/**
 * Apply turn as a tool-using agent loop.
 *
 * The plan turn proposes a JSON envelope; the user accepts it; THIS module runs
 * a multi-step model invocation where the model can:
 *   - inspect current state (`getBuildSnapshot`, `tailBundleLogs`, `getRuntimeErrors`)
 *   - read sources (`getCurrentSource`, `listAppRevisions`)
 *   - mutate the app (`applyPatch`, `addBundleDependency`, `restartPreview`)
 *   - and finally `finish` with a one-paragraph user-facing summary.
 *
 * The loop is capped (default 12 steps via `K0_APPLY_AGENT_MAX_STEPS`) so a
 * misbehaving model can't burn tokens forever. When the agent loop persists
 * nothing, the apply route falls through to the legacy single-shot apply turn.
 */
import { hasToolCall, stepCountIs, APICallError } from "ai";
import type { Kota0Plan } from "@shared/kota0Plan.ts";
import {
  kota0AiModelDescription,
  kota0AiStream,
} from "@/components/kota0/ai/kota0AiProvider";
import {
  buildKota0AgentTools,
  type Kota0AgentToolContext,
} from "@/components/kota0/ai/tools/kota0AgentTools";
import type { Kota0AppRevision } from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";
import { buildKota0BundleStateSummary } from "@/components/kota0/ai/kota0BundleStateSummary";
import { KOTA0_BUNDLE_ARCHITECTURE_RULES } from "@/components/kota0/ai/kota0BundleArchitectureRules";
import { KOTA0_SCRIBE_BACKEND_CONTRACT } from "@/components/kota0/ai/kota0ScribeBackendContract";

export const KOTA0_APPLY_AGENT_MAX_STEPS_DEFAULT = 12;

export function resolveKota0ApplyAgentMaxSteps(): number {
  const raw = process.env.K0_APPLY_AGENT_MAX_STEPS?.trim();
  if (!raw) return KOTA0_APPLY_AGENT_MAX_STEPS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2) return KOTA0_APPLY_AGENT_MAX_STEPS_DEFAULT;
  return Math.min(Math.floor(n), 24);
}


export type Kota0AgentStep = {
  tool: string;
  summary: string;
  ok: boolean;
};

/**
 * Streamed events the agent loop emits as the model works. The apply route
 * forwards these to the chat UI over SSE so the user sees the live trace —
 * `text-delta` between tool calls produces a Claude Code-style interleaved view.
 */
export type Kota0AgentLoopEvent =
  | {
      type: "tool-call";
      tool: string;
      /** Short, human-readable args/state summary (NOT full JSON). */
      summary: string;
    }
  | {
      type: "text-delta";
      /** Incremental text chunk from the model. Concatenate to reconstruct full prose. */
      delta: string;
    };

export type Kota0ApplyAgentResult =
  | {
      ok: true;
      steps: Kota0AgentStep[];
      /** Whatever `finish` was called with; null if the loop ended without calling finish. */
      finishSummary: string | null;
      /** Any plain text the model emitted alongside tool calls (or instead of them). Helpful when the loop fails so the user can see what the model was thinking. */
      modelText: string;
      stepCapReached: boolean;
    }
  | {
      ok: false;
      reason: string;
      steps: Kota0AgentStep[];
      modelText: string;
    };

/**
 * Build the system prompt for the agent loop. Notably this DOES NOT include
 * the full HEAD source — the model fetches what it needs via `getCurrentSource`.
 * That cuts the per-turn token cost dramatically and forces the model to look
 * at fresh state after each mutation.
 */
function buildAgentSystemPrompt(input: {
  plan: Kota0Plan;
  priorRevisions: Kota0AppRevision[];
  recentEditsSection: string;
  bundleStateSummary: string;
  workspaceDepsSummary?: string;
  confirmationText?: string;
  qaSincePlan?: { role: "user" | "assistant"; content: string }[];
  maxSteps: number;
}): string {
  const planHasRewrite = input.plan.changes.some((c) => c.kind === "rewrite" || c.kind === "add");
  const planHasOnlyRewrite = planHasRewrite && input.plan.changes.every((c) => c.kind === "rewrite" || c.kind === "add");
  const isStarterContext = input.priorRevisions.length === 0;

  const parts: string[] = [
    "You are the **Kota0** in-workspace coding assistant operating as a tool-using agent.",
    "The plan below was confirmed by the user. Your job: call tools to make it real. **Before each tool call, write ONE short sentence (≤20 words) saying what you're about to do and why.** Keep it a quick caption, not commentary. The user sees this alongside the tool trace.",
    "",
    `**Step budget: ${input.maxSteps} tool calls maximum.** Be efficient — each \`getCurrentSource\` / \`tailBundleLogs\` / \`getBuildSnapshot\` counts as a step. A typical successful run uses 3-6 steps.`,
    "",
    "**Two ways to write files:**",
    "  - `applyChanges({ source?, backendSource?, bundleEnv? })` — writes FULL file contents directly. Use this for any file the plan marked `kind: \"rewrite\"` or `\"add\"`. **Multiple files in one call.** Fastest path for greenfield work.",
    "  - `applyPatch({ patchText })` — unified-diff hunks against current HEAD. Use this for `kind: \"modify\"` or `\"remove\"`. Anchor on stable lines (function signature, route literal, opening tag) so context+removed block matches EXACTLY once. Preserve indentation; don't mix a patch with a full-file fence for the same file.",
    "",
    "**Typical workflow:**",
    "  1. (Optional) `getCurrentSource({ file })` if you need fresh HEAD before patching. Skip this for `rewrite`/`add` plans — you're writing full contents anyway. The 'Current bundle state' section below already shows the live build/runtime status; you don't need `getBuildSnapshot` upfront.",
    "  2. `applyChanges` and/or `applyPatch`.",
    "  3. `restartPreview` — rebuilds and re-serves the bundle. Returns the build snapshot.",
    "  4. If the snapshot shows `phase: \"failed\"` with `lastBuildError.kind === \"missing_import\"`, call `addBundleDependency({ packageName: lastBuildError.module })` and `restartPreview` once more.",
    "  5. `verifyAppConnectivity({ routes: [...] })` — HTTP smoke against the running bundle Flight. Always checks `/api/kota0-app/hello`; pass the `api/kota0-app/…` routes your App.vue fetches. On 404/500, fix routes or backend handlers and loop back to step 2.",
    "  6. `finish({ summary })` — 1-3 sentence user-facing summary. **Always call this last** so the user knows you're done.",
    "",
    "**Independent reads can run in parallel.** If you need `getCurrentSource` for both App.vue and App.backend.ts, emit BOTH tool calls in the same step. Same for any combination of `getBuildSnapshot` / `tailBundleLogs` / `getRuntimeErrors` / `listAppRevisions`. **Mutating tools (`applyPatch`, `applyChanges`, `addBundleDependency`, `restartPreview`) must be sequential** — don't batch them; each depends on the previous one's result.",
    "",
    KOTA0_SCRIBE_BACKEND_CONTRACT,
    "",
    KOTA0_BUNDLE_ARCHITECTURE_RULES,
    "",
  ];

  if (isStarterContext && planHasOnlyRewrite) {
    parts.push(
      "**This looks like a starter / new app** (no prior revisions). The cleanest path is ONE `applyChanges` call with full `source` and `backendSource` content, then `restartPreview`, then `finish`. Three steps total. Don't bother with `getCurrentSource` — the current contents are starter boilerplate you're about to replace anyway.",
      "",
    );
  } else if (planHasOnlyRewrite) {
    parts.push(
      "**The plan only contains `rewrite`/`add` changes.** Prefer `applyChanges` over emitting full-file fences inside `applyPatch` — same result, fewer steps.",
      "",
    );
  }

  parts.push(
    "**Cumulative work:** features in `preserveExplicitly` MUST still be present after your write. For `modify` plans, untouched regions in the Recent edits section below are stable code — leave them alone unless the plan explicitly targets them.",
    "",
    "=== Accepted plan (apply this) ===",
    JSON.stringify(input.plan, null, 2),
    "=== end Accepted plan ===",
  );

  if (input.recentEditsSection) {
    parts.push("");
    parts.push(input.recentEditsSection);
  }
  if (input.bundleStateSummary && input.bundleStateSummary.trim().length > 0) {
    parts.push("");
    parts.push(input.bundleStateSummary);
  }
  if (input.workspaceDepsSummary && input.workspaceDepsSummary.trim().length > 0) {
    parts.push("");
    parts.push("=== Workspace npm allowlist (already installed in the bundle by default) ===");
    parts.push(input.workspaceDepsSummary.trim());
    parts.push("=== end allowlist ===");
  }
  if (input.confirmationText && input.confirmationText.trim().length > 0) {
    parts.push("");
    parts.push(`User confirmation: ${input.confirmationText.trim()}`);
  }
  if (input.qaSincePlan && input.qaSincePlan.length > 0) {
    parts.push("");
    parts.push("Conversation since the plan (incorporate clarifications):");
    for (const m of input.qaSincePlan) {
      parts.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    }
  }
  return parts.join("\n");
}

export type RunKota0ApplyAgentLoopInput = {
  ctx: Omit<Kota0AgentToolContext, "recordStep">;
  plan: Kota0Plan;
  priorRevisions: Kota0AppRevision[];
  recentEditsSection: string;
  workspaceDepsSummary?: string;
  confirmationText?: string;
  qaSincePlan?: { role: "user" | "assistant"; content: string }[];
  maxSteps?: number;
  /**
   * Live event sink. The agent loop emits `tool-call` events as the model
   * invokes each tool (BEFORE the tool runs) so callers can forward them to a
   * UI via SSE. Tool RESULTS still come back via `recordStep` (server-side
   * only). Errors thrown in `onEvent` are caught and ignored.
   */
  onEvent?: (event: Kota0AgentLoopEvent) => void;
};

/** Render tool args as a short, human-friendly summary for the live trace. */
function shortInputSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  switch (toolName) {
    case "getCurrentSource":
      return typeof o.file === "string" ? o.file : "";
    case "applyChanges": {
      const files: string[] = [];
      if (typeof o.source === "string") files.push("App.vue");
      if (typeof o.backendSource === "string") files.push("App.backend.ts");
      if (typeof o.bundleEnv === "string") files.push(".env");
      return files.join(", ");
    }
    case "applyPatch":
      return typeof o.patchText === "string" ? `${o.patchText.length} chars` : "";
    case "addBundleDependency": {
      const name = typeof o.packageName === "string" ? o.packageName : "";
      const ver = typeof o.version === "string" ? `@${o.version}` : "";
      return `${name}${ver}`;
    }
    case "tailBundleLogs":
      return typeof o.limit === "number" ? `limit=${o.limit}` : "";
    case "getRuntimeErrors":
      return typeof o.limit === "number" ? `limit=${o.limit}` : "";
    case "listAppRevisions":
      return typeof o.limit === "number" ? `limit=${o.limit}` : "";
    case "finish": {
      const s = typeof o.summary === "string" ? o.summary : "";
      return s.length > 80 ? s.slice(0, 80) + "…" : s;
    }
    default:
      return "";
  }
}

/**
 * Run the agent loop to completion (or step-cap). Returns the ordered list of
 * tool calls the model made plus its final `finish` summary.
 *
 * The test-only model override (`setKota0AiModelForTest`) bypasses the
 * `GEMINI_API_KEY` check so eval fixtures can run offline against a mock model.
 */
export async function runKota0ApplyAgentLoop(
  input: RunKota0ApplyAgentLoopInput,
): Promise<Kota0ApplyAgentResult> {
  const steps: Kota0AgentStep[] = [];
  const recordStep: Kota0AgentToolContext["recordStep"] = (step) => {
    steps.push(step);
  };
  const tools = buildKota0AgentTools({ ...input.ctx, plan: input.plan, recordStep });
  const maxSteps = input.maxSteps ?? resolveKota0ApplyAgentMaxSteps();
  const bundleStateSummary = await buildKota0BundleStateSummary(input.ctx.appId).catch(() => "");
  const system = buildAgentSystemPrompt({
    plan: input.plan,
    priorRevisions: input.priorRevisions,
    recentEditsSection: input.recentEditsSection,
    bundleStateSummary,
    workspaceDepsSummary: input.workspaceDepsSummary,
    confirmationText: input.confirmationText,
    qaSincePlan: input.qaSincePlan,
    maxSteps,
  });
  const safeEmit = (event: Kota0AgentLoopEvent): void => {
    if (!input.onEvent) return;
    try {
      input.onEvent(event);
    } catch {
      /* sink errors so a broken UI bridge can't crash the agent loop */
    }
  };
  let modelText = "";
  try {
    await kota0AiStream({
      system,
      prompt: "Apply the confirmed plan now. Pick `applyChanges` for rewrite/add work or `applyPatch` for surgical modify/remove.",
      tools,
      stopWhen: [hasToolCall("finish"), stepCountIs(maxSteps)],
      onChunk: (chunk) => {
        if (chunk.type === "text-delta" && "payload" in chunk) {
          const p = chunk.payload as { text?: string };
          if (typeof p.text === "string" && p.text.length > 0) {
            modelText += p.text;
            safeEmit({ type: "text-delta", delta: p.text });
          }
        }
        if (chunk.type === "tool-call" && "payload" in chunk) {
          const p = chunk.payload as { toolName?: string; args?: unknown };
          if (typeof p.toolName === "string") {
            safeEmit({
              type: "tool-call",
              tool: p.toolName,
              summary: shortInputSummary(p.toolName, p.args),
            });
          }
        }
      },
    });
    const finishStep = steps.find((s) => s.tool === "finish");
    const stepCapReached = steps.length >= maxSteps && !finishStep;
    return {
      ok: true,
      steps,
      finishSummary: finishStep?.summary ?? null,
      modelText: modelText.trim(),
      stepCapReached,
    };
  } catch (e) {
    const desc = kota0AiModelDescription();
    const reason =
      APICallError.isInstance(e) ? `${e.message} (model=${desc.modelId})`
      : e instanceof Error ? e.message
      : "unknown_error";
    return { ok: false, reason, steps, modelText: modelText.trim() };
  }
}

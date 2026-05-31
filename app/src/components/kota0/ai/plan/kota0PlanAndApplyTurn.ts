/**
 * Plan and apply turns for the Mastra chat workflow.
 *
 * Plan turn → JSON envelope (see `shared/kota0Plan.ts`), persisted as `kind: "plan"`.
 * Apply turn → Mastra agent loop with tools (`kota0ApplyAgentLoop.ts`) emitting patches
 *   or fenced rewrites against current HEAD.
 */
import "@/lib/env";

import { APICallError } from "ai";
import { Kota0PlanSchema, type Kota0Plan } from "@/components/kota0/ai/kota0Plan";
import {
  kota0AiGenerate,
  kota0AiGenerateObject,
  kota0AiModelDescription,
} from "@/components/kota0/ai/kota0AiProvider";
import type { Kota0AppRevision } from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";
import type { IncomingMessage } from "./planRun";
import {
  type Kota0IdeationSystemExtras,
  type Kota0ScribeBackendHeadMeta,
  type Kota0ScribeHeadMeta,
  K0_STARTER_PLACEHOLDER_NOTICE,
  truncateBundleEnvForSystemInstruction,
} from "./kota0IdeationRun";
import type { ModelMessage } from "ai";

const PLAN_SYSTEM_PREAMBLE =
  "You are the **Kota0** in-workspace coding planner. The user is vibe-coding an app: a Vite **App.vue**, a Node **App.backend.ts** (Koa) loaded by Flight, and bundle **Secrets** (`.env`). " +
  "Your job in THIS turn is **not to write code** — it is to propose a short, concrete **plan**. The platform auto-executes the apply turn right after; the plan is shown to the user as context, not as a gate. " +
  "**Cumulative by default:** every user prompt builds on previous turns unless the user explicitly says to start fresh. Inspect the Prior revisions and Chat tail below to find features the user already accepted; mention them in `preserveExplicitly` so the apply turn does not regress them. " +
  "**Output JSON ONLY** matching this schema (no markdown wrapper, no prose outside the JSON):\n" +
  "```json\n" +
  '{\n' +
  '  "intent": "one-line restatement of the user\'s ask",\n' +
  '  "userOutline": ["3-6 plain-language bullets the user will read on the plan card"],\n' +
  '  "changes": [\n' +
  '    { "file": "App.vue" | "App.backend.ts" | ".env", "summary": "what changes (one short technical line)", "kind": "add" | "modify" | "remove" | "rewrite" }\n' +
  '  ],\n' +
  '  "preserveExplicitly": ["short bullets of prior features/UI that MUST survive this turn"],\n' +
  '  "openQuestions": []\n' +
  '}\n' +
  "```\n" +
  "Rules:\n" +
  " - **`userOutline` is for non-technical users.** Write 3-6 short bullets in present tense describing what the user will see or get (e.g. 'Add a red line for the developing-world index', 'Switch the page background to creamy yellow', 'Make the data source return both index series'). **NEVER mention file names, function names, frameworks, kinds, or code identifiers** in `userOutline` — those belong in `changes`. Each bullet stands alone; do not number them.\n" +
  " - `changes` is the technical view for the apply turn — keep it concise (one short line per entry) and to <= 6 entries; merge related work into one entry.\n" +
  " - Use `kind: \"rewrite\"` ONLY when the requested change spans most of the file (e.g. complete redesign). Otherwise prefer `add` / `modify`.\n" +
  " - Use `kind: \"remove\"` only when the user explicitly asked to remove something. Do not propose removing features the user previously asked to add — list those in `preserveExplicitly`.\n" +
  " - If the user message is purely informational (a question), return `changes: []`, a one-line `intent` describing what to answer, and a 1-2 bullet `userOutline` describing the answer.\n" +
  " - When the user says 'start fresh' / 'rewrite from scratch' / similar, you may emit `kind: \"rewrite\"` and explicitly state in `intent` that prior turns are being discarded.\n" +
  " - **`openQuestions` MUST be `[]`** in normal flow. The platform auto-executes — there is no Accept button, no rhetorical 'Shall I start implementing?' to ask. Only populate this if there is genuine, blocking scope ambiguity that the apply turn cannot resolve on its own (rare).\n";

const APPLY_SYSTEM_PREAMBLE =
  "You are the **Kota0** in-workspace coding assistant. The plan below was **confirmed by the user in chat**. The app has been under iterative construction across many turns — your job in THIS turn is to apply the plan as **minimal, surgical patches** against the current Scribe HEAD shown above. Do **not** rewrite the file when a patch will do; that erases prior work.\n\n" +
  "**Output format — patches (the only acceptable output for `kind: \"modify\"` and `kind: \"remove\"`):**\n" +
  "Emit one `=== PATCH <file> ===` block per file you change, then one or more hunks. " +
  "Each hunk starts with `@@ ... @@` (the header content is ignored — line numbers don't have to be correct), followed by the hunk body. " +
  "Inside a hunk:\n" +
  " - Lines beginning with a single space (` `) are **context** — must match the current file exactly. They locate the change.\n" +
  " - Lines beginning with `-` are **removed**.\n" +
  " - Lines beginning with `+` are **added**.\n\n" +
  "**Example — modify a div (anchored on the surrounding `<template>` so the match is unique):**\n" +
  "```\n" +
  "=== PATCH App.vue ===\n" +
  "@@ ... @@\n" +
  " <template>\n" +
  "-  <div>Hello</div>\n" +
  "+  <div>Hello, world</div>\n" +
  " </template>\n" +
  "```\n\n" +
  "**Example — add a button after a paragraph:**\n" +
  "```\n" +
  "=== PATCH App.vue ===\n" +
  "@@ ... @@\n" +
  "   <p>Count: {{ count }}</p>\n" +
  "+  <button @click=\"count++\">+</button>\n" +
  " </template>\n" +
  "```\n\n" +
  "**Example — change a route handler in App.backend.ts (anchor on the route literal so the match is unique even if the file has dozens of routes):**\n" +
  "```\n" +
  "=== PATCH App.backend.ts ===\n" +
  "@@ ... @@\n" +
  " router.get(\"/api/kota0-app/items\", async (ctx) => {\n" +
  "-  ctx.body = { items: [] };\n" +
  "+  ctx.body = { items: await listItems() };\n" +
  " });\n" +
  "```\n\n" +
  "Patch rules:\n" +
  " - **Always include enough context lines** (` `) so the context-plus-removed block appears EXACTLY ONCE in the current file. Anchor on stable structural lines (function signature, route literal, named import/export, opening tag) rather than free text that may repeat.\n" +
  " - **Never** emit a hunk that has ONLY `+` lines and no context or `-` lines — there's no way to locate it.\n" +
  " - Preserve indentation precisely; the matcher is whitespace-sensitive.\n" +
  " - You can include multiple hunks per file (each prefixed with its own `@@ ... @@`) and multiple file blocks.\n" +
  " - **No prose, no JSON wrapper, no markdown fences around the patch.** Just the patch text. Comments starting with `# ` between hunks are tolerated.\n\n" +
  "**Full-file rewrite is reserved for `kind: \"rewrite\"` and `kind: \"add\"` ONLY.**\n" +
  " - For those (and only those) files, emit a single fenced ```vue (or ```ts for App.backend.ts, ```env for .env) containing the FULL replacement file.\n" +
  " - **Do NOT mix a patch and a full-file fence for the same file.** Pick one.\n" +
  " - If you emit a full-file fence for a file the plan marked `modify` or `remove`, the apply parser will **reject it** and the turn will fail. The user explicitly does NOT want wholesale rewrites of files they're iterating on.\n\n" +
  "**Cumulative work:** any feature listed in `preserveExplicitly` MUST still be present in the file after your patch. If a patch would remove preserved code, change the patch — do not strip it. The \"Recent edits\" section below shows what surface has been stable across recent turns; treat untouched regions as off-limits unless the current plan explicitly targets them.\n";

function buildPlanContents(messages: IncomingMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/**
 * Window of Scribe revisions to pass into the apply turn as recent-edit diffs.
 * Default 3 mirrors the plan turn; capped at 10 to bound token cost.
 */
const DEFAULT_APPLY_REVISION_WINDOW = 3;
const MAX_APPLY_REVISION_WINDOW = 10;

export function resolveApplyRevisionWindow(): number {
  const raw = process.env.K0_APPLY_REVISION_WINDOW?.trim();
  if (!raw) return DEFAULT_APPLY_REVISION_WINDOW;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_APPLY_REVISION_WINDOW;
  return Math.min(Math.floor(n), MAX_APPLY_REVISION_WINDOW);
}

/**
 * Compact line-level diff between two strings, in a unified-diff-ish shape the
 * model can read. Lines are split, common prefix/suffix collapsed, and the
 * differing middle emitted as `-old` / `+new` with up to `CTX` lines of context
 * on each side. Not LCS-perfect; the goal is "show what changed, cheap on tokens."
 */
const RECENT_EDITS_PER_FILE_CHAR_CAP = 4_000;

function compactLineDiff(before: string, after: string): string {
  if (before === after) return "";
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const CTX = 2;
  const ctxBefore = a.slice(Math.max(0, start - CTX), start);
  const removed = a.slice(start, endA);
  const added = b.slice(start, endB);
  const ctxAfter = a.slice(endA, Math.min(a.length, endA + CTX));
  const out: string[] = [];
  if (start > CTX) out.push("@@ ... @@");
  for (const l of ctxBefore) out.push(` ${l}`);
  for (const l of removed) out.push(`-${l}`);
  for (const l of added) out.push(`+${l}`);
  for (const l of ctxAfter) out.push(` ${l}`);
  let text = out.join("\n");
  if (text.length > RECENT_EDITS_PER_FILE_CHAR_CAP) {
    text = text.slice(0, RECENT_EDITS_PER_FILE_CHAR_CAP) + "\n…(diff truncated)";
  }
  return text;
}

/**
 * Build a "Recent edits" section the apply turn can use to ground itself in the
 * iterative-construction mental model. Diffs each consecutive revision pair
 * (oldest → next-oldest → … → HEAD) so the model sees the *style* and *scope*
 * of recent changes — not just the latest snapshot. Untouched regions in this
 * diff are stable code that should not be rewritten.
 *
 * `revisions` is most-recent-first (as returned by `listKota0AppRevisions`); we
 * also include the diff from the newest stored revision to HEAD.
 */
export function recentEditsSection(
  revisions: Kota0AppRevision[],
  head: { sfc: string; backend: string },
): string {
  if (revisions.length === 0) return "";
  // Chronological order: oldest first, then HEAD as the final "after" state.
  const chronological = [...revisions].reverse();
  const states: { label: string; sfc: string; backend: string }[] = chronological.map((rev, i) => ({
    label: `Revision ${i + 1}${rev.when ? ` (${rev.when})` : ""}`,
    sfc: rev.source,
    backend: rev.backendSource,
  }));
  states.push({ label: "HEAD (current)", sfc: head.sfc, backend: head.backend });

  const parts: string[] = [
    "=== Recent edits — keep extending in this style; do not undo or rewrite the stable regions ===",
  ];
  for (let i = 1; i < states.length; i++) {
    const prev = states[i - 1]!;
    const next = states[i]!;
    const sfcDiff = compactLineDiff(prev.sfc, next.sfc);
    const beDiff = compactLineDiff(prev.backend, next.backend);
    if (!sfcDiff && !beDiff) continue;
    parts.push(`--- ${prev.label} → ${next.label} ---`);
    if (sfcDiff) {
      parts.push("App.vue diff:");
      parts.push("```");
      parts.push(sfcDiff);
      parts.push("```");
    }
    if (beDiff) {
      parts.push("App.backend.ts diff:");
      parts.push("```");
      parts.push(beDiff);
      parts.push("```");
    }
  }
  if (parts.length === 1) return "";
  parts.push("=== end Recent edits ===");
  return parts.join("\n");
}

function priorRevisionsSection(revisions: Kota0AppRevision[]): string {
  if (revisions.length === 0) return "";
  const parts: string[] = ["=== Prior revisions of this app (most recent first; HEAD is the live state above) ==="];
  let i = 0;
  for (const rev of revisions) {
    i += 1;
    const when = rev.when ?? "(no timestamp)";
    parts.push(`--- Revision ${i} — saved at ${when} ---`);
    const sfcSnippet = rev.source.length > 8000 ? rev.source.slice(0, 8000) + "\n…(truncated)" : rev.source;
    const beSnippet = rev.backendSource.length > 4000 ? rev.backendSource.slice(0, 4000) + "\n…(truncated)" : rev.backendSource;
    parts.push("Revision App.vue:");
    parts.push("```vue");
    parts.push(sfcSnippet);
    parts.push("```");
    parts.push("Revision App.backend.ts:");
    parts.push("```ts");
    parts.push(beSnippet);
    parts.push("```");
  }
  parts.push("=== end Prior revisions ===");
  return parts.join("\n");
}

function planSystemInstruction(
  heads: { sfc: string; backend: string },
  sfcMeta: Kota0ScribeHeadMeta,
  backendMeta: Kota0ScribeBackendHeadMeta,
  extras: Kota0IdeationSystemExtras,
  priorRevisions: Kota0AppRevision[],
): string {
  const parts: string[] = [
    PLAN_SYSTEM_PREAMBLE,
    "",
    "=== Scribe HEAD App.vue ===",
    `metadata: fetchedAt=${sfcMeta.fetchedAtIso} utf8Bytes=${sfcMeta.utf8Bytes} lines=${sfcMeta.lineCount}`,
    heads.sfc,
    "=== end Scribe HEAD App.vue ===",
    "",
    "=== Scribe HEAD App.backend.ts ===",
    `metadata: utf8Bytes=${backendMeta.utf8Bytes} lines=${backendMeta.lineCount}`,
    heads.backend,
    "=== end Scribe HEAD App.backend.ts ===",
    "",
  ];
  if (extras.placeholder) {
    parts.push(K0_STARTER_PLACEHOLDER_NOTICE, "");
  }
  parts.push(priorRevisionsSection(priorRevisions));
  if (extras.bundleEnvForSystem && extras.bundleEnvForSystem.trim().length > 0) {
    const t = truncateBundleEnvForSystemInstruction(extras.bundleEnvForSystem);
    parts.push("=== Bundle Secrets (.env) ===");
    parts.push(t.text);
    parts.push("=== end Bundle Secrets ===");
  }
  return parts.filter((p) => p !== "").join("\n");
}

function applySystemInstruction(
  heads: { sfc: string; backend: string },
  sfcMeta: Kota0ScribeHeadMeta,
  backendMeta: Kota0ScribeBackendHeadMeta,
  extras: Kota0IdeationSystemExtras,
  plan: Kota0Plan,
  priorRevisions: Kota0AppRevision[],
): string {
  const parts: string[] = [
    APPLY_SYSTEM_PREAMBLE,
    "",
    "=== Accepted plan (apply this) ===",
    JSON.stringify(plan, null, 2),
    "=== end Accepted plan ===",
    "",
    "=== Scribe HEAD App.vue ===",
    `metadata: fetchedAt=${sfcMeta.fetchedAtIso} utf8Bytes=${sfcMeta.utf8Bytes} lines=${sfcMeta.lineCount}`,
    heads.sfc,
    "=== end Scribe HEAD App.vue ===",
    "",
    "=== Scribe HEAD App.backend.ts ===",
    `metadata: utf8Bytes=${backendMeta.utf8Bytes} lines=${backendMeta.lineCount}`,
    heads.backend,
    "=== end Scribe HEAD App.backend.ts ===",
  ];
  const recent = recentEditsSection(priorRevisions, heads);
  if (recent) {
    parts.push("");
    parts.push(recent);
  }
  if (extras.bundleEnvForSystem && extras.bundleEnvForSystem.trim().length > 0) {
    const t = truncateBundleEnvForSystemInstruction(extras.bundleEnvForSystem);
    parts.push("");
    parts.push("=== Bundle Secrets (.env) ===");
    parts.push(t.text);
    parts.push("=== end Bundle Secrets ===");
  }
  if (extras.workspaceDepsSummary && extras.workspaceDepsSummary.trim().length > 0) {
    parts.push("");
    parts.push("=== Workspace npm allowlist ===");
    parts.push(extras.workspaceDepsSummary.trim());
    parts.push("=== end allowlist ===");
  }
  return parts.join("\n");
}

function formatAiError(e: unknown): string {
  const desc = kota0AiModelDescription();
  if (APICallError.isInstance(e)) {
    return `${e.message} (model=${desc.modelId})`;
  }
  return e instanceof Error ? e.message : "unknown_error";
}

/**
 * Plan turn — model output is the JSON plan envelope. `freshStart=true` instructs
 * the model to ignore prior turns and treat HEAD as the only context (the user
 * clicked "Start fresh"). Stubs the response when `GEMINI_API_KEY` is missing so
 * the rest of the flow stays exercisable in offline dev.
 */
export async function runKota0PlanTurn(input: {
  messages: IncomingMessage[];
  heads: { sfc: string; backend: string };
  sfcMeta: Kota0ScribeHeadMeta;
  backendMeta: Kota0ScribeBackendHeadMeta;
  extras: Kota0IdeationSystemExtras;
  priorRevisions: Kota0AppRevision[];
  freshStart: boolean;
}): Promise<{ ok: true; plan: Kota0Plan } | { ok: false; reason: string; stubPlan: Kota0Plan }> {
  const userText = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const stubPlan: Kota0Plan = {
    intent: userText.trim().slice(0, 200) || "(empty)",
    userOutline: [],
    changes: [],
    preserveExplicitly: [],
    openQuestions: ["Gemini was unreachable; review the change request above and apply from the Code tab if needed."],
  };

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, reason: "GEMINI_API_KEY is not set", stubPlan };
  }
  if (input.messages.length === 0) {
    return { ok: false, reason: "no_messages", stubPlan };
  }

  const contents = buildPlanContents(input.messages);
  const priorForPrompt = input.freshStart ? [] : input.priorRevisions;
  let systemInstruction = planSystemInstruction(
    input.heads,
    input.sfcMeta,
    input.backendMeta,
    input.extras,
    priorForPrompt,
  );
  if (input.freshStart) {
    systemInstruction +=
      "\n\n[FRESH START] The user explicitly asked to start fresh. Ignore prior conversation turns; treat HEAD as the only context. `preserveExplicitly` may be empty.";
  }

  try {
    const result = await kota0AiGenerateObject({
      system: systemInstruction,
      messages: contents,
      schema: Kota0PlanSchema,
    });
    const plan = result.object as Kota0Plan;
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, reason: formatAiError(e), stubPlan };
  }
}

/**
 * Apply turn — model output is patch text (preferred) or full-file fences (when the
 * plan asked for `kind: "rewrite"`). The caller is responsible for parsing the
 * output, applying the patches, and persisting the resulting files.
 */
export async function runKota0ApplyTurn(input: {
  heads: { sfc: string; backend: string };
  sfcMeta: Kota0ScribeHeadMeta;
  backendMeta: Kota0ScribeBackendHeadMeta;
  extras: Kota0IdeationSystemExtras;
  plan: Kota0Plan;
  priorRevisions?: Kota0AppRevision[];
  confirmationText?: string;
  qaSincePlan?: { role: "user" | "assistant"; content: string }[];
  retryHint?: string;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, reason: "GEMINI_API_KEY is not set" };
  }
  const systemInstruction = applySystemInstruction(
    input.heads,
    input.sfcMeta,
    input.backendMeta,
    input.extras,
    input.plan,
    input.priorRevisions ?? [],
  );

  const userLines: string[] = ["Apply the confirmed plan now."];
  if (input.qaSincePlan && input.qaSincePlan.length > 0) {
    userLines.push("");
    userLines.push("Conversation since the plan (incorporate clarifications):");
    for (const m of input.qaSincePlan) {
      userLines.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    }
  }
  if (input.confirmationText?.trim()) {
    userLines.push("");
    userLines.push(`User confirmation: ${input.confirmationText.trim()}`);
  }
  if (input.retryHint?.trim()) {
    userLines.push("");
    userLines.push(input.retryHint.trim());
  }
  userLines.push("");
  userLines.push(
    'Output patch blocks (preferred) or, ONLY for files the plan marked as `kind: "rewrite"`, a single fenced full-file rewrite. No prose outside the patch/rewrite blocks.',
  );

  try {
    const result = await kota0AiGenerate({
      system: systemInstruction,
      prompt: userLines.join("\n"),
    });
    const text = result.text ?? "";
    if (!text.trim()) {
      return { ok: false, reason: "empty_model_content" };
    }
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: formatAiError(e) };
  }
}

/**
 * Two-turn ideation: a **plan** turn proposes structured changes the user can
 * accept/edit/reject, then an **apply** turn emits patches against current HEAD.
 *
 * Plan turn → JSON envelope (see `shared/kota0Plan.ts`).
 * Apply turn → markdown that may contain `=== PATCH file ===` blocks (preferred)
 *   or, when the plan asks for `kind: "rewrite"`, a single fenced ```vue / ```ts
 *   / ```env block per file (the existing rewrite path).
 *
 * This module sits next to `kota0IdeationRun.ts` rather than replacing it because
 * the original full-SFC ideation route is still the fallback when a hunk fails
 * to apply (`reason: "anchor_not_found" | …`).
 */
import "@/lib/env";

import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { Kota0PlanSchema, type Kota0Plan } from "@shared/kota0Plan.ts";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";
import type { Kota0AppRevision } from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";
import type { IncomingMessage } from "./planRun";
import {
  type Kota0IdeationSystemExtras,
  type Kota0ScribeBackendHeadMeta,
  type Kota0ScribeHeadMeta,
  truncateBundleEnvForSystemInstruction,
} from "./kota0IdeationRun";

const PLAN_SYSTEM_PREAMBLE =
  "You are the **Kota0** in-workspace coding planner. The user is vibe-coding an app: a Vite **App.vue**, a Node **App.backend.ts** (Koa) loaded by Flight, and bundle **Secrets** (`.env`). " +
  "Your job in THIS turn is **not to write code** — it is to propose a short, concrete **plan**. The user will confirm in a follow-up chat message before a separate apply turn writes patches. " +
  "**Cumulative by default:** every user prompt builds on previous turns unless the user explicitly says to start fresh. Inspect the Prior revisions and Chat tail below to find features the user already accepted; mention them in `preserveExplicitly` so the apply turn does not regress them. " +
  "**Output JSON ONLY** matching this schema (no markdown wrapper, no prose outside the JSON):\n" +
  "```json\n" +
  '{\n' +
  '  "intent": "one-line restatement of the user\'s ask",\n' +
  '  "changes": [\n' +
  '    { "file": "App.vue" | "App.backend.ts" | ".env", "summary": "what changes (one short line)", "kind": "add" | "modify" | "remove" | "rewrite" }\n' +
  '  ],\n' +
  '  "preserveExplicitly": ["short bullets of prior features/UI that MUST survive this turn"],\n' +
  '  "openQuestions": ["if uncertain about scope; otherwise []"]\n' +
  '}\n' +
  "```\n" +
  "Rules:\n" +
  " - Use `kind: \"rewrite\"` ONLY when the requested change spans most of the file (e.g. complete redesign). Otherwise prefer `add` / `modify`.\n" +
  " - Use `kind: \"remove\"` only when the user explicitly asked to remove something. Do not propose removing features the user previously asked to add — list those in `preserveExplicitly`.\n" +
  " - If the user message is purely informational (a question), return `changes: []` and a one-line `intent` describing what to answer.\n" +
  " - Keep `changes` to <= 6 entries; merge related work into one entry.\n" +
  " - When the user says 'start fresh' / 'rewrite from scratch' / similar, you may emit `kind: \"rewrite\"` and explicitly state in `intent` that prior turns are being discarded.\n" +
  " - When scope is clear and you have no real questions, set `openQuestions` to a single entry: \"Shall I start implementing?\". Otherwise list your open questions there.\n";

const APPLY_SYSTEM_PREAMBLE =
  "You are the **Kota0** in-workspace coding assistant. The plan below was **confirmed by the user in chat**. Your job in THIS turn is to apply it as **minimal, surgical patches** against the current Scribe HEAD shown above.\n\n" +
  "**Output format — preferred (unified-diff style):**\n" +
  "Emit one `=== PATCH <file> ===` block per file you change, then one or more hunks. " +
  "Each hunk starts with `@@ ... @@` (the header content is ignored — line numbers don't have to be correct), followed by the hunk body. " +
  "Inside a hunk:\n" +
  " - Lines beginning with a single space (` `) are **context** — must match the current file exactly. They locate the change.\n" +
  " - Lines beginning with `-` are **removed**.\n" +
  " - Lines beginning with `+` are **added**.\n\n" +
  "**Example — modify a div:**\n" +
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
  "Patch rules:\n" +
  " - **Always include enough context lines** (` `) so the context-plus-removed block appears EXACTLY ONCE in the current file. If a single line could match in multiple places, add more context above/below.\n" +
  " - **Never** emit a hunk that has ONLY `+` lines and no context or `-` lines — there's no way to locate it.\n" +
  " - Preserve indentation precisely; the matcher is whitespace-sensitive.\n" +
  " - You can include multiple hunks per file (each prefixed with its own `@@ ... @@`) and multiple file blocks.\n" +
  " - **No prose, no JSON wrapper, no markdown fences around the patch.** Just the patch text. Comments starting with `# ` between hunks are tolerated.\n\n" +
  "**Output format — full-file rewrite (ONLY for files the plan marked `kind: \"rewrite\"`):**\n" +
  " - Emit a single fenced ```vue (or ```ts for App.backend.ts, ```env for .env) containing the FULL replacement file. Do NOT mix patch and rewrite for the same file.\n\n" +
  "**Cumulative work:** any feature listed in `preserveExplicitly` MUST still be present in the file after your patch. If a patch would remove preserved code, change the patch — do not strip it.\n";

function buildPlanContents(messages: IncomingMessage[]): Content[] {
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return contents;
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
    priorRevisionsSection(priorRevisions),
  ];
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

function unwrapJsonFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

function parsePlanJson(text: string): Kota0Plan {
  const cleaned = unwrapJsonFence(text);
  const attempts: string[] = [cleaned];
  try {
    const repaired = jsonrepair(cleaned);
    if (!attempts.includes(repaired)) attempts.push(repaired);
  } catch {
    /* try raw only */
  }
  for (const s of attempts) {
    try {
      const raw: unknown = JSON.parse(s);
      const parsed = Kota0PlanSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not parse plan JSON from model");
}

function formatGeminiError(e: unknown, model: string): string {
  if (e instanceof ApiError) {
    return `${e.message} (model=${model})`;
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
    changes: [],
    preserveExplicitly: [],
    openQuestions: ["Gemini was unreachable; review the change request above and apply from the Code tab if needed."],
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "GEMINI_API_KEY is not set", stubPlan };
  }
  if (input.messages.length === 0) {
    return { ok: false, reason: "no_messages", stubPlan };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildPlanContents(input.messages);
  const priorForPrompt = input.freshStart ? [] : input.priorRevisions;
  let systemInstruction = planSystemInstruction(input.heads, input.sfcMeta, input.backendMeta, input.extras, priorForPrompt);
  if (input.freshStart) {
    systemInstruction +=
      "\n\n[FRESH START] The user explicitly asked to start fresh. Ignore prior conversation turns; treat HEAD as the only context. `preserveExplicitly` may be empty.";
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });
    const text = response.text ?? "";
    if (!text.trim()) {
      return { ok: false, reason: "empty_model_content", stubPlan };
    }
    const plan = parsePlanJson(text);
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, reason: formatGeminiError(e, model), stubPlan };
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
  confirmationText?: string;
  qaSincePlan?: { role: "user" | "assistant"; content: string }[];
  retryHint?: string;
}): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "GEMINI_API_KEY is not set" };
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = applySystemInstruction(
    input.heads,
    input.sfcMeta,
    input.backendMeta,
    input.extras,
    input.plan,
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

  const contents: Content[] = [
    {
      role: "user",
      parts: [{ text: userLines.join("\n") }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction },
    });
    const text = response.text ?? "";
    if (!text.trim()) {
      return { ok: false, reason: "empty_model_content" };
    }
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: formatGeminiError(e, model) };
  }
}

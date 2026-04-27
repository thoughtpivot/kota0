/**
 * nVibe ideation turns — Gemini with current `App.vue` in system context.
 * Server-safe: same import pattern as planRun.ts.
 *
 * Does **not** pass `responseJsonSchema` (Gemini often rejects zod-to-json-schema output with
 * "reference to undefined schema"). Full SFC is requested inside a ```vue fence in `assistantMessage`,
 * not as a JSON string, to avoid invalid JSON from embedded newlines.
 */
import "@/lib/env";

import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import {
  NvibeIdeationGeminiSchema,
  type NvibeIdeationGeminiJson,
  type NvibeIdeationTurn,
} from "@shared/nvibeIdeationTurn.ts";
import { extractVueFenceFromMarkdown } from "@shared/nvibeExtractVueFence.ts";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";
import type { IncomingMessage } from "@/subjects/plan/planRun";

const DEFAULT_SOURCE_CONTEXT_CHARS = 80_000;

function resolveSourceContextMaxChars(): number {
  const raw = process.env.NVIBE_IDEATION_SOURCE_CONTEXT_CHARS?.trim();
  if (!raw) return DEFAULT_SOURCE_CONTEXT_CHARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 4_096) return DEFAULT_SOURCE_CONTEXT_CHARS;
  return Math.min(Math.floor(n), 500_000);
}

function truncateForSystemInstruction(source: string): { text: string; truncated: boolean } {
  const max = resolveSourceContextMaxChars();
  if (source.length <= max) return { text: source, truncated: false };
  return {
    text: `${source.slice(0, max)}\n\n…(truncated: source longer than ${max} characters; tail omitted.)`,
    truncated: true,
  };
}

/** Snapshot of Scribe `App.vue` head loaded for this Gemini turn (for system + user reminders). */
export type NvibeScribeHeadMeta = {
  fetchedAtIso: string;
  utf8Bytes: number;
  lineCount: number;
  rawCharLength: number;
};

/** Extra static system sections (deps list, SFC digest) — not truncated with HEAD body. */
export type NvibeIdeationSystemExtras = {
  workspaceDepsSummary: string | null;
  headOutline: string | null;
};

const NVIBE_RULES_COMPACT =
  "You iterate on one Vue 3 SFC: **App.vue**. **Scribe HEAD** (full SFC above) is the only source of truth for the live file. Older assistant ```vue fences in the chat tail may be omitted or stale — never treat them as current; only HEAD and `[System]` apply lines describe what is on disk. " +
  "**Infer intent from each user message (no separate UI mode):** " +
  "**Informational** — what/why/how, lists, “what’s supported”, stack questions, or debugging curiosity **without** asking you to change their app: answer only in **`assistantMessage`** (natural prose). **Do not** include a ```vue fenced block, do not paste a full `App.vue`, and do not write as if you already changed their app (avoid “I updated the app below”). Tiny one-line `import …` examples in prose are OK **without** a ```vue fence. " +
  "**App.vue change** — they ask to implement, fix, add/remove, restyle, refactor, replace, or explicitly want a **full-file** or fenced ```vue example: include **at most one** ```vue … ``` block with the **complete replacement SFC** that merges their request into **current Scribe HEAD** (no partial SFC unless they explicitly asked for a snippet only). " +
  "**Ambiguous** — reply without a ```vue fence, then **one short sentence** asking whether they want **`App.vue`** rewritten; do not ship a full SFC until they confirm. " +
  "The chat tail is conversation memory, not code truth. Tone: natural, direct, like a teammate — no role-play, no rigid section headers (do **not** use titles like “Next steps”, “Questions”, or “Plan” in the reply). " +
  "**assistantMessage** — everything the user reads: flowing prose and optional clarifying follow-ups. Add a ```vue fence **only** when they want **`App.vue`** changed (or explicitly ask for a full fenced example), **never** for pure Q&A. " +
  "**planBullets** and **openQuestions** are required JSON keys for the API only — the UI does **not** display them. Use empty arrays `[]` for both unless the API rejects that (then use a single short string each). " +
  "Reply: **one JSON object** only: assistantMessage, planBullets, openQuestions. " +
  "When a ```vue fence is present, the user’s **Apply** action writes that full SFC to Scribe and refreshes the preview; when there is no fence, there is nothing to apply. " +
  "SFC: at least `<template>`; add `<script>` / `<style>` when needed. " +
  "**Tailwind:** utility classes on `<template>` elements. " +
  "In `<style>`, Tailwind v4 + Vite: add `@reference \"../../style.css\"` when using `@apply`; **never** `@apply selection:*` (unknown utility / build error) — use plain CSS `::selection { … }` (and `.dark ::selection` for dark mode) instead. " +
  "Charts: **`vue-chartjs`** + **`chart.js`** (preview registers Chart.js); import chart components from `vue-chartjs`. " +
  "Icons (named Vue components; no global registration): **Lucide** `import { Plus } from 'lucide-vue-next'` → `<Plus />`. " +
  "**Heroicons** `import { HomeIcon } from '@heroicons/vue/24/outline'` (also `@heroicons/vue/24/solid`, `20/solid`, `16/solid` for other sizes). " +
  "**Phosphor** `import { PhHorse } from '@phosphor-icons/vue'` (weight/style per export — see Phosphor + package docs). " +
  "**Iconify (build-time)** `import MdiAccount from '~icons/mdi/account'` (pattern `~icons/{collection}/{icon-id}`; collection must resolve at build; dev may auto-install `@iconify-json/*`). " +
  "**DaisyUI:** semantic Tailwind component classes in the template (e.g. `btn`, `card`, `modal`) — no npm import; optional `data-theme=\"…\"` on a root wrapper inside the SFC. " +
  "**shadcn-vue (this workspace):** import pre-built components from `@/components/ui/...` only (e.g. `import { Button } from '@/components/ui/button'`); those wrap **`reka-ui`** primitives. You may also import **`reka-ui`** directly (e.g. `import { Primitive } from 'reka-ui'`) for custom composition. Do not invent other `@/` paths. " +
  "**Headless UI:** `import { … } from '@headlessui/vue'` for accessible primitives (Dialog, Menu, Listbox, etc.) when useful. " +
  "Use **workspace npm** `dependencies` for third-party package names, plus the imports above (including `@/components/ui/*` and documented packages even if omitted from the trimmed deps list), and **`~icons/...`** (Iconify via **unplugin-icons**; build-time only).";

function nvibeSystemInstruction(
  currentAppSource: string,
  meta: NvibeScribeHeadMeta,
  extras: NvibeIdeationSystemExtras,
): string {
  const { text, truncated } = truncateForSystemInstruction(currentAppSource);
  const metaLine = `metadata: fetchedAt=${meta.fetchedAtIso} utf8Bytes=${meta.utf8Bytes} lines=${meta.lineCount} rawChars=${meta.rawCharLength} modelBodyTruncated=${truncated}`;
  const parts: string[] = [
    "=== Scribe HEAD App.vue (authoritative; re-read from Scribe on every user message) ===",
    metaLine,
    text,
    "=== end Scribe HEAD ===",
    "",
  ];
  if (extras.workspaceDepsSummary && extras.workspaceDepsSummary.trim().length > 0) {
    parts.push("=== nVibe workspace npm (importable in App.vue) ===");
    parts.push(extras.workspaceDepsSummary.trim());
    parts.push("=== end workspace npm ===");
    parts.push("");
  }
  if (extras.headOutline && extras.headOutline.trim().length > 0) {
    parts.push("=== Scribe HEAD outline (non-authoritative; full SFC above) ===");
    parts.push(extras.headOutline.trim());
    parts.push("=== end HEAD outline ===");
    parts.push("");
  }
  parts.push(NVIBE_RULES_COMPACT);
  return parts.join("\n");
}

const NVIBE_JSON_HINT =
  "\n\nReply with **one JSON object only** (no markdown outside it). Keys: assistantMessage (string), planBullets (string[]), openQuestions (string[]). " +
  "Put **all** user-visible text in assistantMessage (natural prose). Use planBullets: [] and openQuestions: [] when possible. " +
  "Do **not** put a ```vue fenced block in assistantMessage unless the user is asking you to change **App.vue** (implement / fix / add / remove / refactor / restyle / replace) or they explicitly ask for a **full-file** or fenced ```vue example. For questions and explanations only, omit ```vue entirely. " +
  "When you do include a full **App.vue**, put it only inside one ```vue ... ``` inside assistantMessage — never as a separate JSON string field.";

function buildContents(messages: IncomingMessage[]): Content[] {
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

function augmentLastUserText(contents: Content[], suffix: string): Content[] {
  const copy: Content[] = contents.map((c) => ({
    role: c.role,
    parts: c.parts?.map((p) => ("text" in p && typeof p.text === "string" ? { text: p.text } : p)),
  }));
  for (let i = copy.length - 1; i >= 0; i--) {
    const c = copy[i];
    if (c.role !== "user" || !c.parts?.length) continue;
    const head = c.parts[0];
    if (head && typeof head === "object" && "text" in head && typeof head.text === "string") {
      copy[i] = {
        role: "user",
        parts: [{ text: head.text + suffix }, ...c.parts.slice(1)],
      };
      return copy;
    }
  }
  return [...copy, { role: "user", parts: [{ text: suffix.trim() }] }];
}

function formatGeminiError(e: unknown, model: string): string {
  if (e instanceof ApiError) {
    const extra =
      e.status === 403 || e.status === 400 ?
        ` | Hint: use an API key from https://aistudio.google.com/apikey , enable "Generative Language API" on the GCP project, check billing/region. If the model returns 404, set GEMINI_MODEL to a stable id (e.g. gemini-2.5-flash or gemini-2.5-pro). Current: ${model}.`
      : "";
    return `${e.message}${extra}`;
  }
  return e instanceof Error ? e.message : "unknown_error";
}

/** Strip optional ```json wrapper around model output. */
function unwrapJsonFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  }
  return t;
}

function parseIdeationGeminiJson(text: string): NvibeIdeationGeminiJson {
  const cleaned = unwrapJsonFence(text);
  const attempts = [cleaned, jsonrepair(cleaned)];
  for (const s of attempts) {
    try {
      const raw: unknown = JSON.parse(s);
      const parsed = NvibeIdeationGeminiSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not parse ideation JSON from model");
}

function turnFromGeminiJson(parsed: NvibeIdeationGeminiJson): NvibeIdeationTurn {
  const fence = extractVueFenceFromMarkdown(parsed.assistantMessage);
  return { ...parsed, proposedAppVue: fence ?? null };
}

async function generateIdeationTurn(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
  systemInstruction: string,
): Promise<NvibeIdeationTurn> {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error("Empty model content");
  }
  return turnFromGeminiJson(parseIdeationGeminiJson(text));
}

/** Markdown persisted in Scribe chat rows — only the natural assistant text (plus optional Apply hint). */
export function formatNvibeIdeationToMarkdown(turn: NvibeIdeationTurn): string {
  const applyHint =
    turn.proposedAppVue && turn.proposedAppVue.trim().length > 0 ?
      "\n\n_When this looks right, click **Apply** to save `App.vue` to Scribe and refresh the preview._"
    : "";
  return `${turn.assistantMessage}${applyHint}`;
}

export function stubNvibeIdeationTurn(userText: string): NvibeIdeationTurn {
  const snippet = userText.trim().slice(0, 120) || "(empty message)";
  return {
    assistantMessage:
      `I couldn’t reach Gemini just now (stub reply). You asked about “${snippet}”. ` +
      `When the API is back: ask questions normally (answers won’t include a full \`App.vue\` unless you ask for a code change). To change the app, describe what you want; if a reply includes one \`\`\`vue block with the full file, click **Apply** to sync Scribe and the preview. You can also edit **Code** and **Apply** there.`,
    planBullets: [],
    openQuestions: [],
    proposedAppVue: null,
  };
}

export async function runNvibeIdeationTurn(
  messages: IncomingMessage[],
  currentAppSource: string,
  scribeMeta: NvibeScribeHeadMeta,
  extras: NvibeIdeationSystemExtras = { workspaceDepsSummary: null, headOutline: null },
): Promise<NvibeIdeationTurn> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const base = buildContents(messages);
  if (base.length === 0) {
    throw new Error("No user or assistant messages");
  }
  const userReminder =
    `\n\n[nVibe] Scribe HEAD for this turn was loaded at ${scribeMeta.fetchedAtIso} (${scribeMeta.utf8Bytes} bytes UTF-8, ${scribeMeta.lineCount} lines). ` +
    "If this user message is **informational only**, respond with prose only — **no** ```vue block. " +
    "If you include a ```vue block, it must be the **full** `App.vue` merged from that HEAD for this turn — not a fragment and not based on an old assistant fence.";
  const contents = augmentLastUserText(base, NVIBE_JSON_HINT + userReminder);
  const systemInstruction = nvibeSystemInstruction(currentAppSource, scribeMeta, extras);

  try {
    return await generateIdeationTurn(ai, model, contents, systemInstruction);
  } catch (e) {
    throw new Error(formatGeminiError(e, model));
  }
}

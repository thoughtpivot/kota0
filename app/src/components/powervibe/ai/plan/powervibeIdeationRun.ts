/**
 * PowerVibe ideation turns — Gemini with current `App.vue` in system context.
 * Server-safe: same import pattern as planRun.ts.
 *
 * Does **not** pass `responseJsonSchema` (Gemini often rejects zod-to-json-schema output with
 * "reference to undefined schema"). Does **not** use `responseMimeType: "application/json"` for the
 * full turn: a valid JSON string cannot safely embed a large `App.vue` (hundreds of `"` in templates).
 * Model output is **markdown** by default; we optionally parse JSON when the model still returns it.
 */
import "@/lib/env";

import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import {
  PowervibeIdeationGeminiSchema,
  type PowervibeIdeationGeminiJson,
  type PowervibeIdeationTurn,
} from "@shared/powervibeIdeationTurn.ts";
import { extractTsFenceFromMarkdown } from "@shared/powervibeExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/powervibeExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/powervibeExtractVueFence.ts";
import { DEFAULT_GEMINI_MODEL } from "@/lib/geminiModel";
import type { IncomingMessage } from "./planRun";

const DEFAULT_SOURCE_CONTEXT_CHARS = 80_000;

function resolveSourceContextMaxChars(): number {
  const raw = process.env.POWERVIBE_IDEATION_SOURCE_CONTEXT_CHARS?.trim();
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
export type PowervibeScribeHeadMeta = {
  fetchedAtIso: string;
  utf8Bytes: number;
  lineCount: number;
  rawCharLength: number;
};

/** Snapshot of Scribe `App.backend.ts` head for the same turn (same `fetchedAtIso` as the SFC meta). */
export type PowervibeScribeBackendHeadMeta = {
  utf8Bytes: number;
  lineCount: number;
  rawCharLength: number;
};

/** Extra static system sections (deps list, SFC digest) — not truncated with HEAD body. */
export type PowervibeIdeationSystemExtras = {
  workspaceDepsSummary: string | null;
  headOutline: string | null;
  /** Parsed `KEY=` names from bundle `.env` text — never includes values. */
  bundleEnvKeyNames: string[] | null;
};

/** Extract env var names from dotenv-style text (comments and blanks skipped). Exported for PowerVibe backend ideation. */
export function bundleEnvKeyNamesFromText(envText: string): string[] {
  const names = new Set<string>();
  for (const line of envText.split(/\r?\n/)) {
    const t = line.trim();
    if (t === "" || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) names.add(key);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Shown to Gemini only (systemInstruction), not in the user’s chat. */
const POWERVIBE_SYSTEM_PREAMBLE =
  "You are the **PowerVibe** in-workspace coding assistant. Users build apps from **Code**: a Vite **App.vue**, a Node **App.backend.ts** (Koa) loaded by Flight, and **bundle Secrets** (`.env` in Scribe). The assistant **can** supply secret *changes* via a ```env fenced block; the user’s **Apply** in the **AI** or **Code** panel persists it—this is a first-class path, not “human-only.” " +
  "The sections below (current sources + platform rules) are the contract for every reply—treat this environment as a product you know deeply.\n\n";

const POWERVIBE_RULES_COMPACT =
  "You iterate on **App.vue** (one Vue 3 SFC) and on **`App.backend.ts`** (Koa + @koa/router, loaded by Flight). **Scribe HEAD** blocks above are the only source of truth. Older assistant ```vue / ```ts fences in the chat tail may be stale — only HEAD sections describe what is on disk. " +
  "**Infer intent from each user message (no separate UI mode):** " +
  "**Informational** — what/why/how, lists, “what’s supported”, stack questions, or debugging curiosity **without** asking you to change their app: answer in **natural prose only** (no ```vue). **Do not** paste a full `App.vue`, and do not write as if you already changed their app (avoid “I updated the app below”). Tiny one-line `import …` examples in prose are OK **without** a ```vue fence. " +
  "**App.vue change** — they ask to implement, fix, add/remove, restyle, refactor, replace, or explicitly want a **full-file** or fenced ```vue example: include **at most one** ```vue … ``` block with the **complete replacement SFC** that merges their request into **current Scribe HEAD** (no partial SFC unless they explicitly asked for a snippet only). " +
  "**Bundle Secrets / `.env` change** — they ask to add, set, rename, or remove environment variables for the bundle: treat this like a normal feature request—include **at most one** ```env fence with the lines they asked for; **do not** refuse as “out of scope” or “human-only.” " +
  "**Ambiguous** — reply without a ```vue fence, then **one short sentence** asking whether they want **`App.vue`** rewritten; do not ship a full SFC until they confirm. " +
  "The chat tail is conversation memory, not code truth. **Chat prose** (your markdown text outside ```vue): natural, direct — do **not** use meta wrapper headings like “Next steps”, “Questions”, or “Plan” as organizing titles for your reply. " +
  "**Ship-ready ```vue (critical):** Whenever you output a full `App.vue`, treat it as **finished product UI** — not a wireframe, not a thin placeholder page. Unless the user explicitly asked for minimal / stub / lorem-only: deliver **editorial density** comparable to a professional creative brief — cohesive **visual theme** (background layers, accent discipline, type scale), **strong layout** (scroll narrative sections, bento/dashboard regions, or cinematic full-width bands — avoid a lone generic centered hero unless that *is* the design), **specific copy** (named project, people, stakes, believable numbers), **motion with purpose** (scroll reveals, staggered fades, transitions tied to state — not empty pulsing skeletons everywhere). For metrics, timelines, comparisons, or “story with data” topics: include **multiple** **`vue-chartjs`** charts with plausible **mock datasets** and readable options (legends/tooltips where helpful). Short or vague user asks still warrant **rich inference** — invent tasteful title, narrative beats, chart roles, and interactions that fit the theme instead of shipping anemic layouts. Honor any detailed brief (palette, beats, chart types) **inside** the SFC; vivid **in-app** voice (journalistic tone, character names) is encouraged when it matches the topic. " +
  "**Stack vs brief:** Do **not** load Chart.js or other libraries via external CDN `<script src>` in the SFC — use **`vue-chartjs`** + **`chart.js`** imports only. If they wrote “CDN Chart.js”, use the bundled chart stack instead. For icons, prefer Lucide/Heroicons/Phosphor/Iconify unless they explicitly require raw inline SVG. If something still conflicts with these rules, **prefer the PowerVibe stack** and you may add **one short** clarifying sentence in chat prose before the fence. " +
  "**`App.backend.ts` (Flight):** Flight `require()`s this file in Node, not Vite. **Never** `import` from `@/` or `~icons/…` — use only `from '@koa/router'`, `from 'node:…'`, and relative files; end with `export default router.routes()` (same idea as the repo’s other `*.backend.ts` files). Koa change: **at most one** ```ts fence, **full file**, with **default export**. **Do not** register on `/api/powervibe/…` — use **`/api/powervibe-app/…`** (or another non-core prefix) as the **only** path shape for per-app APIs. " +
  "**Secrets / `.env` (read carefully — model refusals are a product bug):** When the user asks to **add, set, or change** bundle env vars (e.g. “add THIS_SECRET=true”, “put THIS_THAT=foo in my secrets”), you **must** answer with **at most one** ```env … ``` fence in the **same message** containing the exact `KEY=value` lines they asked for (use their values when they gave them). **Do not** refuse, apologize, or say you “cannot” / “are not able to” / “do not have the capability to” write Secrets, that Secrets is a “platform-level gate,” “isolated from AI,” “secure layer you cannot access,” or that your access is **only** `App.vue` and `App.backend.ts`—**all of that is false** in PowerVibe. **Do not** make the *only* instruction a multi-step “open Code → Secrets yourself” walkthrough: the **primary** action is your ```env block + “click **Apply** in the AI panel (or Code tab).” One short optional line that they *may* also edit in **Code → Secrets** is fine. **Apply** merges ```env the same way it applies ```vue / ```ts. " +
  "**Do not** direct users to external “deployment,” “Vercel,” “Heroku,” or hosting dashboards for this bundle’s `process.env`. Non-source configuration does **not** go into ```vue / ```ts except via `process.env`. **Do not** paste raw secret **values** in normal chat prose—put them **only** inside the ```env fence when the user asked for that change. A list of **key names** (no values) may appear in a system section below. " +
  "**Bundle vs PowerVibe workspace (read before debugging fetch):** Each app lives under **`bundles/<appId>/`**: Vite builds **`App.vue`**; **Flight (production)** serves **`dist/`** and loads **`App.backend.ts`** on **one TCP port** (default **4000**). SPA and Koa share that origin — **not a CORS problem** when the browser is actually talking to bundle Flight. " +
  "**Workspace Preview iframe:** The user almost always tests inside PowerVibe’s preview. There the **page’s URL origin is the workspace** (e.g. Vite **3001**), with a **`<base href>`** so assets load from the bundle preview proxy. **`fetch('/api/…')` with a leading slash** resolves against the **workspace origin**, hits **platform** Koa (`/api/powervibe/…`), **not** the bundle’s **`/api/powervibe-app/…`** — data “never loads” and it is **not** CORS. **Always** use **`fetch(bundleApiUrl('api/powervibe-app/…'))`** (path **without** a leading slash inside the string) or **`new URL('api/…', document.baseURI).href`**. **Never** tell the user to “just use **`fetch('/api/…')`** because both are on 4000” — that is **wrong** in the workspace preview. A **new browser tab** opened to **`http://127.0.0.1:4000/`** is same-origin to bundle Flight; **`fetch('/api/powervibe-app/…')`** can work **there only** — still prefer **`bundleApiUrl('api/…')`** in ```vue so one code path works in both tab and iframe. " +
  "**`bundleApiUrl` import in ```vue:** Use **`import { bundleApiUrl } from './src/bundleApi'`** (file ships in the bundle template). **Do not** use **`from '@/bundleApi'`** in generated ```vue — that is not the supported pattern and breaks resolution against the monorepo **`@` → app/src** alias. " +
  "**Theme:** User-requested hex colors and dark/light skins belong in the shipped `App.vue` when they asked for a visual theme (Tailwind arbitrary colors or scoped CSS). " +
  "A user “keep it under N lines” ask is secondary to a **complete**, parse-valid merged SFC unless they explicitly wanted a **snippet** only. " +
  "Everything the user reads is **plain markdown** (this reply): short framing plus optional clarifying follow-ups. Add a ```vue fence **only** when they want **`App.vue`** changed; add a ```ts fence **only** when they want **`App.backend.ts`** changed; add a ```env fence **only** when they want bundle **Secrets** changed; **never** for pure Q&A. " +
  "Do **not** wrap your whole reply in a single JSON object — the server needs raw markdown (and optional ```vue / ```ts / ```env for **Apply**), not `{\"assistantMessage\": \"...\"}`. " +
  "When a ```vue fence is present, **Apply** can write the full SFC; when a ```ts fence is present, **Apply** can write the full `App.backend.ts`; when a ```env fence is present, **Apply** merges into bundle `.env` / Secrets. Any combination or none. " +
  "SFC: at least `<template>`; add `<script>` / `<style>` when needed. " +
  "**Tailwind:** utility classes on `<template>` elements. " +
  "In `<style>`, Tailwind v4 + Vite: add `@reference \"../../../../style.css\"` (path from `viewer/generated/App.vue` to `app/src/style.css`) when using `@apply`; **never** `@apply selection:*` (unknown utility / build error) — use plain CSS `::selection { … }` (and `.dark ::selection` for dark mode) instead. " +
  "Charts: **`vue-chartjs`** + **`chart.js`** (preview registers Chart.js); import chart components from `vue-chartjs`; **never** pull Chart.js from a CDN `<script>` tag in the SFC. " +
  "Icons (named Vue components; no global registration): **Lucide** `import { Plus } from 'lucide-vue-next'` → `<Plus />`. " +
  "**Heroicons** `import { HomeIcon } from '@heroicons/vue/24/outline'` (also `@heroicons/vue/24/solid`, `20/solid`, `16/solid` for other sizes). " +
  "**Phosphor** `import { PhHorse } from '@phosphor-icons/vue'` (weight/style per export — see Phosphor + package docs). " +
  "**Iconify (build-time)** `import MdiAccount from '~icons/mdi/account'` (pattern `~icons/{collection}/{icon-id}`; collection must resolve at build; dev may auto-install `@iconify-json/*`). " +
  "**DaisyUI:** semantic Tailwind component classes in the template (e.g. `btn`, `card`, `modal`) — no npm import; optional `data-theme=\"…\"` on a root wrapper inside the SFC. " +
  "**reka-ui:** `import { Primitive } from 'reka-ui'` and other primitives for custom composition. " +
  "**Headless UI:** `import { … } from '@headlessui/vue'` for accessible primitives (Dialog, Menu, Listbox, etc.) when useful. " +
  "**@/components/ui/… (same stack as the shell):** shadcn-vue–style building blocks in this repo (e.g. `Button`, `Card`, `input` from `@/components/ui/...`); use when they fit; paths must match the project layout, not ad-hoc new `@/` modules. " +
  "Do not invent other `@/` paths. Use **workspace npm** `dependencies` for third-party package names, plus the imports above, **@/components/ui/…** when appropriate, and **`~icons/...`** (Iconify via **unplugin-icons**; build-time only) in **App.vue** only—not in `App.backend.ts` (Node has no Vite alias).";

function powervibeSystemInstruction(
  heads: { sfc: string; backend: string },
  sfcMeta: PowervibeScribeHeadMeta,
  backendMeta: PowervibeScribeBackendHeadMeta,
  extras: PowervibeIdeationSystemExtras,
): string {
  const sfcT = truncateForSystemInstruction(heads.sfc);
  const beT = truncateForSystemInstruction(heads.backend);
  const sfcLine = `metadata: fetchedAt=${sfcMeta.fetchedAtIso} utf8Bytes=${sfcMeta.utf8Bytes} lines=${sfcMeta.lineCount} rawChars=${sfcMeta.rawCharLength} modelBodyTruncated=${sfcT.truncated}`;
  const beLine = `metadata: fetchedAt=${sfcMeta.fetchedAtIso} utf8Bytes=${backendMeta.utf8Bytes} lines=${backendMeta.lineCount} rawChars=${backendMeta.rawCharLength} modelBodyTruncated=${beT.truncated}`;
  const parts: string[] = [
    POWERVIBE_SYSTEM_PREAMBLE,
    "=== Scribe HEAD App.vue (authoritative; re-read from Scribe on every user message) ===",
    sfcLine,
    sfcT.text,
    "=== end Scribe HEAD ===",
    "",
    "=== Scribe HEAD App.backend.ts (authoritative) ===",
    beLine,
    beT.text,
    "=== end Scribe HEAD App.backend.ts ===",
    "",
  ];
  if (extras.workspaceDepsSummary && extras.workspaceDepsSummary.trim().length > 0) {
    parts.push("=== PowerVibe workspace npm (importable in App.vue) ===");
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
  if (extras.bundleEnvKeyNames && extras.bundleEnvKeyNames.length > 0) {
    parts.push("=== Bundle .env key names already in context (values omitted) ===");
    parts.push(extras.bundleEnvKeyNames.join(", "));
    parts.push("=== end bundle .env key names ===");
    parts.push("");
  }
  parts.push(
    "=== PowerVibe secrets (system) ===\n" +
      "If the user’s message requests new or changed bundle env vars, your reply must include a ```env block—do not claim you cannot write Secrets.\n" +
      "=== end PowerVibe secrets ===\n",
  );
  parts.push(POWERVIBE_RULES_COMPACT);
  return parts.join("\n");
}

const POWERVIBE_MARKDOWN_HINT =
  "\n\nReply in **markdown** (not JSON). Put all user-visible text in normal markdown. " +
  "Include **at most one** ```vue … ``` fence when they want **App.vue** changed, **at most one** ```ts/```typescript fence when they want **`App.backend.ts`** changed, and **at most one** ```env fence when they want bundle **Secrets** / `.env` changed (**Apply** merges it into Scribe). **If this user message asks to add or change env vars, your reply must contain that ```env block—never refuse or defer to “manual Secrets only.”** For Q&A with no code change, omit those fences. " +
  "Never put API keys or secrets in ```vue / ```ts — use ```env or **Code → Secrets**. " +
  "For rich dashboards, put polish **inside** the ```vue block (vue-chartjs + chart.js, no CDN scripts) and keep surrounding chat prose short.";

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

function parseIdeationGeminiJson(text: string): PowervibeIdeationGeminiJson {
  const cleaned = unwrapJsonFence(text);
  const attempts: string[] = [cleaned];
  try {
    const repaired = jsonrepair(cleaned);
    if (!attempts.includes(repaired)) attempts.push(repaired);
  } catch {
    /* jsonrepair threw — try JSON.parse on raw only */
  }
  for (const s of attempts) {
    try {
      const raw: unknown = JSON.parse(s);
      const parsed = PowervibeIdeationGeminiSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not parse ideation JSON from model");
}

function turnFromGeminiJson(parsed: PowervibeIdeationGeminiJson): PowervibeIdeationTurn {
  const fence = extractVueFenceFromMarkdown(parsed.assistantMessage);
  const tsFence = extractTsFenceFromMarkdown(parsed.assistantMessage);
  const envFence = extractEnvFenceFromMarkdown(parsed.assistantMessage);
  return {
    ...parsed,
    proposedAppVue: fence ?? null,
    proposedAppBackend: tsFence ?? null,
    proposedBundleEnv: envFence ?? null,
  };
}

/**
 * Preferred path: freeform markdown (model can put a full ```vue in the message without JSON escaping).
 * If the model still returns JSON, parse that first; otherwise treat the full text as chat + optional fence.
 */
function parseModelOutputToTurn(text: string): PowervibeIdeationTurn {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      assistantMessage: "",
      planBullets: [],
      openQuestions: [],
      proposedAppVue: null,
      proposedAppBackend: null,
      proposedBundleEnv: null,
    };
  }
  try {
    return turnFromGeminiJson(parseIdeationGeminiJson(trimmed));
  } catch {
    const fence = extractVueFenceFromMarkdown(trimmed);
    const tsFence = extractTsFenceFromMarkdown(trimmed);
    const envFence = extractEnvFenceFromMarkdown(trimmed);
    return {
      assistantMessage: trimmed,
      planBullets: [],
      openQuestions: [],
      proposedAppVue: fence ?? null,
      proposedAppBackend: tsFence ?? null,
      proposedBundleEnv: envFence ?? null,
    };
  }
}

async function generateIdeationTurn(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
  systemInstruction: string,
): Promise<PowervibeIdeationTurn> {
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error("Empty model content");
  }
  return parseModelOutputToTurn(text);
}

const STREAM_DELTA_THROTTLE_MS = 80;

async function generateIdeationTurnStream(
  ai: GoogleGenAI,
  model: string,
  contents: Content[],
  systemInstruction: string,
  onDelta: (receivedChars: number) => void,
): Promise<PowervibeIdeationTurn> {
  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction,
    },
  });
  let buffer = "";
  let lastEmitAt = 0;
  for await (const chunk of stream) {
    const piece = typeof chunk.text === "string" ? chunk.text : "";
    buffer += piece;
    const now = Date.now();
    if (now - lastEmitAt >= STREAM_DELTA_THROTTLE_MS) {
      onDelta(buffer.length);
      lastEmitAt = now;
    }
  }
  onDelta(buffer.length);
  const text = buffer.trim();
  if (!text) {
    throw new Error("Empty model content");
  }
  return parseModelOutputToTurn(text);
}

/** Markdown persisted in Scribe chat rows — natural assistant text (plus optional Apply hints). */
export function formatPowervibeIdeationToMarkdown(turn: PowervibeIdeationTurn): string {
  const hasVue = !!(turn.proposedAppVue && turn.proposedAppVue.trim().length > 0);
  const hasBe = !!(turn.proposedAppBackend && turn.proposedAppBackend.trim().length > 0);
  const hasEnv = !!(turn.proposedBundleEnv && turn.proposedBundleEnv.trim().length > 0);
  if (!hasVue && !hasBe && !hasEnv) return turn.assistantMessage;
  const bits: string[] = [];
  if (hasVue) bits.push("`App.vue`");
  if (hasBe) bits.push("`App.backend.ts`");
  if (hasEnv) bits.push("bundle **Secrets** (`.env`)");
  const which =
    bits.length === 1 ? bits[0]
    : bits.length === 2 ? `${bits[0]} and ${bits[1]}`
    : `${bits.slice(0, -1).join(", ")}, and ${bits[bits.length - 1]}`;
  return `${turn.assistantMessage}\n\n_When this looks right, click **Apply** to save ${which} to Scribe._`;
}

export function stubPowervibeIdeationTurn(userText: string): PowervibeIdeationTurn {
  const snippet = userText.trim().slice(0, 120) || "(empty message)";
  return {
    assistantMessage:
      `I couldn’t reach Gemini just now (stub reply). You asked about “${snippet}”. ` +
      `When the API is back: ask questions normally (no full files unless you ask for a code change). To change the app, describe what you want; \`\`\`vue, \`\`\`ts, and \`\`\`env blocks can be **Apply**'d. You can also use **Code** (Frontend / Backend / Secrets) and **Apply** there.`,
    planBullets: [],
    openQuestions: [],
    proposedAppVue: null,
    proposedAppBackend: null,
    proposedBundleEnv: null,
  };
}

export async function runPowervibeIdeationTurn(
  messages: IncomingMessage[],
  heads: { sfc: string; backend: string },
  scribeMeta: PowervibeScribeHeadMeta,
  backendMeta: PowervibeScribeBackendHeadMeta,
  extras: PowervibeIdeationSystemExtras = {
    workspaceDepsSummary: null,
    headOutline: null,
    bundleEnvKeyNames: null,
  },
): Promise<PowervibeIdeationTurn> {
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
    `\n\n[PowerVibe] Scribe HEAD for this turn was loaded at ${scribeMeta.fetchedAtIso} — **App.vue** ${scribeMeta.utf8Bytes} bytes UTF-8, ${scribeMeta.lineCount} lines; **App.backend.ts** ${backendMeta.utf8Bytes} bytes, ${backendMeta.lineCount} lines. ` +
    "If this message asks to add or change **bundle env vars** / secrets, you **must** reply with a ```env fence—**Apply** merges it; **never** refuse, apologize, or say Secrets is off-limits to you. Do not send users only to external deployment dashboards. " +
    "If this user message is **informational only** (no code/env change requested), respond with prose only — **no** ```vue, ```ts, or ```env fences. " +
    "If you include a ```vue block, it must be the **full** `App.vue` from that HEAD. If you include a ```ts block, it must be the **full** `App.backend.ts` from that HEAD. " +
    "Implementation turns that change the UI should still ship **ship-ready** `App.vue` (depth, charts, polish) when a fence is used — not a sketch.";
  const contents = augmentLastUserText(base, POWERVIBE_MARKDOWN_HINT + userReminder);
  const systemInstruction = powervibeSystemInstruction(heads, scribeMeta, backendMeta, extras);

  try {
    return await generateIdeationTurn(ai, model, contents, systemInstruction);
  } catch (e) {
    throw new Error(formatGeminiError(e, model));
  }
}

/** Same as {@link runPowervibeIdeationTurn} but uses Gemini streaming; `onDelta` receives cumulative UTF-16 length of raw JSON text (throttled). */
export async function runPowervibeIdeationTurnStreaming(
  messages: IncomingMessage[],
  heads: { sfc: string; backend: string },
  scribeMeta: PowervibeScribeHeadMeta,
  backendMeta: PowervibeScribeBackendHeadMeta,
  extras: PowervibeIdeationSystemExtras,
  onDelta: (receivedChars: number) => void,
): Promise<PowervibeIdeationTurn> {
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
    `\n\n[PowerVibe] Scribe HEAD for this turn was loaded at ${scribeMeta.fetchedAtIso} — **App.vue** ${scribeMeta.utf8Bytes} bytes UTF-8, ${scribeMeta.lineCount} lines; **App.backend.ts** ${backendMeta.utf8Bytes} bytes, ${backendMeta.lineCount} lines. ` +
    "If this message asks to add or change **bundle env vars** / secrets, you **must** reply with a ```env fence—**Apply** merges it; **never** refuse, apologize, or say Secrets is off-limits to you. Do not send users only to external deployment dashboards. " +
    "If this user message is **informational only** (no code/env change requested), respond with prose only — **no** ```vue, ```ts, or ```env fences. " +
    "If you include a ```vue block, it must be the **full** `App.vue` from that HEAD. If you include a ```ts block, it must be the **full** `App.backend.ts` from that HEAD. " +
    "Implementation turns that change the UI should still ship **ship-ready** `App.vue` (depth, charts, polish) when a fence is used — not a sketch.";
  const contents = augmentLastUserText(base, POWERVIBE_MARKDOWN_HINT + userReminder);
  const systemInstruction = powervibeSystemInstruction(heads, scribeMeta, backendMeta, extras);

  try {
    return await generateIdeationTurnStream(ai, model, contents, systemInstruction, onDelta);
  } catch (e) {
    throw new Error(formatGeminiError(e, model));
  }
}

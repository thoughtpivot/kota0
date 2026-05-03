/**
 * PowerVibe ideation turns — Gemini with current `App.vue` in system context.
 * Server-safe: same import pattern as planRun.ts.
 *
 * Does **not** pass `responseJsonSchema` (Gemini often rejects nested `$ref` / `$defs` in generated
 * JSON Schema). Does **not** use `responseMimeType: "application/json"` for the
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

const DEFAULT_BUNDLE_ENV_SYSTEM_MAX_CHARS = 48_000;

/** Cap for bundle `.env` pasted into Gemini systemInstruction (full contents; override via env). */
export function resolvePowervibeIdeationBundleEnvSystemMaxChars(): number {
  const raw = process.env.POWERVIBE_IDEATION_BUNDLE_ENV_SYSTEM_MAX_CHARS?.trim();
  if (!raw) return DEFAULT_BUNDLE_ENV_SYSTEM_MAX_CHARS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 256) return DEFAULT_BUNDLE_ENV_SYSTEM_MAX_CHARS;
  return Math.min(Math.floor(n), 200_000);
}

export function truncateBundleEnvForSystemInstruction(envText: string): { text: string; truncated: boolean } {
  const max = resolvePowervibeIdeationBundleEnvSystemMaxChars();
  const t = envText.trim();
  if (t.length <= max) return { text: t, truncated: false };
  return {
    text: `${t.slice(0, max)}\n\n…(truncated: bundle .env longer than POWERVIBE_IDEATION_BUNDLE_ENV_SYSTEM_MAX_CHARS)`,
    truncated: true,
  };
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
  /** Full bundle Secrets (`.env`) text for systemInstruction — user expects visibility in chat; bounded by {@link truncateBundleEnvForSystemInstruction}. */
  bundleEnvForSystem: string | null;
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
  "They are **vibe-coding their own app**—they need **full transparency** of bundle Secrets: **never** hide, redact, or strip values from what you show in chat when discussing `.env`. " +
  "The sections below (current sources + platform rules) are the contract for every reply—treat this environment as a product you know deeply.\n\n";

const POWERVIBE_RULES_COMPACT =
  "You iterate on **App.vue** (one Vue 3 SFC) and on **`App.backend.ts`** (Koa + @koa/router, loaded by Flight). **Scribe HEAD** blocks above are the only source of truth. Older assistant ```vue / ```ts fences in the chat tail may be stale — only HEAD sections describe what is on disk. " +
  "**Capabilities (workspace allowlist):** Recommend **only** third-party packages and patterns consistent with the **categorized npm section** injected below (plus styling exceptions listed there). Do **not** suggest npm libraries from general knowledge if they are absent from that list—say the workspace **`dependencies`** must be extended first; user bundles cannot install arbitrary packages from the assistant alone. " +
  "**Modern defaults:** Ship **`App.vue`** with **`<script setup lang=\"ts\">`** and **Composition API** (`ref`, `computed`, `watch`) — not legacy **Options API** unless the user asks. Prefer **`async`/`await`** with **`fetch(bundleApiUrl('api/powervibe-app/…'))`** then **`response.json()`** for bundle APIs (native **`fetch`**, not axios in **`App.vue`**). **Gemini (`@google/genai`):** **`import { GoogleGenAI } from '@google/genai'`** → **`const ai = new GoogleGenAI({ apiKey })`** → **`await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: '…' }] }], config?: { temperature, maxOutputTokens } })`** → read **`response.text`**. **Obsolete:** **`GoogleGenerativeAI`**, **`getGenerativeModel`**, **`model.generateContent(string)`**, **`result.response.text()`** — those belong to older tutorials/SDKs and **break** in this workspace. Use **`process.env.GEMINI_MODEL?.trim()`** when set; otherwise a **current** flash-class id (e.g. **`gemini-2.5-flash`**) — **do not** assume **`gemini-1.5-*`** is still the right default. Node builtins: prefer **`node:`** imports (**`node:crypto`**, **`node:fs`**). " +
  "**Infer intent from each user message (no separate UI mode):** " +
  "**Informational** — what/why/how, lists, “what’s supported”, stack questions, or debugging curiosity **without** asking you to change their app: answer in **natural prose only** (no ```vue). **Do not** paste a full `App.vue`, and do not write as if you already changed their app (avoid “I updated the app below”). Tiny one-line `import …` examples in prose are OK **without** a ```vue fence. " +
  "**App.vue change** — they ask to implement, fix, add/remove, restyle, refactor, replace, or explicitly want a **full-file** or fenced ```vue example: include **at most one** ```vue … ``` block with the **complete replacement SFC** that merges their request into **current Scribe HEAD** (no partial SFC unless they explicitly asked for a snippet only). " +
  "**Bundle Secrets / `.env` change** — they ask to add, set, rename, or remove environment variables for the bundle: treat this like a normal feature request—include **at most one** ```env fence with the lines they asked for; **do not** refuse as “out of scope” or “human-only.” " +
  "**Ambiguous** — reply without a ```vue fence, then **one short sentence** asking whether they want **`App.vue`** rewritten; do not ship a full SFC until they confirm. " +
  "**Persistence & AI — ship working backends:** If the user mentions **save**, **store**, **persist**, **database**, **journal**, **diary**, **entries**, **history over time**, **no data loss**, **sync**, or similar **without** explicitly demanding **localStorage** / **offline-only** / **browser-only** / **local-only** storage: treat **ThoughtPivot Scribe via `App.backend.ts`** as the default — ship **both** a **```ts** fence (full **`App.backend.ts`**) **and** **`App.vue`** wired with **`fetch(bundleApiUrl('api/powervibe-app/…'))`** for create/list/update as needed. **Do not** ship a journaling/data app whose backend is only the stock **`GET /api/powervibe-app/hello`** or other unused stubs while the UI pretends to persist. If they **explicitly** want client-only storage, **`localStorage`** / **`useStorage`** is OK **instead** of Scribe for that brief. " +
  "**End-to-end turns:** When the brief **already** combines **Scribe/database persistence**, **saving entries**, **and** **LLM/AI** (insights, prompts, sentiment), prefer **one** coherent reply with **`App.vue` + full `App.backend.ts` + ```env```** (when new keys are needed)—not UI-only first with a follow-up question whether to add the backend. **Do not** declare the implementation “complete” or “nothing more required” while the UI still uses **fake** insight copy, **placeholder** charts instead of the requested **canvas/generative** visualization, or **wrong** API providers (**OpenAI/Anthropic** keys when only **`@google/genai`** / **`GEMINI_API_KEY`** exist in workspace deps). " +
  "**LLM / sentiment / insights:** Triggers include **AI**, **LLM**, **insight**, **sentiment**, **summarize**, **keywords**, **deep question**, **talks back**, **analyze entry**, or naming OpenAI/Anthropic-style APIs: implement with **`@google/genai`** (Gemini) **inside `App.backend.ts`**, expose **`POST`** (or **`GET`**) routes under **`/api/powervibe-app/…`** that **`App.vue`** calls via **`bundleApiUrl`**—include **`GEMINI_API_KEY=`** in **```env** when the key is needed (**never** embed keys in **`App.vue`**). **Do not** substitute static lorem or fake “insight” paragraphs as if the model ran. If no key, return a JSON error and show a graceful UI message. " +
  "**Visualization fidelity:** When the brief asks for **canvas**, **generative**, **watercolor**, **abstract landscape**, **blobs**, or **organic** visuals, implement with **`<canvas>`** or **SVG** (Vue templates + script)—**do not** default to **`vue-chartjs`** bar/line charts unless they also asked for chart-style analytics. " +
  "The chat tail is conversation memory, not code truth. **Chat prose** (your markdown text outside ```vue): natural, direct — do **not** use meta wrapper headings like “Next steps”, “Questions”, or “Plan” as organizing titles for your reply. " +
  "**Ship-ready ```vue (critical):** Whenever you output a full `App.vue`, treat it as **finished product UI** — not a wireframe, not a thin placeholder page. Unless the user explicitly asked for minimal / stub / lorem-only: deliver **editorial density** — cohesive **visual theme** (background layers, accent discipline, type scale), **strong layout** (scroll narrative sections, bento/dashboard regions, or cinematic full-width bands — avoid a lone generic centered hero unless that *is* the design), **specific copy** (named project, people, stakes, believable numbers where appropriate), **motion with purpose** (scroll reveals, staggered fades, transitions tied to state — not empty pulsing skeletons everywhere). **`vue-chartjs` + `chart.js`:** use **only** when the user asks for dashboards, KPIs, metrics, trends, comparisons, or other explicit **quantitative** visualization; do **not** default every vague or “data-ish” idea to charts — prefer forms, lists, editorial sections, cards, timelines as prose/UI, etc. When charts **are** on-brief, use plausible **mock datasets** and readable options (legends/tooltips where helpful); multiple charts are fine **only** when the ask implies a dashboard-style surface. Short or vague asks still warrant **rich inference** — invent tasteful title, narrative beats, and interactions without assuming every app is a chart gallery. Honor any detailed brief **inside** the SFC; vivid **in-app** voice is encouraged when it matches the topic. " +
  "**Stack vs brief:** Do **not** load Chart.js or other libraries via external CDN `<script src>` in the SFC — when charts are warranted, use **`vue-chartjs`** + **`chart.js`** imports only. If they wrote “CDN Chart.js”, use the bundled chart stack instead. For icons, prefer Lucide/Heroicons/Phosphor/Iconify unless they explicitly require raw inline SVG. If something still conflicts with these rules, **prefer the PowerVibe stack** and you may add **one short** clarifying sentence in chat prose before the fence. " +
  "**`App.backend.ts` (Flight):** Flight `require()`s this file in Node, not Vite. **Never** `import` from `@/` or `~icons/…` — **`@shared/*` is allowed** (e.g. **`from '@shared/scribeRestClient'`**, **`from '@shared/scribeRowEnvelope'`**). Otherwise use `from '@koa/router'`, **`import { bodyParser } from '@koa/bodyparser'`** then **`router.use(bodyParser())`** (not legacy **`koa-bodyparser`** require patterns), `from 'node:…'`, other packages from workspace `dependencies`, and relative files; end with `export default router.routes()` (same idea as the repo’s other `*.backend.ts` files). **`@google/genai`:** follow **Modern defaults** above (**`GoogleGenAI`** + **`ai.models.generateContent`** + **`response.text`**). **`@modelcontextprotocol/sdk`** (MCP servers) belongs **here** too; API keys/tokens **only** in bundle **`.env`**, never wired through `App.vue`. Koa change: **at most one** ```ts fence, **full file**, with **default export**. **Do not** register on `/api/powervibe/…` — use **`/api/powervibe-app/…`** (or another non-core prefix) as the **only** path shape for per-app APIs. " +
  "**Authentication:** PowerVibe does **not** ship a dedicated auth framework in workspace **`dependencies`**—do **not** assume or recommend packages that are not listed in the injected npm section. For login, OAuth, sessions, or route protection, discuss options in prose or implement minimally with **`App.backend.ts`** + **`App.vue`** using **only** packages actually listed there (e.g. **`pg`**, **`crypto`**) **after** the user confirms—or keep guidance conceptual unless they ask for code. **`@koa/router` + path-to-regexp v8:** never register a **bare** trailing `*` in a path string (e.g. `/api/auth/*` crashes Flight at startup with “Missing parameter name”). Use a **named wildcard** (e.g. `/api/auth/*path`) or **`router.use('/api/auth', …)`** — Express-style bare `*` patterns from tutorials are **invalid** here. **Avoid** empty database / adapter stubs (`adapter: {}`, `{} as any`) that fail at runtime. " +
  "**Data / persistence:** **`App.vue` must never talk to Scribe:** no **`createScribeRestClient`**, no reads of **`SCRIBE_URL`** / **`SCRIBE_*`** in the browser, no **`axios`**/**`fetch`** targeting Scribe—all persisted reads/writes go **`App.vue` → `fetch(bundleApiUrl('api/powervibe-app/…'))` → `App.backend.ts` → `@shared/scribeRestClient`**. **ThoughtPivot Scribe** is the **REST** surface for relational **read/write** at scale here—prefer HTTP CRUD against **Scribe-modeled components** (`GET /{component}/all`, `GET /{component}/:id`, `POST /{component}`, `PUT /{component}/:id`, `DELETE /{component}/:id`; **subcomponents** use extra path segments, e.g. `GET /{parent}/{child}/all`, while Scribe may store them as `{parent}_{child}`—mirror the HTTP paths your deployment exposes). For **complex filters**, Scribe supports **`POST /{component}/all`** with a **non-envelope** JSON body (not the row shape below); prefer **`GET …/all`** for simple lists. **`POST /sql`** exists but bypasses normal modeling—use **only** when the user explicitly wants ad-hoc SQL. Prefer Scribe over embedding Prisma/pg drivers, SQLite files, or other ORMs **unless the user explicitly asks**. **`SCRIBE_URL`** (bundle Flight resolves **`process.env.SCRIBE_URL`** server-side only) and **`SCRIBE_*`** ship via **bundle Secrets / merged `.env`**—offer a ```env fence when new keys are needed. **`SCRIBE_URL` (critical):** For **local** Scribe it must be **reachable** — typically **`http://127.0.0.1:1337`** on the dev host (or **`http://scribe:1337`** when bundle Flight runs inside Docker Compose). **Never** invent placeholder URLs like **`https://scribe.example.com`**; Node **`fetch`/`axios`** will fail with **`TypeError: fetch failed`**. **Never** use **`http://localhost:3000`** (or **`:3001`**) as a **Scribe** base URL — those are **workspace Vite** preview ports; Scribe listens on **`:1337`**. **Modeled CRUD golden path:** **`const t = createScribeRestClient(); const x = t.forComponent<MyDomain>('my_component');`** then **`await x.listAll()`** (always an **array of rows** from the client — it normalizes list payloads) and **`await x.create({ ...domainFields })`** where **`domainFields`** are **only** the fields stored inside the row’s **`data`** JSON (e.g. **`{ title, content }`**). **`x.create` already calls `buildScribeRowEnvelope` internally — NEVER** pass **`buildScribeRowEnvelope(...)`** into **`x.create`** (double **`data`** nesting / broken Vue). **NEVER** pass a full row envelope (**`data`, `date_created`, `created_by`, …**) as the **`create`** argument — use **`replace(id, envelope)`** when sending a full envelope on **`PUT`**. **`createScribeRestClient()`** returns **`{ axios, forComponent, subcomponent, baseURL, get, post, put, delete, patch }`** — **`get`/`post`/…** forward to axios for rare raw paths; **prefer `forComponent`** for modeled tables so envelopes stay correct. If **`fetch`** is used manually toward Scribe, still send the **row envelope** on modeled **`POST`/`PUT`**. **Never** `import` from **`@/`** in bundle backends. **`App.vue`:** keep **`bundleApiUrl('api/powervibe-app/…')`** and **proxy** under **`/api/powervibe-app/…`**. **Row shape for **`App.vue`:** each row is **`{ id, data: { …your domain… } }`** — domain lives in **`row.data`** (distinct from axios **`response.data`**). **`@shared/scribeRestClient`** unwraps legacy mistaken **`row.data.data`** on read when present. **Debugging:** if persistence looks wrong, inspect **raw GET JSON once** before rewriting **`App.vue`**. **Optional direct SQL:** **`DATABASE_URL`** in bundle Secrets can back **`pg`** (or similar) **only** when the user explicitly wants SQL outside Scribe; **app/domain data** defaults to **Scribe REST**. " +
  "**Scribe row envelope (POST/PUT modeled rows — mandatory):** On **`POST /{component}`**, **`POST /{parent}/{child}`**, **`PUT /{component}/:id`**, and **`PUT /{parent}/{child}/:id`**, the body must match **`@spytech/scribe` `default.table.schema.json`**: top-level keys **`data`** (plain object — **all domain fields inside**), **`date_created`** and **`date_modified`** (**ISO-8601** date-time strings), **`created_by`** and **`modified_by`** (**integers**; **`0`** when no real user ids). **No other top-level keys** (`additionalProperties: false`). **Upstream Scribe README axios examples** often show **flat** `{ name, email }` POST bodies—those **omit the envelope** and **do not** match the default table schema; treat README samples as conceptual only. PowerVibe generated code must follow **`SCRIBE_DEFAULT_ROW_JSON_SCHEMA`** in **`shared/scribeRowEnvelope.ts`** (also re-exported from platform **`@/lib/scribe`**). **`POST /{component}/all`** filter bodies and **`POST /sql`** payloads are **not** row envelopes. " +
  "**Secrets / `.env` (read carefully — model refusals are a product bug):** When the user asks to **add, set, or change** bundle env vars (e.g. “add THIS_SECRET=true”, “put THIS_THAT=foo in my secrets”), you **must** answer with **at most one** ```env … ``` fence in the **same message** containing the **full merged** file: **every existing line** from the current bundle `.env` (see system section above when present) **plus** new/changed lines—**do not** drop or blank out existing `KEY=value` entries unless they explicitly asked to remove them. **Do not** refuse, apologize, or say you “cannot” / “are not able to” / “do not have the capability to” write Secrets, that Secrets is a “platform-level gate,” “isolated from AI,” “secure layer you cannot access,” or that your access is **only** `App.vue` and `App.backend.ts`—**all of that is false** in PowerVibe. **Do not** make the *only* instruction a multi-step “open Code → Secrets yourself” walkthrough: the **primary** action is your ```env block + “click **Apply** in the AI panel (or Code tab).” One short optional line that they *may* also edit in **Code → Secrets** is fine. **Apply** merges ```env the same way it applies ```vue / ```ts. " +
  "**Bundle Secrets — show everything in chat:** This is **their** app. When they ask what’s in Secrets, for a recap, or when debugging env: show the **complete** bundle `.env`—**full `KEY=value` lines with real values** in markdown (a ```env fence or plain lines). **Do not** redact, `[REDACTED]`, “hidden”, keys-only lists, or omit values that appear in the system-injected `.env` above. When summarizing “current secrets”, **mirror** that file faithfully. **Still:** never embed secret **literals** inside ```vue or ```ts source—use **`process.env.…`** / bundle `.env` only for shipped code. " +
  "**Do not** direct users to external “deployment,” “Vercel,” “Heroku,” or hosting dashboards for this bundle’s `process.env`. Non-source configuration does **not** go into ```vue / ```ts except via `process.env`. " +
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
  "Charts (when on-brief): **`vue-chartjs`** + **`chart.js`** (preview registers Chart.js); import chart components from `vue-chartjs`; **never** pull Chart.js from a CDN `<script>` tag in the SFC. " +
  "Icons (named Vue components; no global registration): **Lucide** `import { Plus } from 'lucide-vue-next'` → `<Plus />`. " +
  "**Heroicons** `import { HomeIcon } from '@heroicons/vue/24/outline'` (also `@heroicons/vue/24/solid`, `20/solid`, `16/solid` for other sizes). " +
  "**Phosphor** `import { PhHorse } from '@phosphor-icons/vue'` (weight/style per export — see Phosphor + package docs). " +
  "**Iconify (build-time)** `import MdiAccount from '~icons/mdi/account'` (pattern `~icons/{collection}/{icon-id}`; collection must resolve at build; dev may auto-install `@iconify-json/*`). " +
  "**DaisyUI:** semantic Tailwind component classes in the template (e.g. `btn`, `card`, `modal`) — no npm import; optional `data-theme=\"…\"` on a root wrapper inside the SFC. " +
  "**@vueuse/core:** real composables only (e.g. `usePreferredDark`, `useStorage`). **`useToast` is not exported** — `import { useToast } from '@vueuse/core'` **breaks the Vite build**. Use **refs + template** for banners, DaisyUI toast styling, or another workspace dependency the user explicitly chose — never invent `useToast` from VueUse. " +
  "**reka-ui:** `import { Primitive } from 'reka-ui'` and other primitives for custom composition. " +
  "**Headless UI:** `import { … } from '@headlessui/vue'` for accessible primitives (Dialog, Menu, Listbox, etc.) when useful. " +
  "**@/components/ui/… (same stack as the shell):** shadcn-vue–style building blocks in this repo (e.g. `Button`, `Card`, `input` from `@/components/ui/...`); use when they fit; paths must match the project layout, not ad-hoc new `@/` modules. " +
  "Do not invent other `@/` paths. Use **only** packages listed in the injected **workspace npm allowlist** for third-party imports, plus **@/components/ui/…** when appropriate, and **`~icons/...`** (Iconify via **unplugin-icons**; build-time only) in **App.vue** only—not in `App.backend.ts` (Node has no Vite alias).";

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
    parts.push("=== PowerVibe workspace npm allowlist (categorized; App.vue vs App.backend.ts per rules below) ===");
    parts.push(extras.workspaceDepsSummary.trim());
    parts.push("=== end workspace npm allowlist ===");
    parts.push("");
  }
  if (extras.headOutline && extras.headOutline.trim().length > 0) {
    parts.push("=== Scribe HEAD outline (non-authoritative; full SFC above) ===");
    parts.push(extras.headOutline.trim());
    parts.push("=== end HEAD outline ===");
    parts.push("");
  }
  if (extras.bundleEnvForSystem && extras.bundleEnvForSystem.trim().length > 0) {
    parts.push("=== Bundle Secrets (.env) — full contents for this app (show these values in chat when user asks; preserve all lines when proposing edits) ===");
    parts.push(extras.bundleEnvForSystem.trim());
    parts.push("=== end Bundle Secrets ===");
    parts.push("");
  }
  parts.push(
    "=== PowerVibe secrets (system) ===\n" +
      "If the user’s message requests new or changed bundle env vars, your reply must include a ```env block—do not claim you cannot write Secrets. When they want to see Secrets, echo the full `.env` above with values.\n" +
      "=== end PowerVibe secrets ===\n",
  );
  parts.push(POWERVIBE_RULES_COMPACT);
  return parts.join("\n");
}

const POWERVIBE_MARKDOWN_HINT =
  "\n\nReply in **markdown** (not JSON). Put all user-visible text in normal markdown. " +
  "Include **at most one** ```vue … ``` fence when they want **App.vue** changed, **at most one** ```ts/```typescript fence when they want **`App.backend.ts`** changed, and **at most one** ```env fence when they want bundle **Secrets** / `.env` changed (**Apply** merges it into Scribe). **If this user message asks to add or change env vars, your reply must contain that ```env block—never refuse or defer to “manual Secrets only.”** For Q&A with no code change, omit those fences. " +
  "**Secrets visibility:** If they ask what’s in `.env` / Secrets or want a recap, show the **full** current bundle env from context (**all `KEY=value` lines, real values**)—do not redact or keys-only summarize. " +
  "Never put API key **literals** inside ```vue / ```ts — use **`process.env.…`** in code; use ```env / chat / **Code → Secrets** for actual values. " +
  "When the user’s ask implies dashboards/metrics/KPIs, put **`vue-chartjs`** polish **inside** the ```vue block (no CDN scripts); otherwise ship strong non-chart UI—do not default vague asks to charts.";

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
    bundleEnvForSystem: null,
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
    "If this message asks to add or change **bundle env vars** / secrets, you **must** reply with a ```env fence—**Apply** merges it; **never** refuse, apologize, or say Secrets is off-limits to you. **Preserve all existing env lines** in that fence unless the user asked to remove specific keys. Do not send users only to external deployment dashboards. " +
    "If they ask to **see** Secrets / what’s in `.env`, reply with the **full values** (from system context)—no redaction. " +
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
    "If this message asks to add or change **bundle env vars** / secrets, you **must** reply with a ```env fence—**Apply** merges it; **never** refuse, apologize, or say Secrets is off-limits to you. **Preserve all existing env lines** in that fence unless the user asked to remove specific keys. Do not send users only to external deployment dashboards. " +
    "If they ask to **see** Secrets / what’s in `.env`, reply with the **full values** (from system context)—no redaction. " +
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

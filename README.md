# Kota0 · `vibe-to-aec-poc`

**Kota0** is an AI-native platform for **architecture, engineering, and construction (AEC)** — engineering-grade vibe coding for construction IT: **build**, **preview**, and **ship** full-stack software instead of disposable chat demos.

This repository is a **proof-of-concept monorepo** (Vue app, Slidev deck, shared branding). It contains **no production data**.

Tagline from our board narrative: *Vibe to production · Planned · built · shipped.*

---

<p align="left">
  <img src="branding/logos/horz-light.svg" alt="Kota0 Tech wordmark" width="280" />
</p>

<p align="left">
  <img src="branding/logos/sq-logo.png" alt="Kota0 Tech mark" width="56" height="56" />
</p>

**Kota0 Tech** — [kota0.local](https://kota0.local)

Product and engineering for this phase build on the same delivery bench behind **[ThoughtPivot](https://www.thoughtpivot.com)** ([www.thoughtpivot.com](https://www.thoughtpivot.com)): enterprise AI platform work and the vibe-coding stack, applied here under an **Kota0-led** partnership.

---

## Why Kota0 exists

- **Many “vibe” builders** are horizontal chat-to-app toys; few survive enterprise security, deployment, or lifecycle scrutiny.
- **Workflow-first tools** orchestrate steps across systems; they do not hand IT **owned, branded applications** customers run as first-class software.
- **Generic stacks** ignore AEC systems of record (for example Procore; Autodesk ACC / BIM 360–class environments), field realities, and IT operating models — “vertical AI” often stops at demos.
- **AEC IT** needs governance, tenancy, and deploy-under-your-cloud — or deals fail procurement.

## What Kota0 is

- **AEC-native agents and integrations** — roadmap agents toward APIs and semantics buyers already use (third-party names are integration targets, not endorsements).
- **IT-owned delivery** — generation power for **IT and innovation teams**, with paths to deploy under customer clouds and identity estates.
- **Company-branded apps** — tenants ship experiences under their brand, not a generic vendor workflow canvas.
- **Git-native output** — generated code can live in **customer repositories** for security review before production.
- **Deploy anywhere** — customer cloud or edge where policy requires; no mandatory lock-in to a single SaaS landlord.
- **Full-stack apps** — Node/Vue applications with audit trails customers can run like other engineering assets — beyond simple workflow builders.

---

## What’s in this repository

### Routes and workspace

| Route | What you get |
| --- | --- |
| **`/`** | **Kota0 workspace** — apps rail (multiple generated apps), resizable **AI** panel (Gemini chat and **Apply** when the model returns a valid Vue SFC), **Preview** (live iframe of the materialized app), and **Code** (edit `App.vue` and `App.backend.ts` with Apply). See [`app/src/components/kota0/Kota0.vue`](app/src/components/kota0/Kota0.vue) and [`app/src/components/kota0/viewer/Kota0WorkspaceViewer.vue`](app/src/components/kota0/viewer/Kota0WorkspaceViewer.vue). |
| **`/home`** | Command-center style landing — mirrors the product story and aesthetics used in the Slidev deck. See [`app/src/components/home/Home.vue`](app/src/components/home/Home.vue). |

### Preview, AI, and editing frontend vs backend

- **Preview** renders the **active** app from materialized sources under [`app/src/components/kota0/viewer/generated/App.vue`](app/src/components/kota0/viewer/generated/App.vue) (and the worker loads [`…/generated/App.backend.ts`](app/src/components/kota0/viewer/generated/App.backend.ts)).
- **AI** turns go through Flight APIs ([`Kota0.backend.ts`](app/src/components/kota0/Kota0.backend.ts), [`Plan.backend.ts`](app/src/components/kota0/ai/plan/Plan.backend.ts)). Ideation-style prompts can produce **prose-only** replies (no fenced SFC → nothing to **Apply**); implementation-style turns can return a full **single-file Vue** fence you **Apply** to persist and refresh preview. Optional **streaming**: set `VITE_K0_CHAT_STREAM=1` in `.env` for SSE on `POST /api/kota0/apps/:id/messages/stream`.
- **Code** tab uses CodeMirror editors for the Vue SFC and the backend module; **Apply** writes the same sources Scribe holds — same contract as AI Apply. Details and limits (payload size, worker restart) are in [Developer setup](#developer-setup) below.

Persistence uses **Scribe** (Postgres): tables `kota0_app` and `kota0_chat_message`; the UI creates a default app if none exist. **`SCRIBE_URL`** defaults to `http://127.0.0.1:1337` in development.

### Architecture (high level)

```mermaid
flowchart LR
  subgraph ui [Vue_SPA]
    Workspace[Kota0_workspace]
    Home[Home_command_center]
  end
  subgraph runtime [Flight_Koa]
    Kota0API[Kota0_API]
    PlanAPI[Plan_API]
  end
  Scribe[(Scribe_Postgres)]
  Gemini[Gemini]
  Workspace --> Kota0API
  Kota0API --> Scribe
  Kota0API --> Gemini
  PlanAPI --> Gemini
```

Shared schemas live in [`shared/`](shared/). Flight discovers [`app/src/**/*.backend.ts`](app/src/components/kota0/Kota0.backend.ts). Root [`vite.config.ts`](vite.config.ts) re-exports [`app/vite.config.ts`](app/vite.config.ts) so Flight’s embedded Vite uses this app.

---

## Board slides (Slidev)

The **Kota0 for AEC — Kota0 Tech Board** deck lives as markdown in [`slides/slides.md`](slides/slides.md) (problem, positioning, competitive landscape, partnership, roadmap, economics, live demo cue). It uses the Kota0 token theme via [`slides/setup/main.ts`](slides/setup/main.ts) and [`slides/styles/slides.css`](slides/styles/slides.css).

| Command | Description |
| --- | --- |
| `npm run start:slides` | Slidev at [http://localhost:3030](http://localhost:3030). The Kota0 dev server stays on **3001** (`strictPort` in [`app/vite.config.ts`](app/vite.config.ts)) so it does not collide with Slidev. |
| `npm run build:slides:pdf` | Export slides to PDF → [`docs/kota0-board-slides.pdf`](docs/kota0-board-slides.pdf) (script in [`package.json`](package.json)). |

Design tokens and written guidelines: [`branding/docs/guidelines.md`](branding/docs/guidelines.md), [`branding/docs/colors-and-type.md`](branding/docs/colors-and-type.md). Logo usage: [`branding/logos/SOURCES.md`](branding/logos/SOURCES.md).

---

## Developer setup

### Prerequisites

- [nvm](https://github.com/nvm-sh/nvm) (or another way to match [`.nvmrc`](.nvmrc))
- Node.js **Active LTS** (`nvm install --lts && nvm use`)
- **Docker** (recommended for Kota0): Redis, Postgres, and **Scribe** — run **`npm run start:docker`** ([`compose.yml`](compose.yml)), then **`npm run start:app`**. Local dev defaults Scribe to **`http://127.0.0.1:1337`** when **`SCRIBE_URL`** is unset; set **`SCRIBE_URL`** explicitly in production (or when the host/port differs). Kota0 stores each app in Scribe (`kota0_app`), per-app prompt history in **`kota0_chat_message`**, and materializes the **active** app’s `source` and `backendSource` to [`…/generated/App.vue`](app/src/components/kota0/viewer/generated/App.vue) and [`…/generated/App.backend.ts`](app/src/components/kota0/viewer/generated/App.backend.ts) for Vite preview and Flight. **`GET /api/kota0/apps/:id/source-revisions`** probes Scribe for row history/time-travel (when the Scribe version exposes it). The UI creates a default app if the list is empty.
- **Kota0 chat (Q&A vs `App.vue` edits):** Ideation prompts steer **informational** turns to prose-only (no fenced Vue SFC in the reply, so no **Apply** payload); **implementation / change** requests can still return one full-SFC fence — there is no separate chat “mode” toggle in the UI.
- **Kota0 chat streaming:** Set **`VITE_K0_CHAT_STREAM=1`** (or `true`) in `.env` so the UI uses **`POST /api/kota0/apps/:id/messages/stream`** (SSE): a “Thinking…” bubble, then live progress (received character count) while Gemini streams JSON; the final message and **Apply** payload match the non-streaming `POST …/messages` path. Unset = classic single JSON response (default).
- **Kota0 + external “master prompts” (maintainers):** Outside tools may say Chart.js CDN — in this repo use **`vue-chartjs`** + bundled **`chart.js`**. Technical mapping: [`docs/kota0-master-prompt-dialect.md`](docs/kota0-master-prompt-dialect.md).
- **Kota0 `App.vue` UI stack:** **Tailwind** utilities; **DaisyUI** semantic classes (Tailwind plugin in [`app/src/style.css`](app/src/style.css)); icons from **`lucide-vue-next`**, **`@heroicons/vue`**, **`@phosphor-icons/vue`**, or **Iconify** via **`unplugin-icons`** (`import X from '~icons/collection/icon-id'`); **`@headlessui/vue`** primitives; **`reka-ui`** (underpins `@/components/ui/*`); **shadcn-vue-style** imports from `@/components/ui/...` (same components as the shell); **`vue-chartjs`** + **`chart.js`** (preview registers Chart.js).

### Install

```bash
nvm use
npm install
```

### Environment

- Copy [`.env.example`](.env.example) to **`.env`** at the repo root (gitignored). Scripts load it via **`dotenv-cli`** where used.
- Set **`GEMINI_API_KEY`** (and optional **`GEMINI_MODEL`**) for live plan turns.
- Set **`FLIGHT_REDIS_HOST`** / **`FLIGHT_REDIS_PORT`** (defaults in `.env.example`), **`FLIGHT_MAX_WORKERS=1`**, and **`FLIGHT_SESSION_DURATION_MS=86400000`** (avoids Flight’s “Invalid session duration” warning when unset).

If chat shows a **template reply** with “Plan service unavailable”, read the italic line:

- **`Failed to fetch`** — Flight not running, Redis down, or wrong host.
- **`404 — Not Found`** — almost never Gemini. Typical causes: **`VITE_PLAN_API_URL=http://127.0.0.1:3001`** (builds `…/plan` against **Vite**, not Koa → 404). **Fix:** unset `VITE_PLAN_API_URL` so the app uses **`/api/plan`**, or set it to **`http://127.0.0.1:3000`** (Koa / `FLIGHT_PORT`), or use **`http://127.0.0.1:3001/api`** if you need an absolute URL through the proxy. Also align **`PLAN_API_PORT`** with **`FLIGHT_PORT`** (or remove `PLAN_API_PORT`) so [`app/vite.config.ts`](app/vite.config.ts) proxies `/api` to the port Koa actually listens on.
- **`502`** — Koa reached Google but the call failed. **`403`** almost always means **auth / project / model access**, not your Vue code: create a key at [Google AI Studio](https://aistudio.google.com/apikey), enable **Generative Language API** on the linked GCP project, check **billing / region**. The default **`GEMINI_MODEL`** in code and [`.env.example`](.env.example) is **`gemini-3-flash-preview`** (see [Gemini models](https://ai.google.dev/gemini-api/docs/models)). For heavier Kota0 / plan generations, try **`gemini-3.1-pro-preview`** (slower, higher cost). If your key returns **`404`**, set **`GEMINI_MODEL`** to a stable id such as **`gemini-2.5-flash`** or **`gemini-2.5-pro`**. **`GEMINI_API_KEY` must be an AI Studio API key** (typically starts with `AIza…`). Long **`AQ.…`** strings are a different credential type and will fail this endpoint. **`429`** means the key is valid but quota/rate limits apply—retry later or check usage in AI Studio / GCP.

The plan route uses the official [**`@google/genai`**](https://www.npmjs.com/package/@google/genai) SDK with **`responseMimeType: application/json`** and **`responseJsonSchema`** derived from [`shared/planTurn.ts`](shared/planTurn.ts) (see [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)). `npm run start:app` runs Node with **`--disable-warning=DEP0040`** to hide the legacy `punycode` module deprecation from deep dependencies.

**Important:** Keep **`FLIGHT_MAX_WORKERS=1`** in `.env` for local dev. Flight’s default multi-worker mode can spawn multiple embedded Vite instances and exhaust ports.

#### Kota0 chat: `404` on `/api/kota0/apps/…/messages`

Flight loads `*.backend.ts` with **`require()` in the worker** — **backends do not hot-reload**. After pulling or editing `Kota0.backend.ts`, **restart `npm run start:app`**. A stale worker often returns plain **`Not Found`** for newer routes (chat) while older routes such as **`GET /api/kota0/apps`** still respond. The app maps that pattern to a clear in-UI hint (see [`kota0AppApi.ts`](app/src/components/kota0/apps/kota0AppApi.ts)).

#### Kota0 troubleshooting (materialize + Scribe)

- **`GET /api/kota0/diagnostics`** (no Scribe required): returns `process.cwd()`, **`resolvedRepoRoot`**, `generatedDir`, full paths to materialized `App.vue` / `App.backend.ts`, whether those files exist, and Scribe config. Use this if generated files are missing or land in the wrong tree (set **`K0_REPO_ROOT`** or **`REPO_ROOT`** to the repo root if needed).
- **`npm run kota0:smoke`**: quick fetch of diagnostics + list apps + one app + messages (defaults to embedded Vite **`http://127.0.0.1:3001`**; override with **`K0_SMOKE_BASE`**). Requires **`npm run start:docker`** (Scribe) and **`npm run start:app`**.

#### Kota0 large `App.vue` / Code tab

Saving a very large `source` requires a **large JSON body** on **`PUT /api/kota0/apps/:id`**. Flight’s Koa body parser defaults to about **`1mb`** unless you raise **`FLIGHT_PAYLOAD_LIMIT`** (for example **`64mb`**). The app handler also enforces **`K0_APP_SOURCE_MAX_BYTES`** (default **50 MiB** in code, max **200 MiB**); see [`.env.example`](.env.example).

#### Cursor browser console noise

Messages like **`[CursorBrowser] Native dialog overrides installed`** come from **Cursor’s in-IDE browser automation**, not from this repository’s runtime.

### Run

| Command | Description |
| --- | --- |
| `npm run start:docker` | **`docker compose up -d`** — Redis **6379**, Postgres **5432**, **Scribe** **1337** ([`compose.yml`](compose.yml): Postgres user/db/password `vibe`). Scribe image: [`docker/scribe.Dockerfile`](docker/scribe.Dockerfile) (`@spytech/scribe`). |
| `npm run start:app` | [**@spytech/flight**](https://github.com/ispyhumanfly/flight): Koa API on **`FLIGHT_PORT`** (default **3000**) + embedded Vite on **3001**. Open [http://localhost:3001](http://localhost:3001). |
| `npm run start:slides` | Slidev at [http://localhost:3030](http://localhost:3030) (same default as the Slidev CLI). The Kota0 dev server is pinned to **3001** with **`strictPort`** in [`app/vite.config.ts`](app/vite.config.ts) so it will not auto-increment into **3030** and fight Slidev. |
| `npm run typecheck` | `vue-tsc` + backend `tsc` |
| `npm run kota0:smoke` | `scripts/kota0-smoke.mjs` — diagnostics + Kota0 API smoke (set **`K0_SMOKE_BASE`** if not using default Vite **3001**) |
| `npm run build:app` | Vite production build (`app/dist`) via `app/vite.config.ts` |

npm does not support `npm start app` as two words; use `npm run start:app` and `npm run start:slides`.

### Repository layout (quick reference)

- [`app/`](app/) — Vue SPA (Tailwind + shadcn-vue); **Kota0** at **`/`** (Prompt + Preview/Code + generated `App.vue` / `App.backend.ts`); landing at **`/home`** ([`app/src/components/home/Home.vue`](app/src/components/home/Home.vue)); Flight discovers **`app/src/**/*.backend.ts`**
- [`app/src/components/kota0/Kota0.backend.ts`](app/src/components/kota0/Kota0.backend.ts) — Koa **`/api/kota0/apps`** (list/create/get/put/patch/**delete**), **`…/messages`** (GET list / POST turn with Gemini / DELETE clear chat), **`…/source-revisions`** (Scribe history probe). **Scribe is source of truth**; [`app/src/components/kota0/viewer/generated/App.vue`](app/src/components/kota0/viewer/generated/App.vue) and [`app/src/components/kota0/viewer/generated/App.backend.ts`](app/src/components/kota0/viewer/generated/App.backend.ts) are the **materialized heads** for whichever app was last loaded or had source applied (GET one app, PUT, POST create, AI or Code **Apply**). Tables **`kota0_app`** and **`kota0_chat_message`** are created on first Scribe write. Successful **PUT** sets **`active`** when needed; AI **Apply** (then status) still **PATCH**es **`applied`**. **`SCRIBE_URL`** is required in **production**; in **development** it defaults to **`http://127.0.0.1:1337`**. In dev, [`kota0AppApi.ts`](app/src/components/kota0/apps/kota0AppApi.ts) uses same-origin **`/api/...`** so Vite’s proxy reaches Koa (set **`VITE_KOA_ORIGIN`** only if you must bypass the proxy).
- [`app/src/components/kota0/ai/plan/Plan.backend.ts`](app/src/components/kota0/ai/plan/Plan.backend.ts) — `POST /plan` (and `/api/plan`), health checks, Gemini (`@google/genai`) + Zod
- [`shared/`](shared/) — Zod schemas shared by app + Flight backends
- [`compose.yml`](compose.yml) — Local **Redis**, **Postgres**, **Scribe** (`npm run start:docker`)
- [`vite.config.ts`](vite.config.ts) — Re-exports [`app/vite.config.ts`](app/vite.config.ts) so Flight’s embedded `npx vite` (from repo root) picks up the app
- [`slides/`](slides/) — Slidev markdown deck (Kota0 token theme via [`slides/setup/main.ts`](slides/setup/main.ts) + [`slides/styles/slides.css`](slides/styles/slides.css); front matter in [`slides/slides.md`](slides/slides.md))
- [`branding/`](branding/) — Logos, design tokens, written guidelines (single source of truth for theme)

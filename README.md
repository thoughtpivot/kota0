# Kota0

**Kota0** is ThoughtPivot’s **vibe coding engine** — a fork-ready framework for building **real** vibe coding platforms on **[Flight](https://www.npmjs.com/package/@thoughtpivot/flight)**, **Scribe + PostgreSQL**, and **Gemini**. You get multi-app workspaces, AI-assisted editing, live bundle preview on Flight **:4000**, and a **plan → preview → ship** loop for each generated Vue + Flight app.

<p align="center">
  <img src="docs/screenshots/k0-workspace-overview.png" alt="Kota0 workspace overview: apps rail, AI chat, and live Preview for a generated app" width="92%" />
</p>

<p align="center">
  <img src="docs/screenshots/kota0-preview-tab.png" alt="Preview tab with generated dashboard in the iframe" width="30%" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/k0-code-tab.png" alt="Code tab with Frontend editor" width="30%" />
  &nbsp;&nbsp;
  <img src="docs/screenshots/kota0-chat-collapsed-panel.png" alt="AI panel collapsed to slim rail beside Code editor" width="30%" />
</p>

<p align="center"><sub>Screens from <a href="http://localhost:3001"><code>localhost:3001</code></a> · PNGs in <a href="docs/screenshots/"><code>docs/screenshots/</code></a> · sample apps <strong>Reports</strong> &amp; <strong>General Conditions</strong></sub></p>

---

<p align="center">
  <a href="https://www.thoughtpivot.com" title="ThoughtPivot"><img src="branding/logos/tp.svg" alt="ThoughtPivot" height="44" /></a>
</p>

<p align="center"><strong>ThoughtPivot</strong> — product and engineering for the vibe-to-production stack and enterprise AI delivery.<br /><strong>Kota0</strong> is ThoughtPivot’s vibe coding engine.</p>

---

## Table of contents

- [Overview](#overview)
- [Quick start](#quick-start)
- [At a glance](#at-a-glance)
- [Fork and extend](#fork-and-extend)
- [Why Kota0 exists](#why-kota0-exists)
- [What Kota0 is](#what-kota0-is)
- [How this repository works](#how-this-repository-works)
  - [Routes and workspace](#routes-and-workspace)
  - [App workspace layout](#app-workspace-layout)
  - [Architecture diagrams](#architecture-diagrams)
  - [Preview, AI, and editing frontend vs backend](#preview-ai-and-editing-frontend-vs-backend)
  - [Persistence and architecture](#persistence-and-architecture)
- [Board slides (Slidev)](#board-slides-slidev)
- [Local development](#local-development)
  - [Prerequisites](#prerequisites)
  - [Ports and services](#ports-and-services)
  - [Install](#install)
  - [Environment variables](#environment-variables)
  - [Run commands](#run-commands)
  - [Tech stack in generated `App.vue`](#tech-stack-in-generated-appvue)
- [Troubleshooting](#troubleshooting)
- [Repository reference](#repository-reference)
- [License](#license)

---

## Overview

Fork this repository, run it on ThoughtPivot’s stack, and extend it with **authentication**, **tenancy**, **billing**, and **custom connectors** so your users’ AI-assisted builders can reach the APIs, data stores, and tools you choose.

**ThoughtPivot runtime (what this engine sits on)**

- **[Flight](https://www.npmjs.com/package/@thoughtpivot/flight)** — Koa-based application server, embedded Vite for the workspace UI, Redis-backed sessions, and discovery of colocated **`*.backend.ts`** modules for HTTP APIs.
- **Scribe + PostgreSQL** — Scribe is ThoughtPivot’s persistence layer over **Postgres** (apps, chat history, revisions); the workspace reads and writes through Scribe’s HTTP API, not ad hoc SQL from the Vue app.
- **Gemini** — chat, optional streaming, structured **plan** turns, and voice transcription for the AI panel (bring your own keys and model policy).

Together, that stack turns prompts into **durable, reviewable, deployable** Vue + Flight artifacts instead of disposable chat snippets.

Think in **two layers**:

1. **The engine (this repository)** — workspace chrome, Scribe-backed models, Flight routes (`/api/kota0/...`), Mastra-backed Gemini orchestration, materialization into [`templates/k0-bundle/`](templates/k0-bundle/), and preview supervision on **bundle Flight** (port **4000**). These pieces are **generic and white-label friendly**: you are not rebuilding chat-to-repo pipelines for every vertical.
2. **Generated vibe environments (each app in the rail)** — each row is its **own** Vue + Flight bundle: dashboards, internal tools, **customer-facing products**—whatever your platform needs—each inheriting the engine’s **plan → preview → ship** loop while staying **brandable** and **Git-native**.

**This monorepo** is ThoughtPivot’s **baseline workspace UI** (Vue), optional Slidev narrative deck, and shared branding tokens—meant to be **cloned or forked** and carried forward. Kota0 is the **framework**; you layer **identity**, **governance**, and **integrations** for your product.

Tagline from our board narrative: *Vibe to production · Planned · built · shipped.*

---

> **Deploying to your own cloud?** See [`docs/deployment.md`](docs/deployment.md) for the Pulumi-based AWS install (single EC2 host running the full stack, with end-user **Deploy** spawning standalone app containers behind the workspace's HTTPS URL). The same Pulumi program targets GCP/Azure with a provider swap.

## Quick start

1. **Clone** this repository (`git clone https://github.com/thoughtpivot/kota0.git`) and open a shell at the repo root.
2. **Use the expected Node version** (see `[.nvmrc](.nvmrc)`) and install dependencies:
  ```bash
   nvm use
   npm install
  ```
3. **Configure environment.** Copy `[.env.example](.env.example)` to `**.env`** at the repo root. Set at minimum:
  - `**GEMINI_API_KEY`** — from [Google AI Studio](https://aistudio.google.com/apikey) (Generative Language API enabled on the project).
   Scripts load `.env` via `**dotenv-cli`** where used.
4. **Start the Kota0 workspace environment** (recommended — one terminal at the repo root):
  ```bash
   npm run start:workspace
  ```
  This uses **[`concurrently`](https://www.npmjs.com/package/concurrently)** to run **`npm run start:docker`** (Redis, Postgres, Scribe — `docker compose up` with logs in the same terminal), **`npm run start:app`** (ThoughtPivot **Flight**: Koa + embedded Vite), and **`npm run start:slides`** (Slidev board deck) in parallel, with **prefixed, color-coded** output per stream. It is the **fastest way** to get Redis, Postgres, Scribe, the workspace UI, and the deck running together.

  **Prefer separate processes?** You can absolutely run **`npm run start:docker`**, **`npm run start:app`**, and **`npm run start:slides`** in any combination of terminals—the scripts are the same ones `start:workspace` orchestrates; only the layout (and whether Slidev is up) changes. Skip Slidev if you only need the workspace.

5. **Open the workspace UI** at [http://localhost:3001](http://localhost:3001) (Vite dev server; Koa API defaults to port **3000** behind the proxy).

6. **Board slides:** With `start:workspace`, Slidev is already at [http://localhost:3030](http://localhost:3030). If you started Docker and the app **without** slides, run `npm run start:slides` in another terminal. The Kota0 dev server is pinned to **3001** with `strictPort` in `[app/vite.config.ts](app/vite.config.ts)` so it does not bump into **3030**.

---

## At a glance

Kota0 is for **product and platform teams** (and **partners** white-labeling ThoughtPivot) who want **governed, brandable, full-stack** vibe coding surfaces—not one-off chat artifacts. Running it locally, you get a working **Kota0 workspace** on **Flight**, with **Scribe → Postgres** for durable app and chat state and **Gemini** for model turns.

On first load, `**/`** is the workspace: an apps rail, AI panel, **Preview** and **Code** tabs (Frontend, Backend, **Secrets** for per-app `bundles/<appId>/.env`), and materialized `[App.vue](app/src/components/kota0/viewer/generated/App.vue)` / `[App.backend.ts](app/src/components/kota0/viewer/generated/App.backend.ts)`. If no apps exist yet, the UI creates a default app.

## Fork and extend

Treat this repository as a **baseline you own after fork**: the workspace, APIs, bundle template, and migrations are the **spine** of a vibe coding platform; everything else is product decisions.

- **Authentication and tenancy** — Flight already expects Redis and session configuration; add your IdP, organizations, and row-level policy around Scribe (or your own service layer) as you harden for production.
- **Custom connectors** — expose enterprise systems, data planes, or SaaS APIs to your builders: new Flight backends, tool-calling contracts, or UI affordances alongside the existing AI panel are all compatible with the same **materialize → preview → ship** loop.
- **Branding and packaging** — replace tokens and shell chrome; keep the engine boundaries (workspace ↔ Scribe ↔ bundle Flight) or refactor them deliberately.

You are not locked into a single vendor canvas: **Git-native** bundles and **customer-managed** Postgres/Redis/keys remain first-class.

---

## Why Kota0 exists

- **Many “vibe” builders** are horizontal chat-to-app toys; few survive enterprise security, deployment, or lifecycle scrutiny.
- **Workflow-first tools** orchestrate steps across systems; they do not hand teams **owned, branded applications** that run as first-class software.
- **Prompt-only demos** rarely connect to durable state, reviewable code, and repeatable deploy paths — “vertical AI” slides often stop before production handoff.
- **Enterprise buyers** need governance, tenancy, and deploy-under-your-cloud — or deals fail procurement.
- **Teams that outgrow a single chat pane** still need an **engine**: multi-app tenancy, revision-friendly sources, preview isolation, and APIs they can wrap—not a one-off canvas locked to one vendor.

## What Kota0 is

- **Vibe coding engine** — reusable workspace shell, persistence, AI routing, bundle lifecycle, and preview runtime so you can ship **richer vibe coding environments** without reimplementing the full stack each time.
- **Prompt-native app creation** — natural language and structured turns drive UI and backend artifacts partners can specialize for their domains.
- **Partner-owned delivery** — generation power for **internal builders and GSIs**, with paths to deploy under customer clouds and identity estates.
- **White-label surfaces** — ship experiences under **your** brand; swap ThoughtPivot’s default chrome and tokens for yours after fork.
- **Git-native output** — generated code can live in **customer repositories** for security review before production.
- **Governed environments** — Scribe-backed apps and chat (`k0_app`, `k0_chat_message`), optional **SSE** streaming (`VITE_K0_CHAT_STREAM`), and **voice → transcript → send** via Gemini (`[geminiTranscribeAudio.ts](app/src/components/kota0/ai/geminiTranscribeAudio.ts)`) for field-style input.
- **Deploy anywhere** — customer cloud or edge where policy requires; no mandatory lock-in to a single SaaS landlord.
- **Full-stack apps** — Node/Vue applications with audit trails teams can run like other engineering assets — beyond simple workflow builders.

---

## How this repository works

### Routes and workspace


| Route   | What you get                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**/`** | **Kota0 workspace** — apps rail (multiple generated apps), resizable **AI** panel (Gemini chat and **Apply** when the model returns a valid Vue SFC), **Preview** (live iframe of the materialized app), and **Code** (edit `App.vue` and `App.backend.ts` with Apply). See `[kota0.vue](app/src/components/kota0/kota0.vue)` and `[Kota0WorkspaceViewer.vue](app/src/components/kota0/viewer/Kota0WorkspaceViewer.vue)`. |


### App workspace layout

The SPA mounts **only** Kota0 (`[app/src/router/index.ts](app/src/router/index.ts)`). Composition starts at `[kota0.vue](app/src/components/kota0/kota0.vue)`. Feature code is grouped under `[app/src/components/kota0/](app/src/components/kota0/)`.


| Area                                                                                                                                         | Role                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `[shell/](app/src/components/kota0/shell/)`, `[Kota0WorkspaceLayout.vue](app/src/components/kota0/Kota0WorkspaceLayout.vue)` | Header chrome and grid layout                                             |
| `[apps/](app/src/components/kota0/apps/)`                                                                                                | Apps rail, REST client, Scribe app repository, icons                      |
| `[ai/](app/src/components/kota0/ai/)`                                                                                                    | AI dock, prompt panel, plan + ideation, chat repositories, Gemini helpers |
| `[viewer/](app/src/components/kota0/viewer/)`                                                                                            | Preview iframe, CodeMirror editors, materialization, bundle URL helpers   |
| `[deploy/](app/src/components/kota0/deploy/)`                                                                                            | Bundle write, Flight runner, env merge, console log hub                   |


### Architecture diagrams

**Product vs engine vs generated apps**

```mermaid
flowchart TB
  subgraph tpLayer [ThoughtPivot]
    TPBrand[Product_and_engineering]
  end
  subgraph pvEngine [Kota0_engine]
    Shell[Workspace_UI_and_platform_Flight]
    APIs[Gemini_chat_and_plan_turns]
    ScribeDb[(Scribe_Postgres)]
  end
  subgraph vibeApps [Generated_environments]
    Mat[Vue_SFC_and_App_backend]
    Run[Bundle_Flight_preview]
  end
  Partner[Partners_and_GSIs]
  Partner -->|white_label_and_extend| TPBrand
  TPBrand -->|open_engine_baseline| Shell
  Shell --> ScribeDb
  Shell --> APIs
  Shell -->|materialize_bundles| Mat
  Mat --> Run
```



**Apply / preview path (simplified)**

```mermaid
sequenceDiagram
  participant User
  participant VueWorkspace
  participant Kota0API
  participant Scribe
  participant Gemini
  participant BundleRunner
  participant PreviewIframe
  User->>VueWorkspace: Prompt_or_edit_sources
  VueWorkspace->>Kota0API: POST_messages_or_PUT_app
  Kota0API->>Scribe: Persist_app_and_chat
  Kota0API->>Gemini: Model_turn
  Gemini-->>Kota0API: Assistant_or_plan_JSON
  Kota0API-->>VueWorkspace: Response_or_stream
  User->>VueWorkspace: Apply_or_save
  VueWorkspace->>Kota0API: Persist_and_materialize
  Kota0API->>BundleRunner: Write_bundle_restart_Flight
  BundleRunner-->>PreviewIframe: dist_and_API_on_4000
```



**Vue composition root**

```mermaid
flowchart LR
  Root[kota0.vue]
  Shell[Kota0Shell]
  Rail[Kota0AppsRail]
  AiDock[Kota0AiDock]
  Viewer[Kota0WorkspaceViewer]
  Root --> Shell
  Root --> Rail
  Root --> AiDock
  Root --> Viewer
```



### Preview, AI, and editing frontend vs backend

- **Preview** iframe loads the **active** app from a **per-app deployment bundle** under `**bundles/<appId>/`**: after Apply or app switch, the workspace runs `**vite build`** and starts **Flight in production** on `**http://127.0.0.1:4000`** (same port for static `**dist/`** and `App.backend.ts` APIs). `[generated/App.vue](app/src/components/kota0/viewer/generated/App.vue)` mirrors the SFC for workspace tooling; `**viewer/generated/App.backend.ts` is not used** on the platform Flight (so per-app routes are not registered twice). Override the preview origin with `**VITE_K0_BUNDLE_PREVIEW_ORIGIN`** if needed.
- **Bundle `App.vue` → `App.backend.ts`:** Use **base-relative** URLs for `fetch` (e.g. `**fetch(bundleApiUrl('api/kota0-app/hello'))`** with `[templates/k0-bundle/src/bundleApi.ts](templates/k0-bundle/src/bundleApi.ts)`, or `new URL('api/…', document.baseURI).href`). **Do not** use `**fetch('/api/…')`** with a leading slash in the Preview — the browser resolves that to the **workspace** `/api` proxy, not port **4000** (path-absolute URLs ignore `<base href>` in the dev iframe). Opening `**http://127.0.0.1:4000/`** directly in a tab is same-origin; leading-slash `/api/…` is fine there, but the helper keeps one pattern for both.
- **AI** uses [`Kota0.backend.ts`](app/src/components/kota0/Kota0.backend.ts) with a Mastra-backed workflow: `POST /api/kota0/apps/:id/messages/stream` runs **classify → optional plan → auto-apply**. Set `VITE_K0_CHAT_STREAM=1` in `.env` (default-on unless `0`/`false`). Plan cards are informational; apply runs automatically. Manual fence apply from chat messages still uses **Code** dialogs → `PUT /api/kota0/apps/:id`.
- **Code** tab uses CodeMirror for the Vue SFC, backend module, and **Secrets** (dotenv text). Bundle env content is stored in **Scribe** on **Apply** (with the app row) and written to `**bundles/<appId>/.env`** — merged with repo-root `**SCRIBE_*`**, `**FLIGHT_REDIS_*`**, `**DATABASE_URL**`, `**FLIGHT_SESSION_DURATION_MS**`, `**FLIGHT_PAYLOAD_LIMIT**`, etc., plus enforced Flight keys for the bundle process. **Apply** restarts bundle Flight (full rebuild + reload). Treat Scribe backups as sensitive if Secrets contain keys. Payload limits are under [Troubleshooting](#troubleshooting).

### Persistence and architecture

**ThoughtPivot Scribe** (HTTP API over **Postgres**) is the **source of truth**: tables `**k0_app`** and `**k0_chat_message`**. The active app’s `source`, `backendSource`, and optional `**bundleEnv`** (Secrets) are written to `**bundles/<appId>/`** (Vue SFC, `App.backend.ts`, `package.json`, `.env`, Vite scaffold from `[templates/k0-bundle/](templates/k0-bundle/)`). `[generated/App.vue](app/src/components/kota0/viewer/generated/App.vue)` is a **mirror** for the workspace dev tree only. Bundle directories are **gitignored** (`/bundles/`). In development, `**SCRIBE_URL`** defaults to `http://127.0.0.1:1337` when unset; set it explicitly in production. `**GET /api/kota0/apps/:id/source-revisions`** probes Scribe for row history when the Scribe version supports it. **DDL:** see `[migrations/README.md](migrations/README.md)`.

**Platform request path (dev)**

```mermaid
flowchart LR
  subgraph ui [Vue_SPA]
    Workspace[Kota0_workspace]
  end
  subgraph runtime [Flight_Koa]
    Kota0API[Kota0_API]
  end
  Scribe[(Scribe_Postgres)]
  Gemini[Gemini]
  Workspace --> Kota0API
  Kota0API --> Scribe
  Kota0API --> Gemini
```



Shared schemas live in `[shared/](shared/)`. Flight discovers `app/src/**/*.backend.ts`. Root `[vite.config.ts](vite.config.ts)` re-exports `[app/vite.config.ts](app/vite.config.ts)` so Flight’s embedded Vite loads this app.

---

## Board slides (Slidev)

The **Kota0 · ThoughtPivot VibeCoding** board deck is `[slides/slides.md](slides/slides.md)` (problem, positioning, competitive landscape, partnership, roadmap, economics, talk track). Theming: `[slides/setup/main.ts](slides/setup/main.ts)`, `[slides/styles/slides.css](slides/styles/slides.css)`.


| Command                    | Description                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run start:slides`     | Slidev at [http://localhost:3030](http://localhost:3030).                                                            |
| `npm run build:slides:pdf` | Export to `[docs/kota0-board-slides.pdf](docs/kota0-board-slides.pdf)` (see `[package.json](package.json)`). |


Design: `[branding/docs/guidelines.md](branding/docs/guidelines.md)`, `[branding/docs/colors-and-type.md](branding/docs/colors-and-type.md)`. Logos: `[branding/logos/SOURCES.md](branding/logos/SOURCES.md)`.

---

## Local development

### Prerequisites

- **[nvm](https://github.com/nvm-sh/nvm)** (or another way to match `[.nvmrc](.nvmrc)`) and Node.js **Active LTS** (`nvm install --lts && nvm use`).
- **Docker** — recommended. `[compose.yml](compose.yml)` runs **Redis**, **Postgres**, and **Scribe** (`npm run start:docker`, or included when you run `npm run start:workspace`). Postgres credentials for the local stack: user / db / password `**vibe`**.
- **Google AI Studio** — an API key with Generative Language API enabled (see [Environment variables](#environment-variables)).

### Ports and services


| Service                            | Port (default)           | Notes                                                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flight (Koa API)**               | `FLIGHT_PORT` → **3000** | Browser hits `**/api`** via Vite proxy from **3001** in dev.                                                                                                                                                                                                        |
| **Embedded Vite (UI)**             | **3001**                 | Open [http://localhost:3001](http://localhost:3001). `strictPort` in `[app/vite.config.ts](app/vite.config.ts)`.                                                                                                                                                    |
| **Kota0 app bundle (preview)** | **4000**                 | Per-app Flight **production**: `vite build` + static `**dist/`** + `App.backend.ts` on one listener. Not running until you open **Apply** / load an app (supervisor in `[kota0BundleRunner.ts](app/src/components/kota0/deploy/kota0BundleRunner.ts)`). |
| **Slidev**                         | **3030**                 | `npm run start:slides` — keep separate from Vite’s **3001**.                                                                                                                                                                                                        |
| **Scribe**                         | **1337**                 | HTTP API; dev default `SCRIBE_URL` `http://127.0.0.1:1337`. Image: `[docker/scribe.Dockerfile](docker/scribe.Dockerfile)`.                                                                                                                                          |
| **Redis**                          | **6379**                 | Required by Flight (`FLIGHT_REDIS_`*).                                                                                                                                                                                                                              |
| **Postgres**                       | **5432**                 | Used by Scribe in Compose.                                                                                                                                                                                                                                          |


### Install

```bash
nvm use
npm install
```

### Environment variables

Copy `[.env.example](.env.example)` to `**.env**` at the repo root. It documents every variable; below is the minimum and common tuning.

**Required for AI + Flight**


| Variable                                          | Purpose                                                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `**GEMINI_API_KEY`**                              | Workspace AI via Mastra + `@ai-sdk/google` ([AI Studio key](https://aistudio.google.com/apikey), typically `AIza…`). |
| `**FLIGHT_REDIS_HOST`** / `**FLIGHT_REDIS_PORT`** | Redis for Flight (defaults in `.env.example`).                                                       |
| `**FLIGHT_MAX_WORKERS=1**`                        | **Keep for local dev** — avoids multiple embedded Vite instances exhausting ports.                   |
| `**FLIGHT_SESSION_DURATION_MS`**                  | e.g. `**86400000`** — avoids Flight “Invalid session duration” when unset.                           |


Also set `**FLIGHT_PORT`** if not using default **3000**; align `**VITE_FLIGHT_PORT`** with `**FLIGHT_PORT`** when used.

**Commonly set**


| Variable                                   | Purpose                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**GEMINI_MODEL`**                         | Default in code / `.env.example` is `**gemini-3-flash-preview`**. Try `**gemini-3.1-pro-preview`** for heavier generations; use `**gemini-2.5-flash**` / `**gemini-2.5-pro**` if your key returns `**404**` on newer ids. |
| `**VITE_K0_CHAT_STREAM**`           | `1` or `true` → SSE on `POST /api/kota0/apps/:id/messages/stream` (“Thinking…” + progress). Restart backend after change.                                                                                             |
| `**VITE_K0_BUNDLE_PREVIEW_ORIGIN**` | Optional. Default `**http://127.0.0.1:4000**` — iframe **Preview** URL for the per-app bundle Flight (see [Routes and workspace](#routes-and-workspace)).                                                                 |
| `**SCRIBE_URL`**                           | Required in **production**. Dev defaults `**http://127.0.0.1:1337`**.                                                                                                                                                     |
| `**FLIGHT_PAYLOAD_LIMIT`**                 | Raise (e.g. `**64mb`**) when saving very large `App.vue` via `**PUT**` — Koa default is often `**1mb**`.                                                                                                                  |
| `**K0_APP_SOURCE_MAX_BYTES**`       | App handler cap (default **50 MiB**, max **200 MiB** in code).                                                                                                                                                            |


**Full reference**

Commented templates, `K0_CHAT_*`, `K0_IDEATION_*`, `K0_AI_CLASSIFIER_MODEL`, and optional GCP fields are in `[.env.example](.env.example)` — use it as the authoritative list.

Workspace AI uses **Mastra** (`@mastra/core`) on `@ai-sdk/google` with the same `GEMINI_API_KEY` / `GEMINI_MODEL` contract. `npm run start:app` runs Node with `**--disable-warning=DEP0040**` (legacy `punycode` noise from dependencies). Inspect per-turn stats with `npm run k0:ai-stats` while the workspace is running.

### Run commands


| Command                    | Description                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start:workspace`  | **Recommended for local dev:** runs **`start:docker`**, **`start:app`**, and **`start:slides`** together via **`concurrently`** (`-n` / `-c` for readable logs). Easiest way to bring up the full Kota0 workspace; use the commands below individually whenever you want. |
| `npm run start:docker`     | **`docker compose up`** (foreground; streamed logs) — Redis **6379**, Postgres **5432**, Scribe **1337** (`[compose.yml](compose.yml)`).                                                                 |
| `npm run start:app`        | **[@thoughtpivot/flight](https://www.npmjs.com/package/@thoughtpivot/flight)** ≥ **1.1.0**: workspace **`--app_home .`** + **`--exclude_paths bundles`** (or **`FLIGHT_EXCLUDE_PATHS=bundles`**) so **`*.backend.ts`** discovery skips **`bundles/<appId>/`**; repo-root **[`vite.config.ts`](vite.config.ts)** delegates to **`app/`**. **`dotenv-cli`** loads **`.env`**; Node **`--disable-warning=DEP0040`**. Koa on **`FLIGHT_PORT`** + embedded Vite on **3001**.       |
| `npm run start:slides`     | Slidev at **3030**.                                                                                                                                                                |
| `npm run typecheck`        | `vue-tsc` + backend `tsc`.                                                                                                                                                         |
| `npm run build:app`        | Production build → `app/dist` (`[app/vite.config.ts](app/vite.config.ts)`).                                                                                                        |
| `npm run build:slides:pdf` | PDF export → `[docs/kota0-board-slides.pdf](docs/kota0-board-slides.pdf)`.                                                                                                 |
| `npm run k0:ai-stats`      | Read in-memory AI turn telemetry from the running workspace (`GET /api/kota0/ai/stats`). |
| `npm run kota0:smoke`  | `[scripts/kota0-smoke.mjs](scripts/kota0-smoke.mjs)` — diagnostics + Kota0 API checks (default base `**http://127.0.0.1:3001`**; override `**K0_SMOKE_BASE`**). |


Use colon scripts (for example `npm run start:workspace`, `npm run start:app`) — not `npm start app`.

### Tech stack in generated `App.vue`

Prompted UI should prefer: **Tailwind** utilities; **DaisyUI** semantic classes (`[app/src/style.css](app/src/style.css)`); icons via `**lucide-vue-next`**, `**@heroicons/vue`**, `**@phosphor-icons/vue**`, or Iconify / `**unplugin-icons**` (`import X from '~icons/collection/icon-id'`); `**@headlessui/vue**`; `**reka-ui**` / `**@/components/ui/***` (shadcn-vue-style); `**vue-chartjs**` + `**chart.js**` (preview registers Chart.js). External “master prompts” may mention Chart.js CDN — in-repo mapping: `[docs/kota0-master-prompt-dialect.md](docs/kota0-master-prompt-dialect.md)`.

---

## Troubleshooting

### Chat / AI workflow errors

If chat fails or shows a generic error after send:

- `**Failed to fetch**` — Flight not running, Redis down, or wrong host. Confirm `npm run start:app` and that the browser hits Vite **3001** with `/api` proxied to Koa **3000**.
- `**404 — Not Found**` on `/api/kota0/...` — Vite proxy misconfigured or Koa not listening on `FLIGHT_PORT`. Check `[app/vite.config.ts](app/vite.config.ts)` proxies `/api` to Koa with the prefix intact.
- `**Chat streaming is required**` — set `VITE_K0_CHAT_STREAM=1` (or remove `0`/`false`) in `.env` and restart the workspace.

### Gemini / Google API (`502`, `403`, `404`, `429`)

- `**502`** — Koa reached Google but the call failed.
- `**403**` — almost always **auth / project / model access**, not your Vue code: enable **Generative Language API**, check billing / region.
- `**GEMINI_MODEL`** — default in code and `[.env.example](.env.example)` is `**gemini-3-flash-preview`** ([Gemini models](https://ai.google.dev/gemini-api/docs/models)). `**GEMINI_API_KEY` must be an AI Studio API key** (`AIza…`). Long `**AQ.…`** tokens are the wrong credential type.
- `**404`** on the model id — switch to `**gemini-2.5-flash`** or `**gemini-2.5-pro**`, or confirm model availability for your project.
- `**429**` — quota / rate limits; retry later or check AI Studio / GCP usage.

### Kota0 chat: `404` on `/api/kota0/apps/…/messages`

Platform Flight loads `*.backend.ts` with `**require()` in the worker** — **backends do not hot-reload**. After pulling or editing `[Kota0.backend.ts](app/src/components/kota0/Kota0.backend.ts)`, **restart `npm run start:app`**. A stale worker often returns `**Not Found**` for newer routes while `**GET /api/kota0/apps**` still works. The UI surfaces a hint (`[kota0AppApi.ts](app/src/components/kota0/apps/kota0AppApi.ts)`). **Per-app** `App.backend.ts` is restarted when you **Apply** (bundle Flight on port **4000**).

### Per-app bundle: `App.vue` cannot reach `App.backend.ts` (404 / wrong JSON / “CORS”)

Usually **not** CORS — bundle Flight enables `**koa/cors`** by default; SPA and API share **:4000**. Typical cause is `**fetch('/api/…')`** from the **workspace Preview** iframe: that hits **platform** Koa, not bundle Flight. Use `**bundleApiUrl('api/kota0-app/…')`** from `[templates/k0-bundle/src/bundleApi.ts](templates/k0-bundle/src/bundleApi.ts)` or base-relative URLs as in [Preview, AI, and editing frontend vs backend](#preview-ai-and-editing-frontend-vs-backend). Confirm routes live under `**/api/kota0-app/*`** in `**App.backend.ts`**.

### Kota0 preview: blank iframe or connection errors on port 4000

Ensure Redis/Postgres/Scribe are up (`**npm run start:docker**`, or use `**npm run start:workspace**` which starts Docker among other processes). Each bundle’s `**.env**` includes `**FLIGHT_REDIS_***` and `**SCRIBE_URL**` (from repo-root `.env` + defaults) so bundle Flight matches the workspace stack; adjust `**bundles/<appId>/.env**` per app if paths differ. First **Apply** runs `**npm install`** in the bundle directory — it can take a minute. Check `**[GET /api/kota0/diagnostics](app/src/components/kota0/Kota0.backend.ts)`** for `**kota0BundleDir`** and errors in the terminal where `**npm run start:app**` runs (or the **`[app]`** stream if you use `**start:workspace**`).

### Materialize + Scribe

- `**GET /api/kota0/diagnostics**` — no Scribe required; returns `process.cwd()`, `**resolvedRepoRoot**`, `generatedDir`, paths to materialized `App.vue` / `App.backend.ts`, existence flags, Scribe config. Use when files are missing or wrong tree (`**K0_REPO_ROOT**` / `**REPO_ROOT**` → repo root if needed).
- `**npm run kota0:smoke**` — diagnostics + list apps + one app + messages; needs the Compose stack and Flight up (`**npm run start:workspace**`, or `**npm run start:docker**` plus `**npm run start:app**`).

### Large `App.vue` / Code tab

Saving a very large `source` needs a **large JSON body** on `**PUT /api/kota0/apps/:id`**. Raise `**FLIGHT_PAYLOAD_LIMIT`** (e.g. `**64mb**`). Handler cap: `**K0_APP_SOURCE_MAX_BYTES**` (default **50 MiB**, max **200 MiB**); see `[.env.example](.env.example)`.

### Cursor browser console noise

Messages like `**[CursorBrowser] Native dialog overrides installed`** come from **Cursor’s in-IDE browser automation**, not this repo’s runtime.

---

## Repository reference


| Area               | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vue app            | `[app/](app/)` — Tailwind + shadcn-vue; Kota0 SPA at `**/`**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Kota0 HTTP API | `[Kota0.backend.ts](app/src/components/kota0/Kota0.backend.ts)` — `**/api/kota0/apps`** (CRUD), `**…/messages/stream**` (chat workflow), `**…/ai/stats**`, `**…/source-revisions**`. **Scribe is source of truth**; active app written to `**bundles/<appId>/`** + `**generated/App.vue`** mirror; bundle Flight restart via `[kota0BundleRunner.ts](app/src/components/kota0/deploy/kota0BundleRunner.ts)`. Successful **PUT** sets `**active`** when needed; AI **Apply** then **PATCH**es `**applied`**. Dev: `[kota0AppApi.ts](app/src/components/kota0/apps/kota0AppApi.ts)` uses same-origin `**/api/...`** ( `**VITE_KOA_ORIGIN**` only if bypassing proxy). |
| AI workflow      | `[kota0ChatWorkflow.ts](app/src/components/kota0/ai/kota0ChatWorkflow.ts)` — classify → plan (complex) → auto-apply via Mastra |
| Shared schemas     | `[shared/](shared/)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Compose            | `[compose.yml](compose.yml)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Vite entry         | `[vite.config.ts](vite.config.ts)` → `[app/vite.config.ts](app/vite.config.ts)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Slides             | `[slides/](slides/)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Branding           | `[branding/](branding/)` — tokens, logos, guidelines                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Screenshots        | [`docs/screenshots/`](docs/screenshots/) — hero images at top of README; `kota0-chat-expanded-panel.png` also available for docs |


---

## License

Kota0 is licensed under the [Apache License, Version 2.0](LICENSE). See [NOTICE](NOTICE) for attribution and third-party notices.

**Trademarks:** The Apache License does not grant rights to ThoughtPivot or Kota0 logos and brand assets. See [branding/TRADEMARK.md](branding/TRADEMARK.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution terms.


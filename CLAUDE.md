# Kota0 — model guidance

This file is loaded into every Claude / agent session. It captures the invariants and
conventions that aren't obvious from reading individual files, so you don't rediscover
them the hard way.

For a full architectural picture (diagrams, request flows, ops reference) read
**[`docs/deployment.md`](docs/deployment.md)** before touching infra.

---

## Two Flight environments, not one

The same `@thoughtpivot/flight` runtime hosts both:

| | **Workspace Flight** | **Bundle Flight** |
|---|---|---|
| Where | Repo root, runs as `npm run start:app` (dev) or the `workspace` container (prod) | `bundles/<appId>/`, runs as a child process (preview) or `k0app-<id>` container (deployed) |
| Port | `FLIGHT_PORT=3000` | `FLIGHT_PORT=4000` |
| Workers | Cluster mode, many | **Always 1** (`FLIGHT_MAX_WORKERS=1`) |
| Backends loaded | `app/src/**/*.backend.ts` | Only `bundles/<id>/App.backend.ts` |
| Talks to Scribe | Direct via `@/lib/scribe` (no gateway) | Through Scribe Gateway (`@shared/scribeRestClient` + scoped `SCRIBE_API_KEY`) |
| Redis client | `ioredis` directly via Flight internals | `createBundleRedisClient()` only |

When editing code, know which Flight you're inside. Workspace backend files end in
`.backend.ts` under `app/src/`; bundle backend code is the single `App.backend.ts` in
`templates/k0-bundle/` (template) or `bundles/<id>/` (materialized).

---

## Bundle code MUST use the shared clients

- **Scribe access from bundle code:** `import { createScribeRestClient } from "@shared/scribeRestClient"`. Don't construct raw Axios/fetch to `:1337`. The gateway enforces per-app table isolation; bypassing it breaks the security model.
- **Redis access from bundle code:** `import { createBundleRedisClient } from "@shared/bundleRedisClient"`. **Never** `import Redis from "ioredis"` in a bundle — the wrapper enforces `K0_APP_REDIS_PREFIX` so apps can't read each other's keys. The function throws loudly if `K0_APP_REDIS_PREFIX` is missing, which is the platform's signal that something is wired wrong.
- **Platform AI from bundle code:** `import { … } from "@shared/kota0PlatformAi"` — calls back to the workspace's `/api/kota0/apps/:id/ai/complete` via `K0_PLATFORM_API_ORIGIN`. Don't bake `GEMINI_API_KEY` into the bundle.

The workspace's deps summary (`app/src/components/kota0/viewer/kota0WorkspaceDepsSummary.ts`) is the contract for what bundles are allowed to import. When adding workspace deps that bundles should be able to use, update that file too.

---

## Per-app data isolation is load-bearing

- `app/src/components/kota0/gateway/ScribeGateway.ts` rewrites the first path segment of every Scribe request to `app_<uuid>_<table>` based on the bearer token. A bundle that crafts a sneaky URL still gets its own prefix forced in — verified by `ScribeGateway.test.ts`.
- `ScribeKeyRegistry` mints one stable key per app on first materialize, revokes on delete. The registry persists to `bundles/.scribe-gateway-keys.json` (dev / single-VM prod). Don't mint or revoke outside `scribeKeyRegistry.provision()` / `.revoke()`.
- The Redis prefix mirrors this: `app_<uuid_with_underscores>:` for every key the bundle writes.

If you change any of this, the gateway isolation test (`npm run k0:guards`) will catch it.

---

## The materialize → preview → deploy lifecycle

```
Apply (workspace UI)
  ↓
writeKota0AppBundle()  — copies template, writes App.vue / App.backend.ts / package.json / .env
  ↓
kota0BundleRunner.restartKota0Bundle()  — npm install + vite build + spawn child Flight :4000
  ↓ (preview reachable via /__k0_bundle/* through Kota0BundlePreview.backend.ts)
  ↓
Deploy button
  ↓
runDeploy() in kota0DeployOrchestrator.ts
  ↓
LocalDockerTarget.build()  — sanity check dist/ + App.backend.ts exist (no per-app docker build)
LocalDockerTarget.provision()  — docker run kota0-workspace:latest with bundle volume-mounted at /bundle
  ↓ (deployed bundle reachable via /__k0_deploy/<id>/* through Kota0DeployProxy.backend.ts)
```

Key invariants:
- **Deploy reuses `kota0-workspace:latest` as the runtime image.** There is no per-app `docker build`. The bundle's UI is built by `vite build` during preview materialize, the dist is volume-mounted into the deployed container. If you find yourself adding a bundle Dockerfile, you're going the wrong way — look at how `LocalDockerTarget.provision()` constructs the `docker run` args and the `sh -c "ln -sfn /workspace/{shared,app,branding} /…"` CMD prefix.
- **Deploy env precedence:** bundle `.env` user keys flow through; platform-managed keys (anything in `PLATFORM_RESERVED_ENV_KEYS` or matching `SCRIBE_*`) cannot be overridden by a bundle. `kota0DeployOrchestrator.ts` is the single source of truth — don't sprinkle env construction elsewhere.

---

## Pulumi + Docker-out-of-Docker (production)

Read `docs/deployment.md` § Architecture before changing any of:
- `Dockerfile.workspace` — multi-stage; includes `lsof procps docker-ce-cli` so the workspace can clean up orphan listeners + invoke the host daemon.
- `compose.prod.yml` — bind-mounts `/opt/kota0/bundles ↔ /workspace/bundles` for **both** workspace and scribe-gateway (they share the gateway keys file there); mounts `/var/run/docker.sock` into workspace for DooD.
- `Caddyfile` — `tls internal { on_demand }` with an always-200 ask endpoint on `:8080`. Don't switch to bare `:443 { tls internal }` — it only certs `localhost`.
- `infra/pulumi/workspace/index.ts` — `ignoreChanges: ["ami"]` on the instance, **don't remove** unless you intend to wipe the EBS volume on AMI churn. `hashContentDeps()` covers Dockerfile.workspace + compose.prod.yml + Caddyfile + all migrations + `app/src/**` + `shared/**` + `templates/**`. If you add a new top-level infra file that should trigger re-bootstrap, add it there.
- `infra/pulumi/workspace/bootstrap.sh` — idempotent; loops over all `migrations/*.sql`. Add new migrations to `migrations/` and they auto-apply.

When `LocalDockerTarget` invokes the host daemon, paths need to be valid on the **host** — `K0_BUNDLES_HOST_DIR` and `translateHostPath()` do the rewrite. Don't pass workspace-container paths to `docker run -v` directly.

---

## Migration schema gotcha

`k0_app.id` and `k0_deployment.id` are **`BIGSERIAL`**, not UUID. The bundled
`@thoughtpivot/scribe@1.0.8` auto-creates `<table>_history` with `foreignKey INTEGER REFERENCES <table>(id)` on first write; UUID would fail Postgres' FK type check and Scribe returns 503 for every subsequent write.

Domain identifiers (`app_id`, `deployment_id`) are UUIDs that live inside the JSONB `data` column. If you're adding a new Scribe-backed table, mirror this shape: `id BIGSERIAL PRIMARY KEY`, `data JSONB`, plus timestamps.

---

## When you add new files

- **`app/src/**/*.backend.ts`** is auto-discovered by workspace Flight. No registration needed.
- **`*.test.ts`** files are not auto-run. Add to the `k0:guards` script in `package.json` if they should run in the guards gate.
- **Browser-only files in `app/src/components/kota0/deploy/`** must be added to `tsconfig.backend.json` `exclude:` array — the deploy/ dir is otherwise globbed into the backend project and a DOM/Vite-typed file will fail the backend typecheck.
- **Files imported by both UI and backend** (e.g. `kota0BundlePreviewHtmlRewrite.ts`) need an explicit `include:` entry in `tsconfig.backend.json`.

---

## Things that *look* wrong but are intentional

- `templates/k0-bundle/vite.config.ts` imports `../../app/vite.kota0GeneratedPlugin`. That only resolves when the bundle dir is a sibling of `app/` in the repo. In production this works because `/opt/kota0/bundles ↔ /workspace/bundles` makes the bundle a sibling of `/workspace/app/`. Don't "fix" the relative path.
- `LocalDockerTarget.provision()` CMD starts with `ln -sfn /workspace/{shared,app,branding} /…`. This recreates the dev layout inside the deployed container so `@shared/*: ../../shared/*` in the bundle's `tsconfig.json` resolves.
- Workspace `compose.prod.yml` sets `FLIGHT_REDIS_HOST=redis` (compose service name) on the workspace service. Inside the workspace container, bundle Flight child processes inherit this via `pickWorkspaceInfraFromRoot()` reading `process.env`. Don't change the env writer to require a root `.env` file — that file is empty in the container.
- `LocalDockerTarget` skips `--publish` when `K0_DEPLOY_DOCKER_NETWORK` is set. Deployed bundles are addressed by **container name** (`http://k0app-<short>:4000`) over the compose network. The Deploy Proxy in the workspace reaches them that way; host-loopback ports don't cross container network namespaces.

---

## AI architecture (Mastra)

Workspace AI uses **Mastra** (`@mastra/core`) on top of the same Gemini env contract (`GEMINI_API_KEY`, `K0_AI_MODEL` / `GEMINI_MODEL`). Entry point: [`app/src/components/kota0/ai/kota0AiProvider.ts`](app/src/components/kota0/ai/kota0AiProvider.ts).

**Chat flow** (`POST /api/kota0/apps/:appId/messages/stream`) runs [`kota0ChatWorkflow.ts`](app/src/components/kota0/ai/kota0ChatWorkflow.ts):

1. **Classify** — fast Flash call (`kota0ComplexityClassifier.ts`, 300ms cap; defaults to `complex: true` on error).
2. **Plan** (complex only) — structured plan via `runKota0PlanTurn`, persisted as `kind: "plan"`, SSE `{ type: "plan" }`.
3. **Apply** (always) — Mastra agent loop in `kota0ApplyAgentLoop.ts` with tools from `kota0AgentTools.ts`; SSE `tool-call` + `done`.

There is **no plan/build mode dropdown** — complexity is server-decided. Plan cards are informational; apply runs automatically.

Bundle-facing `POST /api/kota0/apps/:appId/ai/complete` is unchanged for deployed apps.

Per-turn stats are in-memory inside Flight (`recordKota0AiTurnStats` in the provider). The workspace exposes them at **`GET /api/kota0/ai/stats?limit=N`** so a separate `npm run k0:ai-stats` process can read the running workspace's window (defaults to `http://127.0.0.1:${FLIGHT_PORT:-3000}` — override with `K0_WORKSPACE_ORIGIN`). The script prints both a summary aggregate and the last 10 turns; useful for A/B-ing token counts and step budgets vs `main`.

---

## Tests

```bash
npm run k0:guards        # all critical invariants (gateway isolation, deploy, ai prompts)
npm run typecheck        # vue-tsc + tsc backend project
```

If you break one of these, the failure usually points at exactly what's wrong. Don't disable assertions to make them pass — they exist because the failure mode they catch is silent in production.

---

## Where things live, briefly

```
app/src/components/kota0/
  ├── Kota0.backend.ts       — Main workspace API (apps CRUD, AI, deploy routes)
  ├── apps/                  — App rail + Scribe repo for k0_app
  ├── ai/                    — Prompt panel, Gemini integration
  ├── viewer/                — Code editor + preview iframe + preview proxy
  ├── gateway/               — Scribe Gateway (token → table-prefix proxy)
  └── deploy/                — Materialize, runner, deploy target, deploy proxy, UI

shared/                      — Imported by both workspace AND bundles
templates/k0-bundle/         — Scaffold copied verbatim into bundles/<id>/
migrations/                  — Apply once on first install
infra/pulumi/workspace/      — Provisions the AWS VM
docs/deployment.md           — Full deployment guide + diagrams
```

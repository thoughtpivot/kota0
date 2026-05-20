# Kota0 deployment guide

How to stand up a Kota0 workspace on AWS, what runs where once it's up, and how end-user "Deploy" creates standalone app containers.

> **Scope.** A single EC2 VM running the entire stack via Docker Compose. No managed cloud services (RDS, MemoryStore, etc.). Suitable for internal-tool / low-scale use. The same Pulumi program targets GCP/Azure with a provider swap; the architecture below is vendor-agnostic.

---

## Architecture

### 1. What runs on the workspace VM

A single EC2 host, all services in Docker via `compose.prod.yml`. Only Caddy publishes ports.

```
                                ┌────────────────────────────────────────────────────────┐
                                │ EC2 VM  (default VPC, public IP)                       │
                                │                                                        │
   browser :443  ──HTTPS──▶ ┌───┼─►  caddy:2-alpine                                      │
                            │   │    tls internal + on_demand certs                      │
                            │   │     ↓ reverse_proxy                                    │
                            │   │  ┌─────────────────────────────────────────────────┐   │
                            │   │  │ workspace        kota0-workspace:latest         │   │
                            │   │  │   :3000 — Flight + Vue UI (built dist/)         │   │
                            │   │  │   • /var/run/docker.sock  (Docker-out-of-Docker)│   │
                            │   │  │   • /workspace/bundles  ← /opt/kota0/bundles    │   │
                            │   │  │     (host bind mount, shared w/ gateway)        │   │
                            │   │  └─────────────────────────────────────────────────┘   │
                            │   │  ┌─────────────────────────────────────────────────┐   │
                            │   │  │ scribe-gateway   kota0-workspace:latest         │   │
                            │   │  │   :3002 — Koa proxy: bearer-token auth +        │   │
                            │   │  │            table-prefix rewrite → scribe:1337   │   │
                            │   │  └─────────────────────────────────────────────────┘   │
                            │   │  ┌──────────────┐ ┌───────────────┐ ┌────────────┐     │
                            │   │  │ scribe       │ │ postgres      │ │ redis      │     │
                            │   │  │ :1337 REST   │ │ :5432  vibe   │ │ :6379      │     │
                            │   │  └──────┬───────┘ └──────▲────────┘ └────────────┘     │
                            │   │         └─── pg ────────┘                              │
                            │   │                                                        │
                            │   │  ┌─────────────────────────────────────────────────┐   │
                            │   │  │ k0app-<deploymentId-short>                      │   │
                            │   │  │   kota0-workspace:latest reused as runtime      │   │
                            │   │  │   :4000  Flight in production mode              │   │
                            │   │  │   /bundle  ← /opt/kota0/bundles/<appId>         │   │
                            │   │  │   env: scoped SCRIBE_API_KEY, gateway URL,      │   │
                            │   │  │        K0_APP_REDIS_PREFIX, user .env keys      │   │
                            │   │  │   ← spawned by the workspace via DooD           │   │
                            │   │  └─────────────────────────────────────────────────┘   │
                            │   │  (zero or more — one container per running deployment) │
                            │   │                                                        │
                            │   │  docker network: kota0-prod_default                    │
                            └───┼────────────────────────────────────────────────────────┘
                                ▲
                                │  pulumi up
                                │   (rsync repo → /opt/kota0, ssh bootstrap.sh)
                                │
                       ┌────────┴────────┐
                       │ Operator laptop │  pulumi + aws + ssh
                       └─────────────────┘
```

### 2. Code / repo layout

```
kota0/
├── app/src/                        Workspace UI + Flight backends
│   └── components/kota0/
│       ├── Kota0.backend.ts                       # Main API: apps CRUD, AI, deploy routes
│       ├── apps/ScribeKota0AppRepository.ts       # k0_app CRUD
│       ├── viewer/
│       │   ├── Kota0BundlePreview.backend.ts      # /__k0_bundle/* → bundle Flight :4000
│       │   ├── kota0BundlePreviewHtmlRewrite.ts   # <base href>+/assets/ rewrite (shared)
│       │   └── Kota0WorkspaceViewer.vue           # Preview iframe + source editor
│       ├── gateway/
│       │   ├── ScribeGateway.ts                   # Bearer-token → table-prefix proxy
│       │   └── ScribeKeyRegistry.ts               # Per-app key persistence
│       └── deploy/
│           ├── kota0BundleRunner.ts               # Spawns preview Flight (child process)
│           ├── writeKota0AppBundle.ts             # Materializes bundle dir from Scribe state
│           ├── kota0DeployTarget.ts               # Adapter interface
│           ├── kota0LocalDockerTarget.ts          # docker run impl (DooD)
│           ├── kota0DeployOrchestrator.ts         # Lifecycle: build → provision → patch row
│           ├── Kota0DeployProxy.backend.ts        # /__k0_deploy/<id>/* → deployed container
│           ├── ScribeKota0DeploymentRepository.ts # k0_deployment CRUD
│           └── Kota0DeployPanel.vue               # UI: Deploy button + history + Open ↗
│
├── shared/                         Used by BOTH workspace and deployed bundles
│   ├── scribeRestClient.ts                        # HTTP client (sends SCRIBE_API_KEY)
│   ├── bundleRedisClient.ts                       # ioredis wrapper, enforces prefix
│   └── kota0BundlePlatformAiRoutes.ts             # /api/kota0-app/{hello,ai-test}
│
├── templates/k0-bundle/            Scaffold copied into bundles/<id>/ on Apply
│   ├── vite.config.ts                             # Builds App.vue → dist/
│   ├── tsconfig.json                              # @shared/* → ../../shared/*
│   └── src/{main.ts, bundleApi.ts}
│
├── migrations/                     Apply once on first install
│   ├── 001_k0_app.sql                             # k0_app: BIGSERIAL id + JSONB data
│   └── 003_k0_deployment.sql                      # k0_deployment: BIGSERIAL id + JSONB data
│
├── infra/pulumi/workspace/         Pulumi TS — provisions the VM
│   ├── index.ts                                   # EC2 + SG + bootstrap orchestration
│   ├── bootstrap.sh                               # Runs on VM: build + compose up + migrate
│   └── Pulumi.example.yaml                        # Reference config
│
├── Dockerfile.workspace            Builds the kota0-workspace image
├── compose.prod.yml                Production compose stack
└── Caddyfile                       Reverse proxy with self-signed cert
```

### 3. Request flows

**Workspace UI loads in the browser**

```
browser ─https─► caddy:443 ─► workspace:3000 ─► Flight ─► Vue UI from /workspace/app/dist
                                                    │
                                                    └─ /api/kota0/* ─► Scribe (no auth — platform path)
                                                                          └─ pg ─► postgres
```

**User opens an app → preview iframe**

```
browser ─► workspace ─/api/kota0/apps/:id─► kota0BundleRunner.restart()
                                              │  npm install + vite build  (inside workspace container,
                                              │  where /workspace/{app,shared,branding} resolve)
                                              └─► spawn child Flight on 127.0.0.1:4000
                                                    ▲
browser iframe ─► workspace ─/__k0_bundle/*─► Kota0BundlePreview.backend.ts proxy ─► 127.0.0.1:4000
                                                                                       │
                                                                                       └─ bundle App.backend.ts
                                                                                          ─bearer─► scribe-gateway:3002
                                                                                                      ─prefix rewrite─► scribe:1337
                                                                                                                          ─► postgres
```

**User clicks Deploy → standalone container**

```
browser ─► workspace ─POST /api/kota0/apps/:id/deploy─► runDeploy()
                                                          │  k0_deployment row status=building
                                                          │  LocalDockerTarget.build()  sanity-checks dist/
                                                          │  LocalDockerTarget.provision()  ─DooD─►
                                                          │     host daemon spawns k0app-<short>:
                                                          │       image  = kota0-workspace:latest
                                                          │       mount  = /opt/kota0/bundles/<appId>:/bundle
                                                          │       net    = kota0-prod_default
                                                          │       env    = platform-managed + bundle .env user keys
                                                          │       cmd    = symlink workspace dirs, exec Flight on /bundle
                                                          └─► patch row status=running,
                                                                       endpoint_url=http://k0app-<short>:4000

end user ─► workspace ─/__k0_deploy/<deploymentId>/*─► Kota0DeployProxy.backend.ts
                                                        │  Scribe lookup → endpoint_url
                                                        │  rewrite HTML <base href> + /assets/ to /__k0_deploy/<id>/
                                                        └─► k0app-<short>:4000 (via compose network DNS)
                                                              └─ same Scribe Gateway path as preview
                                                                 (scoped SCRIBE_API_KEY → table prefix → real Scribe)
```

### 4. Security boundaries

- **Per-app data isolation** lives in the **Scribe Gateway**. Each bundle gets a scoped `SCRIBE_API_KEY`; the gateway rewrites the first path segment to `app_<uuid>_<table>` before forwarding to Scribe. A bundle that crafts an attacking URL still gets its own prefix forced in — it cannot reach another app's tables.
- **Redis isolation** mirrors this: every bundle gets `K0_APP_REDIS_PREFIX=app_<uuid>:` and the workspace ships `createBundleRedisClient()` which enforces it via ioredis `keyPrefix`. The bundle template tells authors not to import `ioredis` directly.
- **Bundle `.env` keys** the bundle author sets (`WEATHERAPI_KEY`, etc.) flow through into the deployed container. Platform-reserved keys (`SCRIBE_*`, `DATABASE_URL`, `K0_APP_*`, `FLIGHT_*`) are **never** copied from a bundle's `.env` — the platform sets them authoritatively in the orchestrator, so a malicious bundle can't redirect itself off the gateway.
- **No auth on the workspace itself yet.** Anyone reachable to the public URL can use the platform. Add OIDC + tenancy in a later phase.

---

## Installing

### Prerequisites on the operator's machine

1. **AWS CLI configured** (SSO or static creds, doesn't matter — just needs to work):
   ```bash
   aws sts get-caller-identity --profile kota0
   ```

2. **An SSH keypair imported into your target region**:
   ```bash
   aws ec2 import-key-pair --key-name kota0-admin \
     --public-key-material "fileb://$HOME/.ssh/id_ed25519.pub" \
     --region us-east-1 --profile kota0
   ```

3. **Pulumi CLI logged in** (Pulumi Cloud is free for personal/org use):
   ```bash
   brew install pulumi/tap/pulumi   # or your platform's equivalent
   pulumi login
   pulumi whoami                    # remember this — it's your stack org
   ```

### One-time stack setup

```bash
cd infra/pulumi/workspace
npm install

# Pick a stack name (dev/staging/prod). Org is what `pulumi whoami` printed.
pulumi stack init <org>/<stack>

# Required config:
pulumi config set aws:region us-east-1
pulumi config set aws:profile kota0
pulumi config set keyName kota0-admin
pulumi config set --secret sshPrivateKey -- "$(cat ~/.ssh/id_ed25519)"
pulumi config set --secret postgresPassword "$(openssl rand -hex 24)"

# Recommended:
pulumi config set --secret geminiApiKey "<your-gemini-key>"
pulumi config set geminiModel "gemini-2.5-flash"

# Optional knobs (defaults shown):
# pulumi config set instanceType t3.medium
# pulumi config set allowedSshCidr "$(curl -s ifconfig.me)/32"   # lock SSH to your IP
# pulumi config set allowedHttpCidr 0.0.0.0/0
```

### Bring it up

```bash
pulumi up
```

What happens, in order:

1. EC2 instance + security group created in the default VPC.
2. Cloud-init installs Docker + Compose plugin + rsync on the VM.
3. Pulumi waits for SSH + cloud-init to finish, then rsyncs your local repo to `/opt/kota0`.
4. Pulumi writes `/opt/kota0/.env` from your stack secrets (base64-encoded over SSH; AWS sshd rejects setenv).
5. Pulumi runs `bootstrap.sh` on the VM: `docker compose build workspace` + `compose up -d` + applies all `migrations/*.sql`.
6. Outputs are printed — note `workspaceUrl`.

First `up` takes 8–15 minutes (mostly cold npm install + UI bundle + Docker image build on a t3.medium). Subsequent `up` runs are fast unless you changed Dockerfile.workspace.

### Verify

```bash
pulumi stack output workspaceUrl     # → https://ec2-xx-xx-xx-xx.compute-1.amazonaws.com/

# Sanity check (use -k because Caddy serves a self-signed cert):
curl -k "$(pulumi stack output workspaceUrl)api/kota0/diagnostics"
```

Open the URL in a browser, accept the self-signed-cert warning, you're in.

### SSH into the VM

```bash
ssh ec2-user@$(pulumi stack output publicIp)
cd /opt/kota0

# Useful:
sudo docker compose -f compose.prod.yml ps
sudo docker compose -f compose.prod.yml logs -f workspace
sudo docker ps --filter "name=k0app-"   # see deployed bundle containers
```

### Redeploy after local edits

```bash
# Just from your laptop:
pulumi up
```

`pulumi up` watches a content hash over `app/src/**`, `shared/**`, `templates/**`, the workspace Dockerfile, compose.prod.yml, Caddyfile, and migrations. Any change rsyncs the new code, rebuilds the image, and re-runs Compose. State (Postgres, Redis, Scribe, bundle dirs) persists across redeploys via Docker volumes.

### Tear down

```bash
pulumi destroy
```

Removes the EC2 instance + SG. **Does NOT** preserve workspace data — the EBS root volume is destroyed with the instance. Snapshot it in the EC2 console first if you want a recovery point.

The SSH keypair (imported out-of-band) is not deleted.

---

## Using the workspace

Once `pulumi up` finishes:

1. Open the workspace URL.
2. Click **New app** in the left rail.
3. Edit App.vue / App.backend.ts in the Code panel, or prompt the AI.
4. Click **Apply** — workspace materializes the bundle dir, runs `vite build`, spawns the preview Flight on :4000, and shows it in the Preview panel.
5. Add secrets via the Code → Secrets tab (`WEATHERAPI_KEY=...` etc.) — these flow into the bundle `.env`.
6. Click **Deploy** — spawns a standalone container. The deployment shows up in the rail with an **Open ↗** link to:
   ```
   https://<workspace-public-dns>/__k0_deploy/<deploymentId>/
   ```
   The deployed bundle reads through the same gateway and Redis prefix as preview.

---

## Operations reference

### Key env vars on the workspace service

| Var | Source | Purpose |
|---|---|---|
| `FLIGHT_REDIS_HOST=redis` | compose | Workspace Flight session storage |
| `SCRIBE_URL=http://scribe:1337` | compose | Workspace's direct Scribe (no gateway) |
| `SCRIBE_GATEWAY_URL_FOR_BUNDLES=http://scribe-gateway:3002` | compose | URL passed to bundles |
| `K0_DEPLOY_DOCKER_NETWORK=kota0-prod_default` | compose | Compose network to attach deployed containers to |
| `K0_DEPLOY_RUNTIME_IMAGE=kota0-workspace:latest` | compose | Image used for deployed containers |
| `K0_BUNDLES_HOST_DIR=/opt/kota0/bundles` | compose | Host path the workspace passes to docker daemon |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | Pulumi secret | AI features |
| `POSTGRES_PASSWORD` | Pulumi secret | DB password (also given to Scribe + workspace) |

### Bundle env vars set by the platform (not overridable)

| Var | Where it comes from |
|---|---|
| `K0_APP_ID` | The bundle's app UUID |
| `K0_APP_REDIS_PREFIX` | `app_<uuid_with_underscores>:` |
| `SCRIBE_URL` | `bundleScribeGatewayUrl()` → gateway service URL |
| `SCRIBE_API_KEY` | `scribeKeyRegistry.provision(appId)` — minted on first materialize |
| `K0_PLATFORM_API_ORIGIN` | Workspace URL for `/api/kota0/apps/:id/ai/complete` |
| `FLIGHT_PORT`, `FLIGHT_MODE`, `FLIGHT_DISABLE_VITE`, `FLIGHT_MAX_WORKERS` | Pinned for bundle Flight |

### Common operations

```bash
# Tail workspace logs from your laptop
ssh ec2-user@$(pulumi stack output publicIp) "sudo docker compose -f /opt/kota0/compose.prod.yml logs -f workspace"

# Force the workspace to rebuild its image (e.g. after Dockerfile changes that the content hash missed)
ssh ec2-user@$(pulumi stack output publicIp) \
  "cd /opt/kota0 && sudo docker compose -f compose.prod.yml build --no-cache workspace \
   && sudo docker compose -f compose.prod.yml up -d --force-recreate workspace scribe-gateway"

# Inspect a deployed bundle container
ssh ec2-user@$(pulumi stack output publicIp) "sudo docker exec -it k0app-<short> sh"

# Stop a deployed bundle (also via the UI: Destroy ⌫)
curl -k -X DELETE "$(pulumi stack output workspaceUrl)api/kota0/deployments/<deploymentId>"
```

---

## Known limitations

- **Self-signed TLS.** Browsers warn until a real domain + Let's Encrypt cert is wired (future phase).
- **Single instance, no auto-recovery.** If the VM stops, the service stops. Acceptable for an internal demo; not for SLA-bearing use.
- **No backups.** Postgres data lives on a single EBS volume. Add a snapshot policy (e.g. AWS Data Lifecycle Manager) before relying on it.
- **`allowedSshCidr` defaults to `0.0.0.0/0`** for first-time ease. Lock it down before treating the VM as anything but ephemeral.
- **No auth on the workspace.** Anyone reachable to the public URL has admin rights. OIDC + tenancy is a future phase.
- **Deployed apps share the VM.** Per-VM-per-app isolation (separate cloud-runtime per app) is a future phase. Per-app data isolation via the Scribe Gateway is in place today.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pulumi up` hangs at `wait-for-ssh` | Cloud-init still running on a slow boot | Wait — `dialErrorLimit=30` gives ~7 minutes. If it still fails, ssh in manually and check `cloud-init status --wait`. |
| `pulumi up` says "no changes" but your code change isn't live | Content hash didn't trip — uncommon, but possible for files outside `app/src`, `shared/`, `templates/`, `migrations`, or top-level Dockerfile/compose/Caddyfile | Touch one of the watched files, or `pulumi up --refresh`. |
| Browser TLS warning | Caddy `tls internal` — expected | Click through. Real cert needs a real domain (future phase). |
| `EADDRINUSE :4000` in workspace logs after rapid Apply | Cluster-worker orphan holding the port | Already mitigated (`detached: true` + process-group SIGKILL + `lsof`/`/proc` cleanup). If it recurs, `npm run kill:ports` on the workspace, or restart the workspace container. |
| Deploy returns `deploy_artifact_missing` | You clicked Deploy before opening the app once | Open the app — that runs the preview materialize which produces `dist/`. Then Deploy. |
| Deployed app says "X env var not configured" | You set the secret AFTER deploying | Set in Code → Secrets, click Apply (writes bundle `.env`), then redeploy. Deploy is a snapshot of the bundle's env at deploy time. |
| Workspace logs flood with `ioredis ECONNREFUSED 127.0.0.1:6379` | Stale bundle .env pointing at host loopback | Re-open the app — the bundle env writer picks up `FLIGHT_REDIS_HOST=redis` from the container's process.env. |

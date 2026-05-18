# Installing the Kota0 workspace on AWS (Phase 2)

This brings up a single EC2 host running the workspace platform: Workspace UI + Koa, Postgres, Redis, Scribe, Scribe Gateway, and Caddy as the public TLS terminator. Deployed apps (Phase 1 — local Docker target) run on the same host.

> **Scale:** Designed for low-scale internal use. No managed services (RDS, MemoryStore, etc.) on purpose — the workspace itself owns its state. Per-app DNS / cloud-runtime apps land in Phase 3.

## Prerequisites on the operator's machine

1. **AWS CLI configured.**
   ```bash
   aws sts get-caller-identity --profile kota0
   ```
   Must succeed.

2. **SSH keypair imported into the target region.**
   ```bash
   aws ec2 describe-key-pairs --key-names kota0-admin --region us-east-1 --profile kota0
   ```
   Must list the key.

3. **Pulumi CLI logged in.**
   ```bash
   pulumi whoami
   ```

## One-time setup

```bash
cd infra/pulumi/workspace
npm install
```

Pick a stack name (e.g. `dev`) and create it under your org:

```bash
pulumi stack init milush-thoughtpivot-com/dev
```

Set required config:

```bash
# AWS region (must match where the keypair lives)
pulumi config set aws:region us-east-1
pulumi config set aws:profile kota0

# EC2 keypair name
pulumi config set keyName kota0-admin

# Private key contents so Pulumi can SSH in for bootstrap (Pulumi encrypts as a secret).
pulumi config set --secret sshPrivateKey -- "$(cat ~/.ssh/id_ed25519)"

# Optional but recommended:
pulumi config set --secret geminiApiKey "<your-gemini-key-or-leave-unset>"
pulumi config set --secret postgresPassword "$(openssl rand -hex 24)"

# Optional knobs:
# pulumi config set instanceType t3.large
# pulumi config set allowedSshCidr <your-ip>/32
# pulumi config set allowedHttpCidr <your-ip>/32
```

## Bring it up

```bash
pulumi up
```

What happens:

1. EC2 instance + security group provisioned in the default VPC of the region.
2. Cloud-init installs Docker + Compose plugin and creates `/opt/kota0`.
3. Pulumi rsyncs your local repo to `/opt/kota0` on the VM.
4. The bootstrap script writes `.env`, builds `kota0-workspace:latest`, runs `compose.prod.yml` up `-d`, and applies migrations.
5. Pulumi prints outputs including `workspaceUrl`.

First build takes 5–10 minutes (npm install + UI bundle + Docker image build on a t3.medium).

## Verify

```bash
pulumi stack output workspaceUrl
# → https://ec2-xx-xx-xx-xx.compute-1.amazonaws.com/

# Browser: open the URL. Accept the self-signed cert warning (Phase 2 has no public domain).
# CLI sanity check:
curl -k "$(pulumi stack output workspaceUrl)api/kota0/diagnostics"
```

You should see JSON, not HTML.

## SSH into the VM

```bash
ssh ec2-user@$(pulumi stack output publicIp)

# Then:
cd /opt/kota0
sudo docker compose -f compose.prod.yml ps
sudo docker compose -f compose.prod.yml logs -f workspace
```

## Redeploy after local changes

```bash
# From your machine, after editing code locally:
pulumi up   # rsyncs, rebuilds the image, recreates containers
```

The state in Postgres + Redis + Scribe is preserved across redeploys (Docker volumes).

## Tear down

```bash
pulumi destroy
```

Removes the EC2 instance, security group, and IAM artifacts. The keypair is **not** deleted (it was created out-of-band by `aws ec2 import-key-pair`).

> **Heads up:** `pulumi destroy` removes the EBS volume too — all workspace data is gone with it. Snapshot the volume in the EC2 console first if you want a recovery point.

## Known Phase 2 limitations

- **Self-signed TLS.** Browsers will warn until a real domain + Let's Encrypt cert is wired in (Phase 3).
- **Single instance, no auto-recovery.** If the VM stops, the service stops. Acceptable for an internal demo; not for SLA-bearing use.
- **No backups.** Postgres data lives on a single EBS volume. Add a snapshot policy before relying on it.
- **`allowedSshCidr` defaults to `0.0.0.0/0`** for first-time ease. Lock it down (`pulumi config set allowedSshCidr <your-ip>/32`) before treating the VM as anything but ephemeral.
- **Deployed apps run on the same host** (Phase 1 LocalDockerTarget). Per-VM-per-app isolation is Phase 3's `PulumiTarget`.

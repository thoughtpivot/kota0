#!/usr/bin/env bash
# Runs on the workspace VM via Pulumi's remote.Command after rsync has populated /opt/kota0.
# Idempotent: rerunning produces the same end state (re-build, restart compose).
set -euo pipefail

REPO=/opt/kota0
cd "$REPO"

# Wait for cloud-init to finish in case Pulumi's SSH wait got in early.
sudo cloud-init status --wait >/dev/null 2>&1 || true

# Sanity: docker + compose plugin must be present (cloud-init installs them).
if ! command -v docker >/dev/null 2>&1; then
  echo "docker missing — cloud-init has not finished or failed" >&2
  exit 1
fi
sudo docker compose version >/dev/null

# /opt/kota0/.env is written by Pulumi's `write-env-file` command before this script runs
# (AWS sshd doesn't allow SSH `setenv`, so secrets travel via a base64-encoded file).
# Compose's `${VAR:-default}` interpolation reads it via `--env-file` below.
test -r "$REPO/.env" || { echo ".env missing on the VM — Pulumi write-env-file step did not run" >&2; exit 1; }

# Build + (re)start the stack in one go. `--build` re-runs docker build with cache —
# fast no-op when Dockerfile.workspace is unchanged, full rebuild when it isn't. Compose
# detects the image-id change and recreates dependent containers automatically. The
# workspace image is also reused by the scribe-gateway service (image: kota0-workspace:latest),
# so we explicitly retag after the workspace build to keep the gateway in sync.
# `compose build workspace` honors the `image: kota0-workspace:latest` directive and
# tags the build accordingly, so the scribe-gateway service (which only references the
# image, not the build context) picks up the same artifact on `up -d`.
sudo docker compose -f compose.prod.yml --env-file "$REPO/.env" build workspace
sudo docker compose -f compose.prod.yml --env-file "$REPO/.env" up -d --remove-orphans

# Apply ALL migrations in sorted order. They're all CREATE IF NOT EXISTS or no-op-on-rerun
# guards, so re-applying is safe and any new migration added under migrations/ ships
# automatically on the next `pulumi up`. NOTE: pre-existing tables whose schema changed
# in a migration source-edit will NOT be altered — Postgres won't touch them. For
# destructive schema changes, the operator must drop the table by hand first.
echo "Waiting for postgres to accept connections..."
for i in {1..60}; do
  if sudo docker compose -f compose.prod.yml exec -T postgres pg_isready -U vibe -d vibe >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

shopt -s nullglob
for sql in "$REPO"/migrations/*.sql; do
  echo "Applying $(basename "$sql")"
  sudo docker compose -f compose.prod.yml exec -T postgres \
    psql -U vibe -d vibe -v ON_ERROR_STOP=1 < "$sql"
done
shopt -u nullglob

# Use IMDSv2 (default on AL2023) to fetch the public hostname for the operator log.
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || echo "")
HOST=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-hostname || echo "")
echo "Workspace is up. Visit: https://${HOST}/"

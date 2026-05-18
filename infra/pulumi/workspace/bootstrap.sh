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

# Write the production .env from values injected via Pulumi's `environment`.
# Compose's `${VAR:-default}` interpolation reads this file.
umask 077
cat > "$REPO/.env" <<EOF
POSTGRES_PASSWORD=${KOTA0_POSTGRES_PASSWORD:-vibe}
GEMINI_API_KEY=${KOTA0_GEMINI_API_KEY:-}
EOF
umask 022

# Build the workspace image (and the gateway re-uses it). Tagged `kota0-workspace:latest`
# to match compose.prod.yml.
sudo docker build -f Dockerfile.workspace -t kota0-workspace:latest .

# Bring the stack up. `--remove-orphans` cleans any stale services from earlier configs.
sudo docker compose -f compose.prod.yml --env-file "$REPO/.env" up -d --remove-orphans

# Apply migrations once Postgres is healthy. Safe to re-run (all CREATE IF NOT EXISTS).
echo "Waiting for postgres to accept connections..."
for i in {1..60}; do
  if sudo docker compose -f compose.prod.yml exec -T postgres pg_isready -U vibe -d vibe >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

for sql in migrations/001_k0_app.sql migrations/003_k0_deployment.sql; do
  echo "Applying $sql"
  sudo docker compose -f compose.prod.yml exec -T postgres \
    psql -U vibe -d vibe -v ON_ERROR_STOP=1 < "$REPO/$sql"
done

echo "Workspace is up. Visit: https://$(curl -s http://169.254.169.254/latest/meta-data/public-hostname)/"

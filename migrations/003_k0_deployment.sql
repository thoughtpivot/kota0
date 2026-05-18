-- Kota0 per-app deployments (Scribe-shaped: id + jsonb data + timestamps).
-- One row per deploy attempt (build → run → destroy lifecycle); history is preserved.
-- Apply against the same DB as 001_k0_app.sql:
--   psql "$DATABASE_URL" -f migrations/003_k0_deployment.sql

CREATE TABLE IF NOT EXISTS k0_deployment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Common access patterns: by app, most-recent-first; status filtering.
CREATE INDEX IF NOT EXISTS idx_k0_deployment_app_id ON k0_deployment ((data->>'app_id'));
CREATE INDEX IF NOT EXISTS idx_k0_deployment_status ON k0_deployment ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_k0_deployment_date_modified ON k0_deployment (date_modified DESC);

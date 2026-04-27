-- Kota0 multi-app storage (Scribe-shaped: id + jsonb data + timestamps).
-- Apply once against the DB from compose.yml (database `vibe`, user `vibe`):
--   psql "$DATABASE_URL" -f migrations/001_kota0_app.sql

CREATE TABLE IF NOT EXISTS kota0_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kota0_app_date_modified ON kota0_app (date_modified DESC);

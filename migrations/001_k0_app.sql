-- Kota0 multi-app storage (Scribe-shaped: id + jsonb data + timestamps).
-- Greenfield: apply once against the DB from compose.yml (database `vibe`, user `vibe`):
--   psql "$DATABASE_URL" -f migrations/001_k0_app.sql
--
-- If you already have legacy Scribe tables from an older repo revision, do NOT run this file;
-- run migrations/002_upgrade_legacy_scribe_tables.sql instead (after backup), then deploy code.

CREATE TABLE IF NOT EXISTS k0_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k0_app_date_modified ON k0_app (date_modified DESC);

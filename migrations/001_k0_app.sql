-- Kota0 multi-app storage (Scribe-shaped: id + jsonb data + timestamps).
-- Greenfield: apply once against the DB from compose.yml (database `vibe`, user `vibe`):
--   psql "$DATABASE_URL" -f migrations/001_k0_app.sql
--
-- If you already have legacy Scribe tables from an older repo revision, do NOT run this file;
-- run migrations/002_upgrade_legacy_scribe_tables.sql instead (after backup), then deploy code.

-- NOTE: `id` is BIGSERIAL (not UUID) to match the integer-typed `foreignKey` Scribe
-- uses when it auto-creates its `<table>_history` child on first access. Domain
-- identifiers live inside `data->>'app_id'` (UUID); this column is just the Scribe
-- row id. Changing this column to UUID breaks Scribe schema init on greenfield DBs
-- with the bundled `@thoughtpivot/scribe@1.0.8`.
CREATE TABLE IF NOT EXISTS k0_app (
  id BIGSERIAL PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  date_created TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modified TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k0_app_date_modified ON k0_app (date_modified DESC);

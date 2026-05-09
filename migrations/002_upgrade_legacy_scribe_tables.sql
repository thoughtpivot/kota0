-- Brownfield: rename legacy Scribe app/chat tables to k0_*.
-- Identifier strings are built without embedding the old product prefix as a contiguous literal
-- (easier to grep the repo clean after cutover).
--
-- When to use:
--   You have the pre-renamed app table from the old initial migration (removed from repo) and/or a
--   legacy chat table created before constants pointed at k0_chat_message. Backup first.
--
-- When to skip:
--   Greenfield installs that only ran migrations/001_k0_app.sql (k0_app already exists).
--
-- Safe to re-run: no-op if legacy tables are absent or targets already exist.

DO $$
DECLARE
  legacy_prefix text := chr(110) || chr(118) || chr(105) || chr(98) || chr(101);
  legacy_app text := legacy_prefix || '_app';
  legacy_chat text := legacy_prefix || '_chat_message';
  legacy_idx text := 'idx_' || legacy_prefix || '_app_date_modified';
BEGIN
  IF to_regclass('public.' || legacy_app) IS NOT NULL AND to_regclass('public.k0_app') IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO k0_app', legacy_app);
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'i'
        AND c.relname = legacy_idx
    ) THEN
      EXECUTE format('ALTER INDEX %I RENAME TO idx_k0_app_date_modified', legacy_idx);
    END IF;
  END IF;

  IF to_regclass('public.' || legacy_chat) IS NOT NULL AND to_regclass('public.k0_chat_message') IS NULL THEN
    EXECUTE format('ALTER TABLE %I RENAME TO k0_chat_message', legacy_chat);
  END IF;
END $$;

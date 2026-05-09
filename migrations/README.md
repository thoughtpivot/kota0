# Postgres migrations (Kota0 / Scribe)

Scribe stores Kota0 apps (and chat) in Postgres. Table names must match the `TABLE` constants in the Flight repositories (`k0_app`, `k0_chat_message`).

## Greenfield (new database)

1. Run **[001_k0_app.sql](001_k0_app.sql)** once:
   ```bash
   psql "$DATABASE_URL" -f migrations/001_k0_app.sql
   ```
2. Do **not** run `002_*` unless you are upgrading from pre-`k0_*` Scribe table names.

The chat table is typically created by Scribe on first use after the app targets `k0_chat_message`.

## Brownfield (legacy Scribe table names before `k0_*`)

1. **Backup** the database.
2. Run **[002_upgrade_legacy_scribe_tables.sql](002_upgrade_legacy_scribe_tables.sql)** **before** deploying application code that expects `k0_*`:
   ```bash
   psql "$DATABASE_URL" -f migrations/002_upgrade_legacy_scribe_tables.sql
   ```
3. Deploy the Flight/Vite app.

Do **not** run `001_k0_app.sql` on a database that still has the legacy app table unless you run `002_upgrade_legacy_scribe_tables.sql` first (otherwise you risk two parallel app tables).

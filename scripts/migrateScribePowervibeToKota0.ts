/**
 * One-shot migration: copy Scribe rows from the old `powervibe_*` tables into the new `k0_*` tables.
 *
 * Idempotent — rows already present in the destination (matched by `data.app_id` / `data.message_id`)
 * are skipped, so the script is safe to run multiple times.
 *
 * Flags:
 *   --dry-run       Print what would happen without writing anything.
 *   --purge-source  DELETE source rows after successfully copying them (irreversible).
 *
 * Usage:
 *   npm run k0:migrate-from-powervibe
 *   npm run k0:migrate-from-powervibe -- --dry-run
 *   npm run k0:migrate-from-powervibe -- --purge-source
 */
import "@/lib/env";

import { scribe } from "@/lib/scribe";
import { buildScribeRowEnvelope } from "@shared/scribeRowEnvelope.ts";

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PURGE_SOURCE = args.includes("--purge-source");

// ─── Scribe table names ───────────────────────────────────────────────────────

const SRC_APPS = "powervibe_app";
const DST_APPS = "k0_app";
const SRC_CHAT = "powervibe_chat_message";
const DST_CHAT = "k0_chat_message";

// ─── Row types ────────────────────────────────────────────────────────────────

type ScribeRow<T = Record<string, unknown>> = {
  id: number;
  data: T;
  date_created?: string;
  date_modified?: string;
  created_by?: number;
  modified_by?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRows<T>(raw: unknown): ScribeRow<T>[] {
  if (Array.isArray(raw)) return raw as ScribeRow<T>[];
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: ScribeRow<T>[] }).data;
  }
  return [];
}

async function fetchAll<T>(table: string): Promise<ScribeRow<T>[]> {
  try {
    const res = await scribe.get(`/${table}/all`);
    return normalizeRows<T>(res.data);
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) {
      console.warn(`  ⚠  Table "${table}" returned 404 — treating as empty (table may not exist yet).`);
      return [];
    }
    throw e;
  }
}

async function deleteRow(table: string, id: number): Promise<void> {
  try {
    await scribe.delete(`/${table}/${id}`);
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404) return; // already gone
    throw e;
  }
}

function appIdOf(row: ScribeRow): string | null {
  return typeof (row.data as { app_id?: unknown }).app_id === "string" ?
    ((row.data as { app_id: string }).app_id)
  : null;
}

function messageIdOf(row: ScribeRow): string | null {
  return typeof (row.data as { message_id?: unknown }).message_id === "string" ?
    ((row.data as { message_id: string }).message_id)
  : null;
}

// ─── Migration steps ──────────────────────────────────────────────────────────

async function migrateApps(): Promise<{ copied: number; skipped: number; purged: number }> {
  console.log(`\n● Apps  ${SRC_APPS} → ${DST_APPS}`);

  const [srcRows, dstRows] = await Promise.all([fetchAll(SRC_APPS), fetchAll(DST_APPS)]);
  console.log(`  Source rows : ${srcRows.length}`);
  console.log(`  Dest rows   : ${dstRows.length}`);

  const existingAppIds = new Set(dstRows.map(appIdOf).filter(Boolean) as string[]);

  let copied = 0;
  let skipped = 0;
  let purged = 0;

  for (const row of srcRows) {
    const appId = appIdOf(row);
    if (!appId) {
      console.warn(`  ⚠  Skipping malformed row id=${row.id} (no app_id).`);
      skipped++;
      continue;
    }

    if (existingAppIds.has(appId)) {
      console.log(`  → skip  app_id=${appId} (already in ${DST_APPS})`);
      skipped++;
      continue;
    }

    const envelope = buildScribeRowEnvelope(row.data as Record<string, unknown>, {
      now: row.date_created ?? new Date().toISOString(),
      created_by: row.created_by ?? 0,
      modified_by: row.modified_by ?? 0,
    });
    // Preserve original modification timestamp when present.
    if (row.date_modified) {
      (envelope as { date_modified: string }).date_modified = row.date_modified;
    }

    console.log(`  → copy  app_id=${appId}${DRY_RUN ? " [dry-run]" : ""}`);
    if (!DRY_RUN) {
      await scribe.post(`/${DST_APPS}`, envelope);
      copied++;
    } else {
      copied++;
    }
  }

  if (PURGE_SOURCE && !DRY_RUN) {
    console.log(`\n  Purging source rows from ${SRC_APPS}…`);
    for (const row of srcRows) {
      const appId = appIdOf(row);
      await deleteRow(SRC_APPS, row.id);
      console.log(`  ✗ deleted  id=${row.id} app_id=${appId ?? "?"}`);
      purged++;
    }
  } else if (PURGE_SOURCE && DRY_RUN) {
    console.log(`  [dry-run] Would purge ${srcRows.length} source row(s) from ${SRC_APPS}.`);
  }

  return { copied, skipped, purged };
}

async function migrateChat(): Promise<{ copied: number; skipped: number; purged: number }> {
  console.log(`\n● Chat messages  ${SRC_CHAT} → ${DST_CHAT}`);

  const [srcRows, dstRows] = await Promise.all([fetchAll(SRC_CHAT), fetchAll(DST_CHAT)]);
  console.log(`  Source rows : ${srcRows.length}`);
  console.log(`  Dest rows   : ${dstRows.length}`);

  const existingMessageIds = new Set(dstRows.map(messageIdOf).filter(Boolean) as string[]);

  let copied = 0;
  let skipped = 0;
  let purged = 0;

  for (const row of srcRows) {
    const msgId = messageIdOf(row);
    if (!msgId) {
      console.warn(`  ⚠  Skipping malformed row id=${row.id} (no message_id).`);
      skipped++;
      continue;
    }

    if (existingMessageIds.has(msgId)) {
      console.log(`  → skip  message_id=${msgId} (already in ${DST_CHAT})`);
      skipped++;
      continue;
    }

    const envelope = buildScribeRowEnvelope(row.data as Record<string, unknown>, {
      now: row.date_created ?? new Date().toISOString(),
      created_by: row.created_by ?? 0,
      modified_by: row.modified_by ?? 0,
    });
    if (row.date_modified) {
      (envelope as { date_modified: string }).date_modified = row.date_modified;
    }

    console.log(`  → copy  message_id=${msgId}${DRY_RUN ? " [dry-run]" : ""}`);
    if (!DRY_RUN) {
      await scribe.post(`/${DST_CHAT}`, envelope);
      copied++;
    } else {
      copied++;
    }
  }

  if (PURGE_SOURCE && !DRY_RUN) {
    console.log(`\n  Purging source rows from ${SRC_CHAT}…`);
    for (const row of srcRows) {
      const msgId = messageIdOf(row);
      await deleteRow(SRC_CHAT, row.id);
      console.log(`  ✗ deleted  id=${row.id} message_id=${msgId ?? "?"}`);
      purged++;
    }
  } else if (PURGE_SOURCE && DRY_RUN) {
    console.log(`  [dry-run] Would purge ${srcRows.length} source row(s) from ${SRC_CHAT}.`);
  }

  return { copied, skipped, purged };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("─────────────────────────────────────────────────────────");
  console.log(" Scribe migration: powervibe → kota0");
  if (DRY_RUN) console.log(" Mode: DRY RUN — no writes will be made");
  if (PURGE_SOURCE) console.log(" Mode: PURGE SOURCE — old rows will be deleted after copy");
  console.log("─────────────────────────────────────────────────────────");

  const apps = await migrateApps();
  const chat = await migrateChat();

  console.log("\n─────────────────────────────────────────────────────────");
  console.log(" Summary");
  console.log(`  Apps     : ${apps.copied} copied, ${apps.skipped} skipped${apps.purged ? `, ${apps.purged} source rows purged` : ""}`);
  console.log(`  Messages : ${chat.copied} copied, ${chat.skipped} skipped${chat.purged ? `, ${chat.purged} source rows purged` : ""}`);
  if (DRY_RUN) console.log("\n  (dry-run — no changes were persisted)");
  console.log("─────────────────────────────────────────────────────────");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

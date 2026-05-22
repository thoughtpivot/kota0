/**
 * Reads prior revisions of a `k0_app` row from Scribe's auto-maintained `<table>_history`
 * table. Scribe@1.0.8 writes one snapshot row per PUT against `k0_app/:id`; each snapshot
 * has the same `data` envelope as the live row. This repo gives the AI ideation loop and
 * the chat UI structured access to that history (the previous `probeKota0AppSourceHistory`
 * only confirmed presence — it never decoded the snapshots).
 */
import { scribe } from "@/lib/scribe";
import { probeKota0AppSourceHistory } from "@/components/kota0/ai/scribeKota0History";

export type Kota0AppRevision = {
  source: string;
  backendSource: string;
  bundleEnv: string | undefined;
  when: string | null;
};

export type Kota0AppHistoryResult =
  | { ok: true; revisions: Kota0AppRevision[]; source: "rest" | "sql"; path?: string }
  | { ok: false; reason: "not_supported" | "scribe_error"; tried?: string[]; message?: string };

function pickString(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key];
  return typeof v === "string" ? v : undefined;
}

function snapshotToRevision(snap: unknown): Kota0AppRevision | null {
  if (!snap || typeof snap !== "object") return null;
  const row = snap as Record<string, unknown>;
  const rawData = row.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : row;
  const source = pickString(rawData, "source");
  const backendSource = pickString(rawData, "backendSource");
  if (source === undefined || backendSource === undefined) return null;
  const bundleEnv = pickString(rawData, "bundleEnv");
  const when =
    pickString(row, "date_modified") ??
    pickString(row, "date_created") ??
    pickString(rawData, "date_modified") ??
    pickString(rawData, "date_created") ??
    null;
  return { source, backendSource, bundleEnv, when };
}

/**
 * Try the REST history route first (the same one `probeKota0AppSourceHistory` probes);
 * if Scribe does not expose one, fall back to `POST /sql` against `k0_app_history`.
 * `limit` caps the number of revisions returned (most recent first); callers typically
 * want 2-3 to feed into the plan-call system prompt.
 */
export async function listKota0AppRevisions(
  scribeRowId: number,
  limit: number,
): Promise<Kota0AppHistoryResult> {
  const cappedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const probe = await probeKota0AppSourceHistory(scribeRowId);
  if (probe.supported && Array.isArray(probe.data)) {
    const out: Kota0AppRevision[] = [];
    for (const row of probe.data) {
      const rev = snapshotToRevision(row);
      if (rev) out.push(rev);
      if (out.length >= cappedLimit) break;
    }
    return { ok: true, revisions: out, source: "rest", path: probe.path };
  }

  // SQL fallback. Scribe creates `<table>_history` with the same `data` JSONB column
  // and a `foreignKey` int column referencing the parent row id. Order by descending
  // recency — most Scribe deployments expose `date_modified`; if a deployment renames
  // that column we'd need to adapt here, but the default schema is what kota0 runs on.
  try {
    const sql = `
      SELECT id, "foreignKey", data, date_created, date_modified
      FROM k0_app_history
      WHERE "foreignKey" = $1
      ORDER BY COALESCE(date_modified, date_created) DESC NULLS LAST, id DESC
      LIMIT $2
    `.trim();
    const res = await scribe.post(`/sql`, { sql, params: [scribeRowId, cappedLimit] });
    const body = res.data as unknown;
    const rows =
      Array.isArray(body) ? body
      : body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows)
        ? ((body as { rows: unknown[] }).rows)
        : [];
    const out: Kota0AppRevision[] = [];
    for (const row of rows) {
      const rev = snapshotToRevision(row);
      if (rev) out.push(rev);
    }
    return { ok: true, revisions: out, source: "sql" };
  } catch (e) {
    return {
      ok: false,
      reason: "not_supported",
      tried: probe.supported ? [probe.path] : probe.tried,
      message:
        (e instanceof Error ? e.message : String(e)) +
        " (REST history probe + POST /sql fallback both failed)",
    };
  }
}

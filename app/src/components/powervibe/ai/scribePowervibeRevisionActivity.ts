/**
 * Derive build / source activity from Scribe `GET /:table/:id/history` payloads.
 * Scribe diffs `nvibe_app` rows; each list entry is a reconstructed full row at that revision.
 * We use row-level timestamps (e.g. `date_modified`, `date_created`) when present.
 * @see probePowervibeAppSourceHistory in scribePowervibeHistory.ts
 */

const TIME_KEYS = [
  "date_modified",
  "date_created",
  "updatedAt",
  "createdAt",
] as const;

function parseTimeField(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** One snapshot in Scribe history — may be a row envelope or a plain data payload. */
function instantFromHistorySnapshot(snap: unknown): Date | null {
  if (!snap || typeof snap !== "object") return null;
  const o = snap as Record<string, unknown>;
  for (const k of TIME_KEYS) {
    const t = parseTimeField(o[k]);
    if (t) return t;
  }
  const data = o.data;
  if (data && typeof data === "object") {
    const inner = data as Record<string, unknown>;
    for (const k of TIME_KEYS) {
      const t = parseTimeField(inner[k]);
      if (t) return t;
    }
  }
  return null;
}

/** Scribe `history` is an array of one JSON row per source revision (current first). */
export function countHistoryRevisions(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  return data.length;
}

export function extractRevisionInstantsFromScribeHistoryBody(data: unknown): Date[] {
  if (!Array.isArray(data)) return [];
  const out: Date[] = [];
  for (const row of data) {
    const t = instantFromHistorySnapshot(row);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Pads missing per-revision timestamps with the app’s `updatedAt` so the bar still reflects
 * revision *volume* when a snapshot omits `date_*` (same-day stacking).
 */
export function fillMissingRevisionInstants(
  fromHistory: Date[],
  revisionCount: number,
  registryUpdatedAt: string | null,
): { all: Date[]; usedRegistryFallback: boolean } {
  if (revisionCount <= 0) return { all: [], usedRegistryFallback: false };
  const u = registryUpdatedAt ? parseTimeField(registryUpdatedAt) : null;
  const out = [...fromHistory];
  if (out.length < revisionCount && u) {
    const pad = revisionCount - out.length;
    for (let i = 0; i < pad; i++) {
      out.push(new Date(u.getTime()));
    }
    return { all: out, usedRegistryFallback: true };
  }
  return { all: out, usedRegistryFallback: false };
}

/**
 * Count events per *local* calendar day over the last `windowDays` days (inclusive of today as end).
 * `labels[0]` is the oldest day in the window, `labels[windowDays - 1]` is today.
 */
export function bucketRevisionInstantsByLocalDay(
  all: Date[],
  windowDays: number,
  now: Date = new Date(),
): { dayLabels: string[]; dayCounts: number[] } {
  const n = Math.max(1, Math.min(90, Math.floor(windowDays)));
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (n - 1));
  const dayMs = 24 * 60 * 60 * 1000;

  const dayLabels: string[] = [];
  for (let j = 0; j < n; j++) {
    const d = new Date(start);
    d.setDate(d.getDate() + j);
    dayLabels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }

  const dayCounts = new Array(n).fill(0);
  for (const t of all) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    const t0 = d.getTime();
    if (t0 < start.getTime() || t0 > end.getTime()) continue;
    const idx = Math.round((t0 - start.getTime()) / dayMs);
    if (idx >= 0 && idx < n) {
      dayCounts[idx] += 1;
    }
  }
  return { dayLabels, dayCounts };
}

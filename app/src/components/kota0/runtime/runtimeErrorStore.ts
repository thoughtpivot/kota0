/**
 * Per-app ring buffer of runtime errors POSTed by the bundle's `errorBridge`.
 * Stays in-memory on the platform Flight process; a workspace restart loses
 * history, which is fine — these errors are short-lived signal for the agent
 * loop, not durable telemetry.
 *
 * The buffer is intentionally simple (no Redis fan-out): the apply agent loop
 * runs inside the same workspace process that receives these POSTs, so reads
 * see writes immediately. If we later need cross-worker durability, a Redis
 * LIST keyed by appId is the natural upgrade.
 */

export type Kota0RuntimeError = {
  kind: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  /** ISO timestamp from the iframe at capture time. */
  at: string;
  /** ms epoch when the workspace received the POST. */
  receivedAt: number;
  url: string;
};

const MAX_ERRORS_PER_APP = 50;
const buffersByAppId = new Map<string, Kota0RuntimeError[]>();

export function appendKota0RuntimeError(appId: string, err: Kota0RuntimeError): void {
  if (!appId || typeof appId !== "string") return;
  const buf = buffersByAppId.get(appId) ?? [];
  buf.push(err);
  while (buf.length > MAX_ERRORS_PER_APP) buf.shift();
  buffersByAppId.set(appId, buf);
}

export function readKota0RuntimeErrors(
  appId: string,
  opts?: { since?: number; limit?: number },
): Kota0RuntimeError[] {
  const buf = buffersByAppId.get(appId);
  if (!buf || buf.length === 0) return [];
  let out = buf;
  if (typeof opts?.since === "number" && Number.isFinite(opts.since)) {
    const since = opts.since;
    out = buf.filter((e) => e.receivedAt >= since);
  }
  if (typeof opts?.limit === "number" && Number.isFinite(opts.limit) && opts.limit > 0) {
    const limit = Math.floor(opts.limit);
    out = out.slice(Math.max(0, out.length - limit));
  }
  return out;
}

export function clearKota0RuntimeErrors(appId: string): void {
  buffersByAppId.delete(appId);
}

/** Test-only helper: total count across all apps. Not exported to tools. */
export function _kota0RuntimeErrorStoreSizeForTest(): number {
  let n = 0;
  for (const b of buffersByAppId.values()) n += b.length;
  return n;
}

/**
 * Assembles a compact "current bundle state" markdown block that the agent loop
 * inlines into its system prompt at turn start. The goal: the model knows the
 * build phase, the last failure (if any), recent stdout/stderr, and recent
 * runtime errors WITHOUT burning a tool call to fetch them.
 *
 * The agent can still call `getBuildSnapshot` / `tailBundleLogs` /
 * `getRuntimeErrors` mid-turn for fresh data, but most turns won't need to.
 */
import { getKota0BundleSnapshot } from "@/components/kota0/deploy/kota0BundleSnapshot";
import { getFlightConsoleRecent } from "@/components/kota0/deploy/kota0ConsoleLogHub";
import { readKota0RuntimeErrors } from "@/components/kota0/runtime/kota0RuntimeErrorStore";

const LOG_TAIL_LINES = 20;
const RUNTIME_ERROR_LIMIT = 5;

function describePhaseSince(phaseSince: number, now: number = Date.now()): string {
  if (phaseSince === 0) return "";
  const secs = Math.max(0, Math.floor((now - phaseSince) / 1000));
  if (secs < 60) return ` (since ${secs}s ago)`;
  const mins = Math.floor(secs / 60);
  return ` (since ${mins}m ago)`;
}

function truncateLine(s: string, max = 240): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

export async function buildKota0BundleStateSummary(appId: string): Promise<string> {
  const snap = await getKota0BundleSnapshot(appId);
  const recentLogs = getFlightConsoleRecent();
  const runtimeErrs = readKota0RuntimeErrors(appId, { limit: RUNTIME_ERROR_LIMIT });

  const parts: string[] = [
    "=== Current bundle state (snapshot at agent loop start) ===",
    `phase: ${snap.phase}${describePhaseSince(snap.phaseSince)}`,
  ];
  if (snap.lastBuildError) {
    const e = snap.lastBuildError;
    const mod = e.module ? ` module="${e.module}"` : "";
    parts.push(`lastBuildError: ${e.kind} — ${truncateLine(e.message)}${mod}`);
  } else {
    parts.push("lastBuildError: none");
  }
  parts.push(`servingAppId: ${snap.servingAppId ?? "(none)"}`);
  parts.push(`fingerprint: ${snap.fingerprint ?? "(none)"}`);
  parts.push(`isServingThisApp: ${snap.isServing}`);

  if (recentLogs.length > 0) {
    const tail = recentLogs.slice(-LOG_TAIL_LINES);
    parts.push("");
    parts.push(`Recent bundle Flight output (last ${tail.length} line${tail.length === 1 ? "" : "s"}):`);
    for (const entry of tail) {
      parts.push(`  [${entry.stream}] ${truncateLine(entry.text)}`);
    }
  }

  if (runtimeErrs.length > 0) {
    parts.push("");
    parts.push(`Recent runtime errors from the preview iframe (last ${runtimeErrs.length}):`);
    for (const err of runtimeErrs) {
      parts.push(`  - [${err.kind}] ${truncateLine(err.message)}`);
    }
  }

  parts.push("=== end Current bundle state ===");
  return parts.join("\n");
}

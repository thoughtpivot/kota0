/**
 * Bundle-preview polling — one concern.
 *
 * Polls `/bundle-flight/status` (with an SSE fast-path) until :4000 serves the app
 * with the expected materialize fingerprint. Pure async helpers; the composable
 * (`useKota0GeneratedApp`) owns the surrounding preview lifecycle + reactive state.
 */
import {
  fetchKota0BundleFlightStatus,
  subscribeKota0BundleFlightStatusSse,
  type Kota0BundleFlightStatus,
  type Kota0BundleStatusSseEvent,
} from "@/components/kota0/apps/kota0AppApi";

/**
 * Poll bundle-flight status until :4000 serves `appId` with matching materialize fingerprint.
 * `isStillCurrent` short-circuits when the user switches apps or cancels.
 * `getExpectedFingerprint` may change mid-poll when source is applied while waiting.
 */
export async function waitForBundlePreviewSynced(
  appId: string,
  isStillCurrent: () => boolean,
  getExpectedFingerprint: () => string,
  onStatus: (s: Kota0BundleFlightStatus) => void,
): Promise<boolean> {
  const deadline = Date.now() + 90_000;
  const warmupDelays = [100, 200, 400, 800, 1500];
  let warmupIdx = 0;
  let sseMatched = false;

  const applySseEvent = (evt: Kota0BundleStatusSseEvent): void => {
    if (!isStillCurrent() || evt.appId !== appId) return;
    onStatus({
      servingAppId: appId,
      ready: evt.ready,
      bundleFingerprint: evt.bundleFingerprint,
      restarting: false,
      phase: evt.phase,
      phaseSince: evt.phaseSince,
      lastBuildError: null,
    });
    const want = getExpectedFingerprint().trim();
    if (want && evt.ready && evt.bundleFingerprint === want && evt.phase === "running") {
      sseMatched = true;
    }
  };

  const closeSse = subscribeKota0BundleFlightStatusSse(applySseEvent);

  try {
    while (Date.now() < deadline) {
      if (!isStillCurrent()) return false;
      if (sseMatched) return true;
      const want = getExpectedFingerprint().trim();
      if (!want) return false;
      const res = await fetchKota0BundleFlightStatus(appId);
      if (!isStillCurrent()) return false;
      if (res.ok) {
        onStatus(res.status);
        const { ready, bundleFingerprint, restarting, servingAppId } = res.status;
        // Require :4000 to actually be serving THIS app — a duplicated app shares the source
        // (hence the fingerprint) of its origin, so a fingerprint match alone can be satisfied
        // while the bundle is still serving the original app, yielding a proxy 425 on the iframe.
        if (ready && !restarting && servingAppId === appId && bundleFingerprint === want) {
          return true;
        }
      }
      const delay = warmupIdx < warmupDelays.length ? warmupDelays[warmupIdx]! : 2500;
      warmupIdx += 1;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    return false;
  } finally {
    closeSse();
  }
}

/** Legacy poll — identity only (initial preview before fingerprint is known). */
export async function waitForBundleFlightServing(
  appId: string,
  isStillCurrent: () => boolean,
  onStatus: (s: Kota0BundleFlightStatus) => void,
): Promise<boolean> {
  const deadline = Date.now() + 90_000;
  const warmupDelays = [100, 200, 400, 800, 1500];
  let warmupIdx = 0;
  while (Date.now() < deadline) {
    if (!isStillCurrent()) return false;
    const res = await fetchKota0BundleFlightStatus(appId);
    if (!isStillCurrent()) return false;
    if (res.ok) {
      onStatus(res.status);
      if (res.status.servingAppId === appId && res.status.ready && !res.status.restarting) {
        return true;
      }
    }
    const delay = warmupIdx < warmupDelays.length ? warmupDelays[warmupIdx]! : 2500;
    warmupIdx += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

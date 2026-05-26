/**
 * Read-only snapshot of bundle build/runtime status for a single app. The agent
 * loop's `getBuildSnapshot` tool returns this; the auto-start preview client
 * polls it. Everything is sourced from `kota0BundleSharedState` so cross-worker
 * coordination stays intact.
 */
import {
  readBundleSharedState,
  getBundleAppStatus,
  getBundleFingerprintFromState,
  type BundleAppRuntimeStatus,
  type BundleBuildError,
  type BundlePhase,
} from "@/components/kota0/deploy/kota0BundleSharedState";
import { getBundleFlightServingAppId } from "@/components/kota0/deploy/kota0BundleRunner";

export type Kota0BundleSnapshot = {
  appId: string;
  phase: BundlePhase;
  phaseSince: number;
  lastBuildError: BundleBuildError | null;
  /** Last materialize fingerprint persisted for this app; null when never materialized. */
  fingerprint: string | null;
  /** Is bundle Flight currently serving this app on :4000? */
  isServing: boolean;
  /** App id Flight is currently serving (helps the model spot mid-restart drift). */
  servingAppId: string | null;
  /** Wall-clock when this snapshot was taken — used by the auto-start client to detect freshness. */
  fetchedAt: number;
};

export async function getKota0BundleSnapshot(appId: string): Promise<Kota0BundleSnapshot> {
  const state = await readBundleSharedState();
  const status: BundleAppRuntimeStatus = getBundleAppStatus(state, appId);
  const fingerprint = getBundleFingerprintFromState(state, appId);
  const servingAppId = state.servingAppId ?? getBundleFlightServingAppId();
  return {
    appId,
    phase: status.phase,
    phaseSince: status.phaseSince,
    lastBuildError: status.lastBuildError,
    fingerprint,
    isServing: servingAppId === appId,
    servingAppId,
    fetchedAt: Date.now(),
  };
}

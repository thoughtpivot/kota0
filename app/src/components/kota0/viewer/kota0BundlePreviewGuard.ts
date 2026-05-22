import { bundleFlightIdentityPing } from "./kota0BundleFlightIdentity";

const DEFAULT_BUNDLE_FLIGHT_PORT = 4000;

export function bundlePreviewTargetPort(): number {
  const raw = (process.env.K0_BUNDLE_PREVIEW_TARGET_PORT ?? "4000").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUNDLE_FLIGHT_PORT;
}

export type BundlePreviewGuardResult = { blocked: false } | { blocked: true; body: string };

/**
 * When `?app=` is present on a top-level preview document request, block until :4000
 * hello reports that app id. Asset requests omit `?app=` and skip this guard.
 *
 * Uses only relative imports (no `@/`) so the Vite dev proxy can load this module at
 * config compile time.
 */
export async function guardBundlePreviewAppRequest(
  requestedAppId: string | null,
  port = bundlePreviewTargetPort(),
  opts?: { servingAppId?: string | null },
): Promise<BundlePreviewGuardResult> {
  if (!requestedAppId) return { blocked: false };
  const ok = await bundleFlightIdentityPing(port, requestedAppId, 900);
  if (ok) return { blocked: false };
  const serving = opts?.servingAppId ?? null;
  const body =
    serving && serving !== requestedAppId
      ? `Kota0 bundle preview: serving "${serving}", request was for "${requestedAppId}". Retry shortly.`
      : `Kota0 bundle preview: Flight on :${port} is not serving "${requestedAppId}" yet. Retry shortly.`;
  return { blocked: true, body };
}

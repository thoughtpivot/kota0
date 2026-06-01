/**
 * Bundle lifecycle phase — the cross-subject wire contract.
 *
 * Produced by the deploy runtime (`deploy/kota0BundleSharedState.ts`) and parsed by
 * the workspace API client (`apps/kota0AppApi.ts`). Lives in `lib/` (thin, neutral)
 * because it's shared across subjects but is workspace-only (not imported by bundles).
 */
export type BundlePhase = "idle" | "installing" | "building" | "running" | "failed";

const KOTA0_BUNDLE_PHASE_SET: ReadonlySet<BundlePhase> = new Set([
  "idle",
  "installing",
  "building",
  "running",
  "failed",
]);

/** Narrow an unknown (e.g. parsed JSON / persisted state) to a valid phase, defaulting to `"idle"`. */
export function coerceKota0BundlePhase(raw: unknown): BundlePhase {
  return typeof raw === "string" && KOTA0_BUNDLE_PHASE_SET.has(raw as BundlePhase)
    ? (raw as BundlePhase)
    : "idle";
}

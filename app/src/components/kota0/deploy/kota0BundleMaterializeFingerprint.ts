import { createHash } from "node:crypto";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/kota0/deploy/kota0AppVueChartSanitize.ts";
import { normalizeKota0AppVueLeadingSlashApis } from "@/components/kota0/viewer/kota0Materialize";

function bundleVueSourceForMaterialize(source: string): string {
  return sanitizeChartJsModelArtifactsInAppVueSource(normalizeKota0AppVueLeadingSlashApis(source));
}

function bundleEnvLayerForFingerprint(bundleEnv: string | undefined): string {
  if (bundleEnv === undefined || bundleEnv.length === 0) return "";
  return bundleEnv;
}

/** Stable hash of bundle inputs written by materialize (normalized SFC + backend + env layer). */
export function bundleMaterializeFingerprint(
  source: string,
  backendSource: string,
  bundleEnv?: string,
): string {
  const vueSource = bundleVueSourceForMaterialize(source);
  const envPart = bundleEnvLayerForFingerprint(bundleEnv);
  const payload = `${vueSource}\0${backendSource}\0${envPart}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

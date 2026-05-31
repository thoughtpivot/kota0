import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type BundleScribeGatewayConfig, writeMaterializedBundleDotEnv } from "@/components/kota0/deploy/kota0BundleEnv";
import { buildKota0BundlePackageJson } from "@/components/kota0/deploy/kota0BundlePackageJson";
import { resolveKota0BundleDir, resolveKota0BundleTemplateDir } from "@/components/kota0/deploy/kota0BundlePaths";
import { ensureKota0BundleProbeRoutesFirst,
  sanitizeKota0BackendRoutesForKoa,
} from "@/components/kota0/viewer/kota0AppBackendForFlight";
import { sanitizeKota0AppVueBundleApiImports } from "@/components/kota0/deploy/kota0AppVueBundleApiSanitize";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";

/**
 * Writes `bundles/<appId>/` from `templates/k0-bundle`, materialized `App.vue` / `App.backend.ts`,
 * generated `package.json`, per-app `.env`, and repo `.nvmrc`.
 */
export async function writeKota0AppBundle(input: {
  appId: string;
  source: string;
  backendSource: string;
  /** When set to a non-empty string, written before merge so `writeMaterializedBundleDotEnv` preserves user keys. */
  bundleEnv?: string;
  /** Scoped Scribe Gateway credentials for this bundle. Always pass this in normal operation. */
  scribeGateway?: BundleScribeGatewayConfig;
}): Promise<{ bundleDir: string }> {
  const bundleDir = resolveKota0BundleDir(input.appId);
  await mkdir(bundleDir, { recursive: true });

  const templateDir = resolveKota0BundleTemplateDir();
  await cp(templateDir, bundleDir, { recursive: true, force: true });

  await writeFile(path.join(bundleDir, "App.vue"), sanitizeKota0AppVueBundleApiImports(input.source), "utf8");
  await writeFile(
    path.join(bundleDir, "App.backend.ts"),
    ensureKota0BundleProbeRoutesFirst(sanitizeKota0BackendRoutesForKoa(input.backendSource)),
    "utf8",
  );

  const pkg = buildKota0BundlePackageJson();
  await writeFile(path.join(bundleDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  if (input.bundleEnv !== undefined) {
    await writeFile(path.join(bundleDir, ".env"), input.bundleEnv, "utf8");
  }

  await writeMaterializedBundleDotEnv(bundleDir, input.scribeGateway);

  const root = resolveKota0RepoRoot();
  try {
    const nvmrc = await readFile(path.join(root, ".nvmrc"), "utf8");
    await writeFile(path.join(bundleDir, ".nvmrc"), nvmrc.trimEnd() + "\n", "utf8");
  } catch {
    await writeFile(path.join(bundleDir, ".nvmrc"), "lts/*\n", "utf8");
  }

  return { bundleDir };
}

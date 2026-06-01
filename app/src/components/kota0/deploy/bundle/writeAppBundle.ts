import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type BundleScribeGatewayConfig, writeMaterializedBundleDotEnv } from "@/components/kota0/deploy/runner/bundleEnv";
import { buildBundlePackageJson } from "@/components/kota0/deploy/bundle/bundlePackageJson";
import { resolveBundleDir, resolveBundleTemplateDir } from "@/components/kota0/deploy/bundle/bundlePaths";
import { ensureBundleProbeRoutesFirst,
  sanitizeBackendRoutesForKoa,
} from "@/components/kota0/viewer/materialize/appBackendForFlight";
import { sanitizeAppVueBundleApiImports } from "@/components/kota0/deploy/bundle/appVueBundleApiSanitize";
import { resolveRepoRoot } from "@/components/kota0/viewer/materialize/materialize";

/**
 * Writes `bundles/<appId>/` from `templates/k0-bundle`, materialized `App.vue` / `App.backend.ts`,
 * generated `package.json`, per-app `.env`, and repo `.nvmrc`.
 */
export async function writeAppBundle(input: {
  appId: string;
  source: string;
  backendSource: string;
  /** When set to a non-empty string, written before merge so `writeMaterializedBundleDotEnv` preserves user keys. */
  bundleEnv?: string;
  /** Scoped Scribe Gateway credentials for this bundle. Always pass this in normal operation. */
  scribeGateway?: BundleScribeGatewayConfig;
}): Promise<{ bundleDir: string }> {
  const bundleDir = resolveBundleDir(input.appId);
  await mkdir(bundleDir, { recursive: true });

  const templateDir = resolveBundleTemplateDir();
  await cp(templateDir, bundleDir, { recursive: true, force: true });

  await writeFile(path.join(bundleDir, "App.vue"), sanitizeAppVueBundleApiImports(input.source), "utf8");
  await writeFile(
    path.join(bundleDir, "App.backend.ts"),
    ensureBundleProbeRoutesFirst(sanitizeBackendRoutesForKoa(input.backendSource)),
    "utf8",
  );

  const pkg = buildBundlePackageJson();
  await writeFile(path.join(bundleDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  if (input.bundleEnv !== undefined) {
    await writeFile(path.join(bundleDir, ".env"), input.bundleEnv, "utf8");
  }

  await writeMaterializedBundleDotEnv(bundleDir, input.scribeGateway);

  const root = resolveRepoRoot();
  try {
    const nvmrc = await readFile(path.join(root, ".nvmrc"), "utf8");
    await writeFile(path.join(bundleDir, ".nvmrc"), nvmrc.trimEnd() + "\n", "utf8");
  } catch {
    await writeFile(path.join(bundleDir, ".nvmrc"), "lts/*\n", "utf8");
  }

  return { bundleDir };
}

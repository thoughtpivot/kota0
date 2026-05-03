import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeMaterializedBundleDotEnv } from "@/components/powervibe/deploy/powervibeBundleEnv";
import { buildPowervibeBundlePackageJson } from "@/components/powervibe/deploy/powervibeBundlePackageJson";
import { resolvePowervibeBundleDir, resolvePowervibeBundleTemplateDir } from "@/components/powervibe/deploy/powervibeBundlePaths";
import {
  ensurePowervibeBundleProbeRoutesFirst,
  sanitizePowervibeBackendRoutesForKoa,
} from "@/components/powervibe/viewer/powervibeAppBackendForFlight";
import { resolvePowervibeRepoRoot } from "@/components/powervibe/viewer/powervibeMaterialize";

/**
 * Writes `bundles/<appId>/` from `templates/powervibe-bundle`, materialized `App.vue` / `App.backend.ts`,
 * generated `package.json`, per-app `.env`, and repo `.nvmrc`.
 */
export async function writePowervibeAppBundle(input: {
  appId: string;
  source: string;
  backendSource: string;
  /** When set to a non-empty string, written before merge so `writeMaterializedBundleDotEnv` preserves user keys. */
  bundleEnv?: string;
}): Promise<{ bundleDir: string }> {
  const bundleDir = resolvePowervibeBundleDir(input.appId);
  await mkdir(bundleDir, { recursive: true });

  const templateDir = resolvePowervibeBundleTemplateDir();
  await cp(templateDir, bundleDir, { recursive: true, force: true });

  await writeFile(path.join(bundleDir, "App.vue"), input.source, "utf8");
  await writeFile(
    path.join(bundleDir, "App.backend.ts"),
    ensurePowervibeBundleProbeRoutesFirst(sanitizePowervibeBackendRoutesForKoa(input.backendSource)),
    "utf8",
  );

  const pkg = buildPowervibeBundlePackageJson();
  await writeFile(path.join(bundleDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  if (input.bundleEnv !== undefined) {
    await writeFile(path.join(bundleDir, ".env"), input.bundleEnv, "utf8");
  }

  await writeMaterializedBundleDotEnv(bundleDir);

  const root = resolvePowervibeRepoRoot();
  try {
    const nvmrc = await readFile(path.join(root, ".nvmrc"), "utf8");
    await writeFile(path.join(bundleDir, ".nvmrc"), nvmrc.trimEnd() + "\n", "utf8");
  } catch {
    await writeFile(path.join(bundleDir, ".nvmrc"), "lts/*\n", "utf8");
  }

  return { bundleDir };
}

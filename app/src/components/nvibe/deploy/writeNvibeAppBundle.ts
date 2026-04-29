import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeMaterializedBundleDotEnv } from "@/components/nvibe/deploy/nvibeBundleEnv";
import { buildNvibeBundlePackageJson } from "@/components/nvibe/deploy/nvibeBundlePackageJson";
import { resolveNvibeBundleDir, resolveNvibeBundleTemplateDir } from "@/components/nvibe/deploy/nvibeBundlePaths";
import { resolveNvibeRepoRoot } from "@/components/nvibe/viewer/nvibeMaterialize";

/**
 * Writes `bundles/<appId>/` from `templates/nvibe-bundle`, materialized `App.vue` / `App.backend.ts`,
 * generated `package.json`, per-app `.env`, and repo `.nvmrc`.
 */
export async function writeNvibeAppBundle(input: {
  appId: string;
  source: string;
  backendSource: string;
}): Promise<{ bundleDir: string }> {
  const bundleDir = resolveNvibeBundleDir(input.appId);
  await mkdir(bundleDir, { recursive: true });

  const templateDir = resolveNvibeBundleTemplateDir();
  await cp(templateDir, bundleDir, { recursive: true, force: true });

  await writeFile(path.join(bundleDir, "App.vue"), input.source, "utf8");
  await writeFile(path.join(bundleDir, "App.backend.ts"), input.backendSource, "utf8");

  const pkg = buildNvibeBundlePackageJson();
  await writeFile(path.join(bundleDir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  await writeMaterializedBundleDotEnv(bundleDir);

  const root = resolveNvibeRepoRoot();
  try {
    const nvmrc = await readFile(path.join(root, ".nvmrc"), "utf8");
    await writeFile(path.join(bundleDir, ".nvmrc"), nvmrc.trimEnd() + "\n", "utf8");
  } catch {
    await writeFile(path.join(bundleDir, ".nvmrc"), "lts/*\n", "utf8");
  }

  return { bundleDir };
}

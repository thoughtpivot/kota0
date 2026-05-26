/**
 * Mutate a bundle's `package.json` to add a missing runtime dependency. Used by
 * the agent loop's `addBundleDependency` tool to fix Rollup "failed to resolve
 * import" errors (the leaflet case).
 *
 * Important: we invalidate the runner's in-memory install hash so the next
 * `restartKota0Bundle` actually re-runs `npm install` — without that, the new
 * dep is in the file but never installed.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveKota0BundleDir } from "@/components/kota0/deploy/kota0BundlePaths";
import { forgetKota0BundleNpmState } from "@/components/kota0/deploy/kota0BundleRunner";

export type AddBundleDependencyResult =
  | { ok: true; alreadyPresent: boolean; previousVersion?: string; nextVersion: string }
  | { ok: false; reason: string };

const VALID_PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9\-._]*\/)?[a-z0-9][a-z0-9\-._]*$/i;

function isValidNpmName(name: string): boolean {
  if (!name || name.length === 0 || name.length > 214) return false;
  return VALID_PACKAGE_NAME_RE.test(name);
}

function isReasonableVersion(v: string): boolean {
  if (!v) return false;
  if (v.length > 64) return false;
  // Allow semver-ish strings (^x.y.z, ~x.y.z, x.y.z, latest, dist-tags). We
  // don't pin a strict regex because npm itself accepts many shapes.
  return /^[a-z0-9^~><=\-.*+|& ]+$/i.test(v);
}

export async function addKota0BundleDependency(
  appId: string,
  packageName: string,
  version: string = "latest",
): Promise<AddBundleDependencyResult> {
  if (!isValidNpmName(packageName)) {
    return { ok: false, reason: `invalid package name: "${packageName}"` };
  }
  if (!isReasonableVersion(version)) {
    return { ok: false, reason: `invalid version spec: "${version}"` };
  }
  const bundleDir = resolveKota0BundleDir(appId);
  const pkgPath = path.join(bundleDir, "package.json");
  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf8");
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") {
      return {
        ok: false,
        reason: `bundle package.json missing at ${pkgPath} — materialize the app first`,
      };
    }
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  let pkg: { dependencies?: Record<string, string> } & Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as typeof pkg;
  } catch (e) {
    return { ok: false, reason: `failed to parse bundle package.json: ${e instanceof Error ? e.message : String(e)}` };
  }
  const deps: Record<string, string> = { ...(pkg.dependencies ?? {}) };
  const previous = deps[packageName];
  if (previous === version) {
    return { ok: true, alreadyPresent: true, previousVersion: previous, nextVersion: version };
  }
  deps[packageName] = version;
  pkg.dependencies = sortDeps(deps);
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  // Force the next restart to re-run `npm install` — the runner caches the
  // hash of the last-installed package.json per app, and our edit changes that
  // hash. But the runner also short-circuits when `node_modules` exists; the
  // hash check is what re-triggers install. Belt + braces: forget the hash too.
  forgetKota0BundleNpmState(appId);
  return {
    ok: true,
    alreadyPresent: false,
    previousVersion: previous,
    nextVersion: version,
  };
}

function sortDeps(deps: Record<string, string>): Record<string, string> {
  const keys = Object.keys(deps).sort();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = deps[k]!;
  return out;
}

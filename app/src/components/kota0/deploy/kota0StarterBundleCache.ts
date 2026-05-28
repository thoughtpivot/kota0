import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/kota0/deploy/kota0AppVueChartSanitize.ts";
import { buildKota0BundlePackageJson } from "@/components/kota0/deploy/kota0BundlePackageJson";
import {
  BUNDLE_DEFAULT_SCRIBE_URL,
  minimalHostProcessEnv,
  writeMaterializedBundleDotEnv,
  type BundleScribeGatewayConfig,
} from "@/components/kota0/deploy/kota0BundleEnv";
import { markKota0BundleDepsInstalled } from "@/components/kota0/deploy/kota0BundleRunner";
import { resolveKota0BundleDir, resolveKota0BundlesRoot, resolveKota0BundleTemplateDir } from "@/components/kota0/deploy/kota0BundlePaths";
import { writeKota0AppBundle } from "@/components/kota0/deploy/writeKota0AppBundle";
import { normalizeKota0AppBackendForFlight } from "@/components/kota0/viewer/kota0AppBackendForFlight";
import {
  DEFAULT_K0_BACKEND,
  DEFAULT_K0_SFC,
  normalizeKota0AppVueLeadingSlashApis,
} from "@/components/kota0/viewer/kota0Materialize";

export const KOTA0_STARTER_CACHE_DIRNAME = ".starter-cache";
export const KOTA0_STARTER_CACHE_SENTINEL_APP_ID = ".starter-cache";
const FINGERPRINT_FILE = ".fingerprint";

const WRITABLE_BUNDLE_FILES = [
  "App.vue",
  "App.backend.ts",
  "package.json",
  ".nvmrc",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
] as const;

const STARTER_GATEWAY: BundleScribeGatewayConfig = {
  url: BUNDLE_DEFAULT_SCRIBE_URL,
  apiKey: "starter-cache-unused",
};

let ensureInFlight: Promise<void> | null = null;

function hashHex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function isKota0StarterCacheDisabled(): boolean {
  return process.env.K0_DISABLE_STARTER_CACHE === "1";
}

export function isKota0StarterCacheDeepCopy(): boolean {
  return process.env.K0_STARTER_CACHE_DEEP_COPY === "1";
}

export function isKota0StarterCacheClonefile(): boolean {
  return process.env.K0_STARTER_CACHE_CLONEFILE === "1";
}

export function resolveKota0StarterCacheDir(): string {
  return path.join(resolveKota0BundlesRoot(), KOTA0_STARTER_CACHE_DIRNAME);
}

async function walkTemplateFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkTemplateFiles(abs, rel)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

async function hashTemplateTree(): Promise<string> {
  const templateDir = resolveKota0BundleTemplateDir();
  const files = await walkTemplateFiles(templateDir);
  const parts: string[] = [];
  for (const rel of files) {
    const body = await readFile(path.join(templateDir, rel), "utf8");
    parts.push(`${rel}\0${body}`);
  }
  return hashHex(parts.join("\n"));
}

export async function computeKota0StarterCacheFingerprint(): Promise<string> {
  const vue = sanitizeChartJsModelArtifactsInAppVueSource(
    normalizeKota0AppVueLeadingSlashApis(DEFAULT_K0_SFC),
  );
  const backend = normalizeKota0AppBackendForFlight(DEFAULT_K0_BACKEND);
  const pkg = JSON.stringify(buildKota0BundlePackageJson());
  const templateHash = await hashTemplateTree();
  return hashHex([vue, backend, pkg, templateHash].join("\n"));
}

function cacheArtifactsReady(cacheDir: string): boolean {
  return (
    existsSync(path.join(cacheDir, "node_modules")) &&
    existsSync(path.join(cacheDir, "dist", "index.html")) &&
    existsSync(path.join(cacheDir, "App.vue")) &&
    existsSync(path.join(cacheDir, "App.backend.ts"))
  );
}

export async function isKota0StarterCacheReady(): Promise<boolean> {
  if (isKota0StarterCacheDisabled()) return false;
  const cacheDir = resolveKota0StarterCacheDir();
  if (!cacheArtifactsReady(cacheDir)) return false;
  try {
    const expected = await computeKota0StarterCacheFingerprint();
    const stored = (await readFile(path.join(cacheDir, FINGERPRINT_FILE), "utf8")).trim();
    return stored === expected;
  } catch {
    return false;
  }
}

async function loadBundleEnvForBuild(bundleDir: string): Promise<NodeJS.ProcessEnv> {
  const raw = await readFile(path.join(bundleDir, ".env"), "utf8");
  const parsed = dotenv.parse(raw);
  return {
    ...minimalHostProcessEnv(),
    ...parsed,
    FLIGHT_PORT: "4000",
    FLIGHT_MODE: "production",
    FLIGHT_DIST_PATH: "./dist",
    FLIGHT_DISABLE_VITE: "true",
    FLIGHT_MAX_WORKERS: "1",
  };
}

async function runNpmInstall(bundleDir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: bundleDir,
      env: minimalHostProcessEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[k0-starter-cache] npm install failed (exit ${code ?? "unknown"})`));
    });
  });
}

async function runViteBuild(bundleDir: string): Promise<void> {
  const env = await loadBundleEnvForBuild(bundleDir);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["vite", "build", "--config", "vite.config.ts"], {
      cwd: bundleDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[k0-starter-cache] vite build failed (exit ${code ?? "unknown"})`));
    });
  });
}

async function copyWritableStarterScaffold(cacheDir: string, bundleDir: string): Promise<void> {
  for (const name of WRITABLE_BUNDLE_FILES) {
    const src = path.join(cacheDir, name);
    if (existsSync(src)) {
      await copyFile(src, path.join(bundleDir, name));
    }
  }
  await cp(path.join(cacheDir, "src"), path.join(bundleDir, "src"), { recursive: true, force: true });
}

async function runDarwinCloneCopy(src: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("cp", ["-c", "-a", src, dest], {
      env: minimalHostProcessEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[k0-starter-cache] cp -c -a failed (exit ${code ?? "unknown"})`));
    });
  });
}

/** Copy small writable files; symlink heavy read-only dirs with relative targets. */
export async function thinCloneStarterCacheToAppBundle(
  cacheDir: string,
  bundleDir: string,
): Promise<void> {
  await mkdir(bundleDir, { recursive: true });
  for (const dir of ["node_modules", "dist"] as const) {
    const target = path.relative(bundleDir, path.join(cacheDir, dir));
    await symlink(target, path.join(bundleDir, dir), "dir");
  }
  await copyWritableStarterScaffold(cacheDir, bundleDir);
}

async function clonefileStarterCacheToAppBundle(cacheDir: string, bundleDir: string): Promise<void> {
  await mkdir(bundleDir, { recursive: true });
  for (const dir of ["node_modules", "dist"] as const) {
    await runDarwinCloneCopy(path.join(cacheDir, dir), path.join(bundleDir, dir));
  }
  await copyWritableStarterScaffold(cacheDir, bundleDir);
}

async function deepCopyStarterCacheToAppBundle(cacheDir: string, bundleDir: string): Promise<void> {
  await cp(cacheDir, bundleDir, { recursive: true, force: true });
}

/** chmod cache read-only so writes through symlinks fail fast instead of corrupting every app. */
export async function markStarterCacheReadOnly(cacheDir: string): Promise<void> {
  await chmod(cacheDir, 0o555);
  for (const dir of ["node_modules", "dist"] as const) {
    const p = path.join(cacheDir, dir);
    if (existsSync(p)) {
      await chmod(p, 0o555);
    }
  }
}

async function rebuildStarterCache(): Promise<void> {
  const cacheDir = resolveKota0StarterCacheDir();
  await rm(cacheDir, { recursive: true, force: true });

  const vue = sanitizeChartJsModelArtifactsInAppVueSource(
    normalizeKota0AppVueLeadingSlashApis(DEFAULT_K0_SFC),
  );
  const backend = normalizeKota0AppBackendForFlight(DEFAULT_K0_BACKEND);

  await writeKota0AppBundle({
    appId: KOTA0_STARTER_CACHE_SENTINEL_APP_ID,
    source: vue,
    backendSource: backend,
    scribeGateway: STARTER_GATEWAY,
  });

  await runNpmInstall(cacheDir);
  await runViteBuild(cacheDir);

  const fingerprint = await computeKota0StarterCacheFingerprint();
  await writeFile(path.join(cacheDir, FINGERPRINT_FILE), `${fingerprint}\n`, "utf8");
  await markStarterCacheReadOnly(cacheDir);
}

/** Build or refresh the shared starter bundle cache (node_modules + dist). Idempotent. */
export async function ensureKota0StarterBundle(): Promise<void> {
  if (isKota0StarterCacheDisabled()) return;
  if (await isKota0StarterCacheReady()) return;
  if (ensureInFlight) {
    await ensureInFlight;
    return;
  }
  ensureInFlight = rebuildStarterCache()
    .catch((e) => {
      console.warn(
        "[k0-starter-cache] prebake failed:",
        e instanceof Error ? e.message : String(e),
      );
      throw e;
    })
    .finally(() => {
      ensureInFlight = null;
    });
  await ensureInFlight;
}

async function copyStarterCacheToAppBundle(appId: string): Promise<string> {
  const cacheDir = resolveKota0StarterCacheDir();
  const bundleDir = resolveKota0BundleDir(appId);
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(path.dirname(bundleDir), { recursive: true });

  const useDeepCopy =
    isKota0StarterCacheDeepCopy() || process.platform === "win32";
  const useClonefile =
    !useDeepCopy && isKota0StarterCacheClonefile() && process.platform === "darwin";

  if (useDeepCopy) {
    await deepCopyStarterCacheToAppBundle(cacheDir, bundleDir);
  } else if (useClonefile) {
    await clonefileStarterCacheToAppBundle(cacheDir, bundleDir);
  } else {
    await thinCloneStarterCacheToAppBundle(cacheDir, bundleDir);
  }

  await rm(path.join(bundleDir, FINGERPRINT_FILE), { force: true });
  return bundleDir;
}

/** Copy the prebaked starter cache into `bundles/<appId>/` and rewrite per-app `.env`. */
export async function consumeKota0StarterBundle(input: {
  appId: string;
  scribeGateway: BundleScribeGatewayConfig;
}): Promise<{ bundleDir: string }> {
  await ensureKota0StarterBundle();
  if (!(await isKota0StarterCacheReady())) {
    throw new Error("[k0-starter-cache] cache is not ready after ensure");
  }
  const bundleDir = await copyStarterCacheToAppBundle(input.appId);
  await writeMaterializedBundleDotEnv(bundleDir, input.scribeGateway);
  await markKota0BundleDepsInstalled(input.appId);
  return { bundleDir };
}

/** For tests: override bundles root via env `K0_STARTER_CACHE_TEST_ROOT`. */
export function resolveKota0StarterCacheTestRoot(): string | null {
  const raw = process.env.K0_STARTER_CACHE_TEST_ROOT?.trim();
  return raw ? path.resolve(raw) : null;
}

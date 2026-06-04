import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/kota0/deploy/bundle/appVueChartSanitize.ts";
import { buildBundlePackageJson } from "@/components/kota0/deploy/bundle/bundlePackageJson";
import {
  BUNDLE_DEFAULT_SCRIBE_URL,
  minimalHostProcessEnv,
  writeMaterializedBundleDotEnv,
  type BundleScribeGatewayConfig,
} from "@/components/kota0/deploy/runner/bundleEnv";
import { markBundleDepsInstalled } from "@/components/kota0/deploy/runner/bundleRunner";
import { resolveBundleDir, resolveBundlesRoot, resolveBundleTemplateDir } from "@/components/kota0/deploy/bundle/bundlePaths";
import { writeAppBundle } from "@/components/kota0/deploy/bundle/writeAppBundle";
import { normalizeAppBackendForFlight } from "@/components/kota0/viewer/materialize/appBackendForFlight";
import {
  DEFAULT_K0_BACKEND,
  DEFAULT_K0_SFC,
  normalizeAppVueLeadingSlashApis,
} from "@/components/kota0/viewer/materialize/materialize";

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

export function isStarterCacheDisabled(): boolean {
  return process.env.K0_DISABLE_STARTER_CACHE === "1";
}

export function isStarterCacheDeepCopy(): boolean {
  return process.env.K0_STARTER_CACHE_DEEP_COPY === "1";
}

export function isStarterCacheClonefile(): boolean {
  return process.env.K0_STARTER_CACHE_CLONEFILE === "1";
}

export function resolveStarterCacheDir(): string {
  return path.join(resolveBundlesRoot(), KOTA0_STARTER_CACHE_DIRNAME);
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
  const templateDir = resolveBundleTemplateDir();
  const files = await walkTemplateFiles(templateDir);
  const parts: string[] = [];
  for (const rel of files) {
    const body = await readFile(path.join(templateDir, rel), "utf8");
    parts.push(`${rel}\0${body}`);
  }
  return hashHex(parts.join("\n"));
}

export async function computeStarterCacheFingerprint(): Promise<string> {
  const vue = sanitizeChartJsModelArtifactsInAppVueSource(
    normalizeAppVueLeadingSlashApis(DEFAULT_K0_SFC),
  );
  const backend = normalizeAppBackendForFlight(DEFAULT_K0_BACKEND);
  const pkg = JSON.stringify(buildBundlePackageJson());
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

export async function isStarterCacheReady(): Promise<boolean> {
  if (isStarterCacheDisabled()) return false;
  const cacheDir = resolveStarterCacheDir();
  if (!cacheArtifactsReady(cacheDir)) return false;
  try {
    const expected = await computeStarterCacheFingerprint();
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
  const cacheDir = resolveStarterCacheDir();
  await rm(cacheDir, { recursive: true, force: true });

  const vue = sanitizeChartJsModelArtifactsInAppVueSource(
    normalizeAppVueLeadingSlashApis(DEFAULT_K0_SFC),
  );
  const backend = normalizeAppBackendForFlight(DEFAULT_K0_BACKEND);

  await writeAppBundle({
    appId: KOTA0_STARTER_CACHE_SENTINEL_APP_ID,
    source: vue,
    backendSource: backend,
    scribeGateway: STARTER_GATEWAY,
  });

  await runNpmInstall(cacheDir);
  await runViteBuild(cacheDir);

  const fingerprint = await computeStarterCacheFingerprint();
  await writeFile(path.join(cacheDir, FINGERPRINT_FILE), `${fingerprint}\n`, "utf8");
  await markStarterCacheReadOnly(cacheDir);
}

/** Build or refresh the shared starter bundle cache (node_modules + dist). Idempotent. */
export async function ensureStarterBundle(): Promise<void> {
  if (isStarterCacheDisabled()) return;
  if (await isStarterCacheReady()) return;
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
  const cacheDir = resolveStarterCacheDir();
  const bundleDir = resolveBundleDir(appId);
  await rm(bundleDir, { recursive: true, force: true });
  await mkdir(path.dirname(bundleDir), { recursive: true });

  const useDeepCopy =
    isStarterCacheDeepCopy() || process.platform === "win32";
  const useClonefile =
    !useDeepCopy && isStarterCacheClonefile() && process.platform === "darwin";

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
export async function consumeStarterBundle(input: {
  appId: string;
  scribeGateway: BundleScribeGatewayConfig;
}): Promise<{ bundleDir: string }> {
  await ensureStarterBundle();
  if (!(await isStarterCacheReady())) {
    throw new Error("[k0-starter-cache] cache is not ready after ensure");
  }
  const bundleDir = await copyStarterCacheToAppBundle(input.appId);
  await writeMaterializedBundleDotEnv(bundleDir, input.scribeGateway);
  await markBundleDepsInstalled(input.appId);
  return { bundleDir };
}

/** For tests: override bundles root via env `K0_STARTER_CACHE_TEST_ROOT`. */
export function resolveStarterCacheTestRoot(): string | null {
  const raw = process.env.K0_STARTER_CACHE_TEST_ROOT?.trim();
  return raw ? path.resolve(raw) : null;
}

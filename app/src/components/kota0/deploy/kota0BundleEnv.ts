import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";

/** Enforced on every materialize — supervised Flight + `vite build` for this bundle only. */
export const BUNDLE_KEYS_OVERRIDE: Record<string, string> = {
  FLIGHT_PORT: "4000",
  FLIGHT_MODE: "production",
  FLIGHT_DIST_PATH: "./dist",
  FLIGHT_DISABLE_VITE: "true",
  FLIGHT_MAX_WORKERS: "1",
};

/** Explicit repo-root keys (besides `SCRIBE_*`) copied into each bundle so Flight can reach Redis / Postgres (via DATABASE_URL if used). */
const ROOT_INFRA_KEY_ALLOWLIST = new Set([
  "DATABASE_URL",
  "DOTENV_CONFIG_QUIET",
  "FLIGHT_PAYLOAD_LIMIT",
  "FLIGHT_REDIS_HOST",
  "FLIGHT_REDIS_PORT",
  "FLIGHT_SESSION_DURATION_MS",
]);

/** Local ThoughtPivot Scribe HTTP default for bundle Flight (`localhost:1337` resolves the same on typical dev hosts). */
export const BUNDLE_DEFAULT_SCRIBE_URL = "http://127.0.0.1:1337";

/** When repo-root `.env` omits values, match typical local `compose.yml` / Scribe defaults. */
const WORKSPACE_INFRA_DEFAULTS: Record<string, string> = {
  FLIGHT_REDIS_HOST: "127.0.0.1",
  FLIGHT_REDIS_PORT: "6379",
  SCRIBE_URL: BUNDLE_DEFAULT_SCRIBE_URL,
};

function isPlaceholderOrUnsafeScribeUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (lower.includes("example.com")) return true;
  if (lower.includes("placeholder")) return true;
  if (lower.includes("changeme")) return true;
  if (lower.includes("your-scribe")) return true;
  // Common AI mistake: Vite / workspace preview ports, not Scribe (:1337).
  if (/\blocalhost:(3000|3001)\b/.test(lower)) return true;
  if (/\b127\.0\.0\.1:(3000|3001)\b/.test(lower)) return true;
  return false;
}

/**
 * Normalize `SCRIBE_URL` for bundle `.env` + bundle Flight `process.env`.
 * Empty, placeholder, or obviously wrong values fall back to {@link BUNDLE_DEFAULT_SCRIBE_URL}.
 * Real deployment URLs (https://scribe.mycompany.com, http://scribe:1337 in Compose, etc.) are kept.
 */
export function coerceBundleScribeUrl(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (t === "" || isPlaceholderOrUnsafeScribeUrl(t)) {
    return BUNDLE_DEFAULT_SCRIBE_URL;
  }
  return t.replace(/\/$/, "");
}

function pickWorkspaceInfraFromRoot(parsed: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || v === "") continue;
    if (k.startsWith("SCRIBE_")) {
      out[k] = v;
      continue;
    }
    if (ROOT_INFRA_KEY_ALLOWLIST.has(k)) {
      out[k] = v;
    }
  }
  return out;
}

async function readRootEnvParsed(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(resolveKota0RepoRoot(), ".env"), "utf8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Minimal env inherited from the host so `node` / `npm` / `npx` work. Parent Flight/repo `.env` is **not** included.
 */
export function minimalHostProcessEnv(): NodeJS.ProcessEnv {
  const e = process.env;
  const out: NodeJS.ProcessEnv = {};
  const copy = (k: string): void => {
    const v = e[k];
    if (v !== undefined) out[k] = v;
  };
  copy("PATH");
  copy("HOME");
  copy("USER");
  copy("LOGNAME");
  copy("SHELL");
  copy("LANG");
  copy("LC_ALL");
  copy("TMPDIR");
  copy("TEMP");
  copy("TZ");
  copy("NODE_EXTRA_CA_CERTS");
  copy("SSL_CERT_FILE");
  copy("GIT_SSL_CAINFO");
  if (process.platform === "win32") {
    copy("SystemRoot");
    copy("USERPROFILE");
    copy("ALLUSERSPROFILE");
    copy("APPDATA");
    copy("LOCALAPPDATA");
    copy("PATHEXT");
    copy("ComSpec");
  }
  return out;
}

function serializeBundleDotEnv(merged: Record<string, string>): string {
  const lines: string[] = [
    "# Per-app bundle `.env` — loaded only by this app’s bundle Flight + Vite.",
    "# On each Apply: workspace defaults + repo-root `.env` (SCRIBE_*, FLIGHT_REDIS_*, DATABASE_URL, …), then your edits here, then enforced bundle Flight keys.",
    `# SCRIBE_URL defaults to ${BUNDLE_DEFAULT_SCRIBE_URL} when missing or placeholder; override only for a real remote Scribe.`,
    "# K0_APP_ID — bundle folder name (UUID); used with K0_PLATFORM_API_ORIGIN for workspace AI routes.",
    "# K0_PLATFORM_API_ORIGIN — base URL of workspace Koa (repo FLIGHT_PORT, default http://127.0.0.1:3000). Override for Docker or remote dev.",
    "",
  ];
  const keys = Object.keys(merged).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const val = merged[key];
    if (val === undefined) continue;
    if (val.includes("\n") || val.includes("#")) {
      lines.push(`${key}="${val.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}=${val}`);
    }
  }
  return lines.join("\n") + "\n";
}

/**
 * Write `bundles/<appId>/.env`: workspace Redis / Scribe / Postgres connectivity from repo-root `.env` + defaults,
 * merged with any existing bundle file, then {@link BUNDLE_KEYS_OVERRIDE}.
 */
export async function writeMaterializedBundleDotEnv(bundleDir: string): Promise<void> {
  const envPath = path.join(bundleDir, ".env");
  const rootParsed = await readRootEnvParsed();
  const infraFromRoot = pickWorkspaceInfraFromRoot(rootParsed);

  let bundleExisting: Record<string, string> = {};
  try {
    bundleExisting = dotenv.parse(await readFile(envPath, "utf8"));
  } catch {
    /* first materialize */
  }

  const merged: Record<string, string> = {
    ...WORKSPACE_INFRA_DEFAULTS,
    ...infraFromRoot,
    ...bundleExisting,
    ...BUNDLE_KEYS_OVERRIDE,
  };

  merged.SCRIBE_URL = coerceBundleScribeUrl(merged.SCRIBE_URL);

  const workspaceKoaPort = rootParsed.FLIGHT_PORT?.trim() || "3000";
  const defaultPlatformOrigin = `http://127.0.0.1:${workspaceKoaPort}`;
  merged.K0_APP_ID = path.basename(bundleDir);
  if (!merged.K0_PLATFORM_API_ORIGIN?.trim()) {
    merged.K0_PLATFORM_API_ORIGIN = defaultPlatformOrigin;
  }

  await writeFile(envPath, serializeBundleDotEnv(merged), "utf8");
}

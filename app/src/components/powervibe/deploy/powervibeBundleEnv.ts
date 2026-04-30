import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { resolvePowervibeRepoRoot } from "@/components/powervibe/viewer/powervibeMaterialize";

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

/** When repo-root `.env` omits values, match typical local `compose.yml` / Scribe defaults. */
const WORKSPACE_INFRA_DEFAULTS: Record<string, string> = {
  FLIGHT_REDIS_HOST: "127.0.0.1",
  FLIGHT_REDIS_PORT: "6379",
  SCRIBE_URL: "http://127.0.0.1:1337",
};

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
    const raw = await readFile(path.join(resolvePowervibeRepoRoot(), ".env"), "utf8");
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

  await writeFile(envPath, serializeBundleDotEnv(merged), "utf8");
}

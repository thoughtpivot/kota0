import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { minimalHostProcessEnv } from "@/components/nvibe/deploy/nvibeBundleEnv";
import { resolveNvibeBundleDir } from "@/components/nvibe/deploy/nvibeBundlePaths";
import { resolveNvibeRepoRoot } from "@/components/nvibe/viewer/nvibeMaterialize";

let bundleFlightProcess: ChildProcess | null = null;
let lastInstalledPackageJsonHash: string | null = null;

/** Serializes restarts so we never bind port 4000 while the previous Flight is still exiting. */
let restartChain: Promise<void> = Promise.resolve();

const DEFAULT_BUNDLE_FLIGHT_PORT = 4000;

function hashHex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Env for bundle `vite build` + Flight: **only** `bundles/<appId>/.env`, plus minimal host vars (`PATH`, etc.).
 * Does not inherit the platform Flight / repo shell env (avoids leaking `FLIGHT_PORT=3000`, worker counts, etc.).
 */
async function loadBundleEnv(bundleDir: string): Promise<NodeJS.ProcessEnv> {
  const raw = await readFile(path.join(bundleDir, ".env"), "utf8");
  const parsed = dotenv.parse(raw);
  return { ...minimalHostProcessEnv(), ...parsed };
}

/**
 * Flight uses `Number(process.env.FLIGHT_MAX_WORKERS) || numCPUs` — missing/0 inherits **all CPUs**,
 * and parent `process.env` from platform Flight must never leak here or multiple cluster workers
 * each try to bind the same port → EADDRINUSE.
 */
function bundleFlightSpawnEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const p = String(base.FLIGHT_PORT ?? DEFAULT_BUNDLE_FLIGHT_PORT).trim() || String(DEFAULT_BUNDLE_FLIGHT_PORT);
  return {
    ...base,
    FLIGHT_PORT: p,
    FLIGHT_DIST_PATH: (base.FLIGHT_DIST_PATH ?? "./dist").toString().trim() || "./dist",
    FLIGHT_MODE: "production",
    FLIGHT_DISABLE_VITE: "true",
    FLIGHT_MAX_WORKERS: "1",
  };
}

/** Try binding `port` once; true if the port is free. */
function tryBindPortOnce(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    const done = (ok: boolean): void => {
      try {
        s.close(() => resolve(ok));
      } catch {
        resolve(ok);
      }
    };
    s.once("error", () => done(false));
    s.listen(port, "0.0.0.0", () => done(true));
  });
}

/** Wait until nothing is listening on `port` (previous Flight + cluster workers released it). */
async function waitUntilPortFree(port: number, timeoutMs = 25_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tryBindPortOnce(port)) {
      return;
    }
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  throw new Error(`[nvibe-bundle] Port ${port} still in use after ${timeoutMs}ms`);
}

/**
 * `spawn()` returns before Flight’s worker has called `listen`. Without this, the API can respond
 * while `127.0.0.1:4000` still refuses connections — preview iframe hits the Vite proxy too early.
 */
async function waitUntilBundleFlightReady(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/",
          method: "GET",
          timeout: 2500,
        },
        (res) => {
          const code = res.statusCode ?? 0;
          res.resume();
          resolve(code >= 200 && code < 500);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
    if (ok) return;
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  throw new Error(`[nvibe-bundle] Flight did not respond on 127.0.0.1:${port} within ${timeoutMs}ms`);
}

const SIGKILL_AFTER_MS = 10_000;

/**
 * Wait for the bundle Flight process (tsx primary + Node cluster workers under it) to exit.
 */
export async function stopNvibeBundleAsync(): Promise<void> {
  const proc = bundleFlightProcess;
  bundleFlightProcess = null;
  if (!proc) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };

    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      setTimeout(finish, 80);
    }, SIGKILL_AFTER_MS);

    proc.once("exit", finish);

    try {
      proc.kill("SIGTERM");
    } catch {
      finish();
    }
  });
}

/** Fire-and-forget stop (e.g. emergency); prefer {@link stopNvibeBundleAsync} before starting a new bundle. */
export function stopNvibeBundle(): void {
  void stopNvibeBundleAsync();
}

async function executeNvibeBundleRestart(appId: string): Promise<void> {
  await stopNvibeBundleAsync();

  const repoRoot = resolveNvibeRepoRoot();
  const bundleDir = resolveNvibeBundleDir(appId);
  const pkgPath = path.join(bundleDir, "package.json");
  const pkgRaw = await readFile(pkgPath, "utf8");
  const pkgHash = hashHex(pkgRaw);

  if (lastInstalledPackageJsonHash !== pkgHash) {
    execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: bundleDir,
      stdio: "inherit",
      env: minimalHostProcessEnv(),
    });
    lastInstalledPackageJsonHash = pkgHash;
  }

  let merged: NodeJS.ProcessEnv;
  try {
    merged = await loadBundleEnv(bundleDir);
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (msg === "ENOENT") {
      throw new Error(
        `[nvibe-bundle] Missing ${path.join(bundleDir, ".env")} — apply / materialize the app first.`,
      );
    }
    throw e;
  }

  const env = bundleFlightSpawnEnv(merged);
  const listenPort = Number.parseInt(String(env.FLIGHT_PORT ?? DEFAULT_BUNDLE_FLIGHT_PORT), 10);
  const port = Number.isFinite(listenPort) && listenPort > 0 ? listenPort : DEFAULT_BUNDLE_FLIGHT_PORT;

  await waitUntilPortFree(port);

  execFileSync("npx", ["vite", "build", "--config", "vite.config.ts"], {
    cwd: bundleDir,
    stdio: "inherit",
    env,
  });

  const flightScript = path.join(repoRoot, "node_modules/@spytech/flight/src/flight.ts");
  const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

  const flightProc = (bundleFlightProcess = spawn(
    process.execPath,
    [
      "--disable-warning=DEP0040",
      tsxCli,
      "-r",
      "tsconfig-paths/register",
      flightScript,
      "--mode",
      "production",
      ".",
    ],
    {
      cwd: bundleDir,
      stdio: "inherit",
      env,
      detached: false,
    },
  ));

  flightProc.once("exit", (code) => {
    if (bundleFlightProcess === flightProc) {
      bundleFlightProcess = null;
    }
    if (code !== 0 && code !== null) {
      console.error(`[nvibe-bundle] Flight exited with code ${code}`);
    }
  });

  await waitUntilBundleFlightReady(port);
}

/**
 * Tear down the previous bundle Flight (wait for port free), then build and start the new one.
 * Restarts are **queued** so rapid app switches cannot overlap.
 */
export function restartNvibeBundle(appId: string): Promise<void> {
  const run = restartChain.then(() => executeNvibeBundleRestart(appId));
  restartChain = run.catch((e: unknown) => {
    console.error("[nvibe-bundle] restart failed:", e instanceof Error ? e.message : e);
  });
  return run;
}

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { coerceBundleScribeUrl, minimalHostProcessEnv } from "@/components/kota0/deploy/kota0BundleEnv";
import { resolveKota0BundleDir } from "@/components/kota0/deploy/kota0BundlePaths";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";
import {
  appendFlightExitNotice,
  appendFlightRawChunk,
  appendFlightSessionBanner,
  clearFlightConsoleBuffer,
} from "@/components/kota0/deploy/kota0ConsoleLogHub";

let bundleFlightProcess: ChildProcess | null = null;

/**
 * Each `bundles/<appId>/` has its own `node_modules`, but `package.json` is mirrored from the workspace root
 * and is identical for every app. A single global hash made `npm install` run only once per process — switching
 * apps skipped install and left other bundle dirs without deps (vite / Flight never start).
 */
const lastInstalledPackageJsonHashByAppId = new Map<string, string>();

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
  const merged = { ...minimalHostProcessEnv(), ...parsed };
  merged.SCRIBE_URL = coerceBundleScribeUrl(merged.SCRIBE_URL);
  return merged;
}

/**
 * Flight uses `Number(process.env.FLIGHT_MAX_WORKERS) || numCPUs` — missing/0 inherits **all CPUs**,
 * and parent `process.env` from platform Flight must never leak here or multiple cluster workers
 * each try to bind the same port → EADDRINUSE.
 *
 * **Only bundle Flight** forces `FLIGHT_MAX_WORKERS=1` here. Platform/workspace Flight (`npm run start:app`)
 * may use many HTTP workers; embedded Vite on 3001 is started once on the lead cluster worker via `@thoughtpivot/flight`.
 */
function bundleFlightSpawnEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const p = String(base.FLIGHT_PORT ?? DEFAULT_BUNDLE_FLIGHT_PORT).trim() || String(DEFAULT_BUNDLE_FLIGHT_PORT);
  return {
    ...base,
    FLIGHT_PORT: p,
    FLIGHT_DIST_PATH: (base.FLIGHT_DIST_PATH ?? "./dist").toString().trim() || "./dist",
    FLIGHT_MODE: "production",
    /** Wins over any `FLIGHT_DISABLE_VITE` in `bundles/<id>/.env` — runner runs `vite build`; bundle Flight must not. */
    FLIGHT_DISABLE_VITE: "true",
    FLIGHT_MAX_WORKERS: "1",
    /** Child bundle Flight: skip `koa-logger` per-request spam when `FLIGHT_QUIET_HTTP=1`. */
    FLIGHT_QUIET_HTTP: "1",
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
  throw new Error(`[k0-bundle] Port ${port} still in use after ${timeoutMs}ms`);
}

/**
 * Last resort when SIGTERM/SIGKILL on the supervised child did not release the port (orphan tsx/node,
 * stuck cluster worker). Unix only; no-op on Windows.
 */
function killListenersOnPortBestEffort(port: number): Promise<void> {
  if (process.platform === "win32") return Promise.resolve();
  // -s TCP:LISTEN restricts to LISTEN-state sockets so we don't kill Vite or other processes
  // that merely have an outbound connection *to* this port (e.g. Vite's dev-proxy to :4000).
  return new Promise((resolve) => {
    execFile(
      "sh",
      ["-c", `lsof -t -i tcp:${port} -s TCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true`],
      { timeout: 8000 },
      () => resolve(),
    );
  });
}

/**
 * After {@link stopKota0BundleAsync}, ensure nothing is left holding the bundle port.
 *
 * Always do a preemptive `lsof | kill -9` pass: an orphaned Node cluster worker from a
 * previous run can still hold :4000 even when our supervised `proc.kill()` returned —
 * the worker was forked by the supervised process but is not the supervised process,
 * so SIGTERM to the parent never reached it (this is also fixed at spawn time by
 * `detached: true`, but old orphans pre-fix may exist; and pre-existing local stragglers
 * from outside the workspace get cleaned the same way).
 *
 * Then verify the port is actually bindable. If not, escalate once more.
 */
async function ensurePortFreeAfterBundleStop(port: number): Promise<void> {
  await killListenersOnPortBestEffort(port);
  try {
    await waitUntilPortFree(port, 14_000);
    return;
  } catch {
    /* continue — escalate */
  }
  await killListenersOnPortBestEffort(port);
  await new Promise<void>((r) => setTimeout(r, 250));
  await waitUntilPortFree(port, 22_000);
}

/**
 * `spawn()` returns before Flight’s worker has called `listen`. Without this, the API can respond
 * while `127.0.0.1:4000` still refuses connections — preview iframe hits the Vite proxy too early.
 */
/** Default template serves this JSON route from `App.backend.ts`. */
const BUNDLE_HELLO_PATH = "/api/kota0-app/hello";

function httpGetMatches(
  port: number,
  path: string,
  timeoutMs: number,
  accept: (statusCode: number) => boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const code = res.statusCode ?? 0;
        res.resume();
        resolve(accept(code));
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Prefer the bundle hello API (matches workspace Preview `fetch`); fall back to `/` for custom backends
 * that omit that route.
 */
async function bundleFlightReadyPing(port: number, timeoutMs: number): Promise<boolean> {
  const apiOk = await httpGetMatches(port, BUNDLE_HELLO_PATH, timeoutMs, (c) => c >= 200 && c < 400);
  if (apiOk) return true;
  return httpGetMatches(port, "/", timeoutMs, (c) => c >= 200 && c < 400);
}

async function waitUntilBundleFlightReady(port: number, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bundleFlightReadyPing(port, 2500)) return;
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  throw new Error(`[k0-bundle] Flight did not respond on 127.0.0.1:${port} within ${timeoutMs}ms`);
}

/**
 * True when bundle Flight for `appId` accepts HTTP on its configured `FLIGHT_PORT`.
 * Used when GET would skip materialize (fingerprint match) but the process may have exited.
 */
export async function isBundleFlightUpForApp(appId: string): Promise<boolean> {
  let port = DEFAULT_BUNDLE_FLIGHT_PORT;
  try {
    const bundleDir = resolveKota0BundleDir(appId);
    const merged = await loadBundleEnv(bundleDir);
    const env = bundleFlightSpawnEnv(merged);
    const p = Number.parseInt(String(env.FLIGHT_PORT ?? DEFAULT_BUNDLE_FLIGHT_PORT), 10);
    if (Number.isFinite(p) && p > 0) port = p;
  } catch {
    return false;
  }
  return bundleFlightReadyPing(port, 900);
}

/** If SIGTERM does not exit the bundle Flight tree, SIGKILL sooner so port can be reused. */
const SIGKILL_AFTER_MS = 6000;

/**
 * Send `signal` to the bundle Flight process group (set up via `detached: true` at spawn).
 * Sending to `-pid` reaches the supervised tsx primary AND the Node cluster workers it forked,
 * which is what we need because Flight's workers are the ones actually bound to :4000 — a
 * SIGTERM to the primary alone leaves orphaned workers holding the port.
 */
function killBundleProcessGroup(proc: ChildProcess, signal: NodeJS.Signals): void {
  if (!proc.pid) return;
  try {
    process.kill(-proc.pid, signal);
  } catch {
    // Group may already be gone, or we're on a platform where -pid signaling is unsupported.
    try {
      proc.kill(signal);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wait for the bundle Flight process (tsx primary + Node cluster workers under it) to exit.
 */
export async function stopKota0BundleAsync(): Promise<void> {
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
      killBundleProcessGroup(proc, "SIGKILL");
      setTimeout(finish, 80);
    }, SIGKILL_AFTER_MS);

    proc.once("exit", finish);

    killBundleProcessGroup(proc, "SIGTERM");
  });
}

/** Fire-and-forget stop (e.g. emergency); prefer {@link stopKota0BundleAsync} before starting a new bundle. */
export function stopKota0Bundle(): void {
  void stopKota0BundleAsync();
}

async function executeKota0BundleRestart(appId: string, opts?: { skipViteBuild?: boolean }): Promise<void> {
  await stopKota0BundleAsync();
  clearFlightConsoleBuffer();
  appendFlightSessionBanner(appId);

  const repoRoot = resolveKota0RepoRoot();
  const bundleDir = resolveKota0BundleDir(appId);
  const pkgPath = path.join(bundleDir, "package.json");
  const pkgRaw = await readFile(pkgPath, "utf8");
  const pkgHash = hashHex(pkgRaw);
  const prevHash = lastInstalledPackageJsonHashByAppId.get(appId);
  const nodeModulesDir = path.join(bundleDir, "node_modules");
  const needsInstall = prevHash !== pkgHash || !existsSync(nodeModulesDir);

  if (needsInstall) {
    /** Async spawn — `execFileSync` freezes the Flight worker; Vite’s `/api` proxy then times out with HTTP 502. */
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: bundleDir,
        env: minimalHostProcessEnv(),
        stdio: "inherit",
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`[k0-bundle] npm install failed (exit ${code ?? "unknown"})`));
      });
    });
    lastInstalledPackageJsonHashByAppId.set(appId, pkgHash);
  }

  let merged: NodeJS.ProcessEnv;
  try {
    merged = await loadBundleEnv(bundleDir);
  } catch (e: unknown) {
    const msg = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (msg === "ENOENT") {
      throw new Error(
        `[k0-bundle] Missing ${path.join(bundleDir, ".env")} — apply / materialize the app first.`,
      );
    }
    throw e;
  }

  const env = bundleFlightSpawnEnv(merged);
  const listenPort = Number.parseInt(String(env.FLIGHT_PORT ?? DEFAULT_BUNDLE_FLIGHT_PORT), 10);
  const port = Number.isFinite(listenPort) && listenPort > 0 ? listenPort : DEFAULT_BUNDLE_FLIGHT_PORT;

  await ensurePortFreeAfterBundleStop(port);

  const distIndex = path.join(bundleDir, "dist", "index.html");
  const mustRunVite = !opts?.skipViteBuild || !existsSync(distIndex);
  if (mustRunVite) {
    /** Async spawn — `spawnSync` would block the platform Flight worker like `execFileSync`. */
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npx", ["vite", "build", "--config", "vite.config.ts"], {
        cwd: bundleDir,
        env,
        stdio: "inherit",
      });
      child.on("error", (err) => {
        reject(new Error(`[k0-bundle] vite build spawn failed: ${err.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`[k0-bundle] vite build failed (exit ${code ?? "unknown"})`));
      });
    });
  }

  const flightScript = path.join(repoRoot, "node_modules/@thoughtpivot/flight/src/flight.ts");
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
      stdio: ["ignore", "pipe", "pipe"],
      env,
      // Make the child its own process-group leader so we can SIGTERM/SIGKILL the
      // whole tree (tsx primary + Node cluster workers) via `process.kill(-pid, sig)`.
      // Without this, killing the supervised parent leaves orphaned cluster workers
      // still bound to :4000, producing EADDRINUSE on the next Apply.
      detached: true,
    },
  ));

  flightProc.stdout?.on("data", (chunk: Buffer) => {
    appendFlightRawChunk("stdout", chunk);
  });
  flightProc.stderr?.on("data", (chunk: Buffer) => {
    appendFlightRawChunk("stderr", chunk);
  });

  flightProc.once("exit", (code, signal) => {
    if (bundleFlightProcess === flightProc) {
      bundleFlightProcess = null;
    }
    appendFlightExitNotice(code, signal);
  });

  await waitUntilBundleFlightReady(port);
}

/**
 * Tear down the previous bundle Flight (wait for port free), then build and start the new one.
 * Restarts are **queued** so rapid app switches cannot overlap.
 */
/** Call when `bundles/<appId>/` is removed so the next materialize runs `npm install` again if recreated. */
export function forgetKota0BundleNpmState(appId: string): void {
  lastInstalledPackageJsonHashByAppId.delete(appId);
}

export function restartKota0Bundle(
  appId: string,
  opts?: { skipViteBuild?: boolean },
): Promise<void> {
  const run = restartChain.then(() => executeKota0BundleRestart(appId, opts));
  restartChain = run.catch((e: unknown) => {
    console.error("[k0-bundle] restart failed:", e instanceof Error ? e.message : e);
  });
  return run;
}

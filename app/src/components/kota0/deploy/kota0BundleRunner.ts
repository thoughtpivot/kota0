import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { coerceBundleScribeUrl, minimalHostProcessEnv } from "@/components/kota0/deploy/kota0BundleEnv";
import { ensureWritableDir } from "@/components/kota0/deploy/kota0BundleDirInflate";
import { resolveKota0BundleDir } from "@/components/kota0/deploy/kota0BundlePaths";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";
import {
  appendFlightExitNotice,
  appendFlightRawChunk,
  appendFlightSessionBanner,
  clearFlightConsoleBuffer,
} from "@/components/kota0/deploy/kota0ConsoleLogHub";
import {
  setBundleAppStatus,
  setBundleFingerprintForApp,
  withBundleRestartLock,
  writeBundleSharedState,
} from "@/components/kota0/deploy/kota0BundleSharedState";
import {
  makePortConflictError,
  parseNpmInstallError,
  parseViteBuildError,
} from "@/components/kota0/deploy/kota0BundleBuildErrorParse";
import { bundleFlightIdentityPing } from "@/components/kota0/viewer/kota0BundleFlightIdentity";

export { bundleFlightIdentityPing };

let bundleFlightProcess: ChildProcess | null = null;

/**
 * App id the singleton bundle Flight on :4000 was last spawned for. Reads:
 * - `Kota0.backend.ts` materialize path (writes after `restartKota0Bundle` is queued)
 * - `/api/kota0/bundle-flight/status` (gates the preview iframe)
 * - `Kota0BundlePreview.backend.ts` proxy (425 on `?app=` mismatch)
 */
let bundleFlightServingAppId: string | null = null;

export function getBundleFlightServingAppId(): string | null {
  return bundleFlightServingAppId;
}

export function setBundleFlightServingAppId(appId: string | null): void {
  bundleFlightServingAppId = appId;
}

/**
 * Best-effort cleanup of the bundle Flight port at workspace startup. An orphaned
 * bundle Flight from a previous `npm run start:app` (parent tsx died but cluster
 * worker kept running) can still hold `:4000`, which produces EADDRINUSE the next
 * time the user creates or opens an app. `executeKota0BundleRestart` already runs
 * `killListenersOnPortBestEffort` per restart, but the very first restart in a
 * fresh workspace process has lost the race once we get there — by then the user
 * is staring at an error. Running this on import keeps a clean slate.
 *
 * Idempotent across cluster workers (each worker is its own process); no-op when
 * the port is already free.
 */
let cleanupBundlePortAtStartupRan = false;
export function cleanupBundlePortAtStartup(): void {
  if (cleanupBundlePortAtStartupRan) return;
  cleanupBundlePortAtStartupRan = true;
  void killListenersOnPortBestEffort(DEFAULT_BUNDLE_FLIGHT_PORT);
  void writeBundleSharedState({ restarting: false, servingAppId: null }).catch(() => {});
}

/**
 * Each `bundles/<appId>/` has its own `node_modules`, but `package.json` is mirrored from the workspace root
 * and is identical for every app. A single global hash made `npm install` run only once per process — switching
 * apps skipped install and left other bundle dirs without deps (vite / Flight never start).
 */
const lastInstalledPackageJsonHashByAppId = new Map<string, string>();

/** Mark deps as installed after copying a prebuilt `node_modules` tree (starter cache fast path). */
export async function markKota0BundleDepsInstalled(appId: string): Promise<void> {
  const bundleDir = resolveKota0BundleDir(appId);
  const pkgRaw = await readFile(path.join(bundleDir, "package.json"), "utf8");
  lastInstalledPackageJsonHashByAppId.set(appId, hashHex(pkgRaw));
}

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
 * Find every PID that has a LISTEN socket on `port` by walking `/proc/net/tcp[6]`.
 * Linux-only fallback for when `lsof` isn't installed (slim Docker images).
 *
 * State `0A` in /proc/net/tcp is LISTEN. The local address is `<hex-ip>:<hex-port>`.
 * We grab the inode column and then scan each PID's `fd/` for a socket whose inode
 * matches — that's the LISTEN socket's owner.
 */
async function findListenerPidsViaProc(port: number): Promise<number[]> {
  const portHex = port.toString(16).toUpperCase().padStart(4, "0");
  const inodes = new Set<string>();
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let body = "";
    try {
      body = await readFile(file, "utf8");
    } catch {
      continue;
    }
    for (const line of body.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 10) continue;
      const localAddr = cols[1] ?? "";
      const state = cols[3] ?? "";
      const inode = cols[9] ?? "";
      if (state !== "0A") continue;
      if (!localAddr.endsWith(`:${portHex}`)) continue;
      if (inode && inode !== "0") inodes.add(inode);
    }
  }
  if (inodes.size === 0) return [];

  const { readdir, readlink } = await import("node:fs/promises");
  const pids: number[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir("/proc");
  } catch {
    return [];
  }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    let fds: string[] = [];
    try {
      fds = await readdir(`/proc/${name}/fd`);
    } catch {
      continue; // permission denied for processes we don't own
    }
    for (const fd of fds) {
      let target = "";
      try {
        target = await readlink(`/proc/${name}/fd/${fd}`);
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(target);
      if (m && m[1] && inodes.has(m[1])) {
        pids.push(Number(name));
        break;
      }
    }
  }
  return pids;
}

/**
 * Last resort when SIGTERM/SIGKILL on the supervised child did not release the port (orphan tsx/node,
 * stuck cluster worker). Unix only; no-op on Windows.
 *
 * Tries `lsof` first (fast, works everywhere with the binary installed). Falls back to
 * a /proc/net/tcp walk so this works in slim Docker images that don't ship lsof.
 */
function killListenersOnPortBestEffort(port: number): Promise<void> {
  if (process.platform === "win32") return Promise.resolve();
  // -s TCP:LISTEN restricts to LISTEN-state sockets so we don't kill Vite or other processes
  // that merely have an outbound connection *to* this port (e.g. Vite's dev-proxy to :4000).
  return new Promise((resolve) => {
    execFile(
      "sh",
      [
        "-c",
        // If `lsof` exists, use it. Otherwise this exits 127 (command not found) and we
        // catch that in the callback to run the /proc fallback.
        `command -v lsof >/dev/null 2>&1 && lsof -t -i tcp:${port} -s TCP:LISTEN 2>/dev/null | xargs -r kill -9 2>/dev/null; exit 0`,
      ],
      { timeout: 8000 },
      () => {
        // Always also run the /proc fallback — on Linux it catches anything lsof missed
        // (different netns view, root-only sockets, etc.), and it's a no-op when nothing
        // is listening on the port.
        findListenerPidsViaProc(port)
          .then((pids) => {
            for (const pid of pids) {
              try {
                process.kill(pid, "SIGKILL");
              } catch {
                /* race or perms */
              }
            }
          })
          .catch(() => {
            /* swallow — best-effort */
          })
          .finally(() => resolve());
      },
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

async function waitUntilBundleFlightReady(
  port: number,
  expectedAppId: string,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bundleFlightIdentityPing(port, expectedAppId, 2500)) return;
    await new Promise<void>((r) => setTimeout(r, 120));
  }
  throw new Error(
    `[k0-bundle] Flight did not serve app ${expectedAppId} on 127.0.0.1:${port} within ${timeoutMs}ms`,
  );
}

/**
 * True when bundle Flight for `appId` is listening on its port and hello reports that app id.
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
  return bundleFlightIdentityPing(port, appId, 900);
}

/** Alias — preview rematerialize gates on live identity, not in-memory metadata alone. */
export async function isBundleFlightServingApp(appId: string): Promise<boolean> {
  return isBundleFlightUpForApp(appId);
}

/**
 * If SIGTERM does not exit the bundle Flight tree, SIGKILL sooner so port can be reused.
 * App switching is interactive — the user already moved on from whatever the old bundle
 * was serving — so a long graceful-shutdown grace period just looks like the UI is stuck.
 */
const SIGKILL_AFTER_MS = 800;

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

async function executeKota0BundleRestart(
  appId: string,
  opts?: { skipViteBuild?: boolean; materializeFingerprint?: string },
): Promise<void> {
  return withBundleRestartLock(async () => {
    setBundleFlightServingAppId(null);
    await writeBundleSharedState({ restarting: true, servingAppId: null });
    // Clear stale build error on restart entry; phase moves to "installing"
    // (or "building" later if install is skipped).
    await setBundleAppStatus(appId, { phase: "installing", lastBuildError: null }).catch(() => {});
    try {
      await executeKota0BundleRestartLocked(appId, opts);
    } catch (e) {
      await writeBundleSharedState({ restarting: false }).catch(() => {});
      // If a phase-specific failure already recorded a structured error, leave
      // it. Otherwise stamp a generic vite_build_error so the snapshot doesn't
      // dangle in "installing" forever.
      try {
        const message = e instanceof Error ? e.message : String(e);
        await setBundleAppStatus(appId, {
          phase: "failed",
          lastBuildError: {
            kind: "vite_build_error",
            message,
            rawLines: [message],
            at: Date.now(),
          },
        });
      } catch {
        /* swallow — we don't want shared-state IO to mask the original error */
      }
      throw e;
    }
  });
}

async function executeKota0BundleRestartLocked(
  appId: string,
  opts?: { skipViteBuild?: boolean; materializeFingerprint?: string },
): Promise<void> {
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
    await ensureWritableDir(nodeModulesDir);
    await setBundleAppStatus(appId, { phase: "installing" });
    /** Async spawn — `execFileSync` freezes the Flight worker; Vite's `/api` proxy then times out with HTTP 502.
     *  stderr is piped (not inherited) so we can parse failures into structured `lastBuildError` for tools. */
    const installStderrChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: bundleDir,
        env: minimalHostProcessEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        // Mirror to platform stdout for live visibility (replaces stdio:"inherit").
        process.stdout.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        installStderrChunks.push(chunk.toString("utf8"));
        process.stderr.write(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`[k0-bundle] npm install failed (exit ${code ?? "unknown"})`));
      });
    }).catch(async (e: unknown) => {
      await setBundleAppStatus(appId, {
        phase: "failed",
        lastBuildError: parseNpmInstallError(installStderrChunks.join("")),
      });
      throw e;
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
  const expectedAppId =
    (typeof env.K0_APP_ID === "string" && env.K0_APP_ID.trim()) || appId;

  const portIsAlreadyFree =
    bundleFlightProcess === null &&
    getBundleFlightServingAppId() === null &&
    (await tryBindPortOnce(port));
  if (!portIsAlreadyFree) {
    await ensurePortFreeAfterBundleStop(port);
  }

  const distIndex = path.join(bundleDir, "dist", "index.html");
  const mustRunVite = !opts?.skipViteBuild || !existsSync(distIndex);
  if (mustRunVite) {
    await ensureWritableDir(path.join(bundleDir, "dist"));
    await setBundleAppStatus(appId, { phase: "building" });
    /** Async spawn — `spawnSync` would block the platform Flight worker like `execFileSync`.
     *  Vite v7 prints Rollup resolution errors to stdout, not stderr — buffer both so the parser
     *  finds them either way. */
    const buildOutputChunks: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const child = spawn("npx", ["vite", "build", "--config", "vite.config.ts"], {
        cwd: bundleDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        buildOutputChunks.push(chunk.toString("utf8"));
        process.stdout.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        buildOutputChunks.push(chunk.toString("utf8"));
        process.stderr.write(chunk);
      });
      child.on("error", (err) => {
        reject(new Error(`[k0-bundle] vite build spawn failed: ${err.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`[k0-bundle] vite build failed (exit ${code ?? "unknown"})`));
      });
    }).catch(async (e: unknown) => {
      const parsed = parseViteBuildError(buildOutputChunks.join("")) ?? {
        kind: "vite_build_error" as const,
        message: e instanceof Error ? e.message : "vite build failed",
        rawLines: [e instanceof Error ? e.message : String(e)],
        at: Date.now(),
      };
      await setBundleAppStatus(appId, { phase: "failed", lastBuildError: parsed });
      throw e;
    });
  }

  const flightScript = path.join(repoRoot, "node_modules/@thoughtpivot/flight/src/flight.ts");
  const tsxCli = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");

  // Spawn + readiness with one retry on EADDRINUSE. If the kernel/lsof race meant
  // the previous Flight's socket lingered past `waitUntilPortFree`, the cluster
  // worker will print EADDRINUSE on stderr and exit. We catch that signal,
  // forcibly clear the port again, and retry the spawn once.
  let attempt = 0;
  /* eslint-disable no-constant-condition */
  while (true) {
    const spawnResult = await spawnBundleFlightOnce({
      execPath: process.execPath,
      tsxCli,
      flightScript,
      bundleDir,
      env,
      port,
      expectedAppId,
    });
    if (spawnResult.ok) {
      if (opts?.materializeFingerprint) {
        await setBundleFingerprintForApp(appId, opts.materializeFingerprint);
      }
      await writeBundleSharedState({ servingAppId: expectedAppId, restarting: false });
      setBundleFlightServingAppId(expectedAppId);
      await setBundleAppStatus(appId, { phase: "running", lastBuildError: null });
      if (attempt > 0) {
        console.log(`[k0-bundle] recovered from port conflict on :${port}`);
      }
      return;
    }
    attempt += 1;
    if (attempt >= 2) {
      // Final failure on bind retries — surface as a port_conflict snapshot so
      // tools can distinguish it from compile-time errors.
      await setBundleAppStatus(appId, {
        phase: "failed",
        lastBuildError: makePortConflictError(port, [spawnResult.reason]),
      });
      throw new Error(
        `[k0-bundle] Flight failed to bind :${port} after ${attempt} attempts: ${spawnResult.reason}`,
      );
    }
    console.log(`[k0-bundle] port :${port} busy (${spawnResult.reason}); clearing and retrying`);
    // Force-clear :${port} once more and wait briefly for the kernel to release.
    await killListenersOnPortBestEffort(port);
    try {
      await waitUntilPortFree(port, 4000);
    } catch {
      // Continue anyway; the retry spawn will surface its own error if still busy.
    }
  }
  /* eslint-enable no-constant-condition */
}

type SpawnBundleFlightArgs = {
  execPath: string;
  tsxCli: string;
  flightScript: string;
  bundleDir: string;
  env: NodeJS.ProcessEnv;
  port: number;
  expectedAppId: string;
};

type SpawnBundleFlightResult =
  | { ok: true }
  | { ok: false; reason: "eaddrinuse" | "early_exit" | "ready_timeout"; detail: string };

/**
 * Spawn the bundle Flight child once and resolve when it either becomes ready
 * (HTTP 2xx on the hello ping) or fails in a way the caller can recover from.
 * The classification matters because we want to retry on `eaddrinuse` (race we
 * can fix by killing the squatter) but not on misconfigured-bundle errors.
 */
async function spawnBundleFlightOnce(a: SpawnBundleFlightArgs): Promise<SpawnBundleFlightResult> {
  const flightProc = (bundleFlightProcess = spawn(
    a.execPath,
    [
      "--disable-warning=DEP0040",
      a.tsxCli,
      "-r",
      "tsconfig-paths/register",
      a.flightScript,
      "--mode",
      "production",
      ".",
    ],
    {
      cwd: a.bundleDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: a.env,
      // Make the child its own process-group leader so we can SIGTERM/SIGKILL the
      // whole tree (tsx primary + Node cluster workers) via `process.kill(-pid, sig)`.
      // Without this, killing the supervised parent leaves orphaned cluster workers
      // still bound to :4000, producing EADDRINUSE on the next Apply.
      detached: true,
    },
  ));

  let sawEaddrinuse = false;
  flightProc.stdout?.on("data", (chunk: Buffer) => {
    appendFlightRawChunk("stdout", chunk);
  });
  flightProc.stderr?.on("data", (chunk: Buffer) => {
    if (chunk.includes("EADDRINUSE")) {
      sawEaddrinuse = true;
      return;
    }
    appendFlightRawChunk("stderr", chunk);
  });

  const earlyExit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    flightProc.once("exit", (code, signal) => {
      if (bundleFlightProcess === flightProc) {
        bundleFlightProcess = null;
      }
      appendFlightExitNotice(code, signal);
      resolve({ code, signal });
    });
  });

  // Race readiness against early exit. If the child dies before becoming ready
  // (typical when bind fails), we want to return the error quickly rather than
  // spend 120s polling a dead port.
  const ready = waitUntilBundleFlightReady(a.port, a.expectedAppId).then(
    () => ({ kind: "ready" as const }),
    (e: unknown) => ({ kind: "ready_timeout" as const, error: e }),
  );
  const exited = earlyExit.then((x) => ({ kind: "exited" as const, ...x }));
  const winner = await Promise.race([ready, exited]);
  if (winner.kind === "ready") {
    return { ok: true };
  }
  if (winner.kind === "exited") {
    return {
      ok: false,
      reason: sawEaddrinuse ? "eaddrinuse" : "early_exit",
      detail: `child exited code=${winner.code ?? "null"} signal=${winner.signal ?? "null"}`,
    };
  }
  return {
    ok: false,
    reason: "ready_timeout",
    detail: winner.error instanceof Error ? winner.error.message : "ready timeout",
  };
}

/**
 * Tear down the previous bundle Flight (wait for port free), then build and start the new one.
 * Restarts are **queued** so rapid app switches cannot overlap.
 */
/** Call when `bundles/<appId>/` is removed so the next materialize runs `npm install` again if recreated. */
export function forgetKota0BundleNpmState(appId: string): void {
  lastInstalledPackageJsonHashByAppId.delete(appId);
}

/**
 * Latest restart request seen so older queued ones can be dropped when the user
 * switches apps quickly. Each call to {@link restartKota0Bundle} bumps a seq;
 * when a queued run starts executing it only does work if its seq still matches
 * `latestRestartSeq`. This avoids "switch A→B→C → spawn for B → kill B → spawn C"
 * — we just spawn C directly when its turn comes.
 */
let latestRestartSeq = 0;

export function restartKota0Bundle(
  appId: string,
  opts?: { skipViteBuild?: boolean; materializeFingerprint?: string },
): Promise<void> {
  const seq = ++latestRestartSeq;
  const run = restartChain.then(() => {
    if (seq !== latestRestartSeq) {
      // A newer restart was queued behind us. Skip this one; the newer call's
      // restart will run next and will kill whatever is on :4000 itself.
      return;
    }
    return executeKota0BundleRestart(appId, opts);
  });
  restartChain = run.catch((e: unknown) => {
    console.error("[k0-bundle] restart failed:", e instanceof Error ? e.message : e);
  });
  return run;
}

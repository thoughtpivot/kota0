import { existsSync } from "node:fs";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveKota0BundlesRoot } from "@/components/kota0/deploy/kota0BundlePaths";

export type BundlePhase = "idle" | "installing" | "building" | "running" | "failed";

export type BundleBuildErrorKind =
  | "missing_import"
  | "vite_build_error"
  | "npm_install_error"
  | "port_conflict";

export type BundleBuildError = {
  kind: BundleBuildErrorKind;
  /** Short human-readable summary the model can grep / quote. */
  message: string;
  /** Module the bundle tried to import (when kind === "missing_import"). */
  module?: string;
  /** Where the failing import was referenced (when known). */
  importedFrom?: string;
  /** Tail of raw stderr lines for additional context (capped). */
  rawLines: string[];
  /** Epoch ms when the failure was recorded. */
  at: number;
};

export type BundleAppRuntimeStatus = {
  phase: BundlePhase;
  lastBuildError: BundleBuildError | null;
  /** Epoch ms of the last phase transition. */
  phaseSince: number;
};

export type BundleSharedState = {
  servingAppId: string | null;
  bundleFingerprintByAppId: Record<string, string>;
  restarting: boolean;
  /** Per-app build/runtime status. Apps that never restarted have no entry. */
  appStatus: Record<string, BundleAppRuntimeStatus>;
};

const LOCK_FILE = ".k0-bundle-restart.lock";
const STATE_FILE = ".k0-bundle-state.json";

const DEFAULT_STATE: BundleSharedState = {
  servingAppId: null,
  bundleFingerprintByAppId: {},
  restarting: false,
  appStatus: {},
};

const VALID_PHASES: ReadonlySet<BundlePhase> = new Set(["idle", "installing", "building", "running", "failed"]);
const VALID_ERROR_KINDS: ReadonlySet<BundleBuildErrorKind> = new Set([
  "missing_import",
  "vite_build_error",
  "npm_install_error",
  "port_conflict",
]);

function coerceBuildError(raw: unknown): BundleBuildError | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<BundleBuildError>;
  if (typeof r.kind !== "string" || !VALID_ERROR_KINDS.has(r.kind as BundleBuildErrorKind)) return null;
  if (typeof r.message !== "string") return null;
  return {
    kind: r.kind as BundleBuildErrorKind,
    message: r.message,
    module: typeof r.module === "string" ? r.module : undefined,
    importedFrom: typeof r.importedFrom === "string" ? r.importedFrom : undefined,
    rawLines: Array.isArray(r.rawLines) ? r.rawLines.filter((l): l is string => typeof l === "string") : [],
    at: typeof r.at === "number" && Number.isFinite(r.at) ? r.at : Date.now(),
  };
}

function coerceAppStatus(raw: unknown): Record<string, BundleAppRuntimeStatus> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, BundleAppRuntimeStatus> = {};
  for (const [appId, v] of Object.entries(raw)) {
    if (typeof appId !== "string" || appId.length === 0) continue;
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<BundleAppRuntimeStatus>;
    const phase: BundlePhase = VALID_PHASES.has(s.phase as BundlePhase) ? (s.phase as BundlePhase) : "idle";
    out[appId] = {
      phase,
      lastBuildError: s.lastBuildError ? coerceBuildError(s.lastBuildError) : null,
      phaseSince: typeof s.phaseSince === "number" && Number.isFinite(s.phaseSince) ? s.phaseSince : 0,
    };
  }
  return out;
}

function lockPath(): string {
  return path.join(resolveKota0BundlesRoot(), LOCK_FILE);
}

function statePath(): string {
  return path.join(resolveKota0BundlesRoot(), STATE_FILE);
}

async function ensureBundlesRoot(): Promise<void> {
  await mkdir(resolveKota0BundlesRoot(), { recursive: true });
}

function parseState(raw: string): BundleSharedState {
  try {
    const o = JSON.parse(raw) as Partial<BundleSharedState>;
    const fps =
      o.bundleFingerprintByAppId && typeof o.bundleFingerprintByAppId === "object"
        ? Object.fromEntries(
            Object.entries(o.bundleFingerprintByAppId).filter(
              (e): e is [string, string] => typeof e[0] === "string" && typeof e[1] === "string",
            ),
          )
        : {};
    return {
      servingAppId:
        typeof o.servingAppId === "string" ? o.servingAppId
        : o.servingAppId === null ? null
        : null,
      bundleFingerprintByAppId: fps,
      restarting: o.restarting === true,
      appStatus: coerceAppStatus(o.appStatus),
    };
  } catch {
    return { ...DEFAULT_STATE, appStatus: {} };
  }
}

export async function readBundleSharedState(): Promise<BundleSharedState> {
  const p = statePath();
  if (!existsSync(p)) return { ...DEFAULT_STATE, appStatus: {} };
  try {
    return parseState(await readFile(p, "utf8"));
  } catch {
    return { ...DEFAULT_STATE, appStatus: {} };
  }
}

export async function writeBundleSharedState(patch: Partial<BundleSharedState>): Promise<void> {
  await ensureBundlesRoot();
  const cur = await readBundleSharedState();
  const next: BundleSharedState = {
    servingAppId: patch.servingAppId !== undefined ? patch.servingAppId : cur.servingAppId,
    bundleFingerprintByAppId:
      patch.bundleFingerprintByAppId !== undefined
        ? patch.bundleFingerprintByAppId
        : cur.bundleFingerprintByAppId,
    restarting: patch.restarting !== undefined ? patch.restarting : cur.restarting,
    appStatus: patch.appStatus !== undefined ? patch.appStatus : cur.appStatus,
  };
  await writeFile(statePath(), `${JSON.stringify(next, null, 0)}\n`, "utf8");
}

export async function setBundleFingerprintForApp(appId: string, fingerprint: string): Promise<void> {
  const cur = await readBundleSharedState();
  cur.bundleFingerprintByAppId[appId] = fingerprint;
  await writeBundleSharedState({ bundleFingerprintByAppId: cur.bundleFingerprintByAppId });
}

export function getBundleFingerprintFromState(state: BundleSharedState, appId: string): string | null {
  const fp = state.bundleFingerprintByAppId[appId];
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

/**
 * Patch a single app's phase + optional build error. Reads-modify-writes the
 * shared state file. Callers in the bundle runner use this on every phase
 * transition so the workspace API can surface live status via tools.
 */
export async function setBundleAppStatus(
  appId: string,
  patch: { phase?: BundlePhase; lastBuildError?: BundleBuildError | null },
): Promise<void> {
  const cur = await readBundleSharedState();
  const prev = cur.appStatus[appId];
  const now = Date.now();
  const nextPhase: BundlePhase = patch.phase ?? prev?.phase ?? "idle";
  const phaseChanged = !prev || prev.phase !== nextPhase;
  const next: BundleAppRuntimeStatus = {
    phase: nextPhase,
    lastBuildError:
      patch.lastBuildError !== undefined ? patch.lastBuildError : (prev?.lastBuildError ?? null),
    phaseSince: phaseChanged ? now : (prev?.phaseSince ?? now),
  };
  const appStatus = { ...cur.appStatus, [appId]: next };
  await writeBundleSharedState({ appStatus });
}

export function getBundleAppStatus(
  state: BundleSharedState,
  appId: string,
): BundleAppRuntimeStatus {
  return (
    state.appStatus[appId] ?? {
      phase: "idle" as BundlePhase,
      lastBuildError: null,
      phaseSince: 0,
    }
  );
}

const LOCK_ACQUIRE_MS = 120_000;
const LOCK_RETRY_MS = 80;
const STALE_CHECK_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function breakStaleLock(lp: string): Promise<boolean> {
  try {
    const raw = await readFile(lp, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      await unlink(lp).catch(() => {});
      return true;
    }
    if (!isProcessAlive(pid)) {
      await unlink(lp).catch(() => {});
      return true;
    }
  } catch {
    /* lock file disappeared or unreadable — either way we can retry */
  }
  return false;
}

/**
 * Cross-process lock so only one platform Flight worker restarts bundle Flight on :4000.
 * Detects stale locks left by dead processes (e.g. after SIGKILL / workspace restart).
 */
export async function withBundleRestartLock<T>(fn: () => Promise<T>): Promise<T> {
  await ensureBundlesRoot();
  const lp = lockPath();
  const deadline = Date.now() + LOCK_ACQUIRE_MS;
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  let lastStaleCheck = 0;
  while (Date.now() < deadline) {
    try {
      handle = await open(lp, "wx");
      await handle.write(`${process.pid}\n`);
      break;
    } catch (e: unknown) {
      const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
      if (code !== "EEXIST") throw e;
      const now = Date.now();
      if (now - lastStaleCheck >= STALE_CHECK_INTERVAL_MS) {
        lastStaleCheck = now;
        if (await breakStaleLock(lp)) continue;
      }
      await sleep(LOCK_RETRY_MS);
    }
  }
  if (!handle) {
    throw new Error(`[k0-bundle] Could not acquire restart lock within ${LOCK_ACQUIRE_MS}ms`);
  }
  try {
    return await fn();
  } finally {
    try {
      await handle.close();
    } catch {
      /* ignore */
    }
    try {
      await unlink(lp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Kota0 apps: Scribe is source of truth. Active app runs from `bundles/<appId>/` (Flight prod on port 4000).
 * `viewer/generated/App.vue` mirrors the SFC for workspace tooling; per-app `App.backend.ts` is **not** on platform Flight.
 * Chat: `k0_chat_message`.
 */
import Router, { type RouterContext } from "@koa/router";
import { createHash } from "node:crypto";
import { parse as parseSfc } from "@vue/compiler-sfc";
import dotenv from "dotenv";
import { access, constants, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { isAxiosError } from "axios";
import { getScribeUrl, isScribeConfigured, scribe } from "@/lib/scribe";
import type { IncomingMessage } from "@/components/kota0/ai/plan/planRun";
import {
  K0_TRANSCRIBE_MAX_BASE64_CHARS,
  K0_TRANSCRIBE_MAX_BYTES,
  resolveKota0TranscribeMimeRoot,
  transcribeKota0AudioWithGemini,
} from "@/components/kota0/ai/geminiTranscribeAudio";
import { suggestKota0AppName } from "@/components/kota0/ai/suggestKota0AppName";
import { runWorkspaceGeminiTextCompletion, validateKota0PlatformAiPayload } from "@/components/kota0/ai/kota0WorkspaceAiCompletion";
import {
  formatKota0IdeationToMarkdown,
  truncateBundleEnvForSystemInstruction,
  type Kota0IdeationSystemExtras,
  type Kota0ScribeBackendHeadMeta,
  type Kota0ScribeHeadMeta,
  runKota0IdeationTurn,
  runKota0IdeationTurnStreaming,
  stubKota0IdeationTurn,
} from "@/components/kota0/ai/plan/kota0IdeationRun";
import { buildKota0SfcHeadOutline } from "@/components/kota0/viewer/kota0SfcHeadOutline";
import { getKota0WorkspaceDepsSummary } from "@/components/kota0/viewer/kota0WorkspaceDepsSummary";
import { ScribeKota0AppRepository } from "@/components/kota0/apps/ScribeKota0AppRepository";
import {
  extractKota0BackendScribeKeys,
  mergeScribeBundleComponentManifest,
  purgeKota0BundleScribeComponents,
} from "@/components/kota0/apps/kota0AppScribeComponents.ts";
import { ScribeKota0ChatRepository } from "@/components/kota0/ai/ScribeKota0ChatRepository";
import { kota0ChatRowsToGeminiIncoming } from "@/components/kota0/ai/kota0ChatForModel";
import { probeKota0AppSourceHistory } from "@/components/kota0/ai/scribeKota0History";
import {
  listKota0AppRevisions,
  type Kota0AppRevision,
} from "@/components/kota0/apps/ScribeKota0AppHistoryRepository";
import {
  runKota0ApplyTurn,
  runKota0PlanTurn,
} from "@/components/kota0/ai/plan/kota0PlanAndApplyTurn";
import {
  applyModelPatchText,
  buildApplyRetryHint,
  mergeApplyPatchRetry,
} from "@/components/kota0/ai/kota0ApplyModelPatches";
import { getQaTailSincePlan } from "@/components/kota0/ai/kota0ChatPhase";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { Kota0PlanSchema } from "@shared/kota0Plan.ts";
import {
  bucketRevisionInstantsByLocalDay,
  countHistoryRevisions,
  extractRevisionInstantsFromScribeHistoryBody,
  fillMissingRevisionInstants,
} from "@/components/kota0/ai/scribeKota0RevisionActivity";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/kota0/deploy/kota0AppVueChartSanitize.ts";
import { writeKota0AppBundle } from "@/components/kota0/deploy/writeKota0AppBundle";
import { ScribeKota0DeploymentRepository } from "@/components/kota0/deploy/ScribeKota0DeploymentRepository";
import { LocalDockerTarget } from "@/components/kota0/deploy/kota0LocalDockerTarget";
import { destroyDeployment, runDeploy } from "@/components/kota0/deploy/kota0DeployOrchestrator";
import {
  getFlightConsoleRecent,
  subscribeFlightConsole,
} from "@/components/kota0/deploy/kota0ConsoleLogHub";
import {
  cleanupBundlePortAtStartup,
  forgetKota0BundleNpmState,
  getBundleFlightServingAppId,
  isBundleFlightServingApp,
  isBundleFlightUpForApp,
  restartKota0Bundle,
  setBundleFlightServingAppId,
  stopKota0BundleAsync,
} from "@/components/kota0/deploy/kota0BundleRunner";
import { bundleMaterializeFingerprint } from "@/components/kota0/deploy/kota0BundleMaterializeFingerprint";
import {
  getBundleFingerprintFromState,
  readBundleSharedState,
  writeBundleSharedState,
} from "@/components/kota0/deploy/kota0BundleSharedState";
import { resolveKota0BundleDir, resolveKota0BundlesRoot } from "@/components/kota0/deploy/kota0BundlePaths";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry";
import { bundleScribeGatewayUrl } from "@/components/kota0/gateway/ScribeGateway";
import {
  DEFAULT_K0_BACKEND,
  DEFAULT_K0_SFC,
  GENERATED_DIR,
  MATERIALIZED_APP_BACKEND,
  MATERIALIZED_APP_VUE,
  mirrorKota0GeneratedAppVue,
  normalizeKota0AppVueLeadingSlashApis,
  resolveKota0RepoRoot,
  unlinkKota0GeneratedAppBackend,
} from "@/components/kota0/viewer/kota0Materialize";
import {
  isLegacySeededWelcomeMessage,
  normalizeForKota0LegacyMatch,
} from "@shared/kota0LegacyWelcome.ts";
import { validateKota0AppBackendForFlight } from "@/components/kota0/viewer/kota0AppBackendForFlight";
import { sanitizeKota0AppSfcForTailwindVite } from "@/components/kota0/viewer/kota0SfcTailwindSanitize";
import { isKota0AppIconId } from "@/components/kota0/apps/kota0AppIconIds";
import type { Kota0AppFull, Kota0AppStatus } from "@/components/kota0/apps/kota0AppTypes";
import { extractTsFenceFromMarkdown } from "@shared/kota0ExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/kota0ExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/kota0ExtractVueFence.ts";
import type { Kota0IdeationTurn } from "@shared/kota0IdeationTurn.ts";

dotenv.config({ path: path.join(process.cwd(), ".env"), override: false, quiet: true });

const MIB = 1024 * 1024;

/** UTF-8 byte cap for `source` on PUT. Override with `K0_APP_SOURCE_MAX_BYTES` (clamped 64 KiB–200 MiB). */
function resolveMaxSourceBytes(): number {
  const raw = process.env.K0_APP_SOURCE_MAX_BYTES?.trim();
  if (!raw) return 50 * MIB;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 64 * 1024) return 50 * MIB;
  return Math.min(Math.floor(n), 200 * MIB);
}

const MAX_BYTES = resolveMaxSourceBytes();

/** UTF-8 byte cap for optional `bundleEnv` on PUT (fraction of app source cap). */
const MAX_BUNDLE_ENV_BYTES = Math.max(64 * 1024, Math.floor(MAX_BYTES / 4));

async function readBundleEnvFromDisk(appId: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.join(resolveKota0BundleDir(appId), ".env"), "utf8");
    return raw;
  } catch {
    return undefined;
  }
}

/** Scribe is authoritative when non-empty; `""` / unset fall back to materialized disk (avoids clobbering from a PUT that omitted env). */
function isAuthoritativeScribeBundleEnv(s: string | undefined): s is string {
  return s !== undefined && s.length > 0;
}

function bundleEnvForMaterialize(scribe: string | undefined): string | undefined {
  return isAuthoritativeScribeBundleEnv(scribe) ? scribe : undefined;
}

async function buildKota0IdeationExtras(appId: string, head: string, app: Kota0AppFull): Promise<Kota0IdeationSystemExtras> {
  const workspaceDepsSummary = getKota0WorkspaceDepsSummary();
  const headOutline = buildKota0SfcHeadOutline(head);
  let envText: string;
  if (isAuthoritativeScribeBundleEnv(app.bundleEnv)) {
    envText = app.bundleEnv;
  } else {
    envText = (await readBundleEnvFromDisk(appId)) ?? "";
  }
  const trimmed = envText.trim();
  const bundleEnvForSystem =
    trimmed.length > 0 ? truncateBundleEnvForSystemInstruction(envText).text : null;
  return {
    workspaceDepsSummary,
    headOutline,
    bundleEnvForSystem,
  };
}

/** Prefer JSON / turn field, else ```vue in assistant text; only return parse-valid SFC. */
function coerceProposedAppVue(turn: Kota0IdeationTurn): string | null {
  const candidates: string[] = [];
  const raw = turn.proposedAppVue;
  if (typeof raw === "string" && raw.trim().length > 0) candidates.push(raw.trim());
  const fenced = extractVueFenceFromMarkdown(turn.assistantMessage);
  if (fenced) candidates.push(fenced);
  for (const s of candidates) {
    const { errors } = parseSfc(s, { filename: "App.vue" });
    if (errors.length === 0) return s;
  }
  return null;
}

function coerceProposedAppBackend(turn: Kota0IdeationTurn): string | null {
  const raw = turn.proposedAppBackend;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractTsFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

function coerceProposedBundleEnv(turn: Kota0IdeationTurn): string | null {
  const raw = turn.proposedBundleEnv;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractEnvFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

type Kota0ClientChatRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  /** Defaults to "message" on the client when absent (legacy rows). */
  kind?: "message" | "plan" | "fresh_start";
};

type Kota0PostMessagesBody = {
  usedStub: boolean;
  lastKota0Turn: {
    proposedAppVue: string | null;
    proposedAppBackend: string | null;
    proposedBundleEnv: string | null;
  };
  messages: Kota0ClientChatRow[];
};

async function persistKota0AssistantTurn(
  appId: string,
  ideationTurn: Kota0IdeationTurn,
  usedStub: boolean,
): Promise<Kota0PostMessagesBody> {
  const proposed = coerceProposedAppVue(ideationTurn);
  const proposedBe = coerceProposedAppBackend(ideationTurn);
  const proposedEnv = coerceProposedBundleEnv(ideationTurn);
  const assistantMarkdown = formatKota0IdeationToMarkdown({
    ...ideationTurn,
    proposedAppVue: proposed,
    proposedAppBackend: proposedBe,
    proposedBundleEnv: proposedEnv,
  });
  await chatRepo.appendMessage({
    appId,
    role: "assistant",
    content: assistantMarkdown,
  });
  const rows = await chatRepo.listByAppId(appId);
  return {
    usedStub,
    lastKota0Turn: {
      proposedAppVue: proposed,
      proposedAppBackend: proposedBe,
      proposedBundleEnv: proposedEnv,
    },
    messages: rows.map((m) => ({
      id: m.message_id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      kind: m.kind,
    })),
  };
}

async function runKota0MessageIdeation(
  incoming: IncomingMessage[],
  heads: { sfc: string; backend: string },
  sfcMeta: Kota0ScribeHeadMeta,
  backendMeta: Kota0ScribeBackendHeadMeta,
  extras: Kota0IdeationSystemExtras,
  userTextForStub: string,
  onStreamDelta?: (receivedChars: number, textDelta: string) => void,
): Promise<{ ideationTurn: Kota0IdeationTurn; usedStub: boolean }> {
  let ideationTurn: Kota0IdeationTurn;
  let usedStub = false;
  try {
    if (onStreamDelta) {
      ideationTurn = await runKota0IdeationTurnStreaming(
        incoming,
        heads,
        sfcMeta,
        backendMeta,
        extras,
        onStreamDelta,
      );
    } else {
      ideationTurn = await runKota0IdeationTurn(incoming, heads, sfcMeta, backendMeta, extras);
    }
  } catch (e) {
    usedStub = true;
    const reason = e instanceof Error ? e.message : "unknown_error";
    const stub = stubKota0IdeationTurn(userTextForStub);
    ideationTurn = {
      ...stub,
      assistantMessage: `_(Ideation service unavailable: ${reason}. Showing a template reply.)_\n\n${stub.assistantMessage}`,
    };
  }
  return { ideationTurn, usedStub };
}

const repo = new ScribeKota0AppRepository();
const chatRepo = new ScribeKota0ChatRepository();
const deploymentRepo = new ScribeKota0DeploymentRepository();
const localDockerTarget = new LocalDockerTarget();

// Tell the registry where to persist keys. Workers only write (provision/revoke) — they never
// start the gateway server. The gateway runs as a dedicated process (start:gateway) that loads
// this same file and watches it for changes, keeping its in-memory map in sync.
scribeKeyRegistry.configure(path.join(resolveKota0BundlesRoot(), ".scribe-gateway-keys.json"));

// Reclaim :4000 from any orphaned bundle Flight left over from a previous `npm run start:app`
// (the parent tsx process dies but cluster workers can keep listening). Without this the first
// create-app of a fresh workspace process can hit EADDRINUSE before our per-restart kill runs.
cleanupBundlePortAtStartup();

/** Tracks which app’s head was last written to the single materialized App.vue (for delete cleanup). */
let lastMaterializedAppId: string | null = null;

/**
 * Serialises concurrent `materializeForApp` calls per app so a GET arriving while a PUT’s
 * materialize is in-flight is queued rather than starting a parallel cycle (which would trigger
 * a duplicate full vite-build + Flight restart).
 */
const materializeChainByApp = new Map<string, Promise<void>>();

function queueMaterializeForApp(
  appId: string,
  source: string,
  backendSource: string,
  bundleEnv?: string,
): Promise<void> {
  const prev = materializeChainByApp.get(appId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => materializeForApp(appId, source, backendSource, bundleEnv));
  materializeChainByApp.set(appId, next);
  return next;
}

/** Rematerialize when :4000 hello confirms this app — not in-memory metadata alone. */
async function rematerializeIfPreviewLive(
  appId: string,
  source: string,
  backendSource: string,
  bundleEnv?: string,
): Promise<void> {
  if (await isBundleFlightServingApp(appId)) {
    await queueMaterializeForApp(appId, source, backendSource, bundleEnv);
  }
}

function scribe503(ctx: RouterContext, message: string): void {
  ctx.status = 503;
  ctx.body = { error: "scribe_unavailable", message };
}

function scribeConnectHint(e: unknown): string {
  const base =
    isAxiosError(e) ?
      `${e.code ?? "axios"} — ${e.message}`
    : e instanceof Error ? e.message
    : "unknown";
  if (isAxiosError(e) && (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND")) {
    return `${base} (Start Scribe: npm run start:docker — then ensure port 1337 matches ${getScribeUrl()}.)`;
  }
  return base;
}

function scribeGuard(ctx: RouterContext): boolean {
  if (!isScribeConfigured()) {
    ctx.status = 503;
    ctx.body = {
      error: "scribe_unconfigured",
      message:
        "Set SCRIBE_URL in production .env (e.g. http://scribe:1337 in Docker). For local dev, NODE_ENV=development uses http://127.0.0.1:1337 when SCRIBE_URL is unset.",
    };
    return false;
  }
  return true;
}

async function materializeForApp(
  appId: string,
  source: string,
  backendSource: string,
  bundleEnv?: string,
): Promise<void> {
  const vueSource = sanitizeChartJsModelArtifactsInAppVueSource(
    normalizeKota0AppVueLeadingSlashApis(source),
  );
  const scribeUserEnv = bundleEnvForMaterialize(bundleEnv);
  const fingerprint = bundleMaterializeFingerprint(source, backendSource, bundleEnv);
  const scribeApiKey = await scribeKeyRegistry.provision(appId);
  await writeKota0AppBundle({
    appId,
    source: vueSource,
    backendSource,
    ...(scribeUserEnv !== undefined ? { bundleEnv: scribeUserEnv } : {}),
    scribeGateway: { url: bundleScribeGatewayUrl(), apiKey: scribeApiKey },
  });
  await mirrorKota0GeneratedAppVue(vueSource);
  await unlinkKota0GeneratedAppBackend();
  lastMaterializedAppId = appId;
  try {
    await restartKota0Bundle(appId, { materializeFingerprint: fingerprint });
  } catch (e: unknown) {
    console.error("[k0-bundle] restart failed:", e instanceof Error ? e.message : e);
    throw e;
  }
}

async function clearMaterializedDiskIfLastWas(appId: string): Promise<void> {
  const shared = await readBundleSharedState();
  if (shared.bundleFingerprintByAppId[appId]) {
    delete shared.bundleFingerprintByAppId[appId];
    await writeBundleSharedState({ bundleFingerprintByAppId: shared.bundleFingerprintByAppId });
  }
  if (getBundleFlightServingAppId() === appId) {
    setBundleFlightServingAppId(null);
    await writeBundleSharedState({ servingAppId: null });
  }
  if (lastMaterializedAppId === appId) {
    await mirrorKota0GeneratedAppVue(DEFAULT_K0_SFC);
    await unlinkKota0GeneratedAppBackend();
    lastMaterializedAppId = null;
    await stopKota0BundleAsync();
  }
}

/** Full-body SHA-256 (hex) of known historic welcome blobs (raw and normalized). */
const LEGACY_WELCOME_SHA256_HEX = new Set<string>([
  "dfe657b05ab6a5ae4bcb6b11e01f2fe9a89e9344587fecbabfc9b44f26454c65",
  "ff26811f1658929f927abb4b7ac3428761aea07b39ea402b87a4bee6fa174d69",
  "acaf6374232c00e18a6fd74121127f8806468a34e718d706e945c6324e2b5455",
]);

function isLegacySeededScribeMessage(role: string, content: string): boolean {
  if (isLegacySeededWelcomeMessage(role as "assistant" | "user" | "system", content)) return true;
  if (role !== "assistant" && role !== "system") return false;
  const t = content.trim();
  if (t.length < 60) return false;
  const normHash = createHash("sha256").update(normalizeForKota0LegacyMatch(t), "utf8").digest("hex");
  if (LEGACY_WELCOME_SHA256_HEX.has(normHash)) return true;
  const rawHash = createHash("sha256").update(t, "utf8").digest("hex");
  return LEGACY_WELCOME_SHA256_HEX.has(rawHash);
}

async function generatedFileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const router = new Router();

/** Read-only: materialize paths, cwd, Scribe config. Does not require Scribe to be up. */
router.get("/api/kota0/diagnostics", async (ctx: RouterContext) => {
  const root = resolveKota0RepoRoot();
  const vue = MATERIALIZED_APP_VUE;
  const be = MATERIALIZED_APP_BACKEND;
  const bundleDir = lastMaterializedAppId ? resolveKota0BundleDir(lastMaterializedAppId) : null;
  ctx.status = 200;
  ctx.set("Cache-Control", "no-store");
  ctx.body = {
    processCwd: process.cwd(),
    resolvedRepoRoot: root,
    generatedDir: GENERATED_DIR,
    materializedAppVue: vue,
    materializedAppBackend: be,
    appVueExists: await generatedFileExists(vue),
    appBackendExists: await generatedFileExists(be),
    /** Last materialized app id and on-disk bundle path (Flight prod + `vite build` output). */
    activeKota0BundleAppId: lastMaterializedAppId,
    kota0BundleDir: bundleDir,
    kota0BundlePreviewOrigin: "http://127.0.0.1:4000",
    scribeConfigured: isScribeConfigured(),
    scribeUrl: isScribeConfigured() ? getScribeUrl() : null,
    hint:
      "Per-app preview: bundle Flight on port 4000 (`bundles/<appId>/`). Platform Flight does not load `viewer/generated/App.backend.ts`. If chat returns 404, restart `npm run start:app`. If 503, run `npm run start:docker` and check SCRIBE_URL.",
  };
});

/**
 * Explicitly start (or restart) the preview Flight for an app. Triggered by the
 * "Show app preview" button — preview is opt-in so that switching apps without
 * pressing the button never touches `:4000`, eliminating the EADDRINUSE / wrong-
 * app-in-preview class of bugs. Returns immediately; the iframe polls
 * `/bundle-flight/status` until `ready: true`.
 */
router.post("/api/kota0/apps/:appId/preview/start", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    // Kick off materialize asynchronously — the route returns 202 immediately so
    // the UI can show its loading state. Errors during materialize bubble up via
    // the bundle Flight console SSE and via the status endpoint (ready stays false).
    void queueMaterializeForApp(appId, app.source, app.backendSource, app.bundleEnv).catch(
      (e: unknown) => {
        console.error("[k0-bundle] preview start failed:", e instanceof Error ? e.message : e);
      },
    );
    const bundleEnvResolved = isAuthoritativeScribeBundleEnv(app.bundleEnv) ? app.bundleEnv : undefined;
    const bundleFingerprint = bundleMaterializeFingerprint(
      app.source,
      app.backendSource,
      bundleEnvResolved,
    );
    ctx.status = 202;
    ctx.body = { ok: true, started: true, bundleFingerprint };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

/**
 * Tells the preview iframe whether `:4000` is currently serving the requested app.
 * Used to gate `previewPageUrl` so a stale render of the previous app can't appear
 * under the newly selected app's URL during rapid switches.
 */
router.get("/api/kota0/bundle-flight/status", async (ctx: RouterContext) => {
  const requestedAppId =
    typeof ctx.query.appId === "string" ? ctx.query.appId : undefined;
  const shared = await readBundleSharedState();
  const servingAppId = shared.servingAppId ?? getBundleFlightServingAppId();
  let ready = false;
  let bundleFingerprint: string | null = null;
  if (requestedAppId) {
    try {
      ready = await isBundleFlightUpForApp(requestedAppId);
    } catch {
      ready = false;
    }
    bundleFingerprint = getBundleFingerprintFromState(shared, requestedAppId);
  }
  ctx.status = 200;
  ctx.set("Cache-Control", "no-store");
  ctx.body = { servingAppId, ready, bundleFingerprint, restarting: shared.restarting };
});

/** SSE: bundle Flight stdout/stderr (in-memory ring buffer; no Scribe required). */
router.get("/api/kota0/console/stream", async (ctx: RouterContext) => {
  /** Raw `res` write — do not assign `ctx.body` to a stream (Koa `Stream.pipeline` error path can call `onerror` with a broken `this`). */
  ctx.respond = false;
  const res = ctx.res;
  const req = ctx.req;

  if (!res.headersSent) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  }

  let ended = false;
  let unsub: (() => void) | null = null;

  const safeEnd = (): void => {
    if (ended) return;
    ended = true;
    unsub?.();
    try {
      res.end();
    } catch {
      /* ignore */
    }
  };

  const writeSse = (obj: unknown): void => {
    if (ended) return;
    try {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {
      safeEnd();
    }
  };

  writeSse({ type: "meta", source: "bundle_flight" });
  for (const entry of getFlightConsoleRecent()) {
    writeSse({ type: "line", stream: entry.stream, text: entry.text, at: entry.at });
  }

  unsub = subscribeFlightConsole((entry) => {
    try {
      writeSse({ type: "line", stream: entry.stream, text: entry.text, at: entry.at });
    } catch {
      safeEnd();
    }
  });

  res.once("error", safeEnd);
  req.socket?.once("error", safeEnd);
  req.once("close", safeEnd);
  req.once("aborted", safeEnd);
});

/** Workspace mic → Gemini transcription for Kota0 AI prompt (Gemini only; does not use Scribe). */
router.post("/api/kota0/transcribe-audio", async (ctx: RouterContext) => {
  try {
    const body = ctx.request.body as { audioBase64?: unknown; mimeType?: unknown };
    const mimeRaw = typeof body?.mimeType === "string" ? body.mimeType : "";
    const mimeRoot = resolveKota0TranscribeMimeRoot(mimeRaw);
    if (!mimeRoot) {
      ctx.status = 400;
      ctx.body = {
        error: "invalid_mime_type",
        message: "Unsupported or missing mimeType for audio.",
      };
      return;
    }
    const b64 = typeof body?.audioBase64 === "string" ? body.audioBase64.replace(/\s/g, "") : "";
    if (!b64) {
      ctx.status = 400;
      ctx.body = { error: "audio_required", message: "audioBase64 is required." };
      return;
    }
    if (b64.length > K0_TRANSCRIBE_MAX_BASE64_CHARS) {
      ctx.status = 413;
      ctx.body = {
        error: "payload_too_large",
        message: `Audio exceeds ${K0_TRANSCRIBE_MAX_BYTES} bytes after decoding.`,
      };
      return;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      ctx.status = 400;
      ctx.body = { error: "invalid_base64", message: "audioBase64 is not valid base64." };
      return;
    }
    if (!buf.length) {
      ctx.status = 400;
      ctx.body = { error: "empty_audio", message: "Decoded audio is empty." };
      return;
    }
    if (buf.length > K0_TRANSCRIBE_MAX_BYTES) {
      ctx.status = 413;
      ctx.body = {
        error: "payload_too_large",
        message: `Audio exceeds ${K0_TRANSCRIBE_MAX_BYTES} bytes.`,
      };
      return;
    }
    const text = await transcribeKota0AudioWithGemini(buf, mimeRoot);
    ctx.status = 200;
    ctx.body = { text };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    ctx.status = 502;
    ctx.body = { error: "transcription_failed", message };
  }
});

/** Gemini-backed creative app label (first-app gate and other callers); falls back server-side when the API key or model is unavailable. */
router.post("/api/kota0/suggest-app-name", async (ctx: RouterContext) => {
  ctx.set("Cache-Control", "no-store");
  const name = await suggestKota0AppName();
  ctx.status = 200;
  ctx.body = { name };
});

router.get("/api/kota0/apps", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const apps = await repo.listApps();
    ctx.status = 200;
    ctx.body = { apps };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/kota0/apps", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const body = ctx.request.body as { name?: unknown };
    const name = typeof body?.name === "string" ? body.name : "New app";
    /** Never seed from materialized on-disk files — they belong to whichever app was last active. */
    const full = await repo.createApp({
      name,
      source: DEFAULT_K0_SFC,
      backendSource: DEFAULT_K0_BACKEND,
    });
    // Preview is now opt-in: the user must click "Show app preview" to spawn the
    // bundle Flight. Creating an app is purely a Scribe insert.
    ctx.status = 201;
    ctx.body = { app: full };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.get("/api/kota0/apps/:appId/messages", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    const rawRows = await chatRepo.listByAppId(appId);
    const rows: typeof rawRows = [];
    for (const m of rawRows) {
      if (isLegacySeededScribeMessage(m.role, m.content)) {
        try {
          await chatRepo.deleteMessageById(appId, m.message_id);
        } catch {
          // Still omit from this response; delete can retry on next load.
        }
        continue;
      }
      rows.push(m);
    }
    ctx.status = 200;
    ctx.body = {
      messages: rows.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind: m.kind,
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

/** Workspace Gemini completion for bundle backends — uses repo-root `GEMINI_*`, not bundle secrets. */
router.post("/api/kota0/apps/:appId/ai/complete", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  ctx.set("Cache-Control", "no-store");
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required", message: "Missing app id." };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found", message: "Unknown Kota0 app." };
      return;
    }
    const parsed = validateKota0PlatformAiPayload(ctx.request.body);
    if (!parsed.ok) {
      ctx.status = parsed.code === "payload_too_large" ? 413 : 400;
      ctx.body = { error: parsed.code, message: parsed.message };
      return;
    }
    const result = await runWorkspaceGeminiTextCompletion(parsed.value);
    if (!result.ok) {
      ctx.status = result.status;
      ctx.body = { error: result.error, message: result.message };
      return;
    }
    ctx.status = 200;
    ctx.body = { text: result.text };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/kota0/apps/:appId/messages", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const body = ctx.request.body as { text?: unknown };
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      ctx.status = 400;
      ctx.body = { error: "text_required" };
      return;
    }

    const appExists = await repo.getApp(appId);
    if (!appExists) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }

    await chatRepo.appendMessage({ appId, role: "user", content: text });
    const persisted = await chatRepo.listByAppId(appId);
    const incoming: IncomingMessage[] = kota0ChatRowsToGeminiIncoming(persisted);

    const appLatest = await repo.getApp(appId);
    if (!appLatest) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }

    const head = appLatest.source;
    const beHead = appLatest.backendSource;
    const scribeMeta: Kota0ScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };
    const backendMeta: Kota0ScribeBackendHeadMeta = {
      utf8Bytes: Buffer.byteLength(beHead, "utf8"),
      lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
      rawCharLength: beHead.length,
    };

    const ideationExtras = await buildKota0IdeationExtras(appId, head, appLatest);

    const { ideationTurn, usedStub } = await runKota0MessageIdeation(
      incoming,
      { sfc: head, backend: beHead },
      scribeMeta,
      backendMeta,
      ideationExtras,
      text,
    );

    ctx.status = 200;
    ctx.body = await persistKota0AssistantTurn(appId, ideationTurn, usedStub);
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/kota0/apps/:appId/messages/stream", async (ctx: RouterContext) => {
    if (!scribeGuard(ctx)) return;
    const appId = ctx.params.appId;
    if (!appId) {
      ctx.status = 400;
      ctx.body = { error: "app_id_required" };
      return;
    }
    try {
      const body = ctx.request.body as { text?: unknown };
      const text = typeof body?.text === "string" ? body.text.trim() : "";
      if (!text) {
        ctx.status = 400;
        ctx.body = { error: "text_required" };
        return;
      }

      const appExists = await repo.getApp(appId);
      if (!appExists) {
        ctx.status = 404;
        ctx.body = { error: "app_not_found" };
        return;
      }

      await chatRepo.appendMessage({ appId, role: "user", content: text });
      const persisted = await chatRepo.listByAppId(appId);
      const incoming: IncomingMessage[] = kota0ChatRowsToGeminiIncoming(persisted);

      const appLatest = await repo.getApp(appId);
      if (!appLatest) {
        ctx.status = 404;
        ctx.body = { error: "app_not_found" };
        return;
      }

      const head = appLatest.source;
      const beHead = appLatest.backendSource;
      const scribeMeta: Kota0ScribeHeadMeta = {
        fetchedAtIso: new Date().toISOString(),
        utf8Bytes: Buffer.byteLength(head, "utf8"),
        lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
        rawCharLength: head.length,
      };
      const backendMeta: Kota0ScribeBackendHeadMeta = {
        utf8Bytes: Buffer.byteLength(beHead, "utf8"),
        lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
        rawCharLength: beHead.length,
      };

      const ideationExtras = await buildKota0IdeationExtras(appId, head, appLatest);

      ctx.respond = false;
      const res = ctx.res;
      if (!res.headersSent) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
      }
      // SSE frames are tiny; disable Nagle so each `res.write` flushes to the
      // socket immediately instead of being batched until the connection closes
      // (which would make the whole stream look like a single end-of-turn dump).
      res.socket?.setNoDelay(true);
      // 2KB padding comment as the first frame defeats any front-proxy buffering
      // that waits for an initial byte threshold before forwarding chunks.
      try {
        res.write(`: ${" ".repeat(2048)}\n\n`);
      } catch {
        /* ignore — connection may have died already */
      }

      let ended = false;
      const safeEnd = (): void => {
        if (ended) return;
        ended = true;
        try {
          res.end();
        } catch {
          /* ignore */
        }
      };

      const writeSse = (obj: unknown): void => {
        if (ended) return;
        try {
          res.write(`data: ${JSON.stringify(obj)}\n\n`);
        } catch {
          safeEnd();
        }
      };

      void (async () => {
        try {
          const { ideationTurn, usedStub } = await runKota0MessageIdeation(
            incoming,
            { sfc: head, backend: beHead },
            scribeMeta,
            backendMeta,
            ideationExtras,
            text,
            (n, textDelta) => writeSse({ type: "delta", receivedChars: n, text: textDelta }),
          );
          const doneBody = await persistKota0AssistantTurn(appId, ideationTurn, usedStub);
          writeSse({ type: "done", ...doneBody });
        } catch (e) {
          writeSse({
            type: "error",
            message: e instanceof Error ? e.message : "unknown_error",
          });
        } finally {
          safeEnd();
        }
      })();
    } catch (e) {
      scribe503(ctx, scribeConnectHint(e));
    }
});

/**
 * Plan turn — persists the user's message, asks Gemini for a structured plan envelope,
 * persists the plan as a chat row with `kind: "plan"`, and returns the plan JSON to
 * the client. The apply turn is a separate request (see `/apply`) that the client
 * sends only after the user accepts the plan.
 */
router.post("/api/kota0/apps/:appId/plan", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const body = ctx.request.body as { text?: unknown; freshStart?: unknown };
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      ctx.status = 400;
      ctx.body = { error: "text_required" };
      return;
    }
    const freshStart = body?.freshStart === true;
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    if (freshStart) {
      // The user clicked Start Fresh. Persist a `fresh_start` marker so plan/apply
      // turns after this row know to drop prior conversation context.
      await chatRepo.appendMessage({
        appId,
        role: "user",
        content: "[Start fresh from here]",
        kind: "fresh_start",
      });
    }
    await chatRepo.appendMessage({ appId, role: "user", content: text });
    const persisted = await chatRepo.listByAppId(appId);
    const incoming: IncomingMessage[] = kota0ChatRowsToGeminiIncoming(persisted);

    const appLatest = await repo.getApp(appId);
    if (!appLatest) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    const head = appLatest.source;
    const beHead = appLatest.backendSource;
    const sfcMeta: Kota0ScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };
    const backendMeta: Kota0ScribeBackendHeadMeta = {
      utf8Bytes: Buffer.byteLength(beHead, "utf8"),
      lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
      rawCharLength: beHead.length,
    };
    const ideationExtras = await buildKota0IdeationExtras(appId, head, appLatest);

    // Prior revisions: 3 most recent from k0_app_history. Older turns are useful
    // signal for "what the user already accepted" — the plan model is told to
    // protect those features in `preserveExplicitly`.
    let priorRevisions: Kota0AppRevision[] = [];
    if (!freshStart) {
      try {
        const rowId = await repo.getScribeRowIdForApp(appId);
        if (rowId !== null) {
          const h = await listKota0AppRevisions(rowId, 3);
          if (h.ok) priorRevisions = h.revisions;
        }
      } catch {
        // Non-fatal — plan turn can run without prior revisions.
      }
    }

    const result = await runKota0PlanTurn({
      messages: incoming,
      heads: { sfc: head, backend: beHead },
      sfcMeta,
      backendMeta,
      extras: ideationExtras,
      priorRevisions,
      freshStart,
    });

    const plan = result.ok ? result.plan : result.stubPlan;
    const planContent = JSON.stringify(plan);
    await chatRepo.appendMessage({
      appId,
      role: "assistant",
      content: planContent,
      kind: "plan",
    });
    const rows = await chatRepo.listByAppId(appId);
    ctx.status = 200;
    ctx.body = {
      ok: result.ok,
      reason: result.ok ? null : result.reason,
      plan,
      messages: rows.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind: m.kind,
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

/**
 * Apply turn — runs Gemini with the accepted plan + current HEAD, parses the output
 * as patches (or a full-file rewrite when the plan demanded one), applies them, and
 * persists the resulting source via the usual update path. The assistant's textual
 * reply is appended as a normal chat message; the proposed sources are also
 * returned so the client can mirror the standard "Apply" UX.
 */
router.post("/api/kota0/apps/:appId/apply", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const body = ctx.request.body as { plan?: unknown; confirmationText?: unknown };
    const planParsed = Kota0PlanSchema.safeParse(body?.plan);
    if (!planParsed.success) {
      ctx.status = 400;
      ctx.body = { error: "invalid_plan", message: planParsed.error.message };
      return;
    }
    const plan = planParsed.data;
    const confirmationText =
      typeof body?.confirmationText === "string" ? body.confirmationText.trim() : "";

    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }

    if (confirmationText) {
      await chatRepo.appendMessage({
        appId,
        role: "user",
        content: confirmationText,
      });
    }

    const persistedBeforeApply = await chatRepo.listByAppId(appId);
    const chatForPhase: ChatMessage[] = persistedBeforeApply.map((m) => ({
      id: m.message_id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      kind: m.kind,
    }));
    const qaSincePlan = getQaTailSincePlan(chatForPhase);

    const head = app.source;
    const beHead = app.backendSource;
    const envHead = typeof app.bundleEnv === "string" ? app.bundleEnv : "";
    const sfcMeta: Kota0ScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };
    const backendMeta: Kota0ScribeBackendHeadMeta = {
      utf8Bytes: Buffer.byteLength(beHead, "utf8"),
      lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
      rawCharLength: beHead.length,
    };
    const ideationExtras = await buildKota0IdeationExtras(appId, head, app);

    const r = await runKota0ApplyTurn({
      heads: { sfc: head, backend: beHead },
      sfcMeta,
      backendMeta,
      extras: ideationExtras,
      plan,
      confirmationText: confirmationText || undefined,
      qaSincePlan,
    });
    if (!r.ok) {
      ctx.status = 502;
      ctx.body = { error: "apply_failed", message: r.reason };
      return;
    }

    const patchHead = { source: head, backendSource: beHead, bundleEnv: envHead };
    let patchResult = applyModelPatchText(r.text, patchHead);

    if (patchResult.fallbacks.length > 0) {
      const retry = await runKota0ApplyTurn({
        heads: { sfc: head, backend: beHead },
        sfcMeta,
        backendMeta,
        extras: ideationExtras,
        plan,
        confirmationText: confirmationText || undefined,
        qaSincePlan,
        retryHint: buildApplyRetryHint(patchResult.fallbacks),
      });
      if (retry.ok) {
        const retryResult = applyModelPatchText(retry.text, patchHead);
        patchResult = mergeApplyPatchRetry(patchHead, patchResult, retryResult);
      }
    }

    const nextSource = patchResult.source;
    const nextBackend = patchResult.backendSource;
    const nextEnv = patchResult.bundleEnv;
    const fallbacks = patchResult.fallbacks.map((f) => ({
      file: f.file,
      reason: f.reason,
      detail: f.detail,
    }));

    const sourceChanged = nextSource !== head;
    const backendChanged = nextBackend !== beHead;
    const envChanged = nextEnv !== envHead;

    if (sourceChanged || backendChanged || envChanged) {
      await repo.updateAppSources(appId, {
        source: nextSource,
        backendSource: nextBackend,
        ...(envChanged ? { bundleEnv: nextEnv } : {}),
      });
      await rematerializeIfPreviewLive(
        appId,
        nextSource,
        nextBackend,
        envChanged ? nextEnv : envHead,
      );
    }

    const assistantSummaryLines: string[] = [];
    assistantSummaryLines.push(`Applied: ${plan.intent || "(no intent)"}`);
    if (sourceChanged) assistantSummaryLines.push("- Updated App.vue");
    if (backendChanged) assistantSummaryLines.push("- Updated App.backend.ts");
    if (envChanged) assistantSummaryLines.push("- Updated bundle .env");
    if (fallbacks.length > 0) {
      assistantSummaryLines.push("");
      assistantSummaryLines.push("⚠ Some patches couldn't be applied cleanly:");
      for (const f of fallbacks) {
        assistantSummaryLines.push(`- ${f.file}: ${f.reason} — ${f.detail}`);
      }
    }
    await chatRepo.appendMessage({
      appId,
      role: "assistant",
      content: assistantSummaryLines.join("\n"),
    });

    const rows = await chatRepo.listByAppId(appId);
    const bundleEnvForFp =
      envChanged ? nextEnv
      : isAuthoritativeScribeBundleEnv(envHead) ? envHead
      : undefined;
    const bundleFingerprint = bundleMaterializeFingerprint(nextSource, nextBackend, bundleEnvForFp);
    ctx.status = 200;
    ctx.body = {
      ok: true,
      changed: { source: sourceChanged, backend: backendChanged, env: envChanged },
      fallbacks,
      bundleFingerprint,
      messages: rows.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind: m.kind,
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.delete("/api/kota0/apps/:appId/messages", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    await chatRepo.deleteAllForApp(appId);
    const messages = await chatRepo.listByAppId(appId);
    ctx.status = 200;
    ctx.body = {
      messages: messages.map((m) => ({
        id: m.message_id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        kind: m.kind,
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.get("/api/kota0/apps/:appId/source-revisions", async (ctx: RouterContext) => {
    if (!scribeGuard(ctx)) return;
    const appId = ctx.params.appId;
    if (!appId) {
      ctx.status = 400;
      ctx.body = { error: "app_id_required" };
      return;
    }
    try {
      const rowId = await repo.getScribeRowIdForApp(appId);
      if (rowId === null) {
        ctx.status = 404;
        ctx.body = { error: "app_not_found" };
        return;
      }
      const probe = await probeKota0AppSourceHistory(rowId);
      ctx.status = 200;
      ctx.body = probe;
    } catch (e) {
      scribe503(ctx, scribeConnectHint(e));
    }
});

/**
 * Build activity: aggregate Scribe time-travel rows per app, bucket by `date_modified` (etc.) per
 * source revision, last N local days. Does not add new Scribe state — read-only probes.
 */
router.get("/api/kota0/metrics/revision-activity", async (ctx: RouterContext) => {
    if (!scribeGuard(ctx)) return;
    const rawDays = (ctx.query as { days?: string }).days;
    const n =
      rawDays == null || rawDays === "" ? 14
      : (() => {
        const p = parseInt(String(rawDays), 10);
        if (!Number.isFinite(p) || p < 1) return 14;
        return Math.min(90, p);
      })();
    try {
      const list = await repo.listApps();
      const all: Date[] = [];
      let totalRevisions = 0;
      let appsWithHistory = 0;
      let usedRegistryFallback = false;
      for (const a of list) {
        const rowId = await repo.getScribeRowIdForApp(a.app_id);
        if (rowId === null) continue;
        const probe = await probeKota0AppSourceHistory(rowId);
        if (probe.supported !== true) continue;
        const revN = countHistoryRevisions(probe.data);
        if (revN === 0) continue;
        appsWithHistory += 1;
        totalRevisions += revN;
        const rawInstants = extractRevisionInstantsFromScribeHistoryBody(probe.data);
        const { all: withPad, usedRegistryFallback: pad } = fillMissingRevisionInstants(
          rawInstants,
          revN,
          a.updatedAt,
        );
        if (pad) usedRegistryFallback = true;
        all.push(...withPad);
      }
      const binnedRevisions = all.length;
      const { dayLabels, dayCounts } = bucketRevisionInstantsByLocalDay(all, n);
      ctx.status = 200;
      ctx.body = {
        dayLabels,
        dayCounts,
        days: n,
        totalRevisions,
        binnedRevisions,
        appsTotal: list.length,
        appsWithHistory,
        usedRegistryFallback,
      };
    } catch (e) {
      scribe503(ctx, scribeConnectHint(e));
    }
});

router.get("/api/kota0/apps/:appId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    // GET is a pure read now. Previously this materialized the bundle dir and
    // restarted the singleton Flight on :4000 as a side effect of opening an
    // app, which caused EADDRINUSE / preview-shows-wrong-app whenever the user
    // switched apps quickly. Preview is opt-in via `POST .../preview/start`.
    const bundleEnvResolved = isAuthoritativeScribeBundleEnv(app.bundleEnv)
      ? app.bundleEnv
      : await readBundleEnvFromDisk(appId);
    ctx.status = 200;
    ctx.body = {
      app: {
        ...app,
        ...(bundleEnvResolved !== undefined ? { bundleEnv: bundleEnvResolved } : {}),
      },
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.put("/api/kota0/apps/:appId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const body = ctx.request.body as {
      source?: unknown;
      backendSource?: unknown;
      bundleEnv?: unknown;
      sourceOrigin?: unknown;
    };
    const source = typeof body?.source === "string" ? body.source : null;
    const sourceOrigin =
      body.sourceOrigin === "manual_code_editor" ? "manual_code_editor"
      : body.sourceOrigin === "ai_apply" ? "ai_apply"
      : null;
    if (source === null) {
      ctx.status = 400;
      ctx.body = { error: "source_required" };
      return;
    }
    const previous = await repo.getApp(appId);
    if (!previous) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    let backendForStore: string;
    if (typeof body?.backendSource === "string") {
      backendForStore = body.backendSource;
    } else if (body?.backendSource === undefined) {
      backendForStore = previous.backendSource;
    } else {
      ctx.status = 400;
      ctx.body = { error: "backendSource_invalid" };
      return;
    }
    let bundleEnvForStore: string | undefined;
    if (body.bundleEnv === undefined) {
      bundleEnvForStore = undefined;
    } else if (typeof body.bundleEnv === "string") {
      bundleEnvForStore = body.bundleEnv;
    } else {
      ctx.status = 400;
      ctx.body = { error: "bundleEnv_invalid" };
      return;
    }
    if (bundleEnvForStore !== undefined) {
      const envLen = Buffer.from(bundleEnvForStore, "utf8").length;
      if (envLen > MAX_BUNDLE_ENV_BYTES) {
        ctx.status = 413;
        ctx.body = { error: "bundleEnv_too_large", maxBytes: MAX_BUNDLE_ENV_BYTES };
        return;
      }
    }
    const buf = Buffer.from(source, "utf8");
    if (buf.length > MAX_BYTES) {
      ctx.status = 413;
      ctx.body = { error: "source_too_large", maxBytes: MAX_BYTES };
      return;
    }
    const beBuf = Buffer.from(backendForStore, "utf8");
    if (beBuf.length > MAX_BYTES) {
      ctx.status = 413;
      ctx.body = { error: "backendSource_too_large", maxBytes: MAX_BYTES };
      return;
    }
    const beCheck = validateKota0AppBackendForFlight(backendForStore);
    if (!beCheck.ok) {
      ctx.status = 422;
      ctx.body = { error: "invalid_app_backend", message: beCheck.message };
      return;
    }
    const { errors: sfcErrors } = parseSfc(source, { filename: "App.vue" });
    if (sfcErrors.length > 0) {
      ctx.status = 422;
      ctx.body = {
        error: "invalid_sfc",
        message: sfcErrors.map((err) => err.message).join("\n"),
      };
      return;
    }
    const sourceForStore = sanitizeKota0AppSfcForTailwindVite(sanitizeChartJsModelArtifactsInAppVueSource(source));
    const { errors: sfcErrorsAfterSanitize } = parseSfc(sourceForStore, { filename: "App.vue" });
    if (sfcErrorsAfterSanitize.length > 0) {
      ctx.status = 422;
      ctx.body = {
        error: "invalid_sfc",
        message: sfcErrorsAfterSanitize.map((err) => err.message).join("\n"),
      };
      return;
    }
    const storedBuf = Buffer.from(sourceForStore, "utf8");
    if (storedBuf.length > MAX_BYTES) {
      ctx.status = 413;
      ctx.body = { error: "source_too_large", maxBytes: MAX_BYTES };
      return;
    }
    let full = await repo.updateAppSources(appId, {
      source: sourceForStore,
      backendSource: backendForStore,
      ...(bundleEnvForStore !== undefined ? { bundleEnv: bundleEnvForStore } : {}),
    });
    if (full.status !== "active") {
      full = await repo.updateAppMeta(appId, { status: "active" });
    }
    // Only rebuild the bundle if the user is currently previewing this app.
    // Otherwise we'd respawn :4000 for a hidden app on every save and undo the
    // opt-in-preview UX.
    if (await isBundleFlightServingApp(appId)) {
      await queueMaterializeForApp(appId, full.source, full.backendSource, full.bundleEnv);
    }
    if (sourceOrigin === "manual_code_editor") {
      try {
        await chatRepo.appendMessage({
          appId,
          role: "system",
          content: "App.vue, App.backend.ts, and bundle `.env` (when saved) were updated from the Code tab.",
        });
      } catch {
        /* non-fatal: source already persisted */
      }
    } else if (sourceOrigin === "ai_apply") {
      try {
        const appliedSecrets = bundleEnvForStore !== undefined;
        await chatRepo.appendMessage({
          appId,
          role: "system",
          content:
            appliedSecrets ?
              "App.vue, App.backend.ts, and/or bundle `.env` were updated from the AI panel."
            : "App.vue and/or App.backend.ts were updated from the AI panel.",
        });
      } catch {
        /* non-fatal: source already persisted */
      }
    }
    ctx.status = 200;
    const bundleEnvForFp = isAuthoritativeScribeBundleEnv(full.bundleEnv) ? full.bundleEnv : undefined;
    const bundleFingerprint = bundleMaterializeFingerprint(
      full.source,
      full.backendSource,
      bundleEnvForFp,
    );
    ctx.body = {
      ok: true,
      path: "app/src/components/kota0/viewer/generated/App.vue",
      backendPath: `bundles/${appId}/App.backend.ts`,
      bundleDir: `bundles/${appId}`,
      bytes: storedBuf.length,
      backendBytes: beBuf.length,
      bundleFingerprint,
      app: full,
    };
  } catch (e) {
    if (e instanceof Error && e.message === "app_not_found") {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.delete("/api/kota0/apps/:appId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const existing = await repo.getApp(appId);
    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    const bundleKeys = mergeScribeBundleComponentManifest(
      existing.scribe_bundle_components,
      extractKota0BackendScribeKeys(existing.backendSource),
    );
    await purgeKota0BundleScribeComponents(scribe, bundleKeys);
    await chatRepo.deleteAllForApp(appId);
    await repo.deleteApp(appId);
    await scribeKeyRegistry.revoke(appId);
    await clearMaterializedDiskIfLastWas(appId);
    forgetKota0BundleNpmState(appId);
    try {
      await rm(resolveKota0BundleDir(appId), { recursive: true, force: true });
    } catch (e) {
      console.warn("[kota0] bundle dir cleanup:", resolveKota0BundleDir(appId), e);
    }
    ctx.status = 200;
    ctx.body = { ok: true, deleted: appId };
  } catch (e) {
    if (e instanceof Error && e.message === "app_not_found") {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.patch("/api/kota0/apps/:appId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const body = ctx.request.body as { name?: unknown; status?: unknown; app_icon?: unknown };
    const name = typeof body.name === "string" ? body.name : undefined;
    const statusRaw = body.status;
    const status =
      statusRaw === "draft" || statusRaw === "active" || statusRaw === "applied" || statusRaw === "error" ?
        (statusRaw as Kota0AppStatus)
      : undefined;
    const app_icon_raw = body.app_icon;
    const app_icon = typeof app_icon_raw === "string" ? app_icon_raw.trim() : undefined;
    if (app_icon !== undefined && !isKota0AppIconId(app_icon)) {
      ctx.status = 400;
      ctx.body = { error: "invalid_app_icon" };
      return;
    }
    if (name === undefined && status === undefined && app_icon === undefined) {
      ctx.status = 400;
      ctx.body = { error: "name_status_or_app_icon_required" };
      return;
    }
    const full = await repo.updateAppMeta(appId, { name, status, app_icon });
    ctx.status = 200;
    ctx.body = { app: full };
  } catch (e) {
    if (e instanceof Error && e.message === "app_not_found") {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    if (e instanceof Error && e.message === "invalid_app_icon") {
      ctx.status = 400;
      ctx.body = { error: "invalid_app_icon" };
      return;
    }
    scribe503(ctx, scribeConnectHint(e));
  }
});

// ----- Deploy routes (Phase 1: local Docker target) -----

router.post("/api/kota0/apps/:appId/deploy", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const app = await repo.getApp(appId);
    if (!app) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    const deployment = await runDeploy(appId, { repo: deploymentRepo, target: localDockerTarget });
    ctx.status = 201;
    ctx.body = { deployment };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    ctx.status = 500;
    ctx.body = { error: "deploy_failed", message };
  }
});

router.get("/api/kota0/apps/:appId/deployments", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    const deployments = await deploymentRepo.listForApp(appId);
    ctx.status = 200;
    ctx.body = { deployments };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.delete("/api/kota0/deployments/:deploymentId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const deploymentId = ctx.params.deploymentId;
  if (!deploymentId) {
    ctx.status = 400;
    ctx.body = { error: "deployment_id_required" };
    return;
  }
  try {
    const deployment = await destroyDeployment(deploymentId, {
      repo: deploymentRepo,
      target: localDockerTarget,
    });
    ctx.status = 200;
    ctx.body = { deployment };
  } catch (e) {
    if (e instanceof Error && e.message === "deployment_not_found") {
      ctx.status = 404;
      ctx.body = { error: "deployment_not_found" };
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    ctx.status = 500;
    ctx.body = { error: "destroy_failed", message };
  }
});

export default router.routes();

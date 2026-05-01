/**
 * PowerVibe apps: Scribe is source of truth. Active app runs from `bundles/<appId>/` (Flight prod on port 4000).
 * `viewer/generated/App.vue` mirrors the SFC for workspace tooling; per-app `App.backend.ts` is **not** on platform Flight.
 * Chat: `nvibe_chat_message`.
 */
import Router, { type RouterContext } from "@koa/router";
import { createHash } from "node:crypto";
import { parse as parseSfc } from "@vue/compiler-sfc";
import dotenv from "dotenv";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { isAxiosError } from "axios";
import { getScribeUrl, isScribeConfigured } from "@/lib/scribe";
import type { IncomingMessage } from "@/components/powervibe/ai/plan/planRun";
import {
  POWERVIBE_TRANSCRIBE_MAX_BASE64_CHARS,
  POWERVIBE_TRANSCRIBE_MAX_BYTES,
  resolvePowervibeTranscribeMimeRoot,
  transcribePowervibeAudioWithGemini,
} from "@/components/powervibe/ai/geminiTranscribeAudio";
import {
  bundleEnvKeyNamesFromText,
  formatPowervibeIdeationToMarkdown,
  type PowervibeIdeationSystemExtras,
  type PowervibeScribeBackendHeadMeta,
  type PowervibeScribeHeadMeta,
  runPowervibeIdeationTurn,
  runPowervibeIdeationTurnStreaming,
  stubPowervibeIdeationTurn,
} from "@/components/powervibe/ai/plan/powervibeIdeationRun";
import { buildPowervibeSfcHeadOutline } from "@/components/powervibe/viewer/powervibeSfcHeadOutline";
import { getPowervibeWorkspaceDepsSummary } from "@/components/powervibe/viewer/powervibeWorkspaceDepsSummary";
import { ScribePowervibeAppRepository } from "@/components/powervibe/apps/ScribePowervibeAppRepository";
import { ScribePowervibeChatRepository } from "@/components/powervibe/ai/ScribePowervibeChatRepository";
import { powervibeChatRowsToGeminiIncoming } from "@/components/powervibe/ai/powervibeChatForModel";
import { probePowervibeAppSourceHistory } from "@/components/powervibe/ai/scribePowervibeHistory";
import {
  bucketRevisionInstantsByLocalDay,
  countHistoryRevisions,
  extractRevisionInstantsFromScribeHistoryBody,
  fillMissingRevisionInstants,
} from "@/components/powervibe/ai/scribePowervibeRevisionActivity";
import { sanitizeChartJsModelArtifactsInAppVueSource } from "@/components/powervibe/deploy/powervibeAppVueChartSanitize.ts";
import { writePowervibeAppBundle } from "@/components/powervibe/deploy/writePowervibeAppBundle";
import {
  getFlightConsoleRecent,
  subscribeFlightConsole,
} from "@/components/powervibe/deploy/powervibeConsoleLogHub";
import {
  isBundleFlightUpForApp,
  restartPowervibeBundle,
  stopPowervibeBundleAsync,
} from "@/components/powervibe/deploy/powervibeBundleRunner";
import { resolvePowervibeBundleDir } from "@/components/powervibe/deploy/powervibeBundlePaths";
import {
  DEFAULT_POWERVIBE_BACKEND,
  DEFAULT_POWERVIBE_SFC,
  GENERATED_DIR,
  MATERIALIZED_APP_BACKEND,
  MATERIALIZED_APP_VUE,
  mirrorPowervibeGeneratedAppVue,
  normalizePowervibeAppVueLeadingSlashApis,
  resolvePowervibeRepoRoot,
  unlinkPowervibeGeneratedAppBackend,
} from "@/components/powervibe/viewer/powervibeMaterialize";
import {
  isLegacySeededWelcomeMessage,
  normalizeForPowervibeLegacyMatch,
} from "@shared/powervibeLegacyWelcome.ts";
import { validatePowervibeAppBackendForFlight } from "@/components/powervibe/viewer/powervibeAppBackendForFlight";
import { sanitizePowervibeAppSfcForTailwindVite } from "@/components/powervibe/viewer/powervibeSfcTailwindSanitize";
import { isPowervibeAppIconId } from "@/components/powervibe/apps/powervibeAppIconIds";
import type { PowervibeAppFull, PowervibeAppStatus } from "@/components/powervibe/apps/powervibeAppTypes";
import { extractTsFenceFromMarkdown } from "@shared/powervibeExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/powervibeExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/powervibeExtractVueFence.ts";
import type { PowervibeIdeationTurn } from "@shared/powervibeIdeationTurn.ts";

dotenv.config({ path: path.join(process.cwd(), ".env"), override: false, quiet: true });

const MIB = 1024 * 1024;

/** UTF-8 byte cap for `source` on PUT. Override with `POWERVIBE_APP_SOURCE_MAX_BYTES` (clamped 64 KiB–200 MiB). */
function resolveMaxSourceBytes(): number {
  const raw = process.env.POWERVIBE_APP_SOURCE_MAX_BYTES?.trim();
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
    const raw = await readFile(path.join(resolvePowervibeBundleDir(appId), ".env"), "utf8");
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

async function buildPowervibeIdeationExtras(appId: string, head: string, app: PowervibeAppFull): Promise<PowervibeIdeationSystemExtras> {
  const workspaceDepsSummary = getPowervibeWorkspaceDepsSummary();
  const headOutline = buildPowervibeSfcHeadOutline(head);
  let envText: string;
  if (isAuthoritativeScribeBundleEnv(app.bundleEnv)) {
    envText = app.bundleEnv;
  } else {
    envText = (await readBundleEnvFromDisk(appId)) ?? "";
  }
  const keys = bundleEnvKeyNamesFromText(envText);
  return {
    workspaceDepsSummary,
    headOutline,
    bundleEnvKeyNames: keys.length > 0 ? keys : null,
  };
}

/** Prefer JSON / turn field, else ```vue in assistant text; only return parse-valid SFC. */
function coerceProposedAppVue(turn: PowervibeIdeationTurn): string | null {
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

function coerceProposedAppBackend(turn: PowervibeIdeationTurn): string | null {
  const raw = turn.proposedAppBackend;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractTsFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

function coerceProposedBundleEnv(turn: PowervibeIdeationTurn): string | null {
  const raw = turn.proposedBundleEnv;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractEnvFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

type PowervibeClientChatRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

type PowervibePostMessagesBody = {
  usedStub: boolean;
  lastPowervibeTurn: {
    proposedAppVue: string | null;
    proposedAppBackend: string | null;
    proposedBundleEnv: string | null;
  };
  messages: PowervibeClientChatRow[];
};

async function persistPowervibeAssistantTurn(
  appId: string,
  ideationTurn: PowervibeIdeationTurn,
  usedStub: boolean,
): Promise<PowervibePostMessagesBody> {
  const proposed = coerceProposedAppVue(ideationTurn);
  const proposedBe = coerceProposedAppBackend(ideationTurn);
  const proposedEnv = coerceProposedBundleEnv(ideationTurn);
  const assistantMarkdown = formatPowervibeIdeationToMarkdown({
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
    lastPowervibeTurn: {
      proposedAppVue: proposed,
      proposedAppBackend: proposedBe,
      proposedBundleEnv: proposedEnv,
    },
    messages: rows.map((m) => ({
      id: m.message_id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}

async function runPowervibeMessageIdeation(
  incoming: IncomingMessage[],
  heads: { sfc: string; backend: string },
  sfcMeta: PowervibeScribeHeadMeta,
  backendMeta: PowervibeScribeBackendHeadMeta,
  extras: PowervibeIdeationSystemExtras,
  userTextForStub: string,
  onStreamDelta?: (receivedChars: number) => void,
): Promise<{ ideationTurn: PowervibeIdeationTurn; usedStub: boolean }> {
  let ideationTurn: PowervibeIdeationTurn;
  let usedStub = false;
  try {
    if (onStreamDelta) {
      ideationTurn = await runPowervibeIdeationTurnStreaming(
        incoming,
        heads,
        sfcMeta,
        backendMeta,
        extras,
        onStreamDelta,
      );
    } else {
      ideationTurn = await runPowervibeIdeationTurn(incoming, heads, sfcMeta, backendMeta, extras);
    }
  } catch (e) {
    usedStub = true;
    const reason = e instanceof Error ? e.message : "unknown_error";
    const stub = stubPowervibeIdeationTurn(userTextForStub);
    ideationTurn = {
      ...stub,
      assistantMessage: `_(Ideation service unavailable: ${reason}. Showing a template reply.)_\n\n${stub.assistantMessage}`,
    };
  }
  return { ideationTurn, usedStub };
}

const repo = new ScribePowervibeAppRepository();
const chatRepo = new ScribePowervibeChatRepository();

/** Tracks which app’s head was last written to the single materialized App.vue (for delete cleanup). */
let lastMaterializedAppId: string | null = null;

/** Last successful bundle materialization fingerprint per app — avoids redundant vite build + Flight restart on repeat GET. */
const lastMaterializedBundleFingerprint = new Map<string, string>();

/** Which app’s `bundles/<id>/` the singleton bundle Flight process was started with (port from that app’s `.env`). */
let bundleFlightServingAppId: string | null = null;

/** Stable hash of inputs that {@link materializeForApp} writes (normalized SFC + backend + optional env layer). */
function bundleVueSourceForMaterialize(source: string): string {
  return sanitizeChartJsModelArtifactsInAppVueSource(normalizePowervibeAppVueLeadingSlashApis(source));
}

function bundleMaterializeFingerprint(
  source: string,
  backendSource: string,
  bundleEnv: string | undefined,
): string {
  const vueSource = bundleVueSourceForMaterialize(source);
  const layer = bundleEnvForMaterialize(bundleEnv);
  const envPart = layer !== undefined ? layer : "";
  const payload = `${vueSource}\0${backendSource}\0${envPart}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
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
  const vueSource = bundleVueSourceForMaterialize(source);
  const scribeUserEnv = bundleEnvForMaterialize(bundleEnv);
  await writePowervibeAppBundle({
    appId,
    source: vueSource,
    backendSource,
    ...(scribeUserEnv !== undefined ? { bundleEnv: scribeUserEnv } : {}),
  });
  await mirrorPowervibeGeneratedAppVue(vueSource);
  await unlinkPowervibeGeneratedAppBackend();
  lastMaterializedAppId = appId;
  /**
   * Must complete before GET/POST/PUT return: the client remounts the preview iframe as soon as
   * the API responds. If restart were deferred, the iframe often hit a dead port, stale dist, or a
   * mid-restart server — blank preview.
   */
  try {
    await restartPowervibeBundle(appId);
  } catch (e: unknown) {
    console.error("[powervibe-bundle] restart failed:", e instanceof Error ? e.message : e);
    throw e;
  }
  lastMaterializedBundleFingerprint.set(
    appId,
    bundleMaterializeFingerprint(source, backendSource, bundleEnv),
  );
  bundleFlightServingAppId = appId;
}

async function clearMaterializedDiskIfLastWas(appId: string): Promise<void> {
  lastMaterializedBundleFingerprint.delete(appId);
  if (bundleFlightServingAppId === appId) {
    bundleFlightServingAppId = null;
  }
  if (lastMaterializedAppId === appId) {
    await mirrorPowervibeGeneratedAppVue(DEFAULT_POWERVIBE_SFC);
    await unlinkPowervibeGeneratedAppBackend();
    lastMaterializedAppId = null;
    await stopPowervibeBundleAsync();
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
  const normHash = createHash("sha256").update(normalizeForPowervibeLegacyMatch(t), "utf8").digest("hex");
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
router.get("/api/powervibe/diagnostics", async (ctx: RouterContext) => {
  const root = resolvePowervibeRepoRoot();
  const vue = MATERIALIZED_APP_VUE;
  const be = MATERIALIZED_APP_BACKEND;
  const bundleDir = lastMaterializedAppId ? resolvePowervibeBundleDir(lastMaterializedAppId) : null;
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
    activePowervibeBundleAppId: lastMaterializedAppId,
    powervibeBundleDir: bundleDir,
    powervibeBundlePreviewOrigin: "http://127.0.0.1:4000",
    scribeConfigured: isScribeConfigured(),
    scribeUrl: isScribeConfigured() ? getScribeUrl() : null,
    hint:
      "Per-app preview: bundle Flight on port 4000 (`bundles/<appId>/`). Platform Flight does not load `viewer/generated/App.backend.ts`. If chat returns 404, restart `npm run start:app`. If 503, run `npm run start:docker` and check SCRIBE_URL.",
  };
});

/** SSE: bundle Flight stdout/stderr (in-memory ring buffer; no Scribe required). */
router.get("/api/powervibe/console/stream", async (ctx: RouterContext) => {
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

/** Workspace mic → Gemini transcription for PowerVibe AI prompt (same env as ideation). */
router.post("/api/powervibe/transcribe-audio", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const body = ctx.request.body as { audioBase64?: unknown; mimeType?: unknown };
    const mimeRaw = typeof body?.mimeType === "string" ? body.mimeType : "";
    const mimeRoot = resolvePowervibeTranscribeMimeRoot(mimeRaw);
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
    if (b64.length > POWERVIBE_TRANSCRIBE_MAX_BASE64_CHARS) {
      ctx.status = 413;
      ctx.body = {
        error: "payload_too_large",
        message: `Audio exceeds ${POWERVIBE_TRANSCRIBE_MAX_BYTES} bytes after decoding.`,
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
    if (buf.length > POWERVIBE_TRANSCRIBE_MAX_BYTES) {
      ctx.status = 413;
      ctx.body = {
        error: "payload_too_large",
        message: `Audio exceeds ${POWERVIBE_TRANSCRIBE_MAX_BYTES} bytes.`,
      };
      return;
    }
    const text = await transcribePowervibeAudioWithGemini(buf, mimeRoot);
    ctx.status = 200;
    ctx.body = { text };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown_error";
    ctx.status = 502;
    ctx.body = { error: "transcription_failed", message };
  }
});

router.get("/api/powervibe/apps", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const apps = await repo.listApps();
    ctx.status = 200;
    ctx.body = { apps };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/powervibe/apps", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const body = ctx.request.body as { name?: unknown };
    const name = typeof body?.name === "string" ? body.name : "New app";
    /** Never seed from materialized on-disk files — they belong to whichever app was last active. */
    const full = await repo.createApp({
      name,
      source: DEFAULT_POWERVIBE_SFC,
      backendSource: DEFAULT_POWERVIBE_BACKEND,
    });
    await materializeForApp(full.app_id, full.source, full.backendSource, full.bundleEnv);
    ctx.status = 201;
    ctx.body = { app: full };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.get("/api/powervibe/apps/:appId/messages", async (ctx: RouterContext) => {
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
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/powervibe/apps/:appId/messages", async (ctx: RouterContext) => {
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
    const incoming: IncomingMessage[] = powervibeChatRowsToGeminiIncoming(persisted);

    const appLatest = await repo.getApp(appId);
    if (!appLatest) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }

    const head = appLatest.source;
    const beHead = appLatest.backendSource;
    const scribeMeta: PowervibeScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };
    const backendMeta: PowervibeScribeBackendHeadMeta = {
      utf8Bytes: Buffer.byteLength(beHead, "utf8"),
      lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
      rawCharLength: beHead.length,
    };

    const ideationExtras = await buildPowervibeIdeationExtras(appId, head, appLatest);

    const { ideationTurn, usedStub } = await runPowervibeMessageIdeation(
      incoming,
      { sfc: head, backend: beHead },
      scribeMeta,
      backendMeta,
      ideationExtras,
      text,
    );

    ctx.status = 200;
    ctx.body = await persistPowervibeAssistantTurn(appId, ideationTurn, usedStub);
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post("/api/powervibe/apps/:appId/messages/stream", async (ctx: RouterContext) => {
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
      const incoming: IncomingMessage[] = powervibeChatRowsToGeminiIncoming(persisted);

      const appLatest = await repo.getApp(appId);
      if (!appLatest) {
        ctx.status = 404;
        ctx.body = { error: "app_not_found" };
        return;
      }

      const head = appLatest.source;
      const beHead = appLatest.backendSource;
      const scribeMeta: PowervibeScribeHeadMeta = {
        fetchedAtIso: new Date().toISOString(),
        utf8Bytes: Buffer.byteLength(head, "utf8"),
        lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
        rawCharLength: head.length,
      };
      const backendMeta: PowervibeScribeBackendHeadMeta = {
        utf8Bytes: Buffer.byteLength(beHead, "utf8"),
        lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
        rawCharLength: beHead.length,
      };

      const ideationExtras = await buildPowervibeIdeationExtras(appId, head, appLatest);

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
          const { ideationTurn, usedStub } = await runPowervibeMessageIdeation(
            incoming,
            { sfc: head, backend: beHead },
            scribeMeta,
            backendMeta,
            ideationExtras,
            text,
            (n) => writeSse({ type: "delta", receivedChars: n }),
          );
          const doneBody = await persistPowervibeAssistantTurn(appId, ideationTurn, usedStub);
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

router.delete("/api/powervibe/apps/:appId/messages", async (ctx: RouterContext) => {
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
      })),
    };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.get("/api/powervibe/apps/:appId/source-revisions", async (ctx: RouterContext) => {
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
      const probe = await probePowervibeAppSourceHistory(rowId);
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
router.get("/api/powervibe/metrics/revision-activity", async (ctx: RouterContext) => {
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
        const probe = await probePowervibeAppSourceHistory(rowId);
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

router.get("/api/powervibe/apps/:appId", async (ctx: RouterContext) => {
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
    const fp = bundleMaterializeFingerprint(app.source, app.backendSource, app.bundleEnv);
    const fingerprintHit = lastMaterializedBundleFingerprint.get(appId) === fp;
    if (!fingerprintHit) {
      await materializeForApp(appId, app.source, app.backendSource, app.bundleEnv);
    } else {
      const servingThisApp = bundleFlightServingAppId === appId;
      const bundleUp = servingThisApp ? await isBundleFlightUpForApp(appId) : false;
      if (!servingThisApp || !bundleUp) {
        await restartPowervibeBundle(appId, { skipViteBuild: true });
        bundleFlightServingAppId = appId;
      }
    }
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

router.put("/api/powervibe/apps/:appId", async (ctx: RouterContext) => {
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
    const beCheck = validatePowervibeAppBackendForFlight(backendForStore);
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
    const sourceForStore = sanitizePowervibeAppSfcForTailwindVite(sanitizeChartJsModelArtifactsInAppVueSource(source));
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
    await materializeForApp(appId, full.source, full.backendSource, full.bundleEnv);
    if (sourceOrigin === "manual_code_editor") {
      try {
        await chatRepo.appendMessage({
          appId,
          role: "system",
          content:
            "App.vue, App.backend.ts, and bundle `.env` (when saved) were applied from the Code tab (Scribe head updated).",
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
              "App.vue and/or App.backend.ts and/or bundle Secrets (`.env`) were applied from the AI panel (Scribe head updated)."
            : "App.vue and/or App.backend.ts were applied from the AI panel (Scribe head updated).",
        });
      } catch {
        /* non-fatal: source already persisted */
      }
    }
    ctx.status = 200;
    ctx.body = {
      ok: true,
      path: "app/src/components/powervibe/viewer/generated/App.vue",
      backendPath: `bundles/${appId}/App.backend.ts`,
      bundleDir: `bundles/${appId}`,
      bytes: storedBuf.length,
      backendBytes: beBuf.length,
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

router.delete("/api/powervibe/apps/:appId", async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  try {
    await chatRepo.deleteAllForApp(appId);
    await repo.deleteApp(appId);
    await clearMaterializedDiskIfLastWas(appId);
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

router.patch("/api/powervibe/apps/:appId", async (ctx: RouterContext) => {
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
        (statusRaw as PowervibeAppStatus)
      : undefined;
    const app_icon_raw = body.app_icon;
    const app_icon = typeof app_icon_raw === "string" ? app_icon_raw.trim() : undefined;
    if (app_icon !== undefined && !isPowervibeAppIconId(app_icon)) {
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

export default router.routes();

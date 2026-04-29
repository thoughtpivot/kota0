/**
 * nVibe apps: Scribe is source of truth. Active app runs from `bundles/<appId>/` (Flight prod on port 4000).
 * `viewer/generated/App.vue` mirrors the SFC for workspace tooling; per-app `App.backend.ts` is **not** on platform Flight.
 * Chat: `nvibe_chat_message`.
 */
import Router, { type RouterContext } from "@koa/router";
import { createHash } from "node:crypto";
import { parse as parseSfc } from "@vue/compiler-sfc";
import dotenv from "dotenv";
import { access, constants, readFile } from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { isAxiosError } from "axios";
import { getScribeUrl, isScribeConfigured } from "@/lib/scribe";
import type { IncomingMessage } from "@/components/nvibe/ai/plan/planRun";
import {
  bundleEnvKeyNamesFromText,
  formatNvibeIdeationToMarkdown,
  type NvibeIdeationSystemExtras,
  type NvibeScribeBackendHeadMeta,
  type NvibeScribeHeadMeta,
  runNvibeIdeationTurn,
  runNvibeIdeationTurnStreaming,
  stubNvibeIdeationTurn,
} from "@/components/nvibe/ai/plan/nvibeIdeationRun";
import { buildNvibeSfcHeadOutline } from "@/components/nvibe/viewer/nvibeSfcHeadOutline";
import { getNvibeWorkspaceDepsSummary } from "@/components/nvibe/viewer/nvibeWorkspaceDepsSummary";
import { ScribeNvibeAppRepository } from "@/components/nvibe/apps/ScribeNvibeAppRepository";
import { ScribeNvibeChatRepository } from "@/components/nvibe/ai/ScribeNvibeChatRepository";
import { nvibeChatRowsToGeminiIncoming } from "@/components/nvibe/ai/nvibeChatForModel";
import { probeNvibeAppSourceHistory } from "@/components/nvibe/ai/scribeNvibeHistory";
import {
  bucketRevisionInstantsByLocalDay,
  countHistoryRevisions,
  extractRevisionInstantsFromScribeHistoryBody,
  fillMissingRevisionInstants,
} from "@/components/nvibe/ai/scribeNvibeRevisionActivity";
import { writeNvibeAppBundle } from "@/components/nvibe/deploy/writeNvibeAppBundle";
import {
  getFlightConsoleRecent,
  subscribeFlightConsole,
} from "@/components/nvibe/deploy/nvibeConsoleLogHub";
import { restartNvibeBundle, stopNvibeBundleAsync } from "@/components/nvibe/deploy/nvibeBundleRunner";
import { resolveNvibeBundleDir } from "@/components/nvibe/deploy/nvibeBundlePaths";
import {
  DEFAULT_NVIBE_BACKEND,
  DEFAULT_NVIBE_SFC,
  GENERATED_DIR,
  MATERIALIZED_APP_BACKEND,
  MATERIALIZED_APP_VUE,
  mirrorNvibeGeneratedAppVue,
  normalizeNvibeAppVueLeadingSlashApis,
  resolveNvibeRepoRoot,
  unlinkNvibeGeneratedAppBackend,
} from "@/components/nvibe/viewer/nvibeMaterialize";
import {
  isLegacySeededWelcomeMessage,
  normalizeForNvibeLegacyMatch,
} from "@shared/nvibeLegacyWelcome.ts";
import { validateNvibeAppBackendForFlight } from "@/components/nvibe/viewer/nvibeAppBackendForFlight";
import { sanitizeNvibeAppSfcForTailwindVite } from "@/components/nvibe/viewer/nvibeSfcTailwindSanitize";
import { isNvibeAppIconId } from "@/components/nvibe/apps/nvibeAppIconIds";
import type { NvibeAppFull, NvibeAppStatus } from "@/components/nvibe/apps/nvibeAppTypes";
import { extractTsFenceFromMarkdown } from "@shared/nvibeExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/nvibeExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/nvibeExtractVueFence.ts";
import type { NvibeIdeationTurn } from "@shared/nvibeIdeationTurn.ts";

dotenv.config({ path: path.join(process.cwd(), ".env"), override: false, quiet: true });

const MIB = 1024 * 1024;

/** UTF-8 byte cap for `source` on PUT. Override with `NVIBE_APP_SOURCE_MAX_BYTES` (clamped 64 KiB–200 MiB). */
function resolveMaxSourceBytes(): number {
  const raw = process.env.NVIBE_APP_SOURCE_MAX_BYTES?.trim();
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
    const raw = await readFile(path.join(resolveNvibeBundleDir(appId), ".env"), "utf8");
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

async function buildNvibeIdeationExtras(appId: string, head: string, app: NvibeAppFull): Promise<NvibeIdeationSystemExtras> {
  const workspaceDepsSummary = getNvibeWorkspaceDepsSummary();
  const headOutline = buildNvibeSfcHeadOutline(head);
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
function coerceProposedAppVue(turn: NvibeIdeationTurn): string | null {
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

function coerceProposedAppBackend(turn: NvibeIdeationTurn): string | null {
  const raw = turn.proposedAppBackend;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractTsFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

function coerceProposedBundleEnv(turn: NvibeIdeationTurn): string | null {
  const raw = turn.proposedBundleEnv;
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  const fenced = extractEnvFenceFromMarkdown(turn.assistantMessage);
  if (fenced && fenced.trim().length > 0) return fenced.trim();
  return null;
}

type NvibeClientChatRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

type NvibePostMessagesBody = {
  usedStub: boolean;
  lastNvibeTurn: {
    proposedAppVue: string | null;
    proposedAppBackend: string | null;
    proposedBundleEnv: string | null;
  };
  messages: NvibeClientChatRow[];
};

async function persistNvibeAssistantTurn(
  appId: string,
  ideationTurn: NvibeIdeationTurn,
  usedStub: boolean,
): Promise<NvibePostMessagesBody> {
  const proposed = coerceProposedAppVue(ideationTurn);
  const proposedBe = coerceProposedAppBackend(ideationTurn);
  const proposedEnv = coerceProposedBundleEnv(ideationTurn);
  const assistantMarkdown = formatNvibeIdeationToMarkdown({
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
    lastNvibeTurn: {
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

async function runNvibeMessageIdeation(
  incoming: IncomingMessage[],
  heads: { sfc: string; backend: string },
  sfcMeta: NvibeScribeHeadMeta,
  backendMeta: NvibeScribeBackendHeadMeta,
  extras: NvibeIdeationSystemExtras,
  userTextForStub: string,
  onStreamDelta?: (receivedChars: number) => void,
): Promise<{ ideationTurn: NvibeIdeationTurn; usedStub: boolean }> {
  let ideationTurn: NvibeIdeationTurn;
  let usedStub = false;
  try {
    if (onStreamDelta) {
      ideationTurn = await runNvibeIdeationTurnStreaming(
        incoming,
        heads,
        sfcMeta,
        backendMeta,
        extras,
        onStreamDelta,
      );
    } else {
      ideationTurn = await runNvibeIdeationTurn(incoming, heads, sfcMeta, backendMeta, extras);
    }
  } catch (e) {
    usedStub = true;
    const reason = e instanceof Error ? e.message : "unknown_error";
    const stub = stubNvibeIdeationTurn(userTextForStub);
    ideationTurn = {
      ...stub,
      assistantMessage: `_(Ideation service unavailable: ${reason}. Showing a template reply.)_\n\n${stub.assistantMessage}`,
    };
  }
  return { ideationTurn, usedStub };
}

const repo = new ScribeNvibeAppRepository();
const chatRepo = new ScribeNvibeChatRepository();

/** Tracks which app’s head was last written to the single materialized App.vue (for delete cleanup). */
let lastMaterializedAppId: string | null = null;

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
  const vueSource = normalizeNvibeAppVueLeadingSlashApis(source);
  const scribeUserEnv = bundleEnvForMaterialize(bundleEnv);
  await writeNvibeAppBundle({
    appId,
    source: vueSource,
    backendSource,
    ...(scribeUserEnv !== undefined ? { bundleEnv: scribeUserEnv } : {}),
  });
  await mirrorNvibeGeneratedAppVue(vueSource);
  await unlinkNvibeGeneratedAppBackend();
  lastMaterializedAppId = appId;
  /**
   * Must complete before GET/POST/PUT return: the client remounts the preview iframe as soon as
   * the API responds. If restart were deferred, the iframe often hit a dead port, stale dist, or a
   * mid-restart server — blank preview.
   */
  try {
    await restartNvibeBundle(appId);
  } catch (e: unknown) {
    console.error("[nvibe-bundle] restart failed:", e instanceof Error ? e.message : e);
    throw e;
  }
}

async function clearMaterializedDiskIfLastWas(appId: string): Promise<void> {
  if (lastMaterializedAppId === appId) {
    await mirrorNvibeGeneratedAppVue(DEFAULT_NVIBE_SFC);
    await unlinkNvibeGeneratedAppBackend();
    lastMaterializedAppId = null;
    await stopNvibeBundleAsync();
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
  const normHash = createHash("sha256").update(normalizeForNvibeLegacyMatch(t), "utf8").digest("hex");
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
router.get(["/nvibe/diagnostics", "/api/nvibe/diagnostics"], async (ctx: RouterContext) => {
  const root = resolveNvibeRepoRoot();
  const vue = MATERIALIZED_APP_VUE;
  const be = MATERIALIZED_APP_BACKEND;
  const bundleDir = lastMaterializedAppId ? resolveNvibeBundleDir(lastMaterializedAppId) : null;
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
    activeNvibeBundleAppId: lastMaterializedAppId,
    nvibeBundleDir: bundleDir,
    nvibeBundlePreviewOrigin: "http://127.0.0.1:4000",
    scribeConfigured: isScribeConfigured(),
    scribeUrl: isScribeConfigured() ? getScribeUrl() : null,
    hint:
      "Per-app preview: bundle Flight on port 4000 (`bundles/<appId>/`). Platform Flight does not load `viewer/generated/App.backend.ts`. If chat returns 404, restart `npm run start:app`. If 503, run `npm run start:docker` and check SCRIBE_URL.",
  };
});

/** SSE: bundle Flight stdout/stderr (in-memory ring buffer; no Scribe required). */
router.get(["/nvibe/console/stream", "/api/nvibe/console/stream"], async (ctx: RouterContext) => {
  const passthrough = new PassThrough();
  ctx.set("Content-Type", "text/event-stream; charset=utf-8");
  ctx.set("Cache-Control", "no-cache");
  ctx.set("Connection", "keep-alive");
  ctx.set("X-Accel-Buffering", "no");
  ctx.status = 200;
  ctx.body = passthrough;

  const writeSse = (obj: unknown) => {
    try {
      passthrough.write(`data: ${JSON.stringify(obj)}\n\n`);
    } catch {
      /* client gone */
    }
  };

  writeSse({ type: "meta", source: "bundle_flight" });
  for (const entry of getFlightConsoleRecent()) {
    writeSse({ type: "line", stream: entry.stream, text: entry.text, at: entry.at });
  }

  const unsub = subscribeFlightConsole((entry) => {
    writeSse({ type: "line", stream: entry.stream, text: entry.text, at: entry.at });
  });

  let ended = false;
  const close = (): void => {
    if (ended) return;
    ended = true;
    unsub();
    try {
      passthrough.end();
    } catch {
      /* ignore */
    }
  };

  ctx.req.once("close", close);
  ctx.req.once("aborted", close);
});

router.get(["/nvibe/apps", "/api/nvibe/apps"], async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const apps = await repo.listApps();
    ctx.status = 200;
    ctx.body = { apps };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post(["/nvibe/apps", "/api/nvibe/apps"], async (ctx: RouterContext) => {
  if (!scribeGuard(ctx)) return;
  try {
    const body = ctx.request.body as { name?: unknown };
    const name = typeof body?.name === "string" ? body.name : "New app";
    /** Never seed from materialized on-disk files — they belong to whichever app was last active. */
    const full = await repo.createApp({
      name,
      source: DEFAULT_NVIBE_SFC,
      backendSource: DEFAULT_NVIBE_BACKEND,
    });
    await materializeForApp(full.app_id, full.source, full.backendSource, full.bundleEnv);
    ctx.status = 201;
    ctx.body = { app: full };
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.get(["/nvibe/apps/:appId/messages", "/api/nvibe/apps/:appId/messages"], async (ctx: RouterContext) => {
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

router.post(["/nvibe/apps/:appId/messages", "/api/nvibe/apps/:appId/messages"], async (ctx: RouterContext) => {
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
    const incoming: IncomingMessage[] = nvibeChatRowsToGeminiIncoming(persisted);

    const appLatest = await repo.getApp(appId);
    if (!appLatest) {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }

    const head = appLatest.source;
    const beHead = appLatest.backendSource;
    const scribeMeta: NvibeScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };
    const backendMeta: NvibeScribeBackendHeadMeta = {
      utf8Bytes: Buffer.byteLength(beHead, "utf8"),
      lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
      rawCharLength: beHead.length,
    };

    const ideationExtras = await buildNvibeIdeationExtras(appId, head, appLatest);

    const { ideationTurn, usedStub } = await runNvibeMessageIdeation(
      incoming,
      { sfc: head, backend: beHead },
      scribeMeta,
      backendMeta,
      ideationExtras,
      text,
    );

    ctx.status = 200;
    ctx.body = await persistNvibeAssistantTurn(appId, ideationTurn, usedStub);
  } catch (e) {
    scribe503(ctx, scribeConnectHint(e));
  }
});

router.post(
  ["/nvibe/apps/:appId/messages/stream", "/api/nvibe/apps/:appId/messages/stream"],
  async (ctx: RouterContext) => {
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
      const incoming: IncomingMessage[] = nvibeChatRowsToGeminiIncoming(persisted);

      const appLatest = await repo.getApp(appId);
      if (!appLatest) {
        ctx.status = 404;
        ctx.body = { error: "app_not_found" };
        return;
      }

      const head = appLatest.source;
      const beHead = appLatest.backendSource;
      const scribeMeta: NvibeScribeHeadMeta = {
        fetchedAtIso: new Date().toISOString(),
        utf8Bytes: Buffer.byteLength(head, "utf8"),
        lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
        rawCharLength: head.length,
      };
      const backendMeta: NvibeScribeBackendHeadMeta = {
        utf8Bytes: Buffer.byteLength(beHead, "utf8"),
        lineCount: beHead.length === 0 ? 0 : beHead.split(/\r?\n/).length,
        rawCharLength: beHead.length,
      };

      const ideationExtras = await buildNvibeIdeationExtras(appId, head, appLatest);

      const passthrough = new PassThrough();
      ctx.set("Content-Type", "text/event-stream; charset=utf-8");
      ctx.set("Cache-Control", "no-cache");
      ctx.set("Connection", "keep-alive");
      ctx.set("X-Accel-Buffering", "no");
      ctx.status = 200;
      ctx.body = passthrough;

      const writeSse = (obj: unknown) => {
        passthrough.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      void (async () => {
        try {
          const { ideationTurn, usedStub } = await runNvibeMessageIdeation(
            incoming,
            { sfc: head, backend: beHead },
            scribeMeta,
            backendMeta,
            ideationExtras,
            text,
            (n) => writeSse({ type: "delta", receivedChars: n }),
          );
          const doneBody = await persistNvibeAssistantTurn(appId, ideationTurn, usedStub);
          writeSse({ type: "done", ...doneBody });
        } catch (e) {
          writeSse({
            type: "error",
            message: e instanceof Error ? e.message : "unknown_error",
          });
        } finally {
          passthrough.end();
        }
      })();
    } catch (e) {
      scribe503(ctx, scribeConnectHint(e));
    }
  },
);

router.delete(["/nvibe/apps/:appId/messages", "/api/nvibe/apps/:appId/messages"], async (ctx: RouterContext) => {
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

router.get(
  ["/nvibe/apps/:appId/source-revisions", "/api/nvibe/apps/:appId/source-revisions"],
  async (ctx: RouterContext) => {
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
      const probe = await probeNvibeAppSourceHistory(rowId);
      ctx.status = 200;
      ctx.body = probe;
    } catch (e) {
      scribe503(ctx, scribeConnectHint(e));
    }
  },
);

/**
 * Build activity: aggregate Scribe time-travel rows per app, bucket by `date_modified` (etc.) per
 * source revision, last N local days. Does not add new Scribe state — read-only probes.
 */
router.get(
  ["/nvibe/metrics/revision-activity", "/api/nvibe/metrics/revision-activity"],
  async (ctx: RouterContext) => {
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
        const probe = await probeNvibeAppSourceHistory(rowId);
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
  },
);

router.get(["/nvibe/apps/:appId", "/api/nvibe/apps/:appId"], async (ctx: RouterContext) => {
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
    await materializeForApp(appId, app.source, app.backendSource, app.bundleEnv);
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

router.put(["/nvibe/apps/:appId", "/api/nvibe/apps/:appId"], async (ctx: RouterContext) => {
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
    const beCheck = validateNvibeAppBackendForFlight(backendForStore);
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
    const sourceForStore = sanitizeNvibeAppSfcForTailwindVite(source);
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
      path: "app/src/components/nvibe/viewer/generated/App.vue",
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

router.delete(["/nvibe/apps/:appId", "/api/nvibe/apps/:appId"], async (ctx: RouterContext) => {
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

router.patch(["/nvibe/apps/:appId", "/api/nvibe/apps/:appId"], async (ctx: RouterContext) => {
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
        (statusRaw as NvibeAppStatus)
      : undefined;
    const app_icon_raw = body.app_icon;
    const app_icon = typeof app_icon_raw === "string" ? app_icon_raw.trim() : undefined;
    if (app_icon !== undefined && !isNvibeAppIconId(app_icon)) {
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

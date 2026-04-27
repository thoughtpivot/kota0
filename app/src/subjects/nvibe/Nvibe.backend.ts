/**
 * nVibe apps: Scribe is source of truth. A single materialized
 * `app/src/nvibe/generated/App.vue` mirrors the latest `source` for the app last loaded
 * (GET one / PUT / POST create / prompt apply). Chat lives in `nvibe_chat_message` in Scribe.
 */
import Router, { type RouterContext } from "@koa/router";
import { parse as parseSfc } from "@vue/compiler-sfc";
import dotenv from "dotenv";
import path from "node:path";
import { isAxiosError } from "axios";
import { getScribeUrl, isScribeConfigured } from "@/lib/scribe";
import type { IncomingMessage } from "@/subjects/plan/planRun";
import {
  formatNvibeIdeationToMarkdown,
  type NvibeScribeHeadMeta,
  runNvibeIdeationTurn,
  stubNvibeIdeationTurn,
} from "@/subjects/plan/nvibeIdeationRun";
import { buildNvibeSfcHeadOutline } from "@/subjects/nvibe/nvibeSfcHeadOutline";
import { getNvibeWorkspaceDepsSummary } from "@/subjects/nvibe/nvibeWorkspaceDepsSummary";
import { ScribeNvibeAppRepository } from "@/subjects/nvibe/ScribeNvibeAppRepository";
import { ScribeNvibeChatRepository } from "@/subjects/nvibe/ScribeNvibeChatRepository";
import { nvibeChatRowsToGeminiIncoming } from "@/subjects/nvibe/nvibeChatForModel";
import { probeNvibeAppSourceHistory } from "@/subjects/nvibe/scribeNvibeHistory";
import { DEFAULT_NVIBE_SFC, materializeNvibeHeadToDisk } from "@/subjects/nvibe/nvibeMaterialize";
import { sanitizeNvibeAppSfcForTailwindVite } from "@/subjects/nvibe/nvibeSfcTailwindSanitize";
import type { NvibeAppStatus } from "@/subjects/nvibe/nvibeAppTypes";
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

/** Prefer JSON `proposedAppVue`, else ```vue in assistant text; only return parse-valid SFC. */
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

const repo = new ScribeNvibeAppRepository();
const chatRepo = new ScribeNvibeChatRepository();

/** Tracks which app’s head was last written to the single materialized App.vue (for delete cleanup). */
let lastMaterializedAppId: string | null = null;

const WELCOME_ASSISTANT =
  "Hi — I’m here to help you shape **App.vue** (one Vue file: template, script, styles). You can use **Tailwind** utilities, **DaisyUI** component classes (e.g. `btn`, `card` — no extra import), icons from **Lucide** (`lucide-vue-next`), **Heroicons** (`@heroicons/vue/…`), **Phosphor** (`@phosphor-icons/vue`), or **Iconify**-style `import … from '~icons/…'`, plus **Headless UI** (`@headlessui/vue`), **reka-ui** primitives (same stack as our shadcn-style components), **vue-chartjs** + Chart.js, and **shadcn-vue-style** building blocks from `@/components/ui/...` in this workspace. In `<style>`, do **not** use `@apply` with `selection:` utilities (the preview build fails); use plain CSS `::selection { … }` / `.dark ::selection { … }` or put `selection:` classes on template elements only. Plain questions get direct answers; when you want the app changed, say so in plain language — if a reply includes a full `App.vue` inside a ```vue code block, click **Apply** to save it to Scribe and refresh the preview. What would you like to build or change first?";

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

async function materializeForApp(appId: string, source: string): Promise<void> {
  await materializeNvibeHeadToDisk(source);
  lastMaterializedAppId = appId;
}

async function clearMaterializedDiskIfLastWas(appId: string): Promise<void> {
  if (lastMaterializedAppId === appId) {
    await materializeNvibeHeadToDisk(DEFAULT_NVIBE_SFC);
    lastMaterializedAppId = null;
  }
}

const router = new Router();

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
    /** Never seed from materialized `App.vue` on disk — that file belongs to whichever app was last active. */
    const source = DEFAULT_NVIBE_SFC;
    const full = await repo.createApp({ name, source });
    await materializeForApp(full.app_id, full.source);
    await chatRepo.appendMessage({
      appId: full.app_id,
      role: "assistant",
      content: WELCOME_ASSISTANT,
    });
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
    let rows = await chatRepo.listByAppId(appId);
    if (rows.length === 0) {
      await chatRepo.appendMessage({
        appId,
        role: "assistant",
        content: WELCOME_ASSISTANT,
      });
      rows = await chatRepo.listByAppId(appId);
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
    const scribeMeta: NvibeScribeHeadMeta = {
      fetchedAtIso: new Date().toISOString(),
      utf8Bytes: Buffer.byteLength(head, "utf8"),
      lineCount: head.length === 0 ? 0 : head.split(/\r?\n/).length,
      rawCharLength: head.length,
    };

    const workspaceDepsSummary = getNvibeWorkspaceDepsSummary();
    const headOutline = buildNvibeSfcHeadOutline(head);

    let ideationTurn: NvibeIdeationTurn;
    let usedStub = false;
    try {
      ideationTurn = await runNvibeIdeationTurn(incoming, head, scribeMeta, {
        workspaceDepsSummary,
        headOutline,
      });
    } catch (e) {
      usedStub = true;
      const reason = e instanceof Error ? e.message : "unknown_error";
      const stub = stubNvibeIdeationTurn(text);
      ideationTurn = {
        ...stub,
        assistantMessage: `_(Ideation service unavailable: ${reason}. Showing a template reply.)_\n\n${stub.assistantMessage}`,
      };
    }

    const proposed = coerceProposedAppVue(ideationTurn);

    const assistantMarkdown = formatNvibeIdeationToMarkdown({
      ...ideationTurn,
      proposedAppVue: proposed,
    });

    await chatRepo.appendMessage({
      appId,
      role: "assistant",
      content: assistantMarkdown,
    });

    const messages = await chatRepo.listByAppId(appId);
    ctx.status = 200;
    ctx.body = {
      usedStub,
      lastNvibeTurn: { proposedAppVue: proposed },
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
    await chatRepo.appendMessage({
      appId,
      role: "assistant",
      content: WELCOME_ASSISTANT,
    });
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
    await materializeForApp(appId, app.source);
    ctx.status = 200;
    ctx.body = { app };
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
    const body = ctx.request.body as { source?: unknown; sourceOrigin?: unknown };
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
    const buf = Buffer.from(source, "utf8");
    if (buf.length > MAX_BYTES) {
      ctx.status = 413;
      ctx.body = { error: "source_too_large", maxBytes: MAX_BYTES };
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
    let full = await repo.updateAppSource(appId, sourceForStore);
    if (full.status !== "active") {
      full = await repo.updateAppMeta(appId, { status: "active" });
    }
    await materializeForApp(appId, full.source);
    if (sourceOrigin === "manual_code_editor") {
      try {
        await chatRepo.appendMessage({
          appId,
          role: "system",
          content: "App.vue was applied from the Code tab (Scribe head updated).",
        });
      } catch {
        /* non-fatal: source already persisted */
      }
    } else if (sourceOrigin === "ai_apply") {
      try {
        await chatRepo.appendMessage({
          appId,
          role: "system",
          content: "App.vue was applied from the AI panel (Scribe head updated).",
        });
      } catch {
        /* non-fatal: source already persisted */
      }
    }
    ctx.status = 200;
    ctx.body = {
      ok: true,
      path: "app/src/nvibe/generated/App.vue",
      bytes: storedBuf.length,
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
    const body = ctx.request.body as { name?: unknown; status?: unknown };
    const name = typeof body.name === "string" ? body.name : undefined;
    const statusRaw = body.status;
    const status =
      statusRaw === "draft" || statusRaw === "active" || statusRaw === "applied" || statusRaw === "error" ?
        (statusRaw as NvibeAppStatus)
      : undefined;
    if (name === undefined && status === undefined) {
      ctx.status = 400;
      ctx.body = { error: "name_or_status_required" };
      return;
    }
    const full = await repo.updateAppMeta(appId, { name, status });
    ctx.status = 200;
    ctx.body = { app: full };
  } catch (e) {
    if (e instanceof Error && e.message === "app_not_found") {
      ctx.status = 404;
      ctx.body = { error: "app_not_found" };
      return;
    }
    scribe503(ctx, scribeConnectHint(e));
  }
});

export default router.routes();

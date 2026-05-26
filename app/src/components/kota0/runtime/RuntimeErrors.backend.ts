/**
 * Workspace endpoints for the bundle iframe's runtime error bridge.
 *
 *   POST /api/kota0/apps/:appId/runtime-errors  — body from `errorBridge.ts`
 *   GET  /api/kota0/apps/:appId/runtime-errors  — tail for the agent loop / UI
 *
 * Auto-discovered by Flight via the `*.backend.ts` glob. No registration.
 */
import Router, { type RouterContext } from "@koa/router";
import {
  appendKota0RuntimeError,
  readKota0RuntimeErrors,
} from "@/components/kota0/runtime/kota0RuntimeErrorStore";

const router = new Router();

type IncomingBody = {
  kind?: unknown;
  message?: unknown;
  stack?: unknown;
  source?: unknown;
  line?: unknown;
  column?: unknown;
  at?: unknown;
  url?: unknown;
};

const MAX_FIELD_CHARS = 8 * 1024;

function clampStr(v: unknown, max = MAX_FIELD_CHARS): string | undefined {
  if (typeof v !== "string") return undefined;
  if (v.length === 0) return undefined;
  return v.length > max ? v.slice(0, max) + "…(truncated)" : v;
}

function clampInt(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.floor(v);
}

router.post("/api/kota0/apps/:appId/runtime-errors", async (ctx: RouterContext) => {
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  const body = ctx.request.body as IncomingBody;
  const kindRaw = typeof body?.kind === "string" ? body.kind : "";
  const kind: "error" | "unhandledrejection" =
    kindRaw === "unhandledrejection" ? "unhandledrejection" : "error";
  const message = clampStr(body?.message) ?? "(no message)";
  appendKota0RuntimeError(appId, {
    kind,
    message,
    stack: clampStr(body?.stack),
    source: clampStr(body?.source, 1024),
    line: clampInt(body?.line),
    column: clampInt(body?.column),
    at: clampStr(body?.at, 64) ?? new Date().toISOString(),
    receivedAt: Date.now(),
    url: clampStr(body?.url, 2048) ?? "",
  });
  ctx.status = 204;
});

router.get("/api/kota0/apps/:appId/runtime-errors", async (ctx: RouterContext) => {
  const appId = ctx.params.appId;
  if (!appId) {
    ctx.status = 400;
    ctx.body = { error: "app_id_required" };
    return;
  }
  const sinceRaw = ctx.query.since;
  const limitRaw = ctx.query.limit;
  const since =
    typeof sinceRaw === "string" && /^\d+$/.test(sinceRaw) ? Number.parseInt(sinceRaw, 10) : undefined;
  const limit =
    typeof limitRaw === "string" && /^\d+$/.test(limitRaw) ? Number.parseInt(limitRaw, 10) : undefined;
  const errors = readKota0RuntimeErrors(appId, { since, limit });
  ctx.status = 200;
  ctx.body = { errors };
});

export default router.routes();

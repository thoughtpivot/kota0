import Koa from "koa";
import bodyParser from "@koa/bodyparser";
import { createServer } from "node:http";
import axios from "axios";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry";

export const DEFAULT_SCRIBE_GATEWAY_PORT = 3002;

/**
 * URL bundles should use to reach the Scribe Gateway. In local dev the gateway runs on
 * the workspace host's loopback (`127.0.0.1:<port>`). In a Docker compose deployment the
 * gateway is a sibling service and bundle Flight runs inside the workspace container —
 * so 127.0.0.1 would resolve back to the workspace itself. Honor an explicit
 * `SCRIBE_GATEWAY_URL_FOR_BUNDLES` env override (set by compose.prod.yml to e.g.
 * `http://scribe-gateway:3002`) when the bundle and gateway live on different network
 * peers.
 */
export function bundleScribeGatewayUrl(): string {
  const override = process.env.SCRIBE_GATEWAY_URL_FOR_BUNDLES?.trim();
  if (override) return override.replace(/\/$/, "");
  const port = Number(process.env.SCRIBE_GATEWAY_PORT) || DEFAULT_SCRIBE_GATEWAY_PORT;
  return `http://127.0.0.1:${port}`;
}

/** The real Scribe URL that the gateway proxies to — never exposed to bundle apps. */
function upstreamBase(): string {
  return (process.env.SCRIBE_GATEWAY_UPSTREAM_URL ?? "http://127.0.0.1:1337").replace(/\/$/, "");
}

/**
 * Rewrites the first path segment to include an app-scoped prefix:
 *   /chat_messages/all  →  /app_<appId>_chat_messages/all
 *
 * Only the first segment is prefixed so subcomponent paths (/parent/child/all)
 * correctly become /app_<id>_parent/child/all — matching Scribe's subcomponent convention.
 */
function rewritePath(reqPath: string, appId: string): string {
  const prefix = `app_${appId.replace(/-/g, "_")}`;
  const body = reqPath.startsWith("/") ? reqPath.slice(1) : reqPath;
  if (!body) return reqPath;
  const sep = body.indexOf("/");
  const first = sep === -1 ? body : body.slice(0, sep);
  const rest = sep === -1 ? "" : body.slice(sep);
  return `/${prefix}_${first}${rest}`;
}

const NO_BODY_METHODS = new Set(["GET", "HEAD", "DELETE"]);

/**
 * Build the gateway Koa app without binding a port. Exported so integration tests can
 * mount it on an ephemeral port against a mock upstream.
 */
export function createScribeGatewayApp(): Koa {
  const app = new Koa();

  app.use(bodyParser());

  app.use(async (ctx) => {
    // Authenticate
    const auth = (ctx.headers.authorization as string | undefined) ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    let appId = token ? scribeKeyRegistry.resolve(token) : undefined;

    if (!appId && token) {
      // fs.watch debounce may not have fired yet for a freshly provisioned key — reload on miss
      await scribeKeyRegistry.load();
      appId = scribeKeyRegistry.resolve(token);
    }

    if (!appId) {
      ctx.status = 401;
      ctx.body = { error: "unauthorized" };
      return;
    }

    // Rewrite path and proxy to real Scribe
    const targetPath = rewritePath(ctx.path, appId);
    const query = ctx.querystring ? `?${ctx.querystring}` : "";
    const targetUrl = `${upstreamBase()}${targetPath}${query}`;

    try {
      const resp = await axios({
        method: ctx.method.toLowerCase() as "get" | "post" | "put" | "delete" | "patch",
        url: targetUrl,
        data: NO_BODY_METHODS.has(ctx.method) ? undefined : ctx.request.body,
        headers: { "content-type": "application/json" },
        validateStatus: () => true,
        timeout: 60_000,
      });
      ctx.status = resp.status;
      ctx.body = resp.data;
    } catch (err) {
      console.error("[scribe-gateway] upstream error:", err instanceof Error ? err.message : err);
      ctx.status = 502;
      ctx.body = { error: "upstream_unavailable" };
    }
  });

  return app;
}

export function startScribeGateway(): void {
  const port = Number(process.env.SCRIBE_GATEWAY_PORT) || DEFAULT_SCRIBE_GATEWAY_PORT;
  const app = createScribeGatewayApp();
  createServer(app.callback()).listen(port, () => {
    console.log(`[scribe-gateway] :${port} → ${upstreamBase()}`);
  });
}

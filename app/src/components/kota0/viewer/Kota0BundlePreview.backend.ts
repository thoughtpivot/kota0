/**
 * Koa-side preview proxy. The bundle Flight runs on `127.0.0.1:4000` inside the workspace
 * process (local dev) or inside the workspace container (compose.prod.yml). Browsers can
 * reach the workspace at the public URL but **not** that loopback port — so we proxy
 * `/__k0_bundle/*` through workspace Koa to the bundle, mirroring what the Vite dev
 * plugin (`vite.kota0BundlePreviewProxy.ts`) does in dev. HTML bodies get the same
 * `<base href>` + `/assets/` path rewrite so iframe-relative asset URLs resolve through
 * the proxy and not against the workspace origin.
 *
 * Exported as plain Koa middleware (not `@koa/router`) because the prefix-catch-all
 * pattern is awkward to express in path-to-regexp v8; the prefix match is exact and
 * trivial in middleware. Flight discovers this file via the `*.backend.ts` convention.
 */
import http from "node:http";
import Router, { type RouterContext } from "@koa/router";
import { rewriteKota0BundleIndexHtml } from "@/components/kota0/viewer/kota0BundlePreviewHtmlRewrite";
import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "@/components/kota0/viewer/kota0BundlePreviewConstants";
import { guardBundlePreviewAppRequest, bundlePreviewTargetPort } from "@/components/kota0/viewer/kota0BundlePreviewGuard";
import { readBundleSharedState } from "@/components/kota0/deploy/kota0BundleSharedState";

const router = new Router();

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function stripHopByHop(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function targetPort(): number {
  return bundlePreviewTargetPort();
}

/**
 * Workspace Flight registers `koa-bodyparser` globally, which drains `ctx.req` for JSON/form POSTs
 * and exposes the original payload on `ctx.request.rawBody`. If we tried to re-drain `ctx.req`,
 * its `data`/`end` events never fire (stream already ended) and the proxy hangs → browser sees
 * the request stuck in pending and the bundle Flight on :4000 is never contacted.
 *
 * Prefer `rawBody` when bodyparser already consumed the stream; only drain when the stream is
 * still readable (e.g. multipart uploads bodyparser doesn't handle).
 */
export async function readProxyRequestBody(ctx: RouterContext): Promise<Buffer | undefined> {
  const rawBody = (ctx.request as { rawBody?: unknown }).rawBody;
  if (typeof rawBody === "string") {
    return rawBody.length > 0 ? Buffer.from(rawBody, "utf8") : undefined;
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody.length > 0 ? rawBody : undefined;
  }
  if (!ctx.req.readable || ctx.req.readableEnded) {
    return undefined;
  }
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    ctx.req.on("data", (c: Buffer) => chunks.push(c));
    ctx.req.on("end", () => resolve());
    ctx.req.on("error", (e) => reject(e));
  });
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function proxyHandler(ctx: RouterContext): Promise<void> {
  const port = targetPort();
  const rawUrl = ctx.originalUrl ?? ctx.url;
  const parsed = new URL(rawUrl, "http://127.0.0.1");
  const rest = parsed.pathname.slice(K0_BUNDLE_PREVIEW_PROXY_PREFIX.length) || "/";
  const targetPath = rest + parsed.search;

  /**
   * Iframe URL carries `?app=<id>` so the proxy can refuse requests until :4000 hello
   * reports that app id. Asset fetches under `<base href>` drop `?app=` — skip guard.
   */
  const requestedAppId = parsed.searchParams.get("app");
  const shared = await readBundleSharedState();
  const guard = await guardBundlePreviewAppRequest(requestedAppId, port, {
    servingAppId: shared.servingAppId,
  });
  if (guard.blocked) {
    ctx.status = 425;
    ctx.set("Cache-Control", "no-store");
    ctx.set("Retry-After", "1");
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = guard.body;
    return;
  }

  const upstreamHeaders = stripHopByHop(ctx.headers);
  delete upstreamHeaders["accept-encoding"];
  upstreamHeaders["host"] = `127.0.0.1:${port}`;
  // Force identity so we can UTF-8-rewrite HTML asset URLs without decoding gzip.
  upstreamHeaders["accept-encoding"] = "identity";

  const reqBody = await readProxyRequestBody(ctx);
  if (reqBody !== undefined) {
    // Recompute against the buffer we'll actually write — bodyParser stored a raw string we re-buffer,
    // so the on-the-wire length must match this Buffer, not the original Content-Length header.
    upstreamHeaders["content-length"] = String(reqBody.length);
  }

  await new Promise<void>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: targetPath,
        method: ctx.method,
        headers: upstreamHeaders,
      },
      (proxyRes) => {
        const status = proxyRes.statusCode ?? 502;
        const ct = String(proxyRes.headers["content-type"] ?? "");

        const chunks: Buffer[] = [];
        proxyRes.on("data", (c: Buffer) => chunks.push(c));
        proxyRes.on("end", () => {
          let body: Buffer | string = Buffer.concat(chunks);
          const headers: Record<string, string | string[]> = {};
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (v === undefined) continue;
            const lower = k.toLowerCase();
            if (lower === "content-length" || lower === "transfer-encoding") continue;
            headers[k] = v as string | string[];
          }
          if (ct.includes("text/html")) {
            body = rewriteKota0BundleIndexHtml(body.toString("utf8"));
            headers["content-type"] = "text/html; charset=utf-8";
          }
          ctx.status = status;
          for (const [k, v] of Object.entries(headers)) ctx.set(k, v as string | string[]);
          ctx.body = body;
          resolve();
        });
        proxyRes.on("error", () => {
          ctx.status = 502;
          ctx.type = "text/plain; charset=utf-8";
          ctx.body = "Kota0 bundle preview proxy: upstream read error";
          resolve();
        });
      },
    );
    proxyReq.on("error", () => {
      ctx.status = 502;
      ctx.type = "text/plain; charset=utf-8";
      ctx.body =
        `Kota0 bundle preview proxy: nothing listening on 127.0.0.1:${port}. ` +
        "Open an app so the bundle Flight builds and binds.";
      resolve();
    });
    if (reqBody !== undefined) proxyReq.write(reqBody);
    proxyReq.end();
  });
}

// path-to-regexp v8 syntax (used by @koa/router 15.x):
//   `*splat` — named wildcard catching the remainder of the path
//   `{...}`  — optional segment
// So `/__k0_bundle{/*splat}` matches both `/__k0_bundle` and `/__k0_bundle/anything/below`.
router.all(`${K0_BUNDLE_PREVIEW_PROXY_PREFIX}{/*splat}`, proxyHandler);

export default router.routes();

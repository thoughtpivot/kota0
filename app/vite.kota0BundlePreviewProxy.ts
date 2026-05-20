import http from "node:http";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import type { Plugin } from "vite";
import { K0_BUNDLE_PREVIEW_PROXY_PREFIX } from "./src/components/kota0/viewer/kota0BundlePreviewConstants";
import { rewriteKota0BundleIndexHtml as rewriteShared } from "./src/components/kota0/viewer/kota0BundlePreviewHtmlRewrite";

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

function stripHopByHop(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const out: IncomingHttpHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

/** Re-export so existing callers keep working; logic lives in the shared module so the
 * Koa production middleware uses the same rewrite. */
export const rewriteKota0BundleIndexHtml = rewriteShared;

function proxyMiddleware(targetPort: number) {
  return (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (err?: unknown) => void,
  ): void => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(K0_BUNDLE_PREVIEW_PROXY_PREFIX)) {
      next();
      return;
    }

    const parsed = new URL(rawUrl, "http://127.0.0.1");
    const rest = parsed.pathname.slice(K0_BUNDLE_PREVIEW_PROXY_PREFIX.length) || "/";
    const targetPath = rest + parsed.search;

    const upstreamHeaders = stripHopByHop(req.headers);
    delete upstreamHeaders["accept-encoding"];

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: targetPort,
        path: targetPath,
        method: req.method,
        headers: {
          ...upstreamHeaders,
          host: `127.0.0.1:${targetPort}`,
          /** So `koa-compress` does not gzip HTML before we rewrite asset paths as UTF-8. */
          "accept-encoding": "identity",
        },
      },
      (proxyRes) => {
        const ct = String(proxyRes.headers["content-type"] ?? "");
        const status = proxyRes.statusCode ?? 502;

        if (ct.includes("text/html")) {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (c: Buffer) => void chunks.push(c));
          proxyRes.on("end", () => {
            let body = Buffer.concat(chunks).toString("utf8");
            body = rewriteKota0BundleIndexHtml(body);
            const headers = { ...proxyRes.headers } as OutgoingHttpHeaders;
            delete headers["content-length"];
            delete headers["transfer-encoding"];
            res.writeHead(status, headers);
            res.end(body);
          });
          proxyRes.on("error", (err: Error) => {
            res.statusCode = 502;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(err.message);
          });
          return;
        }

        res.writeHead(status, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );

    proxyReq.on("error", () => {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(
        `Kota0 bundle preview proxy: nothing listening on 127.0.0.1:${targetPort}. Open an app in Kota0 so Flight builds and binds the bundle port.`,
      );
    });

    req.pipe(proxyReq);
  };
}

export function kota0BundlePreviewProxyPlugin(options: { targetPort: number }): Plugin {
  const mw = proxyMiddleware(options.targetPort);
  return {
    name: "k0-bundle-preview-proxy",
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    },
  };
}

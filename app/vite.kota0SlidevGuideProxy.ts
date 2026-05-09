import http from "node:http";
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from "node:http";
import type { Plugin } from "vite";
import { K0_GUIDE_SLIDEV_PROXY_PREFIX } from "./src/components/kota0/shell/kota0SlidevGuideConstants";

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

/**
 * Slidev HTML references root-absolute `/…` assets; under a path prefix those must be rewritten
 * or the browser loads the host app’s Vite instead of Slidev.
 */
export function rewriteSlidevGuideIndexHtml(html: string): string {
  const p = K0_GUIDE_SLIDEV_PROXY_PREFIX;
  if (html.includes(`${p}/@vite`) || html.includes(`${p}/@id`)) return html;
  /* Root-absolute `/…` ignores <base>; rewrite so assets hit the proxy, not the host Vite app. */
  return html.replace(/\b(src|href)=(["'])\//g, `$1=$2${p}/`);
}

function proxyMiddleware(targetPort: number) {
  return (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (err?: unknown) => void,
  ): void => {
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith(K0_GUIDE_SLIDEV_PROXY_PREFIX)) {
      next();
      return;
    }

    const parsed = new URL(rawUrl, "http://127.0.0.1");
    const rest = parsed.pathname.slice(K0_GUIDE_SLIDEV_PROXY_PREFIX.length) || "/";
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
            body = rewriteSlidevGuideIndexHtml(body);
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
        `Slidev tutorial proxy: nothing listening on 127.0.0.1:${targetPort}. Run npm run start:slides.`,
      );
    });

    req.pipe(proxyReq);
  };
}

export function kota0SlidevGuideProxyPlugin(options: { targetPort: number }): Plugin {
  const mw = proxyMiddleware(options.targetPort);
  return {
    name: "kota0-slidev-guide-proxy",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    },
  };
}

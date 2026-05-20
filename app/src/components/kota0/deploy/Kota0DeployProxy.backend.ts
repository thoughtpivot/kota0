/**
 * Reverse-proxy `/__k0_deploy/<deploymentId>/*` → the deployed container's host port.
 *
 * Each deploy spawns a sibling container that publishes its Flight port to a free
 * 127.0.0.1:<host_port> on the workspace VM. We look up that port from the
 * `k0_deployment` Scribe row's `endpoint_url`, then stream HTTP through. HTML responses
 * get the same `<base href>` + `/assets/` rewrite the preview proxy uses, scoped to the
 * deployment-specific prefix.
 *
 * Auth/tenancy hooks come later — Phase 2 exposes deployments to anyone who can reach
 * the workspace URL. Same posture as the workspace itself.
 */
import http from "node:http";
import Router, { type RouterContext } from "@koa/router";
import { ScribeKota0DeploymentRepository } from "@/components/kota0/deploy/ScribeKota0DeploymentRepository";
import { rewriteKota0BundleHtmlForPrefix } from "@/components/kota0/viewer/kota0BundlePreviewHtmlRewrite";
import { K0_DEPLOY_PROXY_PREFIX } from "@/components/kota0/viewer/kota0BundlePreviewConstants";

const router = new Router();
const deploymentRepo = new ScribeKota0DeploymentRepository();

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

/** Parse a deployment endpoint URL into the host+port we should proxy to. */
function parseUpstream(endpointUrl: string | undefined): { hostname: string; port: number } | null {
  if (!endpointUrl) return null;
  try {
    const u = new URL(endpointUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const port = Number.parseInt(u.port || (u.protocol === "https:" ? "443" : "80"), 10);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { hostname: u.hostname, port };
  } catch {
    return null;
  }
}

async function proxyHandler(ctx: RouterContext): Promise<void> {
  const deploymentId = ctx.params.deploymentId;
  if (typeof deploymentId !== "string" || deploymentId.length === 0) {
    ctx.status = 404;
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = "Kota0 deploy proxy: missing deployment id";
    return;
  }

  let row: Awaited<ReturnType<ScribeKota0DeploymentRepository["get"]>>;
  try {
    row = await deploymentRepo.get(deploymentId);
  } catch (err) {
    ctx.status = 502;
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = `Kota0 deploy proxy: could not load deployment row (${err instanceof Error ? err.message : String(err)})`;
    return;
  }
  if (!row) {
    ctx.status = 404;
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = `Kota0 deploy proxy: no deployment ${deploymentId}`;
    return;
  }
  if (row.status !== "running") {
    ctx.status = 409;
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = `Kota0 deploy proxy: deployment ${deploymentId} is ${row.status}`;
    return;
  }
  const upstream = parseUpstream(row.endpoint_url);
  if (!upstream) {
    ctx.status = 502;
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = `Kota0 deploy proxy: deployment ${deploymentId} has no parseable endpoint (${row.endpoint_url ?? "missing"})`;
    return;
  }

  const myPrefix = `${K0_DEPLOY_PROXY_PREFIX}/${deploymentId}`;
  const rawUrl = ctx.originalUrl ?? ctx.url;
  const parsed = new URL(rawUrl, "http://127.0.0.1");
  const rest = parsed.pathname.slice(myPrefix.length) || "/";
  const targetPath = rest + parsed.search;

  const upstreamHeaders = stripHopByHop(ctx.headers);
  delete upstreamHeaders["accept-encoding"];
  upstreamHeaders["host"] = `${upstream.hostname}:${upstream.port}`;
  // Force identity so HTML responses can be UTF-8-rewritten without decoding gzip.
  upstreamHeaders["accept-encoding"] = "identity";

  const bodyChunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    ctx.req.on("data", (c: Buffer) => bodyChunks.push(c));
    ctx.req.on("end", () => resolve());
    ctx.req.on("error", (e) => reject(e));
  });
  const reqBody = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

  await new Promise<void>((resolve) => {
    const proxyReq = http.request(
      {
        hostname: upstream.hostname,
        port: upstream.port,
        path: targetPath,
        method: ctx.method,
        headers: upstreamHeaders,
      },
      (proxyRes) => {
        const status = proxyRes.statusCode ?? 502;
        const upstreamCt = String(proxyRes.headers["content-type"] ?? "");

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
          if (upstreamCt.includes("text/html")) {
            body = rewriteKota0BundleHtmlForPrefix(body.toString("utf8"), myPrefix);
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
          ctx.body = "Kota0 deploy proxy: upstream read error";
          resolve();
        });
      },
    );
    proxyReq.on("error", () => {
      ctx.status = 502;
      ctx.type = "text/plain; charset=utf-8";
      ctx.body =
        `Kota0 deploy proxy: cannot reach ${upstream.hostname}:${upstream.port} for deployment ${deploymentId}. ` +
        "Container may have crashed — check the deployment status in the rail.";
      resolve();
    });
    if (reqBody !== undefined) proxyReq.write(reqBody);
    proxyReq.end();
  });
}

router.all(`${K0_DEPLOY_PROXY_PREFIX}/:deploymentId{/*splat}`, proxyHandler);

export default router.routes();

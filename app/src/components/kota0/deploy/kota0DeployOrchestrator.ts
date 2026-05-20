/**
 * Orchestrates the Deploy lifecycle: persist row, build, provision, patch with results.
 * Failures are recorded on the same row so the UI can show the error.
 *
 * Keeps the route handler thin and the target adapter mock-friendly.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { bundleScribeGatewayUrl } from "@/components/kota0/gateway/ScribeGateway.ts";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry.ts";
import { resolveKota0BundleDir } from "@/components/kota0/deploy/kota0BundlePaths.ts";
import type { Kota0DeploymentRepository, Kota0DeploymentRow } from "@/components/kota0/deploy/kota0DeploymentTypes.ts";
import type { DeployTarget } from "@/components/kota0/deploy/kota0DeployTarget.ts";

/**
 * Keys the platform controls authoritatively — never copied from the bundle's `.env`.
 * Anything else in the bundle's `.env` (custom secrets like `WEATHERAPI_KEY`,
 * per-app feature flags, etc.) DOES flow through to the deployed container, matching
 * how the in-workspace preview Flight reads bundle env via `loadBundleEnv`.
 */
const PLATFORM_RESERVED_ENV_KEYS = new Set([
  "K0_APP_ID",
  "K0_APP_REDIS_PREFIX",
  "SCRIBE_URL",
  "SCRIBE_API_KEY",
  "K0_PLATFORM_API_ORIGIN",
  "FLIGHT_REDIS_HOST",
  "FLIGHT_REDIS_PORT",
  "FLIGHT_PORT",
  "FLIGHT_MODE",
  "FLIGHT_DISABLE_VITE",
  "FLIGHT_MAX_WORKERS",
  "FLIGHT_DIST_PATH",
  // DB credentials must NEVER leak from a bundle's .env into a deployed container.
  // The bundle should only talk to Scribe via the gateway anyway.
  "DATABASE_URL",
  // SCRIBE_* keys (other than what we set explicitly above) are also reserved —
  // bundles get a scoped SCRIBE_API_KEY, never the raw Scribe URL/creds.
]);

async function readBundleEnvFile(bundleDir: string): Promise<Record<string, string>> {
  try {
    const raw = await readFile(path.join(bundleDir, ".env"), "utf8");
    return dotenv.parse(raw);
  } catch {
    return {};
  }
}

/** Returns the bundle-author-set keys safe to forward into the deployed container. */
function pickBundleUserEnv(bundleEnv: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bundleEnv)) {
    if (!k || v === undefined) continue;
    if (PLATFORM_RESERVED_ENV_KEYS.has(k)) continue;
    if (k.startsWith("SCRIBE_")) continue; // never leak raw Scribe wiring
    out[k] = v;
  }
  return out;
}

/**
 * Rewrite a `127.0.0.1` / `localhost` URL so a container can reach the workspace host.
 * `host.docker.internal` is provided by Docker Desktop and mapped explicitly on Linux
 * via `--add-host host.docker.internal:host-gateway` (see LocalDockerTarget).
 *
 * In compose-network mode (env `K0_DEPLOY_DOCKER_NETWORK` set), spawned bundles join
 * the same docker network as the platform services — there's no need to go out to the
 * host gateway, and there shouldn't be (the gateway service isn't published). In that
 * case we leave the URL alone; compose service names like `scribe-gateway` resolve
 * directly. Caller can short-circuit by passing the override hostname in env vars.
 */
export function rewriteHostLoopbackForContainer(url: string): string {
  // When the bundle will be attached to a compose network, the workspace itself is
  // reachable by its compose service name (default `workspace`, configurable via
  // K0_DEPLOY_WORKSPACE_SERVICE). Scribe-gateway / scribe URLs already use service
  // names by the time they get here, so this only affects K0_PLATFORM_API_ORIGIN.
  if (process.env.K0_DEPLOY_DOCKER_NETWORK?.trim()) {
    const service = process.env.K0_DEPLOY_WORKSPACE_SERVICE?.trim() || "workspace";
    return url.replace(/\b(?:127\.0\.0\.1|localhost)\b/, service);
  }
  return url.replace(/\b(?:127\.0\.0\.1|localhost)\b/, "host.docker.internal");
}

export interface DeployOrchestratorDeps {
  repo: Kota0DeploymentRepository;
  target: DeployTarget;
  /** Workspace Koa port — bundles call back here for platform AI routes. */
  workspaceKoaPort?: string;
}

export async function runDeploy(
  appId: string,
  deps: DeployOrchestratorDeps,
): Promise<Kota0DeploymentRow> {
  const { repo, target } = deps;
  // Reuse the per-app scoped gateway key minted during materialize. If it's missing
  // (e.g. app was never Applied) we provision one now — same code path as materialize.
  const apiKey = await scribeKeyRegistry.provision(appId);

  const gatewayUrlForHost = bundleScribeGatewayUrl();
  const workspacePort = deps.workspaceKoaPort ?? process.env.FLIGHT_PORT?.trim() ?? "3000";
  // On a compose network bundles reach Redis by service name (`redis`); off-network
  // (Docker Desktop / standalone) they go through `host.docker.internal:host-gateway`.
  const onComposeNet = (process.env.K0_DEPLOY_DOCKER_NETWORK?.trim() ?? "") !== "";
  const redisHost = onComposeNet
    ? (process.env.FLIGHT_REDIS_HOST?.trim() || "redis")
    : "host.docker.internal";

  // Start from the bundle author's .env (custom keys like WEATHERAPI_KEY, GEMINI_API_KEY
  // when the bundle uses its own, app-specific feature flags, etc.). Platform-managed
  // keys below always win — bundles cannot override SCRIBE_API_KEY, redirect themselves
  // to a different Scribe, point at a different Redis namespace, etc.
  const bundleEnv = await readBundleEnvFile(resolveKota0BundleDir(appId));
  const env: Record<string, string> = {
    ...pickBundleUserEnv(bundleEnv),
    K0_APP_ID: appId,
    K0_APP_REDIS_PREFIX: `app_${appId.replace(/-/g, "_")}:`,
    SCRIBE_URL: rewriteHostLoopbackForContainer(gatewayUrlForHost),
    SCRIBE_API_KEY: apiKey,
    K0_PLATFORM_API_ORIGIN: rewriteHostLoopbackForContainer(`http://127.0.0.1:${workspacePort}`),
    FLIGHT_REDIS_HOST: redisHost,
    FLIGHT_REDIS_PORT: process.env.FLIGHT_REDIS_PORT ?? "6379",
    FLIGHT_PORT: "4000",
    FLIGHT_MODE: "production",
    FLIGHT_DISABLE_VITE: "true",
    FLIGHT_MAX_WORKERS: "1",
    FLIGHT_DIST_PATH: "./dist",
  };

  const created = await repo.create({
    deployment_id: "",
    app_id: appId,
    target: target.kind,
    status: "building",
  });

  try {
    const artifact = await target.build({ appId, bundleDir: resolveKota0BundleDir(appId) });
    await repo.patch(created.deployment_id, { image_ref: artifact.imageRef });

    const endpoint = await target.provision({
      appId,
      deploymentId: created.deployment_id,
      artifact,
      env,
    });

    return await repo.patch(created.deployment_id, {
      status: "running",
      container_id: endpoint.handle,
      endpoint_url: endpoint.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await repo.patch(created.deployment_id, { status: "failed", error: message }).catch(() => {});
    throw err;
  }
}

export async function destroyDeployment(
  deploymentId: string,
  deps: DeployOrchestratorDeps,
): Promise<Kota0DeploymentRow> {
  const { repo, target } = deps;
  const row = await repo.get(deploymentId);
  if (!row) throw new Error("deployment_not_found");
  if (row.container_id) {
    await target.destroy(row.container_id);
  }
  return repo.patch(deploymentId, { status: "destroyed", destroyed_at: new Date().toISOString() });
}

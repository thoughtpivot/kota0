/**
 * Orchestrates the Deploy lifecycle: persist row, build, provision, patch with results.
 * Failures are recorded on the same row so the UI can show the error.
 *
 * Keeps the route handler thin and the target adapter mock-friendly.
 */
import { bundleScribeGatewayUrl } from "@/components/kota0/gateway/ScribeGateway.ts";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry.ts";
import { resolveKota0BundleDir } from "@/components/kota0/deploy/kota0BundlePaths.ts";
import type { Kota0DeploymentRepository, Kota0DeploymentRow } from "@/components/kota0/deploy/kota0DeploymentTypes.ts";
import type { DeployTarget } from "@/components/kota0/deploy/kota0DeployTarget.ts";

/**
 * Rewrite a `127.0.0.1` / `localhost` URL so a container can reach the workspace host.
 * `host.docker.internal` is provided by Docker Desktop and mapped explicitly on Linux
 * via `--add-host host.docker.internal:host-gateway` (see LocalDockerTarget).
 */
export function rewriteHostLoopbackForContainer(url: string): string {
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

  const env: Record<string, string> = {
    K0_APP_ID: appId,
    K0_APP_REDIS_PREFIX: `app_${appId.replace(/-/g, "_")}:`,
    SCRIBE_URL: rewriteHostLoopbackForContainer(gatewayUrlForHost),
    SCRIBE_API_KEY: apiKey,
    K0_PLATFORM_API_ORIGIN: rewriteHostLoopbackForContainer(`http://127.0.0.1:${workspacePort}`),
    FLIGHT_REDIS_HOST: "host.docker.internal",
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

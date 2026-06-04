import path from "node:path";
import { resolveRepoRoot } from "@/components/kota0/viewer/materialize/materialize";

/**
 * Where per-app bundles live on the filesystem **from the workspace's point of view**.
 * Defaults to `<repoRoot>/bundles`. This is the path the workspace uses for fs reads/writes,
 * vite-build invocations, etc. It must be a sibling of `app/` / `shared/` / `branding/`
 * so the bundle's vite.config relative imports (`../../app/...`) resolve.
 *
 * In Docker prod, this is `/workspace/bundles` inside the container — bind-mounted from
 * `/opt/kota0/bundles` on the host. When the workspace invokes the host docker daemon
 * (Docker-out-of-Docker), `LocalDockerTarget` translates this container path to the
 * matching host path via `K0_BUNDLES_HOST_DIR` / `K0_BUNDLES_CONTAINER_DIR`.
 */
export function resolveBundlesRoot(): string {
  return path.join(resolveRepoRoot(), "bundles");
}

export function resolveBundleDir(appId: string): string {
  return path.join(resolveBundlesRoot(), appId);
}

export function resolveBundleTemplateDir(): string {
  return path.join(resolveRepoRoot(), "templates", "k0-bundle");
}

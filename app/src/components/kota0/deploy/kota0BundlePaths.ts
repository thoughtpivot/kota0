import path from "node:path";
import { resolveKota0RepoRoot } from "@/components/kota0/viewer/kota0Materialize";

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
export function resolveKota0BundlesRoot(): string {
  return path.join(resolveKota0RepoRoot(), "bundles");
}

export function resolveKota0BundleDir(appId: string): string {
  return path.join(resolveKota0BundlesRoot(), appId);
}

export function resolveKota0BundleTemplateDir(): string {
  return path.join(resolveKota0RepoRoot(), "templates", "k0-bundle");
}

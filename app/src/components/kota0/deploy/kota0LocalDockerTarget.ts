/**
 * Local Docker deploy target. Builds an image from `bundles/<appId>/` and runs a
 * detached container on the workspace host. The container hits the Scribe Gateway
 * over the host network and exposes Flight on a host port we allocate per deploy.
 *
 * Designed for low-scale internal use and local smoke testing — production targets
 * (Pulumi/ECS/etc.) implement the same DeployTarget surface in a later phase.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import {
  resolveKota0BundleDir,
  resolveKota0BundlesRoot,
} from "@/components/kota0/deploy/kota0BundlePaths.ts";
import type {
  DeployArtifactRef,
  DeployBuildInput,
  DeployEndpoint,
  DeployProvisionInput,
  DeployRuntimeStatus,
  DeployTarget,
} from "@/components/kota0/deploy/kota0DeployTarget.ts";

const execFileAsync = promisify(execFile);

/** Replaceable shell-exec hook so tests can stub `docker` without spawning a real binary. */
export type DockerExec = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultDockerExec: DockerExec = async (args: string[]) => {
  const { stdout, stderr } = await execFileAsync("docker", args, { maxBuffer: 16 * 1024 * 1024 });
  return { stdout, stderr };
};

/** Allocate a free TCP port on 127.0.0.1 via OS port-0 binding. Caller races on bind, but for low-scale local deploy that's fine. */
async function pickFreeHostPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        server.close();
        reject(new Error("port_alloc_failed"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

/** Stable, docker-safe tag for an app's image. Short app id keeps tags readable. */
export function imageTagForApp(appId: string, stamp: number = Date.now()): string {
  const short = appId.replace(/-/g, "").slice(0, 12).toLowerCase();
  return `kota0-app-${short}:${stamp}`;
}

/** Stable container name for a deployment. */
export function containerNameForDeployment(deploymentId: string): string {
  return `k0app-${deploymentId.replace(/-/g, "").slice(0, 24).toLowerCase()}`;
}

export interface LocalDockerTargetOptions {
  /** Inject for tests. Defaults to a real `execFile("docker", …)`. */
  exec?: DockerExec;
  /** Override port allocator (tests). Defaults to OS-assigned 127.0.0.1 port. */
  allocatePort?: () => Promise<number>;
}

export class LocalDockerTarget implements DeployTarget {
  readonly kind = "local-docker" as const;
  private readonly exec: DockerExec;
  private readonly allocatePort: () => Promise<number>;

  constructor(opts: LocalDockerTargetOptions = {}) {
    this.exec = opts.exec ?? defaultDockerExec;
    this.allocatePort = opts.allocatePort ?? pickFreeHostPort;
  }

  /**
   * Translate a path the workspace sees (e.g. `/workspace/bundles/<id>`) to the matching
   * host-daemon path (`/opt/kota0/bundles/<id>`). In local dev (`K0_BUNDLES_HOST_DIR`
   * unset), both paths are identical — workspace runs directly on the host's filesystem.
   * The container-side base is the workspace's own bundles root, so this works no matter
   * what `resolveKota0BundlesRoot` returns.
   */
  private translateHostPath(containerPath: string): string {
    const hostBase = process.env.K0_BUNDLES_HOST_DIR?.trim();
    if (!hostBase) return containerPath;
    const containerBase = resolveKota0BundlesRoot();
    if (containerPath === containerBase) return hostBase;
    if (containerPath.startsWith(`${containerBase}/`)) {
      return hostBase + containerPath.slice(containerBase.length);
    }
    return containerPath;
  }

  /**
   * "Build" is a no-op in this target — the bundle's UI was already built (vite) on the
   * workspace during preview materialize, and the runtime image (`kota0-workspace:latest`)
   * is the workspace's own image, which already has node + tsx + Flight + every dep. We
   * just verify the artifacts that `provision` will mount are actually on disk so the user
   * gets a friendly error instead of a runtime crash after the container starts.
   */
  async build({ bundleDir }: DeployBuildInput): Promise<DeployArtifactRef> {
    const imageRef = process.env.K0_DEPLOY_RUNTIME_IMAGE?.trim() || "kota0-workspace:latest";
    const distIndex = path.join(bundleDir, "dist", "index.html");
    const appBackend = path.join(bundleDir, "App.backend.ts");
    for (const p of [distIndex, appBackend]) {
      if (!existsSync(p)) {
        throw new Error(
          `deploy_artifact_missing: ${p} — open the app at least once so the bundle materializes and vite-builds before deploying.`,
        );
      }
    }
    return { kind: this.kind, imageRef };
  }

  async provision({ deploymentId, artifact, env, appId }: DeployProvisionInput): Promise<DeployEndpoint> {
    const containerName = containerNameForDeployment(deploymentId);
    const containerBundleDir = resolveKota0BundleDir(appId);
    const hostBundleDir = this.translateHostPath(containerBundleDir);
    const composeNet = process.env.K0_DEPLOY_DOCKER_NETWORK?.trim();

    const args: string[] = [
      "run",
      "--detach",
      "--name",
      containerName,
      // Volume-mount the bundle dir into the runtime image at /bundle. The runtime image
      // is `kota0-workspace:latest` (default) which already has node_modules baked in;
      // /bundle/{App.backend.ts, dist, .env, vite.config.ts} comes from the volume.
      "--volume",
      `${hostBundleDir}:/bundle`,
      "--workdir",
      "/bundle",
      // Bundle needs to reach the workspace's Scribe Gateway. host.docker.internal works
      // on Docker Desktop and via --add-host on Linux; on a compose network we use service
      // names instead (see compose branch below).
      "--add-host",
      "host.docker.internal:host-gateway",
    ];

    // Endpoint URL strategy:
    //   • Compose-network mode: attach to the same network as platform services and address
    //     the deployed container by its name (`http://k0app-<id>:4000`). No host-port publish
    //     needed — the workspace's deploy proxy reaches it over the compose network.
    //   • Standalone mode: publish to a free host port and address `127.0.0.1:<port>` — the
    //     workspace runs on the host directly so loopback is reachable.
    let endpointUrl: string;
    if (composeNet) {
      args.push("--network", composeNet);
      endpointUrl = `http://${containerName}:4000`;
    } else {
      const hostPort = await this.allocatePort();
      args.push("--publish", `127.0.0.1:${hostPort}:4000`);
      endpointUrl = `http://127.0.0.1:${hostPort}`;
    }
    for (const [k, v] of Object.entries(env)) {
      args.push("--env", `${k}=${v}`);
    }
    args.push(artifact.imageRef);
    // CMD wrapper:
    //   1. Symlink the workspace image's `shared/`, `app/`, `branding/` at the paths the
    //      bundle's tsconfig + style imports expect (`../../{shared,app,branding}` from
    //      /bundle = `/{shared,app,branding}`). Image has them at /workspace/{...}.
    //      Local-dev preview gets these for free because bundles is a sibling of those
    //      dirs in the repo; in the deployed container the bundle dir is mounted in
    //      isolation, so we recreate the layout via symlinks.
    //   2. Exec Flight from the bundle's own node_modules (volume-mounted) — tsx + Flight
    //      version matches what was used during preview materialize.
    const wrappedCmd =
      "ln -sfn /workspace/shared /shared && " +
      "ln -sfn /workspace/app /app && " +
      "ln -sfn /workspace/branding /branding && " +
      "exec node --disable-warning=DEP0040 " +
      "./node_modules/tsx/dist/cli.mjs " +
      "-r tsconfig-paths/register " +
      "./node_modules/@thoughtpivot/flight/src/flight.ts " +
      "--mode production --app_home /bundle";
    args.push("sh", "-c", wrappedCmd);

    const { stdout } = await this.exec(args);
    const containerId = stdout.trim();
    if (!containerId) throw new Error("docker_run_returned_empty_id");
    return {
      url: endpointUrl,
      handle: containerId,
    };
  }

  async status(handle: string): Promise<DeployRuntimeStatus> {
    try {
      const { stdout } = await this.exec(["inspect", "--format", "{{.State.Status}}", handle]);
      const s = stdout.trim();
      if (s === "running") return "running";
      if (s === "exited" || s === "dead" || s === "removing") return "stopped";
      if (s === "created" || s === "restarting" || s === "paused") return "running";
      return "unknown";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/No such object/i.test(msg)) return "missing";
      throw err;
    }
  }

  async destroy(handle: string): Promise<void> {
    try {
      await this.exec(["rm", "-f", handle]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Treat already-gone as success — destroy is idempotent.
      if (/No such container/i.test(msg)) return;
      throw err;
    }
  }
}

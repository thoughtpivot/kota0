/**
 * Local Docker deploy target. Builds an image from `bundles/<appId>/` and runs a
 * detached container on the workspace host. The container hits the Scribe Gateway
 * over the host network and exposes Flight on a host port we allocate per deploy.
 *
 * Designed for low-scale internal use and local smoke testing — production targets
 * (Pulumi/ECS/etc.) implement the same DeployTarget surface in a later phase.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
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
  /** Override clock for image tags (tests). */
  now?: () => number;
}

export class LocalDockerTarget implements DeployTarget {
  readonly kind = "local-docker" as const;
  private readonly exec: DockerExec;
  private readonly allocatePort: () => Promise<number>;
  private readonly now: () => number;

  constructor(opts: LocalDockerTargetOptions = {}) {
    this.exec = opts.exec ?? defaultDockerExec;
    this.allocatePort = opts.allocatePort ?? pickFreeHostPort;
    this.now = opts.now ?? Date.now;
  }

  async build({ appId, bundleDir }: DeployBuildInput): Promise<DeployArtifactRef> {
    const imageRef = imageTagForApp(appId, this.now());
    await this.exec(["build", "-t", imageRef, bundleDir]);
    return { kind: this.kind, imageRef };
  }

  async provision({ deploymentId, artifact, env }: DeployProvisionInput): Promise<DeployEndpoint> {
    const hostPort = await this.allocatePort();
    const containerName = containerNameForDeployment(deploymentId);

    const args: string[] = [
      "run",
      "--detach",
      "--name",
      containerName,
      "--publish",
      `127.0.0.1:${hostPort}:4000`,
      // Container needs to reach the workspace's Scribe Gateway running on the host.
      // host.docker.internal works on Docker Desktop (mac/win); on Linux we add an
      // explicit mapping via --add-host so the bundle's SCRIBE_URL resolves.
      "--add-host",
      "host.docker.internal:host-gateway",
    ];
    for (const [k, v] of Object.entries(env)) {
      args.push("--env", `${k}=${v}`);
    }
    args.push(artifact.imageRef);

    const { stdout } = await this.exec(args);
    const containerId = stdout.trim();
    if (!containerId) throw new Error("docker_run_returned_empty_id");
    return {
      url: `http://127.0.0.1:${hostPort}`,
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

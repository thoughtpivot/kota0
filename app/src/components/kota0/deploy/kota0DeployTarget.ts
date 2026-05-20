/**
 * Adapter interface between the workspace's Deploy API and a runtime backend.
 *
 * Phase 1 ships `LocalDockerTarget`. Future targets (`PulumiTarget`, …) implement
 * this same surface so the deploy routes never hardcode a runtime.
 */
import type { Kota0DeployTargetKind } from "@/components/kota0/deploy/kota0DeploymentTypes.ts";

export interface DeployArtifactRef {
  kind: Kota0DeployTargetKind;
  /** Adapter-specific image / artifact identifier (e.g. local Docker image tag). */
  imageRef: string;
}

export interface DeployEndpoint {
  /** Reachable URL for the deployed bundle. */
  url: string;
  /** Adapter-specific runtime handle (Docker container id, ECS task ARN, etc.). */
  handle: string;
}

export interface DeployBuildInput {
  appId: string;
  bundleDir: string;
}

export interface DeployProvisionInput {
  appId: string;
  deploymentId: string;
  artifact: DeployArtifactRef;
  /** Env vars injected at runtime — gateway URL, SCRIBE_API_KEY, K0_APP_REDIS_PREFIX, etc. */
  env: Record<string, string>;
}

export type DeployRuntimeStatus = "running" | "stopped" | "missing" | "unknown";

export interface DeployTarget {
  readonly kind: Kota0DeployTargetKind;
  build(input: DeployBuildInput): Promise<DeployArtifactRef>;
  provision(input: DeployProvisionInput): Promise<DeployEndpoint>;
  status(handle: string): Promise<DeployRuntimeStatus>;
  destroy(handle: string): Promise<void>;
}

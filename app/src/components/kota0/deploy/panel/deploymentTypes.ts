/**
 * Domain types for the `k0_deployment` Scribe table. One row per deploy attempt.
 *
 * Lifecycle: `building` → `running` (or `failed`) → `destroyed`. Rows are never
 * mutated in place once `destroyed`; a new deploy creates a new row.
 */

export type DeploymentStatus = "building" | "running" | "failed" | "destroyed";

/** Identifies which adapter handled the deploy. Phase 1 ships `local-docker` only. */
export type DeployTargetKind = "local-docker";

export interface DeploymentData {
  /** Stable, client-generated UUID — distinct from the Scribe numeric row id. */
  deployment_id: string;
  app_id: string;
  target: DeployTargetKind;
  status: DeploymentStatus;
  /** Adapter-specific image ref (e.g. `kota0-app-<short>:<timestamp>` for local-docker). */
  image_ref?: string;
  /** Adapter-specific runtime handle (e.g. Docker container id). */
  container_id?: string;
  /** Reachable URL once status is `running`. */
  endpoint_url?: string;
  /** Free-form error message when status is `failed`. */
  error?: string;
  /** When the row was created (build started). */
  started_at: string;
  /** Set when status transitions to `destroyed`. */
  destroyed_at?: string;
}

export interface DeploymentRow extends DeploymentData {
  scribeRowId: number;
  updatedAt: string | null;
}

export interface DeploymentRepository {
  listForApp(appId: string): Promise<DeploymentRow[]>;
  get(deploymentId: string): Promise<DeploymentRow | null>;
  create(input: Omit<DeploymentData, "status" | "started_at"> & {
    status?: DeploymentStatus;
  }): Promise<DeploymentRow>;
  patch(
    deploymentId: string,
    patch: Partial<Omit<DeploymentData, "deployment_id" | "app_id" | "target" | "started_at">>,
  ): Promise<DeploymentRow>;
}

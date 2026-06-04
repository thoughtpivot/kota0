/**
 * Scribe-backed CRUD for `k0_deployment`. Mirrors AppRepository's row shape:
 *   { id (UUID), data (JSONB DeploymentData), date_created, date_modified }
 */
import { scribe } from "@/lib/scribe";
import { randomUUID } from "node:crypto";
import type {
  DeploymentData,
  DeploymentRepository,
  DeploymentRow,
  DeploymentStatus,
  DeployTargetKind,
} from "@/components/kota0/deploy/panel/deploymentTypes.ts";

const TABLE = "k0_deployment";

type ScribeRow = {
  id: number;
  data: DeploymentData;
  date_created?: string;
  date_modified?: string;
};

const VALID_STATUS = new Set<DeploymentStatus>(["building", "running", "failed", "destroyed"]);
const VALID_TARGET = new Set<DeployTargetKind>(["local-docker"]);

function normalizeAllRows(raw: unknown): ScribeRow[] {
  if (Array.isArray(raw)) return raw as ScribeRow[];
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: ScribeRow[] }).data;
  }
  return [];
}

function asData(raw: Record<string, unknown> | undefined): DeploymentData | null {
  if (!raw || typeof raw !== "object") return null;
  const deployment_id = typeof raw.deployment_id === "string" ? raw.deployment_id : null;
  const app_id = typeof raw.app_id === "string" ? raw.app_id : null;
  const target = typeof raw.target === "string" ? (raw.target as DeployTargetKind) : null;
  const status = typeof raw.status === "string" ? (raw.status as DeploymentStatus) : null;
  const started_at = typeof raw.started_at === "string" ? raw.started_at : null;
  if (!deployment_id || !app_id || !target || !status || !started_at) return null;
  if (!VALID_TARGET.has(target) || !VALID_STATUS.has(status)) return null;
  const optString = (k: string): string | undefined =>
    typeof raw[k] === "string" ? (raw[k] as string) : undefined;
  return {
    deployment_id,
    app_id,
    target,
    status,
    started_at,
    ...(optString("image_ref") !== undefined ? { image_ref: optString("image_ref")! } : {}),
    ...(optString("container_id") !== undefined ? { container_id: optString("container_id")! } : {}),
    ...(optString("endpoint_url") !== undefined ? { endpoint_url: optString("endpoint_url")! } : {}),
    ...(optString("error") !== undefined ? { error: optString("error")! } : {}),
    ...(optString("destroyed_at") !== undefined ? { destroyed_at: optString("destroyed_at")! } : {}),
  };
}

function rowToDomain(row: ScribeRow): DeploymentRow | null {
  const data = asData(row.data as unknown as Record<string, unknown>);
  if (!data) return null;
  return {
    ...data,
    scribeRowId: row.id,
    updatedAt: row.date_modified ?? row.date_created ?? null,
  };
}

export class ScribeDeploymentRepository implements DeploymentRepository {
  async listForApp(appId: string): Promise<DeploymentRow[]> {
    const rows = normalizeAllRows((await scribe.get(`/${TABLE}/all`)).data);
    const out: DeploymentRow[] = [];
    for (const row of rows) {
      const d = rowToDomain(row);
      if (d && d.app_id === appId) out.push(d);
    }
    out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return out;
  }

  private async findRow(deploymentId: string): Promise<ScribeRow | null> {
    const rows = normalizeAllRows((await scribe.get(`/${TABLE}/all`)).data);
    return (
      rows.find((r) => asData(r.data as unknown as Record<string, unknown>)?.deployment_id === deploymentId) ?? null
    );
  }

  async get(deploymentId: string): Promise<DeploymentRow | null> {
    const row = await this.findRow(deploymentId);
    return row ? rowToDomain(row) : null;
  }

  async create(
    input: Omit<DeploymentData, "status" | "started_at"> & { status?: DeploymentStatus },
  ): Promise<DeploymentRow> {
    const now = new Date().toISOString();
    const data: DeploymentData = {
      deployment_id: input.deployment_id || randomUUID(),
      app_id: input.app_id,
      target: input.target,
      status: input.status ?? "building",
      started_at: now,
      ...(input.image_ref !== undefined ? { image_ref: input.image_ref } : {}),
      ...(input.container_id !== undefined ? { container_id: input.container_id } : {}),
      ...(input.endpoint_url !== undefined ? { endpoint_url: input.endpoint_url } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
    };
    await scribe.post(`/${TABLE}`, {
      data,
      date_created: now,
      date_modified: now,
      created_by: 1,
      modified_by: 1,
    });
    const created = await this.get(data.deployment_id);
    if (!created) throw new Error("scribe_create_failed");
    return created;
  }

  async patch(
    deploymentId: string,
    patch: Partial<Omit<DeploymentData, "deployment_id" | "app_id" | "target" | "started_at">>,
  ): Promise<DeploymentRow> {
    const row = await this.findRow(deploymentId);
    if (!row) throw new Error("deployment_not_found");
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) throw new Error("invalid_row");
    const next: DeploymentData = { ...data, ...patch };
    const now = new Date().toISOString();
    await scribe.put(`/${TABLE}/${row.id}`, {
      data: next,
      date_created: row.date_created ?? now,
      date_modified: now,
      created_by: 1,
      modified_by: 1,
    });
    const updated = await this.get(deploymentId);
    if (!updated) throw new Error("scribe_update_failed");
    return updated;
  }
}

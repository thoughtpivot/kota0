import { scribe } from "@/lib/scribe";
import type { Kota0AppData, Kota0AppFull, Kota0AppRepository, Kota0AppStatus, Kota0AppSummary } from "./kota0AppTypes";

const TABLE = "kota0_app";

type ScribeRow = {
  id: number;
  data: Kota0AppData;
  date_created?: string;
  date_modified?: string;
};

function normalizeAllRows(raw: unknown): ScribeRow[] {
  if (Array.isArray(raw)) return raw as ScribeRow[];
  if (raw && typeof raw === "object" && "data" in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: ScribeRow[] }).data;
  }
  return [];
}

function asData(raw: Record<string, unknown> | undefined): Kota0AppData | null {
  if (!raw || typeof raw !== "object") return null;
  const app_id = typeof raw.app_id === "string" ? raw.app_id : null;
  const name = typeof raw.name === "string" ? raw.name : null;
  const status = typeof raw.status === "string" ? (raw.status as Kota0AppStatus) : null;
  const source = typeof raw.source === "string" ? raw.source : null;
  if (!app_id || !name || !status || source === null) return null;
  return { app_id, name, status, source };
}

function rowToFull(row: ScribeRow): Kota0AppFull | null {
  const data = asData(row.data as unknown as Record<string, unknown>);
  if (!data) return null;
  return {
    app_id: data.app_id,
    name: data.name,
    status: data.status,
    source: data.source,
    updatedAt: row.date_modified ?? row.date_created ?? null,
    scribeRowId: row.id,
  };
}

function rowToSummary(row: ScribeRow): Kota0AppSummary | null {
  const full = rowToFull(row);
  if (!full) return null;
  return {
    app_id: full.app_id,
    name: full.name,
    status: full.status,
    updatedAt: full.updatedAt,
  };
}

export class ScribeKota0AppRepository implements Kota0AppRepository {
  async listApps(): Promise<Kota0AppSummary[]> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const out: Kota0AppSummary[] = [];
    for (const row of rows) {
      const s = rowToSummary(row);
      if (s) out.push(s);
    }
    out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return out;
  }

  async getApp(appId: string): Promise<Kota0AppFull | null> {
    const rows = normalizeAllRows((await scribe.get(`/${TABLE}/all`)).data);
    const row = rows.find((r) => asData(r.data as unknown as Record<string, unknown>)?.app_id === appId);
    return row ? rowToFull(row) : null;
  }

  private async findRow(appId: string): Promise<ScribeRow | null> {
    const rows = normalizeAllRows((await scribe.get(`/${TABLE}/all`)).data);
    return rows.find((r) => asData(r.data as unknown as Record<string, unknown>)?.app_id === appId) ?? null;
  }

  /** Scribe numeric row id for history/time-travel APIs. */
  async getScribeRowIdForApp(appId: string): Promise<number | null> {
    const row = await this.findRow(appId);
    return row?.id ?? null;
  }

  async createApp(input: { name: string; source: string }): Promise<Kota0AppFull> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const app_id = randomUUID();
    const data: Kota0AppData = {
      app_id,
      name: input.name.trim() || "Untitled",
      status: "draft",
      source: input.source,
    };
    await scribe.post(`/${TABLE}`, {
      data,
      date_created: now,
      date_modified: now,
      created_by: 1,
      modified_by: 1,
    });
    const created = await this.getApp(app_id);
    if (!created) {
      throw new Error("scribe_create_failed");
    }
    return created;
  }

  async updateAppSource(appId: string, source: string): Promise<Kota0AppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const next: Kota0AppData = { ...data, source };
    await scribe.put(`/${TABLE}/${row.id}`, {
      data: next,
      date_created: row.date_created ?? now,
      date_modified: now,
      created_by: 1,
      modified_by: 1,
    });
    const updated = await this.getApp(appId);
    if (!updated) {
      throw new Error("scribe_update_failed");
    }
    return updated;
  }

  async updateAppMeta(appId: string, patch: { name?: string; status?: Kota0AppStatus }): Promise<Kota0AppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const next: Kota0AppData = {
      ...data,
      name: patch.name !== undefined ? patch.name.trim() || data.name : data.name,
      status: patch.status ?? data.status,
    };
    await scribe.put(`/${TABLE}/${row.id}`, {
      data: next,
      date_created: row.date_created ?? now,
      date_modified: now,
      created_by: 1,
      modified_by: 1,
    });
    const updated = await this.getApp(appId);
    if (!updated) {
      throw new Error("scribe_update_failed");
    }
    return updated;
  }

  async deleteApp(appId: string): Promise<void> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    await scribe.delete(`/${TABLE}/${row.id}`);
  }
}

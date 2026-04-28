import { scribe } from "@/lib/scribe";
import { randomInt } from "node:crypto";
import {
  defaultNvibeAppIconId,
  isNvibeAppIconId,
  NVIBE_APP_ICON_IDS,
  type NvibeAppIconId,
} from "./nvibeAppIconIds";
import { randomNvibeAppIconId } from "./nvibeAppIconRandom";
import type { NvibeAppData, NvibeAppFull, NvibeAppRepository, NvibeAppStatus, NvibeAppSummary } from "./nvibeAppTypes";
import { DEFAULT_NVIBE_BACKEND } from "@/components/nvibe/viewer/nvibeMaterialize";

const TABLE = "nvibe_app";

type ScribeRow = {
  id: number;
  data: NvibeAppData;
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

function asData(raw: Record<string, unknown> | undefined): NvibeAppData | null {
  if (!raw || typeof raw !== "object") return null;
  const app_id = typeof raw.app_id === "string" ? raw.app_id : null;
  const name = typeof raw.name === "string" ? raw.name : null;
  const status = typeof raw.status === "string" ? (raw.status as NvibeAppStatus) : null;
  const source = typeof raw.source === "string" ? raw.source : null;
  const backendSource =
    typeof raw.backendSource === "string" ? raw.backendSource : undefined;
  if (!app_id || !name || !status || source === null) return null;
  let app_icon: string | undefined;
  if (typeof raw.app_icon === "string") {
    const t = raw.app_icon.trim();
    if (isNvibeAppIconId(t)) app_icon = t;
  }
  return {
    app_id,
    name,
    status,
    source,
    backendSource: backendSource ?? DEFAULT_NVIBE_BACKEND,
    app_icon,
  };
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function rowToFull(row: ScribeRow): NvibeAppFull | null {
  const data = asData(row.data as unknown as Record<string, unknown>);
  if (!data) return null;
  return {
    app_id: data.app_id,
    name: data.name,
    status: data.status,
    source: data.source,
    backendSource: data.backendSource,
    app_icon: data.app_icon ?? defaultNvibeAppIconId(data.app_id),
    updatedAt: row.date_modified ?? row.date_created ?? null,
    scribeRowId: row.id,
  };
}

function rowToSummary(row: ScribeRow): NvibeAppSummary | null {
  const full = rowToFull(row);
  if (!full) return null;
  return {
    app_id: full.app_id,
    name: full.name,
    status: full.status,
    app_icon: full.app_icon,
    updatedAt: full.updatedAt,
  };
}

export class ScribeNvibeAppRepository implements NvibeAppRepository {
  async listApps(): Promise<NvibeAppSummary[]> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const out: NvibeAppSummary[] = [];
    for (const row of rows) {
      const s = rowToSummary(row);
      if (s) out.push(s);
    }
    out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return out;
  }

  async getApp(appId: string): Promise<NvibeAppFull | null> {
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

  async createApp(input: { name: string; source: string; backendSource: string }): Promise<NvibeAppFull> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const app_id = randomUUID();
    const data: NvibeAppData = {
      app_id,
      name: input.name.trim() || "Untitled",
      status: "draft",
      source: input.source,
      backendSource: input.backendSource,
      app_icon: randomNvibeAppIconId(),
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

  async updateAppSources(appId: string, input: { source: string; backendSource: string }): Promise<NvibeAppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const next: NvibeAppData = { ...data, source: input.source, backendSource: input.backendSource };
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

  async updateAppMeta(
    appId: string,
    patch: { name?: string; status?: NvibeAppStatus; app_icon?: string },
  ): Promise<NvibeAppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const next: NvibeAppData = {
      ...data,
      name: patch.name !== undefined ? patch.name.trim() || data.name : data.name,
      status: patch.status ?? data.status,
    };
    if (patch.app_icon !== undefined) {
      if (!isNvibeAppIconId(patch.app_icon)) {
        throw new Error("invalid_app_icon");
      }
      next.app_icon = patch.app_icon;
    }
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

  /**
   * Tooling: rewrite `app_icon` on every valid `nvibe_app` row in Scribe.
   * If there are at most as many apps as icons, each app gets a distinct icon (random pairing).
   * Otherwise each app gets an independent random icon (duplicates allowed).
   */
  async randomizePersistedAppIcons(): Promise<{ updated: number; assignments: { app_id: string; app_icon: string }[] }> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const pairs: { row: ScribeRow; data: NvibeAppData }[] = [];
    for (const row of rows) {
      const data = asData(row.data as unknown as Record<string, unknown>);
      if (data) pairs.push({ row, data });
    }
    shuffleInPlace(pairs);
    const n = pairs.length;
    let icons: NvibeAppIconId[];
    if (n === 0) {
      icons = [];
    } else if (n <= NVIBE_APP_ICON_IDS.length) {
      icons = [...NVIBE_APP_ICON_IDS];
      shuffleInPlace(icons);
      icons = icons.slice(0, n);
    } else {
      icons = pairs.map(() => randomNvibeAppIconId());
    }
    const now = new Date().toISOString();
    const assignments: { app_id: string; app_icon: string }[] = [];
    for (let i = 0; i < n; i++) {
      const { row, data } = pairs[i]!;
      const app_icon = icons[i]!;
      const next: NvibeAppData = { ...data, app_icon };
      await scribe.put(`/${TABLE}/${row.id}`, {
        data: next,
        date_created: row.date_created ?? now,
        date_modified: now,
        created_by: 1,
        modified_by: 1,
      });
      assignments.push({ app_id: data.app_id, app_icon });
    }
    return { updated: n, assignments };
  }
}

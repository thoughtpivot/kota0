import { scribe } from "@/lib/scribe";
import { randomInt } from "node:crypto";
import {
  defaultAppIconId,
  isAppIconId,
  K0_APP_ICON_IDS,
  type AppIconId,
} from "@/components/kota0/apps/icons/appIconIds";
import { randomAppIconId } from "@/components/kota0/apps/icons/appIconRandom";
import type { AppData, AppFull, AppRepository, AppStatus, AppSummary } from "@/components/kota0/apps/data/appTypes";
import { sortAppsByUpdatedAtDesc } from "@/components/kota0/apps/data/sortAppsByUpdatedAt";
import { DEFAULT_K0_BACKEND } from "@/components/kota0/viewer/materialize/materialize";
import {
  extractBackendScribeKeys,
  mergeScribeBundleComponentManifest,
} from "@/components/kota0/apps/data/appScribeComponents.ts";

const TABLE = "k0_app";

type ScribeRow = {
  id: number;
  data: AppData;
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

function asData(raw: Record<string, unknown> | undefined): AppData | null {
  if (!raw || typeof raw !== "object") return null;
  const app_id = typeof raw.app_id === "string" ? raw.app_id : null;
  const name = typeof raw.name === "string" ? raw.name : null;
  const status = typeof raw.status === "string" ? (raw.status as AppStatus) : null;
  const source = typeof raw.source === "string" ? raw.source : null;
  const backendSource =
    typeof raw.backendSource === "string" ? raw.backendSource : undefined;
  if (!app_id || !name || !status || source === null) return null;
  let app_icon: string | undefined;
  if (typeof raw.app_icon === "string") {
    const t = raw.app_icon.trim();
    if (isAppIconId(t)) app_icon = t;
  }
  let bundleEnv: string | undefined;
  if (typeof raw.bundleEnv === "string") {
    bundleEnv = raw.bundleEnv;
  }
  let scribe_bundle_components: string[] | undefined;
  if (Array.isArray(raw.scribe_bundle_components)) {
    const strings = raw.scribe_bundle_components.filter((x): x is string => typeof x === "string");
    const merged = mergeScribeBundleComponentManifest(undefined, strings);
    if (merged.length > 0) scribe_bundle_components = merged;
  }
  return {
    app_id,
    name,
    status,
    source,
    backendSource: backendSource ?? DEFAULT_K0_BACKEND,
    app_icon,
    ...(bundleEnv !== undefined ? { bundleEnv } : {}),
    ...(scribe_bundle_components !== undefined ? { scribe_bundle_components } : {}),
  };
}

/**
 * Build the next non-colliding `<base> (copy)` / `(copy N)` name for a duplicate. Mirrors the
 * macOS Finder pattern. If `sourceName` already ends in `(copy)` / `(copy N)`, the base is the
 * underlying name so a second duplicate of "Foo (copy)" yields "Foo (copy 2)", not "Foo (copy) (copy)".
 */
export function nextCopyName(sourceName: string, existingNames: readonly string[]): string {
  const trimmedSource = sourceName.trim();
  const base = stripCopySuffix(trimmedSource) || "Untitled";
  const taken = new Set(existingNames.map((n) => n.trim()));
  const first = `${base} (copy)`;
  if (!taken.has(first)) return first;
  let n = 2;
  while (taken.has(`${base} (copy ${n})`)) n += 1;
  return `${base} (copy ${n})`;
}

function stripCopySuffix(name: string): string {
  const match = name.match(/^(.*?)\s+\(copy(?:\s+\d+)?\)$/);
  return match ? match[1]!.trim() : name;
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
}

function rowToFull(row: ScribeRow): AppFull | null {
  const data = asData(row.data as unknown as Record<string, unknown>);
  if (!data) return null;
  return {
    app_id: data.app_id,
    name: data.name,
    status: data.status,
    source: data.source,
    backendSource: data.backendSource,
    ...(data.bundleEnv !== undefined ? { bundleEnv: data.bundleEnv } : {}),
    ...(data.scribe_bundle_components !== undefined && data.scribe_bundle_components.length > 0 ?
      { scribe_bundle_components: data.scribe_bundle_components }
    : {}),
    app_icon: data.app_icon ?? defaultAppIconId(data.app_id),
    updatedAt: row.date_modified ?? row.date_created ?? null,
    scribeRowId: row.id,
  };
}

function rowToSummary(row: ScribeRow): AppSummary | null {
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

export class ScribeAppRepository implements AppRepository {
  async listApps(): Promise<AppSummary[]> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const out: AppSummary[] = [];
    for (const row of rows) {
      const s = rowToSummary(row);
      if (s) out.push(s);
    }
    sortAppsByUpdatedAtDesc(out);
    return out;
  }

  async getApp(appId: string): Promise<AppFull | null> {
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

  async createApp(input: { name: string; source: string; backendSource: string }): Promise<AppFull> {
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const app_id = randomUUID();
    const extracted = extractBackendScribeKeys(input.backendSource);
    const manifest = mergeScribeBundleComponentManifest(undefined, extracted);
    const data: AppData = {
      app_id,
      name: input.name.trim() || "Untitled",
      status: "draft",
      source: input.source,
      backendSource: input.backendSource,
      app_icon: randomAppIconId(),
      ...(manifest.length > 0 ? { scribe_bundle_components: manifest } : {}),
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

  async updateAppSources(
    appId: string,
    input: { source: string; backendSource: string; bundleEnv?: string },
  ): Promise<AppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const extracted = extractBackendScribeKeys(input.backendSource);
    const manifest = mergeScribeBundleComponentManifest(data.scribe_bundle_components, extracted);
    const next: AppData = {
      ...data,
      source: input.source,
      backendSource: input.backendSource,
      ...(input.bundleEnv !== undefined ? { bundleEnv: input.bundleEnv } : {}),
      ...(manifest.length > 0 ? { scribe_bundle_components: manifest } : {}),
    };
    if (manifest.length === 0) {
      delete next.scribe_bundle_components;
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

  async updateAppMeta(
    appId: string,
    patch: { name?: string; status?: AppStatus; app_icon?: string },
  ): Promise<AppFull> {
    const row = await this.findRow(appId);
    if (!row) {
      throw new Error("app_not_found");
    }
    const data = asData(row.data as unknown as Record<string, unknown>);
    if (!data) {
      throw new Error("invalid_row");
    }
    const now = new Date().toISOString();
    const next: AppData = {
      ...data,
      name: patch.name !== undefined ? patch.name.trim() || data.name : data.name,
      status: patch.status ?? data.status,
    };
    if (patch.app_icon !== undefined) {
      if (!isAppIconId(patch.app_icon)) {
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

  async duplicateApp(sourceAppId: string): Promise<AppFull> {
    const source = await this.getApp(sourceAppId);
    if (!source) {
      throw new Error("app_not_found");
    }
    const summaries = await this.listApps();
    const name = nextCopyName(source.name, summaries.map((s) => s.name));
    const { randomUUID } = await import("node:crypto");
    const now = new Date().toISOString();
    const app_id = randomUUID();
    const extracted = extractBackendScribeKeys(source.backendSource);
    const manifest = mergeScribeBundleComponentManifest(undefined, extracted);
    const data: AppData = {
      app_id,
      name,
      status: "draft",
      source: source.source,
      backendSource: source.backendSource,
      app_icon: source.app_icon,
      ...(source.bundleEnv !== undefined ? { bundleEnv: source.bundleEnv } : {}),
      ...(manifest.length > 0 ? { scribe_bundle_components: manifest } : {}),
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

  /**
   * Tooling: rewrite `app_icon` on every valid `k0_app` row in Scribe.
   * If there are at most as many apps as icons, each app gets a distinct icon (random pairing).
   * Otherwise each app gets an independent random icon (duplicates allowed).
   */
  async randomizePersistedAppIcons(): Promise<{ updated: number; assignments: { app_id: string; app_icon: string }[] }> {
    const res = await scribe.get(`/${TABLE}/all`);
    const rows = normalizeAllRows(res.data);
    const pairs: { row: ScribeRow; data: AppData }[] = [];
    for (const row of rows) {
      const data = asData(row.data as unknown as Record<string, unknown>);
      if (data) pairs.push({ row, data });
    }
    shuffleInPlace(pairs);
    const n = pairs.length;
    let icons: AppIconId[];
    if (n === 0) {
      icons = [];
    } else if (n <= K0_APP_ICON_IDS.length) {
      icons = [...K0_APP_ICON_IDS];
      shuffleInPlace(icons);
      icons = icons.slice(0, n);
    } else {
      icons = pairs.map(() => randomAppIconId());
    }
    const now = new Date().toISOString();
    const assignments: { app_id: string; app_icon: string }[] = [];
    for (let i = 0; i < n; i++) {
      const { row, data } = pairs[i]!;
      const app_icon = icons[i]!;
      const next: AppData = { ...data, app_icon };
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

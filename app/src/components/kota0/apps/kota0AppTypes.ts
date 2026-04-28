export type Kota0AppStatus = "draft" | "active" | "applied" | "error";

export interface Kota0AppData {
  app_id: string;
  name: string;
  status: Kota0AppStatus;
  source: string;
  /** Allowlisted id (see `kota0AppIconIds.ts`); omit on legacy Scribe rows. */
  app_icon?: string;
}

export interface Kota0AppSummary {
  app_id: string;
  name: string;
  status: Kota0AppStatus;
  /** Resolved allowlisted icon id (defaulted from `app_id` when missing in Scribe). */
  app_icon: string;
  updatedAt: string | null;
}

export interface Kota0AppFull extends Kota0AppSummary {
  source: string;
  scribeRowId: number;
}

export interface Kota0AppRepository {
  listApps(): Promise<Kota0AppSummary[]>;
  getApp(appId: string): Promise<Kota0AppFull | null>;
  createApp(input: { name: string; source: string }): Promise<Kota0AppFull>;
  updateAppSource(appId: string, source: string): Promise<Kota0AppFull>;
  updateAppMeta(
    appId: string,
    patch: { name?: string; status?: Kota0AppStatus; app_icon?: string },
  ): Promise<Kota0AppFull>;
  /** Removes the Scribe row by numeric id (domain `app_id` resolved server-side). */
  deleteApp(appId: string): Promise<void>;
}

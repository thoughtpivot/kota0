export type NvibeAppStatus = "draft" | "active" | "applied" | "error";

export interface NvibeAppData {
  app_id: string;
  name: string;
  status: NvibeAppStatus;
  source: string;
}

export interface NvibeAppSummary {
  app_id: string;
  name: string;
  status: NvibeAppStatus;
  updatedAt: string | null;
}

export interface NvibeAppFull extends NvibeAppSummary {
  source: string;
  scribeRowId: number;
}

export interface NvibeAppRepository {
  listApps(): Promise<NvibeAppSummary[]>;
  getApp(appId: string): Promise<NvibeAppFull | null>;
  createApp(input: { name: string; source: string }): Promise<NvibeAppFull>;
  updateAppSource(appId: string, source: string): Promise<NvibeAppFull>;
  updateAppMeta(appId: string, patch: { name?: string; status?: NvibeAppStatus }): Promise<NvibeAppFull>;
  /** Removes the Scribe row by numeric id (domain `app_id` resolved server-side). */
  deleteApp(appId: string): Promise<void>;
}

export type NvibeAppStatus = "draft" | "active" | "applied" | "error";

export interface NvibeAppData {
  app_id: string;
  name: string;
  status: NvibeAppStatus;
  source: string;
  /** Koa/Flight per-app server module; deployed under `bundles/<app_id>/App.backend.ts` (bundle Flight port 4000). */
  backendSource: string;
  /** Allowlisted id (see `nvibeAppIconIds.ts`); omit on legacy Scribe rows. */
  app_icon?: string;
}

export interface NvibeAppSummary {
  app_id: string;
  name: string;
  status: NvibeAppStatus;
  /** Resolved allowlisted icon id (defaulted from `app_id` when missing in Scribe). */
  app_icon: string;
  updatedAt: string | null;
}

export interface NvibeAppFull extends NvibeAppSummary {
  source: string;
  backendSource: string;
  scribeRowId: number;
}

export interface NvibeAppRepository {
  listApps(): Promise<NvibeAppSummary[]>;
  getApp(appId: string): Promise<NvibeAppFull | null>;
  createApp(input: { name: string; source: string; backendSource: string }): Promise<NvibeAppFull>;
  updateAppSources(appId: string, input: { source: string; backendSource: string }): Promise<NvibeAppFull>;
  updateAppMeta(
    appId: string,
    patch: { name?: string; status?: NvibeAppStatus; app_icon?: string },
  ): Promise<NvibeAppFull>;
  /** Removes the Scribe row by numeric id (domain `app_id` resolved server-side). */
  deleteApp(appId: string): Promise<void>;
}

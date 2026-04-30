export type PowervibeAppStatus = "draft" | "active" | "applied" | "error";

export interface PowervibeAppData {
  app_id: string;
  name: string;
  status: PowervibeAppStatus;
  source: string;
  /** Koa/Flight per-app server module; deployed under `bundles/<app_id>/App.backend.ts` (bundle Flight port 4000). */
  backendSource: string;
  /** Allowlisted id (see `powervibeAppIconIds.ts`); omit on legacy Scribe rows. */
  app_icon?: string;
  /** Per-app bundle dotenv text (`bundles/<app_id>/.env`); omit until first Save from Code → Secrets. */
  bundleEnv?: string;
}

export interface PowervibeAppSummary {
  app_id: string;
  name: string;
  status: PowervibeAppStatus;
  /** Resolved allowlisted icon id (defaulted from `app_id` when missing in Scribe). */
  app_icon: string;
  updatedAt: string | null;
}

export interface PowervibeAppFull extends PowervibeAppSummary {
  source: string;
  backendSource: string;
  /** Present when stored in Scribe and/or returned from GET after resolving disk fallback. */
  bundleEnv?: string;
  scribeRowId: number;
}

export interface PowervibeAppRepository {
  listApps(): Promise<PowervibeAppSummary[]>;
  getApp(appId: string): Promise<PowervibeAppFull | null>;
  createApp(input: { name: string; source: string; backendSource: string }): Promise<PowervibeAppFull>;
  updateAppSources(
    appId: string,
    input: { source: string; backendSource: string; bundleEnv?: string },
  ): Promise<PowervibeAppFull>;
  updateAppMeta(
    appId: string,
    patch: { name?: string; status?: PowervibeAppStatus; app_icon?: string },
  ): Promise<PowervibeAppFull>;
  /** Removes the Scribe row by numeric id (domain `app_id` resolved server-side). */
  deleteApp(appId: string): Promise<void>;
}

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
  /**
   * Scribe HTTP path keys used by this app’s `App.backend.ts` (`forComponent` / `subcomponent`), e.g. `blog_posts` or
   * `parent/child`. Used on delete to purge bundle-owned rows. Unioned with fresh extraction from `backendSource` on save.
   */
  scribe_bundle_components?: string[];
}

export interface PowervibeAppSummary {
  app_id: string;
  name: string;
  status: PowervibeAppStatus;
  /** Resolved allowlisted icon id (defaulted from `app_id` when missing in Scribe). */
  app_icon: string;
  updatedAt: string | null;
}

/** Apps rail row: real summary plus transient UI flags (optimistic create / delete-in-flight). */
export interface PowervibeAppRowVm extends PowervibeAppSummary {
  pending: boolean;
  deleting: boolean;
}

export interface PowervibeAppFull extends PowervibeAppSummary {
  source: string;
  backendSource: string;
  /** Present when stored in Scribe and/or returned from GET after resolving disk fallback. */
  bundleEnv?: string;
  /** Persisted + maintained list of Scribe components to purge when the app is deleted. */
  scribe_bundle_components?: string[];
  scribeRowId: number;
}

export interface PowervibeAppRepository {
  listApps(): Promise<PowervibeAppSummary[]>;
  getApp(appId: string): Promise<PowervibeAppFull | null>;
  createApp(input: {
    name: string;
    source: string;
    backendSource: string;
    /** Merged into `scribe_bundle_components` with extraction from `backendSource` (e.g. blog preset `blog_posts`). */
    scribeBundleComponentHints?: string[];
  }): Promise<PowervibeAppFull>;
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

export type Kota0AppStatus = "draft" | "active" | "applied" | "error";

export interface Kota0AppData {
  app_id: string;
  name: string;
  status: Kota0AppStatus;
  source: string;
  /** Koa/Flight per-app server module; deployed under `bundles/<app_id>/App.backend.ts` (bundle Flight port 4000). */
  backendSource: string;
  /** Allowlisted id (see `kota0AppIconIds.ts`); omit on legacy Scribe rows. */
  app_icon?: string;
  /** Per-app bundle dotenv text (`bundles/<app_id>/.env`); omit until first Save from Code → Secrets. */
  bundleEnv?: string;
  /**
   * Scribe HTTP path keys used by this app’s `App.backend.ts` (`forComponent` / `subcomponent`), e.g. `blog_posts` or
   * `parent/child`. Used on delete to purge bundle-owned rows. Unioned with fresh extraction from `backendSource` on save.
   */
  scribe_bundle_components?: string[];
}

export interface Kota0AppSummary {
  app_id: string;
  name: string;
  status: Kota0AppStatus;
  /** Resolved allowlisted icon id (defaulted from `app_id` when missing in Scribe). */
  app_icon: string;
  updatedAt: string | null;
}

/** Apps rail row: real summary plus transient UI flags (optimistic create / delete-in-flight). */
export interface Kota0AppRowVm extends Kota0AppSummary {
  pending: boolean;
  deleting: boolean;
}

export interface Kota0AppFull extends Kota0AppSummary {
  source: string;
  backendSource: string;
  /** Present when stored in Scribe and/or returned from GET after resolving disk fallback. */
  bundleEnv?: string;
  /** Persisted + maintained list of Scribe components to purge when the app is deleted. */
  scribe_bundle_components?: string[];
  scribeRowId: number;
}

export interface Kota0AppRepository {
  listApps(): Promise<Kota0AppSummary[]>;
  getApp(appId: string): Promise<Kota0AppFull | null>;
  createApp(input: { name: string; source: string; backendSource: string }): Promise<Kota0AppFull>;
  updateAppSources(
    appId: string,
    input: { source: string; backendSource: string; bundleEnv?: string },
  ): Promise<Kota0AppFull>;
  updateAppMeta(
    appId: string,
    patch: { name?: string; status?: Kota0AppStatus; app_icon?: string },
  ): Promise<Kota0AppFull>;
  /** Removes the Scribe row by numeric id (domain `app_id` resolved server-side). */
  deleteApp(appId: string): Promise<void>;
}

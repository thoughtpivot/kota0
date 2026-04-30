import { computed, ref } from "vue";
import { createNvibeApp, deleteNvibeApp, fetchNvibeApps, patchNvibeApp } from "./nvibeAppApi";
import type { NvibeAppSummary } from "./nvibeAppTypes";

const STORAGE_KEY = "vibe-nvibe-active-app-v1";

export function useNvibeApps() {
  const apps = ref<NvibeAppSummary[]>([]);
  const activeAppId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const renameBusy = ref(false);

  /** Coalesce overlapping list fetches (double mount / parallel callers). */
  let refreshInFlight: Promise<void> | null = null;

  function readStoredActiveId(): string | null {
    try {
      const v = sessionStorage.getItem(STORAGE_KEY);
      return v && v.trim() ? v.trim() : null;
    } catch {
      return null;
    }
  }

  function persistActiveId(id: string | null) {
    try {
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function refresh(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      loading.value = true;
      error.value = null;
      try {
        const r = await fetchNvibeApps();
        if (!r.ok) {
          error.value = r.message;
          apps.value = [];
          return;
        }
        apps.value = r.apps;
        const stored = readStoredActiveId();
        if (stored && r.apps.some((a) => a.app_id === stored)) {
          activeAppId.value = stored;
        } else if (r.apps.length > 0) {
          activeAppId.value = r.apps[0]!.app_id;
          persistActiveId(activeAppId.value);
        } else {
          activeAppId.value = null;
          persistActiveId(null);
        }
      } finally {
        loading.value = false;
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  async function ensureAtLeastOneApp(): Promise<boolean> {
    await refresh();
    if (apps.value.length > 0) return true;
    const cr = await createNvibeApp("Default app");
    if (!cr.ok) {
      error.value = cr.message;
      return false;
    }
    await refresh();
    activeAppId.value = cr.app.app_id;
    persistActiveId(activeAppId.value);
    return true;
  }

  function selectApp(appId: string) {
    if (!apps.value.some((a) => a.app_id === appId)) return;
    activeAppId.value = appId;
    persistActiveId(appId);
  }

  /** PATCH display name; updates `apps` in memory on success. */
  async function renameApp(appId: string, name: string): Promise<boolean> {
    const cur = apps.value.find((a) => a.app_id === appId);
    if (!cur) return false;
    const trimmed = name.trim();
    if (trimmed === cur.name) return true;
    if (trimmed === "") return true;
    renameBusy.value = true;
    error.value = null;
    const r = await patchNvibeApp(appId, { name: trimmed });
    renameBusy.value = false;
    if (!r.ok) {
      error.value = r.message;
      return false;
    }
    const idx = apps.value.findIndex((a) => a.app_id === appId);
    if (idx >= 0) {
      const prev = apps.value[idx]!;
      apps.value[idx] = {
        ...prev,
        name: r.app.name,
        status: r.app.status,
        app_icon: r.app.app_icon ?? prev.app_icon,
        updatedAt: r.app.updatedAt,
      };
    }
    return true;
  }

  async function createNewApp(name?: string): Promise<boolean> {
    error.value = null;
    const cr = await createNvibeApp(name ?? "New app");
    if (!cr.ok) {
      error.value = cr.message;
      return false;
    }
    await refresh();
    activeAppId.value = cr.app.app_id;
    persistActiveId(activeAppId.value);
    return true;
  }

  /** Deletes the app in Scribe; if the list becomes empty, creates a default app. */
  async function removeApp(appId: string): Promise<boolean> {
    error.value = null;
    const dr = await deleteNvibeApp(appId);
    if (!dr.ok) {
      error.value = dr.message;
      return false;
    }
    await refresh();
    if (apps.value.length === 0) {
      return ensureAtLeastOneApp();
    }
    if (activeAppId.value === appId) {
      activeAppId.value = apps.value[0]!.app_id;
      persistActiveId(activeAppId.value);
    }
    return true;
  }

  const activeApp = computed(() => apps.value.find((a) => a.app_id === activeAppId.value) ?? null);

  return {
    apps,
    activeAppId,
    activeApp,
    loading,
    error,
    renameBusy,
    refresh,
    ensureAtLeastOneApp,
    selectApp,
    renameApp,
    createNewApp,
    removeApp,
  };
}

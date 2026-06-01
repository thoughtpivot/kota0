import { sortAppsByUpdatedAtDesc } from "@/components/kota0/apps/data/sortAppsByUpdatedAt";
import { pushToast, dismissToast } from "@/components/kota0/ai/dock/useAiToast";
import { computed, ref } from "vue";
import {
  createApp,
  deleteApp,
  duplicateApp as apiDuplicateApp,
  fetchApps,
  fetchSuggestAppName,
  patchApp,
} from "@/components/kota0/apps/data/appApi";
import { pickAppNameClientFallback } from "@/components/kota0/apps/appNameFallback";
import type { AppRowVm, AppSummary } from "@/components/kota0/apps/data/appTypes";

const STORAGE_KEY = "vibe-kota0-active-app-v1";
const DELETE_UNDO_MS = 5000;

export function useApps() {
  const apps = ref<AppSummary[]>([]);
  const activeAppId = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const renameBusy = ref(false);

  /** Optimistic “creating…” row at top of rail (client UUID until POST returns). */
  const pendingCreateId = ref<string | null>(null);
  const pendingCreateName = ref("Untitled app");

  /** App removed from the list but DELETE not sent yet — toast offers Restore. */
  const pendingDeletion = ref<{
    appId: string;
    snapshot: AppSummary;
    toastId: number;
  } | null>(null);

  let deletionTimer: ReturnType<typeof setTimeout> | null = null;

  /** Coalesce overlapping list fetches (double mount / parallel callers). */
  let refreshInFlight: Promise<void> | null = null;

  /** Skip the preview auto-start debounce once after create/duplicate. */
  const previewStartImmediate = ref(false);

  /** One create at a time (covers suggest-name round-trip before `pendingCreateId` is set). */
  let createNewAppInFlight: Promise<boolean> | null = null;

  const deletionUndoPending = computed(() => pendingDeletion.value !== null);

  const displayApps = computed<AppRowVm[]>(() => {
    const real = apps.value.map((a) => ({
      ...a,
      pending: false,
      deleting: false,
    }));
    if (!pendingCreateId.value) return real;
    return [
      {
        app_id: pendingCreateId.value,
        name: pendingCreateName.value,
        status: "draft",
        app_icon: "sparkles",
        updatedAt: null,
        pending: true,
        deleting: false,
      },
      ...real,
    ];
  });

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
        const r = await fetchApps();
        if (!r.ok) {
          error.value = r.message;
          apps.value = [];
          return;
        }
        apps.value = r.apps;
        const pend = pendingDeletion.value;
        if (pend) {
          apps.value = apps.value.filter((a) => a.app_id !== pend.appId);
        }
        const stored = readStoredActiveId();
        if (stored && apps.value.some((a) => a.app_id === stored)) {
          activeAppId.value = stored;
        } else if (apps.value.length > 0) {
          activeAppId.value = apps.value[0]!.app_id;
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
    const r = await patchApp(appId, { name: trimmed });
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
      sortAppsByUpdatedAtDesc(apps.value);
    }
    const pend = pendingDeletion.value;
    if (pend && pend.appId === appId) {
      pendingDeletion.value = {
        ...pend,
        snapshot: {
          ...pend.snapshot,
          name: r.app.name,
          status: r.app.status,
          app_icon: r.app.app_icon ?? pend.snapshot.app_icon,
          updatedAt: r.app.updatedAt,
        },
      };
    }
    return true;
  }

  async function createNewApp(name?: string): Promise<boolean> {
    if (createNewAppInFlight) return createNewAppInFlight;
    createNewAppInFlight = (async () => {
      if (pendingCreateId.value) return false;
      error.value = null;
      let label: string;
      if (name?.trim()) {
        label = name.trim();
      } else {
        const sr = await fetchSuggestAppName();
        label = sr.ok ? sr.name : pickAppNameClientFallback();
      }
      pendingCreateName.value = label;
      pendingCreateId.value = crypto.randomUUID();
      try {
        const cr = await createApp(label);
        if (!cr.ok) {
          error.value = cr.message;
          pendingCreateId.value = null;
          return false;
        }
        pendingCreateId.value = null;
        /** Persist before `refresh()` so list reconciliation does not re-select the previous app from sessionStorage. */
        persistActiveId(cr.app.app_id);
        await refresh();
        previewStartImmediate.value = true;
        activeAppId.value = cr.app.app_id;
        persistActiveId(cr.app.app_id);
        return true;
      } catch (e) {
        pendingCreateId.value = null;
        throw e;
      }
    })().finally(() => {
      createNewAppInFlight = null;
    });
    return createNewAppInFlight;
  }

  function cancelScheduledDeletion(): void {
    const p = pendingDeletion.value;
    if (!p) return;
    if (deletionTimer !== null) {
      clearTimeout(deletionTimer);
      deletionTimer = null;
    }
    pendingDeletion.value = null;
    apps.value = [...apps.value, p.snapshot];
    sortAppsByUpdatedAtDesc(apps.value);
    activeAppId.value = p.snapshot.app_id;
    persistActiveId(p.snapshot.app_id);
  }

  async function completeScheduledDeletion(): Promise<void> {
    const p = pendingDeletion.value;
    if (!p) return;
    if (deletionTimer !== null) {
      clearTimeout(deletionTimer);
      deletionTimer = null;
    }
    const { appId, snapshot, toastId } = p;
    pendingDeletion.value = null;
    dismissToast(toastId);

    error.value = null;
    const dr = await deleteApp(appId);
    if (!dr.ok) {
      error.value = dr.message;
      apps.value = [...apps.value, snapshot];
      sortAppsByUpdatedAtDesc(apps.value);
      activeAppId.value = snapshot.app_id;
      persistActiveId(snapshot.app_id);
      pushToast({ message: dr.message, variant: "error", durationMs: 5500 });
      return;
    }
    await refresh();
    if (apps.value.length === 0) {
      activeAppId.value = null;
      persistActiveId(null);
    } else if (activeAppId.value === null || !apps.value.some((a) => a.app_id === activeAppId.value)) {
      activeAppId.value = apps.value[0]!.app_id;
      persistActiveId(activeAppId.value);
    }
  }

  /**
   * Removes the app from the rail immediately, shows a toast with Restore, then DELETEs after {@link DELETE_UNDO_MS}.
   */
  function scheduleRemoveApp(appId: string): boolean {
    if (pendingDeletion.value) return false;
    const idx = apps.value.findIndex((a) => a.app_id === appId);
    if (idx < 0) return false;

    const snapshot = { ...apps.value[idx]! };
    apps.value = apps.value.filter((a) => a.app_id !== appId);

    if (activeAppId.value === appId) {
      activeAppId.value = apps.value[0]?.app_id ?? null;
      persistActiveId(activeAppId.value);
    }

    const toastId = pushToast({
      message: `"${snapshot.name}" removed. You can restore it for 5 seconds.`,
      actionLabel: "Restore",
      durationMs: DELETE_UNDO_MS,
      onAction: () => {
        cancelScheduledDeletion();
      },
    });

    pendingDeletion.value = { appId, snapshot, toastId };

    deletionTimer = setTimeout(() => {
      deletionTimer = null;
      void completeScheduledDeletion();
    }, DELETE_UNDO_MS);

    return true;
  }

  const activeApp = computed(() => apps.value.find((a) => a.app_id === activeAppId.value) ?? null);

  async function duplicateApp(sourceAppId: string): Promise<boolean> {
    if (!apps.value.some((a) => a.app_id === sourceAppId)) return false;
    error.value = null;
    const r = await apiDuplicateApp(sourceAppId);
    if (!r.ok) {
      error.value = r.message;
      pushToast({ message: r.message, variant: "error", durationMs: 5500 });
      return false;
    }
    persistActiveId(r.app.app_id);
    await refresh();
    previewStartImmediate.value = true;
    activeAppId.value = r.app.app_id;
    persistActiveId(r.app.app_id);
    return true;
  }

  return {
    apps,
    displayApps,
    pendingCreateId,
    deletionUndoPending,
    activeAppId,
    activeApp,
    loading,
    error,
    renameBusy,
    refresh,
    selectApp,
    renameApp,
    createNewApp,
    scheduleRemoveApp,
    duplicateApp,
    previewStartImmediate,
  };
}

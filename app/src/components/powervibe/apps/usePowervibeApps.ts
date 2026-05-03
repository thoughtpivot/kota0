import { sortPowervibeAppsByUpdatedAtDesc } from "@shared/sortPowervibeAppsByUpdatedAt.ts";
import { pushPowervibeToast, dismissPowervibeToast } from "@/components/powervibe/ai/usePowervibeAiToast";
import { computed, ref } from "vue";
import {
  createPowervibeApp,
  deletePowervibeApp,
  fetchPowervibeApps,
  patchPowervibeApp,
  type PowervibeCreateAppPreset,
} from "./powervibeAppApi";
import type { PowervibeAppRowVm, PowervibeAppSummary } from "./powervibeAppTypes";

const STORAGE_KEY = "vibe-powervibe-active-app-v1";
const DELETE_UNDO_MS = 5000;

export function usePowervibeApps() {
  const apps = ref<PowervibeAppSummary[]>([]);
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
    snapshot: PowervibeAppSummary;
    toastId: number;
  } | null>(null);

  let deletionTimer: ReturnType<typeof setTimeout> | null = null;

  /** Coalesce overlapping list fetches (double mount / parallel callers). */
  let refreshInFlight: Promise<void> | null = null;

  const deletionUndoPending = computed(() => pendingDeletion.value !== null);

  const displayApps = computed<PowervibeAppRowVm[]>(() => {
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
        const r = await fetchPowervibeApps();
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
    const r = await patchPowervibeApp(appId, { name: trimmed });
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
      sortPowervibeAppsByUpdatedAtDesc(apps.value);
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

  async function createNewApp(name?: string, opts?: { preset?: PowervibeCreateAppPreset }): Promise<boolean> {
    error.value = null;
    const label = name?.trim() ? name.trim() : "New app";
    pendingCreateName.value = label;
    pendingCreateId.value = crypto.randomUUID();
    try {
      const cr = await createPowervibeApp(name ?? "New app", opts);
      if (!cr.ok) {
        error.value = cr.message;
        pendingCreateId.value = null;
        return false;
      }
      pendingCreateId.value = null;
      await refresh();
      activeAppId.value = cr.app.app_id;
      persistActiveId(activeAppId.value);
      return true;
    } catch (e) {
      pendingCreateId.value = null;
      throw e;
    }
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
    sortPowervibeAppsByUpdatedAtDesc(apps.value);
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
    dismissPowervibeToast(toastId);

    error.value = null;
    const dr = await deletePowervibeApp(appId);
    if (!dr.ok) {
      error.value = dr.message;
      apps.value = [...apps.value, snapshot];
      sortPowervibeAppsByUpdatedAtDesc(apps.value);
      activeAppId.value = snapshot.app_id;
      persistActiveId(snapshot.app_id);
      pushPowervibeToast({ message: dr.message, variant: "error", durationMs: 5500 });
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

    const toastId = pushPowervibeToast({
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
  };
}

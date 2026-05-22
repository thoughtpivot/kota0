import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import {
  fetchKota0App,
  fetchKota0BundleFlightStatus,
  postKota0PreviewStart,
  putKota0App,
} from "@/components/kota0/apps/kota0AppApi";
import { kota0BundlePreviewBaseUrl } from "@/components/kota0/viewer/kota0BundlePreviewOrigin";

/**
 * Poll bundle-flight status until :4000 serves `appId` with matching materialize fingerprint.
 * `isStillCurrent` short-circuits when the user switches apps or cancels.
 */
async function waitForBundlePreviewSynced(
  appId: string,
  expectedFingerprint: string,
  isStillCurrent: () => boolean,
): Promise<boolean> {
  const want = expectedFingerprint.trim();
  if (!want) return false;
  const deadline = Date.now() + 90_000;
  const warmupDelays = [100, 200, 400, 800, 1500];
  let warmupIdx = 0;
  while (Date.now() < deadline) {
    if (!isStillCurrent()) return false;
    const res = await fetchKota0BundleFlightStatus(appId);
    if (!isStillCurrent()) return false;
    if (res.ok) {
      const { ready, bundleFingerprint, restarting } = res.status;
      if (ready && !restarting && bundleFingerprint === want) {
        return true;
      }
    }
    const delay = warmupIdx < warmupDelays.length ? warmupDelays[warmupIdx]! : 2500;
    warmupIdx += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

/** Legacy poll — identity only (initial preview before fingerprint is known). */
async function waitForBundleFlightServing(
  appId: string,
  isStillCurrent: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + 90_000;
  const warmupDelays = [100, 200, 400, 800, 1500];
  let warmupIdx = 0;
  while (Date.now() < deadline) {
    if (!isStillCurrent()) return false;
    const res = await fetchKota0BundleFlightStatus(appId);
    if (!isStillCurrent()) return false;
    if (res.ok && res.status.servingAppId === appId && res.status.ready && !res.status.restarting) {
      return true;
    }
    const delay = warmupIdx < warmupDelays.length ? warmupDelays[warmupIdx]! : 2500;
    warmupIdx += 1;
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  return false;
}

export function useKota0GeneratedApp(appId: MaybeRefOrGetter<string | null | undefined>) {
  const source = ref("");
  const backendSource = ref("");
  const bundleEnv = ref("");
  const lastLoaded = ref("");
  const lastLoadedBackend = ref("");
  const lastLoadedBundleEnv = ref("");
  const loading = ref(false);
  const applying = ref(false);
  const error = ref<string | null>(null);
  /** Bump so the preview iframe remounts if HMR does not pick up a change. */
  const previewEpoch = ref(0);
  /**
   * Preview is opt-in: false until the user clicks "Show app preview". Reset on app
   * switch so opening a different app never auto-spawns a bundle Flight, which
   * eliminates the EADDRINUSE / wrong-app-in-iframe failure modes from quick switching.
   */
  const previewRequested = ref(false);
  /** True only after the bundle Flight reports it's serving the active app. */
  const bundlePreviewReady = ref(false);
  /** True while the start-preview round trip + status poll is in flight. */
  const previewStarting = ref(false);

  /** Invalidates in-flight loads when the user switches apps quickly — avoids stale GET completion overwriting state. */
  let loadSeq = 0;
  /** Invalidates in-flight preview starts when the user switches apps or cancels. */
  let previewSeq = 0;

  /** Previous app id from the `watch` below — used to detect app switches. */
  let prevWatchAppId: string | null | undefined;

  /** Last app id whose editor buffers were synced from GET; used to avoid clobbering unsaved Code-tab edits on repeat fetch. */
  let lastBufferSyncAppId: string | null = null;

  const dirty = computed(
    () =>
      source.value !== lastLoaded.value ||
      backendSource.value !== lastLoadedBackend.value ||
      bundleEnv.value !== lastLoadedBundleEnv.value,
  );

  /**
   * Empty until the user has explicitly started the preview AND the singleton Flight
   * confirms it's serving this app. Empty URL means the iframe doesn't render; the
   * Preview pane shows a "Show app preview" button instead.
   */
  const previewPageUrl = computed(() => {
    const id = toValue(appId) ?? "";
    if (!id || !previewRequested.value || !bundlePreviewReady.value) {
      return "";
    }
    const base = kota0BundlePreviewBaseUrl().replace(/\/$/, "");
    const appQ = `app=${encodeURIComponent(id)}`;
    return `${base}/?e=${previewEpoch.value}&${appQ}`;
  });

  function resetPreviewState(): void {
    previewSeq += 1;
    previewRequested.value = false;
    previewStarting.value = false;
    bundlePreviewReady.value = false;
  }

  async function startPreview(): Promise<boolean> {
    const id = toValue(appId);
    if (!id || previewStarting.value) return false;

    previewSeq += 1;
    const seq = previewSeq;
    previewRequested.value = true;
    previewStarting.value = true;
    bundlePreviewReady.value = false;
    error.value = null;

    try {
      const r = await postKota0PreviewStart(id);
      if (seq !== previewSeq) return false;
      if (!r.ok) {
        error.value = r.message;
        previewRequested.value = false;
        return false;
      }

      const expectedFp = r.bundleFingerprint.trim();
      const confirmed =
        expectedFp.length > 0
          ? await waitForBundlePreviewSynced(id, expectedFp, () => seq === previewSeq)
          : await waitForBundleFlightServing(id, () => seq === previewSeq);
      if (seq !== previewSeq) return false;
      if (!confirmed) {
        error.value = "Preview did not become ready in time. Try again or check the Console tab.";
        bundlePreviewReady.value = false;
        return false;
      }

      bundlePreviewReady.value = true;
      previewEpoch.value += 1;
      return true;
    } catch (e: unknown) {
      if (seq === previewSeq) {
        error.value = e instanceof Error ? e.message : String(e);
        previewRequested.value = false;
      }
      return false;
    } finally {
      if (seq === previewSeq) {
        previewStarting.value = false;
      }
    }
  }

  /**
   * After apply/PUT while preview is open: wait for materialized dist on :4000, then
   * cache-bust the iframe. Falls back to full startPreview when preview was never live.
   */
  async function refreshPreviewAfterSourceChange(expectedFingerprint?: string): Promise<void> {
    const id = toValue(appId);
    if (!id || !previewRequested.value) return;

    const fp = expectedFingerprint?.trim() ?? "";
    if (!fp) {
      await startPreview();
      return;
    }

    previewSeq += 1;
    const seq = previewSeq;
    previewStarting.value = true;
    error.value = null;

    try {
      const synced = await waitForBundlePreviewSynced(id, fp, () => seq === previewSeq);
      if (seq !== previewSeq) return;
      if (!synced) {
        await startPreview();
        return;
      }
      bundlePreviewReady.value = true;
      previewEpoch.value += 1;
    } catch (e: unknown) {
      if (seq === previewSeq) {
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (seq === previewSeq) {
        previewStarting.value = false;
      }
    }
  }

  async function load(opts?: { force?: boolean }): Promise<void> {
    const id = toValue(appId);
    if (!id) {
      loadSeq += 1;
      lastBufferSyncAppId = null;
      source.value = "";
      backendSource.value = "";
      bundleEnv.value = "";
      lastLoaded.value = "";
      lastLoadedBackend.value = "";
      lastLoadedBundleEnv.value = "";
      resetPreviewState();
      loading.value = false;
      error.value = null;
      return;
    }

    loadSeq += 1;
    const seq = loadSeq;
    loading.value = true;
    error.value = null;

    try {
      const r = await fetchKota0App(id);
      if (seq !== loadSeq) return;

      if (!r.ok) {
        error.value = r.message;
        return;
      }

      if (seq !== loadSeq) return;

      if (!opts?.force && dirty.value && id === lastBufferSyncAppId && lastBufferSyncAppId !== null) {
        return;
      }

      source.value = r.app.source;
      backendSource.value = r.app.backendSource;
      const envText = typeof r.app.bundleEnv === "string" ? r.app.bundleEnv : "";
      bundleEnv.value = envText;
      lastLoaded.value = r.app.source;
      lastLoadedBackend.value = r.app.backendSource;
      lastLoadedBundleEnv.value = envText;
      lastBufferSyncAppId = id;
    } catch (e: unknown) {
      if (seq === loadSeq) {
        error.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (seq === loadSeq) {
        loading.value = false;
      }
    }
  }

  /** Persist editor buffer to Scribe (`PUT`); same data path as AI **Apply**. */
  async function apply(): Promise<boolean> {
    const id = toValue(appId);
    if (!id) {
      error.value = "No active app";
      return false;
    }
    applying.value = true;
    error.value = null;
    try {
      const body: { source: string; backendSource: string; bundleEnv?: string } = {
        source: source.value,
        backendSource: backendSource.value,
      };
      if (bundleEnv.value !== lastLoadedBundleEnv.value) {
        body.bundleEnv = bundleEnv.value;
      }
      const r = await putKota0App(id, body, { sourceOrigin: "manual_code_editor" });
      if (!r.ok) {
        error.value = r.message;
        return false;
      }
      const saved = r.data.app;
      lastLoaded.value = source.value;
      lastLoadedBackend.value = backendSource.value;
      if (typeof saved.bundleEnv === "string") {
        bundleEnv.value = saved.bundleEnv;
        lastLoadedBundleEnv.value = saved.bundleEnv;
      } else {
        lastLoadedBundleEnv.value = bundleEnv.value;
      }
      if (previewRequested.value) {
        await refreshPreviewAfterSourceChange(r.data.bundleFingerprint);
      }
      return true;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : String(e);
      return false;
    } finally {
      applying.value = false;
    }
  }

  watch(
    () => toValue(appId),
    (id) => {
      const switched = prevWatchAppId !== id;
      if (switched) {
        resetPreviewState();
      }
      prevWatchAppId = id;
      void load({ force: switched });
    },
    { immediate: true },
  );

  return {
    source,
    backendSource,
    bundleEnv,
    loading,
    applying,
    error,
    dirty,
    previewPageUrl,
    previewRequested,
    previewStarting,
    bundlePreviewReady,
    load,
    apply,
    startPreview,
    refreshPreviewAfterSourceChange,
  };
}

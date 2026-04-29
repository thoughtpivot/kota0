import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import { fetchNvibeApp, putNvibeApp } from "@/components/nvibe/apps/nvibeAppApi";
import { nvibeBundlePreviewBaseUrl } from "@/components/nvibe/viewer/nvibeBundlePreviewOrigin";

export function useNvibeGeneratedApp(appId: MaybeRefOrGetter<string | null | undefined>) {
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
   * True only after the latest `fetchNvibeApp` succeeded (GET ran materialize + bundle Flight).
   * If we only gated on `!loading`, a failed fetch still left an app id set → iframe hit the proxy
   * while nothing listened on :4000 → "nothing listening on 127.0.0.1:4000".
   */
  const bundlePreviewReady = ref(false);

  /** Invalidates in-flight loads when the user switches apps quickly — avoids stale GET completion overwriting state / preview. */
  let loadSeq = 0;

  const dirty = computed(
    () =>
      source.value !== lastLoaded.value ||
      backendSource.value !== lastLoadedBackend.value ||
      bundleEnv.value !== lastLoadedBundleEnv.value,
  );

  /** Empty until load succeeded — avoids hitting the preview proxy when no bundle Flight is up. */
  const previewPageUrl = computed(() => {
    const id = toValue(appId) ?? "";
    if (!id || loading.value || !bundlePreviewReady.value) {
      return "";
    }
    const base = nvibeBundlePreviewBaseUrl().replace(/\/$/, "");
    const appQ = `app=${encodeURIComponent(id)}`;
    return `${base}/?e=${previewEpoch.value}&${appQ}`;
  });

  async function load(): Promise<void> {
    const id = toValue(appId);
    if (!id) {
      loadSeq += 1;
      source.value = "";
      backendSource.value = "";
      bundleEnv.value = "";
      lastLoaded.value = "";
      lastLoadedBackend.value = "";
      lastLoadedBundleEnv.value = "";
      bundlePreviewReady.value = false;
      loading.value = false;
      error.value = null;
      return;
    }

    loadSeq += 1;
    const seq = loadSeq;
    bundlePreviewReady.value = false;
    loading.value = true;
    error.value = null;

    try {
      const r = await fetchNvibeApp(id);
      if (seq !== loadSeq) return;

      if (!r.ok) {
        error.value = r.message;
        return;
      }

      if (seq !== loadSeq) return;

      source.value = r.app.source;
      backendSource.value = r.app.backendSource;
      const envText = typeof r.app.bundleEnv === "string" ? r.app.bundleEnv : "";
      bundleEnv.value = envText;
      lastLoaded.value = r.app.source;
      lastLoadedBackend.value = r.app.backendSource;
      lastLoadedBundleEnv.value = envText;
      bundlePreviewReady.value = true;
      /** GET materializes this app to `generated/App.vue` before the response. Remount preview after that so the iframe never renders the previous app’s file (race when `activeAppId` changes and `src` updates immediately). */
      previewEpoch.value += 1;
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
      // Omit `bundleEnv` when unchanged so Scribe is not overwritten with `""` (which would
      // block showing the materialized on-disk .env in Secrets — see GET resolution in `Nvibe.backend.ts`).
      const body: { source: string; backendSource: string; bundleEnv?: string } = {
        source: source.value,
        backendSource: backendSource.value,
      };
      if (bundleEnv.value !== lastLoadedBundleEnv.value) {
        body.bundleEnv = bundleEnv.value;
      }
      const r = await putNvibeApp(id, body, { sourceOrigin: "manual_code_editor" });
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
      previewEpoch.value += 1;
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
    () => {
      void load();
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
    load,
    apply,
  };
}

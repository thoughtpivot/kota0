import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import { fetchNvibeApp, putNvibeApp } from "@/components/nvibe/apps/nvibeAppApi";

export function useNvibeGeneratedApp(appId: MaybeRefOrGetter<string | null | undefined>) {
  const source = ref("");
  const backendSource = ref("");
  const lastLoaded = ref("");
  const lastLoadedBackend = ref("");
  const loading = ref(false);
  const applying = ref(false);
  const error = ref<string | null>(null);
  /** Bump so the preview iframe remounts if HMR does not pick up a change. */
  const previewEpoch = ref(0);

  const dirty = computed(
    () => source.value !== lastLoaded.value || backendSource.value !== lastLoadedBackend.value,
  );

  const previewPageUrl = computed(() => {
    const base = import.meta.env.BASE_URL;
    const prefix = base.endsWith("/") ? base : `${base}/`;
    const id = toValue(appId) ?? "";
    const appQ = id ? `&app=${encodeURIComponent(id)}` : "";
    return `${prefix}nvibe-preview.html?e=${previewEpoch.value}${appQ}`;
  });

  async function load(): Promise<void> {
    const id = toValue(appId);
    if (!id) {
      source.value = "";
      backendSource.value = "";
      lastLoaded.value = "";
      lastLoadedBackend.value = "";
      return;
    }
    loading.value = true;
    error.value = null;
    const r = await fetchNvibeApp(id);
    loading.value = false;
    if (!r.ok) {
      error.value = r.message;
      return;
    }
    source.value = r.app.source;
    backendSource.value = r.app.backendSource;
    lastLoaded.value = r.app.source;
    lastLoadedBackend.value = r.app.backendSource;
    /** GET materializes this app to `generated/App.vue` before the response. Remount preview after that so the iframe never renders the previous app’s file (race when `activeAppId` changes and `src` updates immediately). */
    previewEpoch.value += 1;
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
    const r = await putNvibeApp(
      id,
      { source: source.value, backendSource: backendSource.value },
      { sourceOrigin: "manual_code_editor" },
    );
    applying.value = false;
    if (!r.ok) {
      error.value = r.message;
      return false;
    }
    lastLoaded.value = source.value;
    lastLoadedBackend.value = backendSource.value;
    previewEpoch.value += 1;
    return true;
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
    loading,
    applying,
    error,
    dirty,
    previewPageUrl,
    load,
    apply,
  };
}

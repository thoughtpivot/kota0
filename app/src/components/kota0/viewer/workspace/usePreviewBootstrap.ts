/**
 * Preview-iframe boot state — one concern.
 *
 * Tracks whether the preview iframe is still booting / errored, keyed off the
 * current preview URL, with a load watchdog. Extracted from `Kota0WorkspaceViewer`
 * so the SFC stays presentational rather than owning timer state.
 */
import { onBeforeUnmount, ref, watch } from "vue";

const PREVIEW_LOAD_WATCHDOG_MS = 45_000;

export function useKota0PreviewBootstrap(previewPageUrl: () => string) {
  /** True until the preview iframe fires `load` for the current URL. */
  const previewIframeBooting = ref(true);
  /** Set when the iframe fails to load (rare cross-browser); cleared on successful load. */
  const previewIframeError = ref<string | null>(null);

  let previewLoadWatchdog: ReturnType<typeof setTimeout> | null = null;
  function clearWatchdog(): void {
    if (previewLoadWatchdog) {
      clearTimeout(previewLoadWatchdog);
      previewLoadWatchdog = null;
    }
  }

  watch(
    previewPageUrl,
    (url) => {
      previewIframeError.value = null;
      clearWatchdog();
      if (!url) {
        previewIframeBooting.value = false;
        return;
      }
      previewIframeBooting.value = true;
      previewLoadWatchdog = setTimeout(() => {
        previewLoadWatchdog = null;
        if (!previewIframeBooting.value) return;
        previewIframeBooting.value = false;
        previewIframeError.value =
          "Preview did not finish loading. If it works in a new tab, try matching localhost vs 127.0.0.1 in your workspace URL, or unset VITE_K0_BUNDLE_PREVIEW_ORIGIN.";
      }, PREVIEW_LOAD_WATCHDOG_MS);
    },
    { immediate: true },
  );

  function onPreviewIframeLoad(): void {
    previewIframeBooting.value = false;
    previewIframeError.value = null;
    clearWatchdog();
  }

  function onPreviewIframeError(): void {
    previewIframeBooting.value = false;
    previewIframeError.value =
      "Preview iframe failed to load. Open in new tab works only when this URL is blocked inside an embedded browser.";
    clearWatchdog();
  }

  onBeforeUnmount(clearWatchdog);

  return { previewIframeBooting, previewIframeError, onPreviewIframeLoad, onPreviewIframeError };
}

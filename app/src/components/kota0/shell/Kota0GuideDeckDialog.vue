<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { onKeyStroke } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { K0_GUIDE_SLIDEV_PROXY_PREFIX } from "@/components/kota0/shell/kota0SlidevGuideConstants";

/** Slidev `routerMode: history` — slide index in the path (1-based). */
const DEFAULT_START_SLIDE = "2";

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/**
 * In dev, load Slidev **same-origin** via the Vite proxy (`/__k0_slidev/…`) so `/…` assets
 * resolve to Slidev, not the host app. Outside dev, point at Slidev’s origin directly.
 */
function defaultGuideBase(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:3030/";
  if (import.meta.env.DEV) {
    return `${window.location.origin}${K0_GUIDE_SLIDEV_PROXY_PREFIX}/`;
  }
  if (isLoopbackHost(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:3030/`;
  }
  return "http://127.0.0.1:3030/";
}

/** Slidev reads `?embedded` for iframe-friendly behavior (see `@slidev/client` `isEmbedded`). */
function ensureEmbeddedQuery(url: URL): void {
  if (!url.searchParams.has("embedded")) url.searchParams.set("embedded", "true");
}

/** If both page and Slidev URLs are loopback but disagree (`localhost` vs `127.0.0.1`), follow the page. */
function alignSlidevHostnameToPage(url: URL): void {
  if (typeof window === "undefined") return;
  const pageHost = window.location.hostname;
  if (!isLoopbackHost(pageHost) || !isLoopbackHost(url.hostname)) return;
  if (url.hostname !== pageHost) url.hostname = pageHost;
}

/**
 * If the config URL has no path (or is `/` only), open the default start slide. Otherwise
 * the URL is used as given (e.g. `/1`, `/presenter`).
 */
function resolveGuideDeckUrl(href: string): string {
  const base = defaultGuideBase();
  const raw = (href.trim() || base).trim() || base;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    const px = K0_GUIDE_SLIDEV_PROXY_PREFIX;
    url =
      import.meta.env.DEV && base.includes(px) ?
        new URL(`${px}/${DEFAULT_START_SLIDE}`, base)
      : new URL(`/${DEFAULT_START_SLIDE}`, base);
    alignSlidevHostnameToPage(url);
    ensureEmbeddedQuery(url);
    return url.href;
  }
  alignSlidevHostnameToPage(url);
  const px = K0_GUIDE_SLIDEV_PROXY_PREFIX;
  const atProxyRoot =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    url.origin === window.location.origin &&
    (url.pathname === px || url.pathname === `${px}/`);
  if (atProxyRoot) url.pathname = `${px}/${DEFAULT_START_SLIDE}`;
  else if (url.pathname === "" || url.pathname === "/") url.pathname = `/${DEFAULT_START_SLIDE}`;
  ensureEmbeddedQuery(url);
  return url.href;
}

const deckUrl = computed(() =>
  resolveGuideDeckUrl(import.meta.env.VITE_K0_GUIDE_SLIDEV_URL?.trim() ?? ""),
);

/** Native `<dialog>` + `showModal()` can leave cross-origin iframes at 0×0 in Chromium; use a plain overlay instead. */
const tutorialShellOpen = ref(false);
const showDeckFrame = ref(false);
const deckIframeLoaded = ref(false);
const deckLoading = ref(true);

function syncLoadingForOpen() {
  deckLoading.value = !deckIframeLoaded.value;
}

let loadFallbackTimer: ReturnType<typeof setTimeout> | undefined;

function clearLoadFallbackTimer(): void {
  if (loadFallbackTimer !== undefined) {
    clearTimeout(loadFallbackTimer);
    loadFallbackTimer = undefined;
  }
}

function scheduleLoadFallback(): void {
  clearLoadFallbackTimer();
  loadFallbackTimer = setTimeout(() => {
    loadFallbackTimer = undefined;
    if (deckLoading.value) {
      deckIframeLoaded.value = true;
      deckLoading.value = false;
    }
  }, 18000);
}

function onDeckIframeLoad() {
  clearLoadFallbackTimer();
  deckIframeLoaded.value = true;
  deckLoading.value = false;
}

function openDialog() {
  deckIframeLoaded.value = false;
  deckLoading.value = true;
  tutorialShellOpen.value = true;
  showDeckFrame.value = true;
  void nextTick(() => {
    scheduleLoadFallback();
    document.body.style.overflow = "hidden";
  });
}

function closeDialog() {
  clearLoadFallbackTimer();
  tutorialShellOpen.value = false;
  document.body.style.overflow = "";
}

defineExpose({ open: openDialog, close: closeDialog });

onKeyStroke(
  "Escape",
  (e) => {
    if (!tutorialShellOpen.value) return;
    e.preventDefault();
    closeDialog();
  },
  { dedupe: true },
);

onBeforeUnmount(() => {
  clearLoadFallbackTimer();
  if (tutorialShellOpen.value) document.body.style.overflow = "";
});

/** Remount iframe when the configured URL changes so the frame tracks env updates in dev. */
const iframeKey = ref(0);
watch(deckUrl, () => {
  deckIframeLoaded.value = false;
  iframeKey.value += 1;
  if (tutorialShellOpen.value) {
    syncLoadingForOpen();
    scheduleLoadFallback();
  } else if (showDeckFrame.value) {
    deckLoading.value = true;
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tutorialShellOpen"
      class="kota0-tutorial-overlay fixed inset-0 z-[10000] flex items-center justify-center bg-black/72 p-0"
      role="presentation"
      @click.self="closeDialog"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tutorial"
        class="k0-guide-deck-frame"
        @click.stop
      >
        <div
          v-if="deckLoading"
          class="k0-guide-deck-loading absolute inset-0 z-10 flex items-center justify-center bg-black"
          aria-hidden="true"
        >
          <Loader2 class="size-7 animate-spin text-[#3B82F6]" />
        </div>
        <iframe
          v-if="showDeckFrame"
          :key="iframeKey"
          :src="deckUrl"
          title="Kota0 tutorial"
          class="k0-guide-deck-iframe"
          allow="fullscreen"
          @load="onDeckIframeLoad"
        />
      </div>
    </div>
  </Teleport>
</template>

<style>
.k0-guide-deck-frame {
  position: relative;
  box-sizing: border-box;
  width: min(75vw, calc(100vw - 16px));
  height: min(75dvh, calc(100dvh - 16px));
  min-width: 280px;
  min-height: 320px;
  margin: 0;
  padding: 0;
  background: #000;
  overflow: hidden;
}

.k0-guide-deck-iframe {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  vertical-align: top;
}
</style>

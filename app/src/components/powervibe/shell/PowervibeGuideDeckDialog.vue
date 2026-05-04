<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";

/**
 * Slidev’s dev server uses `host: "localhost"` by default (`@slidev/cli`), so the deck is only
 * reliably reachable at **localhost:3030**, not `127.0.0.1:3030`, even if the workspace is open
 * at `127.0.0.1:3001`.
 */
const DEFAULT_GUIDE_BASE = "http://localhost:3030/";
/** Slidev `routerMode: history` — slide index in the path (1-based). */
const DEFAULT_START_SLIDE = "2";

/** Slidev reads `?embedded` for iframe-friendly behavior (see `@slidev/client` `isEmbedded`). */
function ensureEmbeddedQuery(url: URL): void {
  if (!url.searchParams.has("embedded")) url.searchParams.set("embedded", "true");
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
}

/** Map loopback hosts to `localhost` so URLs match Slidev’s default listen address. */
function alignSlidevLoopbackToLocalhost(url: URL): void {
  if (!isLoopbackHost(url.hostname) || url.hostname === "localhost") return;
  url.hostname = "localhost";
}

/**
 * If the config URL has no path (or is `/` only), open the default start slide. Otherwise
 * the URL is used as given (e.g. `/1`, `/presenter`).
 */
function resolveGuideDeckUrl(href: string): string {
  const base = DEFAULT_GUIDE_BASE;
  const raw = (href.trim() || base).trim() || base;
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    url = new URL(`/${DEFAULT_START_SLIDE}`, base);
    alignSlidevLoopbackToLocalhost(url);
    ensureEmbeddedQuery(url);
    return url.href;
  }
  alignSlidevLoopbackToLocalhost(url);
  if (url.pathname === "" || url.pathname === "/") url.pathname = `/${DEFAULT_START_SLIDE}`;
  ensureEmbeddedQuery(url);
  return url.href;
}

const guideDlg = ref<HTMLDialogElement | null>(null);
const deckUrl = computed(() =>
  resolveGuideDeckUrl(import.meta.env.VITE_POWERVIBE_GUIDE_SLIDEV_URL?.trim() ?? ""),
);
/** Avoid loading Slidev in the background until the user opens the dialog once. */
const showDeckFrame = ref(false);
const deckIframeLoaded = ref(false);
const deckLoading = ref(true);

function syncLoadingForOpen() {
  deckLoading.value = !deckIframeLoaded.value;
}

function openDialog() {
  showDeckFrame.value = true;
  void nextTick(() => {
    const el = guideDlg.value;
    if (el && !el.open) {
      syncLoadingForOpen();
      el.showModal();
    }
  });
}

function closeDialog() {
  const el = guideDlg.value;
  if (el?.open) el.close();
}

defineExpose({ open: openDialog, close: closeDialog });

function onDeckIframeLoad() {
  deckIframeLoaded.value = true;
  deckLoading.value = false;
}

/** Remount iframe when the configured URL changes so the frame tracks env updates in dev. */
const iframeKey = ref(0);
watch(deckUrl, () => {
  deckIframeLoaded.value = false;
  iframeKey.value += 1;
  if (guideDlg.value?.open) syncLoadingForOpen();
  else if (showDeckFrame.value) deckLoading.value = true;
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="guideDlg"
      class="powervibe-guide-deck-dialog"
      aria-label="Tutorial"
      aria-modal="true"
      @click.self="closeDialog"
    >
      <div class="powervibe-guide-deck-frame" @click.stop>
        <div
          v-if="deckLoading"
          class="powervibe-guide-deck-loading absolute inset-0 z-10 flex items-center justify-center bg-black"
          aria-hidden="true"
        >
          <Loader2 class="size-7 animate-spin text-[#3B82F6]" />
        </div>
        <iframe
          v-if="showDeckFrame"
          :key="iframeKey"
          :src="deckUrl"
          title="PowerVibe tutorial"
          class="powervibe-guide-deck-iframe block border-0"
          @load="onDeckIframeLoad"
        />
      </div>
    </dialog>
  </Teleport>
</template>

<style>
/*
 * A closed <dialog> must not use Tailwind `display: flex` in the class list: it overrides the UA
 * `display: none` and keeps the shell visible before showModal().
 */
.powervibe-guide-deck-dialog:not([open]) {
  display: none;
}

.powervibe-guide-deck-dialog[open] {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  width: 100%;
  max-width: none;
  height: 100%;
  min-height: 100dvh;
  max-height: none;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  box-shadow: none;
  outline: none;
  overflow: hidden;
}

.powervibe-guide-deck-dialog::backdrop {
  background: rgba(0, 0, 0, 0.72);
}

.powervibe-guide-deck-frame {
  position: relative;
  width: 75vw;
  height: 75dvh;
  max-width: min(75vw, calc(100vw - 16px));
  max-height: min(75dvh, calc(100dvh - 16px));
  margin: 0;
  padding: 0;
  background: #000;
  overflow: hidden;
}

.powervibe-guide-deck-iframe {
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  vertical-align: top;
}
</style>

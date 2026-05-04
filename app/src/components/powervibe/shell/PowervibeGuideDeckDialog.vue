<script setup lang="ts">
import { BookOpen, Loader2 } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";

const titleId = "powervibe-guide-deck-title";

const guideDlg = ref<HTMLDialogElement | null>(null);
const deckUrl = computed(
  () => import.meta.env.VITE_POWERVIBE_GUIDE_SLIDEV_URL?.trim() || "http://127.0.0.1:3030/",
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
      :aria-labelledby="titleId"
      @click.self="closeDialog"
    >
      <div
        class="flex max-h-[92vh] w-[min(96vw,88rem)] max-w-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl"
        @click.stop
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div class="flex min-w-0 items-center gap-2">
            <BookOpen class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
            <h2 :id="titleId" class="text-sm font-medium">Briefing deck</h2>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            aria-label="Close briefing deck"
            @click="closeDialog"
          >
            Close
          </button>
        </div>

        <div
          class="relative min-h-0 w-full flex-1 [height:min(80vh,860px)]"
        >
          <div
            v-if="deckLoading"
            class="absolute inset-0 z-10 flex items-center justify-center bg-background/80"
            aria-live="polite"
            role="status"
          >
            <Loader2 class="size-7 animate-spin text-[#3B82F6]" />
          </div>
          <iframe
            v-if="showDeckFrame"
            :key="iframeKey"
            :src="deckUrl"
            title="Slidev briefing deck"
            class="h-full w-full min-h-0 border-0"
            @load="onDeckIframeLoad"
          />
        </div>

        <p class="shrink-0 border-t border-border bg-muted/15 px-4 py-2 text-center text-xs text-muted-foreground">
          Run
          <span class="font-mono text-foreground/90">npm run start:slides</span>
          in another terminal if the deck is blank, and set
          <span class="font-mono">VITE_POWERVIBE_GUIDE_SLIDEV_URL</span>
          if the host (localhost vs 127.0.0.1) does not match.
        </p>
      </div>
    </dialog>
  </Teleport>
</template>

<style>
/*
 * A closed <dialog> must not use Tailwind `display: flex` in the class list: it overrides the UA
 * `display: none` and keeps the (empty) “modal” visible and blocks interaction before showModal().
 */
.powervibe-guide-deck-dialog:not([open]) {
  display: none;
}

.powervibe-guide-deck-dialog[open] {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 0;
  max-width: none;
  max-height: none;
  width: 100%;
  min-height: 100dvh;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 0;
  background: rgba(15, 23, 42, 0.6);
  box-shadow: none;
  outline: none;
}

.powervibe-guide-deck-dialog::backdrop {
  background: rgba(15, 23, 42, 0.5);
}
</style>

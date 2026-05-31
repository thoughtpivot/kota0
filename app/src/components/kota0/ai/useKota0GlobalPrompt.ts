/**
 * Floating "quick AI" prompt bar control — one concern.
 *
 * Owns open state, toggle (+focus the composer on open), and the global
 * Escape-to-close hotkey. Extracted from `kota0.vue` so the workspace orchestrator
 * doesn't carry the bar's keyboard wiring inline.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type Kota0GlobalPromptBar from "@/components/kota0/ai/Kota0GlobalPromptBar.vue";

/** A code-expand dialog is open — let Escape close that first, not the prompt bar. */
function kota0CodeDialogOpen(): boolean {
  return !!document.querySelector("dialog.k0-code-expand-dialog[open]");
}

export function useKota0GlobalPrompt() {
  const globalPromptOpen = ref(false);
  const globalPromptBarRef = ref<InstanceType<typeof Kota0GlobalPromptBar> | null>(null);

  function toggleGlobalPromptBar(): void {
    if (globalPromptOpen.value) {
      globalPromptOpen.value = false;
      return;
    }
    globalPromptOpen.value = true;
    void nextTick(() => globalPromptBarRef.value?.focusComposer());
  }

  function onWorkspacePromptHotkey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") {
      if (kota0CodeDialogOpen()) return;
      if (!globalPromptOpen.value) return;
      e.preventDefault();
      globalPromptOpen.value = false;
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", onWorkspacePromptHotkey, true);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onWorkspacePromptHotkey, true);
  });

  return { globalPromptOpen, globalPromptBarRef, toggleGlobalPromptBar };
}

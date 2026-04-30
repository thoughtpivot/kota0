import { ref, watch } from "vue";

const RAIL_OPEN_KEY = "vibe-kota0-app-rail-open-v1";
const AI_PANEL_OPEN_KEY = "vibe-kota0-ai-panel-open-v1";

function readRailOpen(): boolean {
  try {
    const v = sessionStorage.getItem(RAIL_OPEN_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistRailOpen(open: boolean): void {
  try {
    sessionStorage.setItem(RAIL_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readAiPanelOpen(): boolean {
  try {
    const v = sessionStorage.getItem(AI_PANEL_OPEN_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function persistAiPanelOpen(open: boolean): void {
  try {
    sessionStorage.setItem(AI_PANEL_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Persisted app rail + AI panel visibility (sessionStorage). */
export function useKota0WorkspaceChrome() {
  const appRailOpen = ref(readRailOpen());
  watch(appRailOpen, (open) => {
    persistRailOpen(open);
  });

  const aiPanelOpen = ref(readAiPanelOpen());
  watch(aiPanelOpen, (open) => {
    persistAiPanelOpen(open);
  });

  function toggleAppRail(): void {
    appRailOpen.value = !appRailOpen.value;
  }

  function toggleAiPanel(): void {
    aiPanelOpen.value = !aiPanelOpen.value;
  }

  return {
    appRailOpen,
    aiPanelOpen,
    toggleAppRail,
    toggleAiPanel,
  };
}

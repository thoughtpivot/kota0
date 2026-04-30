import { type ComputedRef, type Ref, computed, ref } from "vue";

const AI_PANEL_WIDTH_PX_KEY = "vibe-powervibe-ai-panel-max-px-v1";
const DEFAULT_AI_PANEL_WIDTH_PX = 400;
const MIN_AI_PANEL_WIDTH_PX = 300;
const MAX_AI_PANEL_WIDTH_PX = 560;

function readAiPanelWidthPx(): number {
  try {
    const v = sessionStorage.getItem(AI_PANEL_WIDTH_PX_KEY);
    const n = v ? Number.parseInt(v, 10) : NaN;
    if (Number.isFinite(n)) {
      return Math.min(MAX_AI_PANEL_WIDTH_PX, Math.max(MIN_AI_PANEL_WIDTH_PX, n));
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_AI_PANEL_WIDTH_PX;
}

function persistAiPanelWidthPx(px: number): void {
  try {
    sessionStorage.setItem(AI_PANEL_WIDTH_PX_KEY, String(px));
  } catch {
    /* ignore */
  }
}

function clampAiPanelMaxPx(px: number): number {
  return Math.min(MAX_AI_PANEL_WIDTH_PX, Math.max(MIN_AI_PANEL_WIDTH_PX, Math.round(px)));
}

/**
 * AI chat column width (md+), drag-to-resize, and grid template for the three-column workspace.
 * Depends on {@link usePowervibeWorkspaceChrome} open state.
 */
export function usePowervibeAiPanelResize(
  appRailOpen: Ref<boolean>,
  aiPanelOpen: Ref<boolean>,
): {
  aiPanelMaxPx: Ref<number>;
  powervibeMdGridTemplate: ComputedRef<string>;
  onAiPanelResizePointerDown: (e: PointerEvent) => void;
  onAiPanelResizePointerMove: (e: PointerEvent) => void;
  endAiPanelResizeDrag: (e: PointerEvent) => void;
  nudgeAiPanelWidth: (delta: number) => void;
  resetAiPanelWidth: () => void;
} {
  const aiPanelMaxPx = ref(readAiPanelWidthPx());

  const aiGridTrack = computed(
    () => `minmax(${MIN_AI_PANEL_WIDTH_PX}px, ${aiPanelMaxPx.value}px)`,
  );

  const powervibeMdGridTemplate = computed(() => {
    const ai = aiGridTrack.value;
    if (appRailOpen.value && aiPanelOpen.value) {
      return `minmax(12rem,14rem) ${ai} minmax(0,1fr)`;
    }
    if (appRailOpen.value && !aiPanelOpen.value) {
      return "minmax(12rem,14rem) 2.75rem minmax(0,1fr)";
    }
    if (!appRailOpen.value && aiPanelOpen.value) {
      return `2.75rem ${ai} minmax(0,1fr)`;
    }
    return "2.75rem 2.75rem minmax(0,1fr)";
  });

  let aiResizeActive = false;
  let aiResizeStartX = 0;
  let aiResizeStartW = 0;
  let aiResizePointerId: number | null = null;
  let aiResizeGripEl: HTMLElement | null = null;
  let aiResizeRafId = 0;
  let aiResizePendingPx: number | null = null;

  function flushAiPanelResizeRaf(): void {
    aiResizeRafId = 0;
    if (aiResizePendingPx === null) return;
    const v = aiResizePendingPx;
    aiResizePendingPx = null;
    if (aiResizeActive) aiPanelMaxPx.value = v;
  }

  function cancelAiPanelResizeRaf(): void {
    if (aiResizeRafId) {
      cancelAnimationFrame(aiResizeRafId);
      aiResizeRafId = 0;
    }
    if (aiResizePendingPx !== null && aiResizeActive) {
      aiPanelMaxPx.value = aiResizePendingPx;
      aiResizePendingPx = null;
    }
  }

  function endAiPanelResizeDrag(e: PointerEvent): void {
    if (!aiResizeActive) return;
    if (aiResizePointerId !== null && e.pointerId !== aiResizePointerId) return;

    cancelAiPanelResizeRaf();
    aiResizeActive = false;
    aiResizePointerId = null;
    const el = aiResizeGripEl;
    aiResizeGripEl = null;
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persistAiPanelWidthPx(aiPanelMaxPx.value);
  }

  function onAiPanelResizePointerMove(e: PointerEvent): void {
    if (!aiResizeActive || e.pointerId !== aiResizePointerId) return;
    const dx = e.clientX - aiResizeStartX;
    aiResizePendingPx = clampAiPanelMaxPx(aiResizeStartW + dx);
    if (!aiResizeRafId) {
      aiResizeRafId = requestAnimationFrame(flushAiPanelResizeRaf);
    }
  }

  function onAiPanelResizePointerDown(e: PointerEvent): void {
    if (!e.isPrimary) return;
    e.preventDefault();
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement)) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    cancelAiPanelResizeRaf();
    aiResizeGripEl = el;
    aiResizePointerId = e.pointerId;
    aiResizeActive = true;
    aiResizeStartX = e.clientX;
    aiResizeStartW = aiPanelMaxPx.value;
    aiResizePendingPx = null;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function nudgeAiPanelWidth(delta: number): void {
    aiPanelMaxPx.value = clampAiPanelMaxPx(aiPanelMaxPx.value + delta);
    persistAiPanelWidthPx(aiPanelMaxPx.value);
  }

  function resetAiPanelWidth(): void {
    aiPanelMaxPx.value = DEFAULT_AI_PANEL_WIDTH_PX;
    persistAiPanelWidthPx(aiPanelMaxPx.value);
  }

  return {
    aiPanelMaxPx,
    powervibeMdGridTemplate,
    onAiPanelResizePointerDown,
    onAiPanelResizePointerMove,
    endAiPanelResizeDrag,
    nudgeAiPanelWidth,
    resetAiPanelWidth,
  };
}

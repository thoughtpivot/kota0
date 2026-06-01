/**
 * Draggable floating-panel position — one concern.
 *
 * Owns left/top placement, pointer-drag, and keep-in-viewport clamping for a panel
 * that starts bottom-centered (Tailwind classes) and becomes absolutely positioned
 * once dragged. Extracted from `Kota0GlobalPromptBar` so the component stays
 * presentational layout + a composable, not a drag orchestrator.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

export function useDraggablePanel(open: Ref<boolean>) {
  const shellRef = ref<HTMLElement | null>(null);

  /** `null` until first layout sync — then kept across opens until unmount (drag / resize). */
  const panelLeft = ref<number | null>(null);
  const panelTop = ref<number | null>(null);

  const dragging = ref(false);
  let dragPointerId: number | null = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let dragOriginLeft = 0;
  let dragOriginTop = 0;

  /** Lock `left`/`top` from current on-screen box (after Tailwind bottom-center placement). */
  function syncShellPositionFromDom(): void {
    const el = shellRef.value;
    if (!el) return;
    const r = el.getBoundingClientRect();
    panelLeft.value = Math.round(r.left);
    panelTop.value = Math.round(r.top);
  }

  function clampPanelIntoView(): void {
    const el = shellRef.value;
    if (!el || panelLeft.value === null || panelTop.value === null) return;
    const margin = 8;
    const maxL = Math.max(margin, window.innerWidth - el.offsetWidth - margin);
    const maxT = Math.max(margin, window.innerHeight - el.offsetHeight - margin);
    panelLeft.value = Math.min(Math.max(margin, panelLeft.value), maxL);
    panelTop.value = Math.min(Math.max(margin, panelTop.value), maxT);
  }

  function onWindowResize(): void {
    if (!open.value) return;
    if (panelLeft.value === null || panelTop.value === null) {
      void nextTick(() => {
        requestAnimationFrame(() => syncShellPositionFromDom());
      });
      return;
    }
    clampPanelIntoView();
  }

  watch(open, async (isOpen) => {
    if (!isOpen) return;
    await nextTick();
    requestAnimationFrame(() => {
      if (panelLeft.value === null || panelTop.value === null) {
        syncShellPositionFromDom();
      }
      requestAnimationFrame(() => {
        clampPanelIntoView();
      });
    });
  });

  function onDragHandlePointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (panelLeft.value === null || panelTop.value === null) {
      syncShellPositionFromDom();
    }
    if (panelLeft.value === null || panelTop.value === null) return;
    dragging.value = true;
    dragPointerId = e.pointerId;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    dragOriginLeft = panelLeft.value;
    dragOriginTop = panelTop.value;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragHandlePointerMove(e: PointerEvent): void {
    if (!dragging.value || e.pointerId !== dragPointerId) return;
    if (panelLeft.value === null || panelTop.value === null) return;
    const dx = e.clientX - dragStartClientX;
    const dy = e.clientY - dragStartClientY;
    panelLeft.value = dragOriginLeft + dx;
    panelTop.value = dragOriginTop + dy;
    clampPanelIntoView();
  }

  function onDragHandlePointerUp(e: PointerEvent): void {
    if (e.pointerId !== dragPointerId) return;
    dragging.value = false;
    dragPointerId = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    clampPanelIntoView();
  }

  const shellPositionClass = computed(() =>
    panelLeft.value === null || panelTop.value === null ? "bottom-4 left-1/2 -translate-x-1/2" : "",
  );

  const shellStyle = computed(() => {
    if (!open.value || panelLeft.value === null || panelTop.value === null) return {};
    return {
      left: `${panelLeft.value}px`,
      top: `${panelTop.value}px`,
    };
  });

  onMounted(() => {
    window.addEventListener("resize", onWindowResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onWindowResize);
  });

  return {
    shellRef,
    dragging,
    shellPositionClass,
    shellStyle,
    onDragHandlePointerDown,
    onDragHandlePointerMove,
    onDragHandlePointerUp,
  };
}

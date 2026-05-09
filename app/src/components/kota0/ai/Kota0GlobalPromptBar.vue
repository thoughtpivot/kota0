<script setup lang="ts">
import { GripVertical, X } from "lucide-vue-next";
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import Kota0ChatComposer from "@/components/kota0/ai/Kota0ChatComposer.vue";
import {
  K0_PROMPT_CONTROLLER,
  type Kota0PromptController,
} from "@/components/kota0/ai/useKota0PromptController";

const open = defineModel<boolean>({ required: true });

const injected = inject(K0_PROMPT_CONTROLLER);
if (!injected) throw new Error("Kota0GlobalPromptBar requires K0_PROMPT_CONTROLLER");

const ctrl = injected as Kota0PromptController;

const composerRef = useTemplateRef<InstanceType<typeof Kota0ChatComposer>>("composerRef");
const shellRef = useTemplateRef<HTMLDivElement>("shellRef");

/** `null` until layout sync — then kept across opens until unmount (drag / resize). */
const panelLeft = ref<number | null>(null);
const panelTop = ref<number | null>(null);

const dragging = ref(false);
let dragPointerId: number | null = null;
let dragStartClientX = 0;
let dragStartClientY = 0;
let dragOriginLeft = 0;
let dragOriginTop = 0;

function focusComposer(): void {
  composerRef.value?.focusInput();
}

defineExpose({ focusComposer });

function dismiss(): void {
  open.value = false;
}

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
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-150 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        ref="shellRef"
        class="fixed z-[380] w-[min(100vw-1.5rem,28rem)]"
        :class="[shellPositionClass, dragging ? 'touch-none' : '']"
        :style="shellStyle"
      >
        <div
          data-kota0-global-prompt
          class="kota0-global-prompt-solid w-full rounded-xl border border-white/10 bg-[#0f1115] text-slate-100 shadow-2xl"
          role="dialog"
          aria-modal="false"
          aria-label="Quick AI prompt"
        >
          <div
            class="flex cursor-grab select-none items-center gap-1 border-b border-white/10 px-1 py-1 active:cursor-grabbing"
            @pointerdown="onDragHandlePointerDown"
            @pointermove="onDragHandlePointerMove"
            @pointerup="onDragHandlePointerUp"
            @pointercancel="onDragHandlePointerUp"
          >
            <span class="inline-flex size-8 shrink-0 items-center justify-center text-slate-500" aria-hidden="true">
              <GripVertical class="size-4" />
            </span>
            <span class="min-w-0 flex-1 truncate pr-1 text-xs font-medium text-slate-400">Quick AI</span>
            <button
              type="button"
              class="btn btn-ghost btn-square btn-sm size-8 shrink-0 cursor-pointer text-slate-400 hover:bg-white/10 hover:text-slate-100"
              aria-label="Close"
              @pointerdown.stop
              @click="dismiss"
            >
              <X class="size-4" />
            </button>
          </div>
          <div class="p-3">
            <Kota0ChatComposer
              ref="composerRef"
              compact
              :show-mic="false"
              input-id="kota0-global-ai-input"
              :disabled="!ctrl.canSend || !ctrl.activeAppId"
              :sending="ctrl.sending"
              placeholder="Message…"
              @submit="ctrl.onComposerSubmit"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/** Teleport under `body` — solid dark tokens for composer (`bg-background`, borders, etc.). */
.kota0-global-prompt-solid {
  --nc-background: #13151c;
  --nc-foreground: #e2e8f0;
  --nc-muted: #1e293b;
  --nc-muted-foreground: #94a3b8;
  --nc-card: #13151c;
  --nc-card-foreground: #e2e8f0;
  --nc-border: rgba(255, 255, 255, 0.12);
  --nc-input: #0b0c10;
  --nc-ring: #3b82f6;
  --nc-primary: #3b82f6;
  --nc-primary-foreground: #ffffff;

  --color-background: var(--nc-background);
  --color-foreground: var(--nc-foreground);
  --color-card: var(--nc-card);
  --color-card-foreground: var(--nc-card-foreground);
  --color-muted: var(--nc-muted);
  --color-muted-foreground: var(--nc-muted-foreground);
  --color-border: var(--nc-border);
  --color-input: var(--nc-input);
  --color-primary: var(--nc-primary);
  --color-primary-foreground: var(--nc-primary-foreground);
  --color-ring: var(--nc-ring);
}
</style>

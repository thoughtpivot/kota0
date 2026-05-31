<script setup lang="ts">
import { GripVertical, X } from "lucide-vue-next";
import { useTemplateRef } from "vue";
import Kota0ChatComposer from "@/components/kota0/ai/Kota0ChatComposer.vue";
import { useDraggablePanel } from "@/components/kota0/ai/useDraggablePanel";
import type { Kota0PromptController } from "@/components/kota0/ai/useKota0PromptController";

const open = defineModel<boolean>({ required: true });

const props = defineProps<{ controller: Kota0PromptController }>();
const ctrl = props.controller;

const composerRef = useTemplateRef<InstanceType<typeof Kota0ChatComposer>>("composerRef");

const {
  shellRef,
  dragging,
  shellPositionClass,
  shellStyle,
  onDragHandlePointerDown,
  onDragHandlePointerMove,
  onDragHandlePointerUp,
} = useDraggablePanel(open);

function focusComposer(): void {
  composerRef.value?.focusInput();
}

defineExpose({ focusComposer });

function dismiss(): void {
  open.value = false;
}
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

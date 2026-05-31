<script setup lang="ts">
import { GripVertical } from "lucide-vue-next";
import { computed, ref, unref } from "vue";
import type { Ref } from "vue";
import PromptPanel from "@/components/kota0/ai/PromptPanel.vue";

/** Matches {@link PromptPanel} `defineExpose` — template ref typing is loose for exposed refs. */
type PromptPanelExpose = {
  sending: Ref<boolean>;
  submitUserMessageFromPanel: (text: string) => Promise<void>;
};

defineEmits<{
  collapsePanel: [];
  resizePointerDown: [PointerEvent];
  resizePointerMove: [PointerEvent];
  resizePointerUp: [PointerEvent];
  resizePointerCancel: [PointerEvent];
  resizeLostCapture: [PointerEvent];
  resetPanelWidth: [];
  nudgePanelWidth: [delta: number];
}>();

const panelRef = ref<PromptPanelExpose | null>(null);

/** Re-expose the panel's submit + sending so the dock can drive voice-send / disabled state. */
defineExpose({
  sending: computed(() => (panelRef.value?.sending ? unref(panelRef.value.sending) : false)),
  submitUserMessageFromPanel: (text: string): Promise<void> =>
    panelRef.value?.submitUserMessageFromPanel(text) ?? Promise.resolve(),
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
    <PromptPanel
      ref="panelRef"
      class="flex min-h-0 min-w-0 flex-1 flex-col"
      @collapse-panel="$emit('collapsePanel')"
    />
    <div class="hidden h-full min-h-0 w-2 shrink-0 flex-col items-stretch border-l border-border bg-muted/25 md:flex">
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
        <button
          type="button"
          class="btn btn-ghost btn-square btn-sm size-8 shrink-0 touch-none cursor-grab touch-manipulation active:cursor-grabbing hover:bg-transparent active:bg-transparent focus-visible:bg-transparent dark:hover:bg-transparent dark:active:bg-transparent dark:focus-visible:bg-transparent hover:text-muted-foreground active:text-muted-foreground focus-visible:text-muted-foreground dark:hover:text-muted-foreground dark:active:text-muted-foreground"
          aria-label="Drag sideways to resize the AI panel"
          title="Drag sideways to resize · Double-click to reset width"
          @pointerdown="$emit('resizePointerDown', $event)"
          @pointermove="$emit('resizePointerMove', $event)"
          @pointerup="$emit('resizePointerUp', $event)"
          @pointercancel="$emit('resizePointerCancel', $event)"
          @lostpointercapture="$emit('resizeLostCapture', $event)"
          @dblclick.prevent="$emit('resetPanelWidth')"
          @keydown.left.prevent="$emit('nudgePanelWidth', -12)"
          @keydown.right.prevent="$emit('nudgePanelWidth', 12)"
        >
          <GripVertical class="size-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  </div>
</template>

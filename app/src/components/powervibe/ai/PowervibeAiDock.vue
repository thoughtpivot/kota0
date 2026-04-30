<script setup lang="ts">
import { ChevronRight, GripVertical } from "lucide-vue-next";
import PromptPanel from "@/components/powervibe/ai/PromptPanel.vue";

defineProps<{
  aiPanelOpen: boolean;
  activeAppId: string | null;
  chatRefreshKey: number;
}>();

defineEmits<{
  toggleAiPanel: [];
  applied: [];
  resizePointerDown: [PointerEvent];
  resizePointerMove: [PointerEvent];
  resizePointerUp: [PointerEvent];
  resizePointerCancel: [PointerEvent];
  resizeLostCapture: [PointerEvent];
  resetPanelWidth: [];
  nudgePanelWidth: [delta: number];
}>();
</script>

<template>
  <aside
    class="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border bg-muted/15 md:shrink md:border-b-0 md:border-r"
    :class="[
      aiPanelOpen ? 'max-h-[55vh] min-h-0 md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible',
    ]"
  >
    <div
      v-if="!aiPanelOpen"
      class="hidden h-full min-h-0 flex-col items-center gap-3 border-b border-border py-3 md:flex md:border-b-0"
    >
      <button
        type="button"
        class="btn btn-ghost btn-square btn-sm shrink-0"
        aria-label="Show AI panel"
        @click="$emit('toggleAiPanel')"
      >
        <ChevronRight class="size-4" />
      </button>
    </div>

    <div v-show="aiPanelOpen" class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <PromptPanel
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :active-app-id="activeAppId"
        :refresh-chat-key="chatRefreshKey"
        @applied="$emit('applied')"
        @collapse-panel="$emit('toggleAiPanel')"
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
  </aside>
</template>

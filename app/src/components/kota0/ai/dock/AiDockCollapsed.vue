<script setup lang="ts">
import { ChevronRight, MessageSquare, Mic } from "lucide-vue-next";

defineProps<{
  globalPromptOpen: boolean;
  railRecording: boolean;
  collapsedMicDisabled: boolean;
  collapsedGlobalPromptDisabled: boolean;
}>();

defineEmits<{
  toggleAiPanel: [];
  toggleGlobalPrompt: [];
  micClick: [MouseEvent];
}>();
</script>

<template>
  <div
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
    <button
      type="button"
      class="btn btn-ghost btn-square btn-sm shrink-0 touch-manipulation text-muted-foreground"
      :disabled="collapsedGlobalPromptDisabled"
      :aria-pressed="globalPromptOpen"
      aria-label="Toggle quick AI prompt"
      title="Toggle quick AI prompt bar"
      @click="$emit('toggleGlobalPrompt')"
    >
      <MessageSquare class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="btn btn-ghost btn-square btn-sm shrink-0 touch-manipulation"
      :class="
        railRecording ?
          'text-destructive hover:bg-destructive/10 hover:text-destructive'
        : 'text-muted-foreground'
      "
      :disabled="collapsedMicDisabled"
      :aria-pressed="railRecording"
      aria-label="Toggle voice recording"
      :title="
        railRecording ? 'Stop recording, transcribe, and send' : 'Record voice message (collapsed rail)'
      "
      @click="$emit('micClick', $event)"
    >
      <Mic class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>

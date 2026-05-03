<script setup lang="ts">
import { ChevronRight, GripVertical, MessageSquare, Mic } from "lucide-vue-next";
import { computed, ref, unref, watch } from "vue";
import type { Ref } from "vue";
import PromptPanel from "@/components/powervibe/ai/PromptPanel.vue";
import { usePowervibeAiToast, type PowervibeAiToastItem } from "@/components/powervibe/ai/usePowervibeAiToast";
import { usePowervibeMicRecorder } from "@/components/powervibe/ai/usePowervibeMicRecorder";

const props = defineProps<{
  aiPanelOpen: boolean;
  activeAppId: string | null;
  /** Lets the rail icon stay enabled to close the bar when open. */
  globalPromptOpen: boolean;
}>();

defineEmits<{
  toggleAiPanel: [];
  toggleGlobalPrompt: [];
  resizePointerDown: [PointerEvent];
  resizePointerMove: [PointerEvent];
  resizePointerUp: [PointerEvent];
  resizePointerCancel: [PointerEvent];
  resizeLostCapture: [PointerEvent];
  resetPanelWidth: [];
  nudgePanelWidth: [delta: number];
}>();

/** Matches {@link PromptPanel} `defineExpose` — template ref typing is loose for exposed refs. */
type PromptPanelExpose = {
  sending: Ref<boolean>;
  submitUserMessageFromPanel: (text: string) => Promise<void>;
};

const promptPanelRef = ref<PromptPanelExpose | null>(null);

const panelSending = computed(() => {
  const p = promptPanelRef.value;
  return p?.sending ? unref(p.sending) : false;
});

const { items: toastItems, pushToast, dismiss } = usePowervibeAiToast();

function onToastAction(t: PowervibeAiToastItem): void {
  t.onAction?.();
  dismiss(t.id);
}

const railToastIds: { recording: number | null; transcribing: number | null } = {
  recording: null,
  transcribing: null,
};

function clearRailToastSlots(): void {
  if (railToastIds.recording !== null) {
    dismiss(railToastIds.recording);
    railToastIds.recording = null;
  }
  if (railToastIds.transcribing !== null) {
    dismiss(railToastIds.transcribing);
    railToastIds.transcribing = null;
  }
}

const {
  isRecording: railRecording,
  isTranscribing: railTranscribing,
  micError: railMicError,
  transcribeError: railTranscribeError,
  toggleRecording: railToggleRecording,
  cancelRecording: railCancelRecording,
} = usePowervibeMicRecorder({
  async onTranscript(text: string) {
    clearRailToastSlots();
    const trimmed = text.trim();
    if (!trimmed) {
      pushToast({ message: "No speech detected.", durationMs: 2600 });
      return;
    }
    const sendingId = pushToast({ message: "Sending…", persistent: true });
    try {
      await promptPanelRef.value?.submitUserMessageFromPanel(trimmed);
    } finally {
      dismiss(sendingId);
    }
    pushToast({ message: "Message sent.", durationMs: 2600 });
  },
});

const collapsedMicDisabled = computed(
  () =>
    railTranscribing.value ||
    (!railRecording.value && (!props.activeAppId || panelSending.value)),
);

const collapsedGlobalPromptDisabled = computed(
  () =>
    !props.globalPromptOpen && (!props.activeAppId || panelSending.value),
);

async function onCollapsedMicClick(e: MouseEvent): Promise<void> {
  e.preventDefault();
  e.stopPropagation();
  if (collapsedMicDisabled.value) return;

  railMicError.value = null;
  railTranscribeError.value = null;

  if (!railRecording.value) {
    await railToggleRecording();
    if (railRecording.value) {
      clearRailToastSlots();
      railToastIds.recording = pushToast({
        message: "Recording — speak now. Click the mic again to stop and send.",
        persistent: true,
      });
    } else if (railMicError.value) {
      pushToast({ message: railMicError.value, variant: "error", durationMs: 4500 });
    }
  } else {
    if (railToastIds.recording !== null) {
      dismiss(railToastIds.recording);
      railToastIds.recording = null;
    }
    railToastIds.transcribing = pushToast({ message: "Transcribing…", persistent: true });
    await railToggleRecording();
    if (railToastIds.transcribing !== null) {
      dismiss(railToastIds.transcribing);
      railToastIds.transcribing = null;
    }
    if (railTranscribeError.value) {
      pushToast({ message: railTranscribeError.value, variant: "error", durationMs: 5500 });
    }
  }
}

watch(
  () => props.aiPanelOpen,
  async (open) => {
    if (open && railRecording.value) {
      clearRailToastSlots();
      await railCancelRecording();
      pushToast({ message: "Recording cancelled.", durationMs: 2200 });
    }
  },
);
</script>

<template>
  <aside
    class="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border bg-muted/15 md:shrink md:border-b-0 md:border-r"
    :class="[
      aiPanelOpen ? 'max-h-[55vh] min-h-0 md:max-h-none' : 'max-h-0 overflow-hidden md:max-h-none md:overflow-visible',
      globalPromptOpen ? 'relative z-[375]' : '',
    ]"
  >
    <Teleport to="body">
      <div
        class="pointer-events-none fixed right-4 top-20 z-[500] flex max-w-[min(100vw-2rem,20rem)] flex-col gap-2 sm:right-6 sm:top-24"
        aria-live="polite"
      >
        <div
          v-for="t in toastItems"
          :key="t.id"
          class="pointer-events-auto flex flex-col gap-2 rounded-md border px-3 py-2 text-xs shadow-lg backdrop-blur-sm"
          :class="
            t.variant === 'error' ?
              'border-destructive/40 bg-destructive/15 text-destructive'
            : 'border-border bg-card/95 text-card-foreground'
          "
        >
          <span class="leading-snug">{{ t.message }}</span>
          <button
            v-if="t.actionLabel"
            type="button"
            class="btn btn-sm shrink-0 self-start border-border bg-background/80 text-xs font-medium hover:bg-muted"
            :class="t.variant === 'error' ? 'text-destructive' : 'text-primary'"
            @click="onToastAction(t)"
          >
            {{ t.actionLabel }}
          </button>
        </div>
      </div>
    </Teleport>

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
        @click="onCollapsedMicClick"
      >
        <Mic class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div v-show="aiPanelOpen" class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
      <PromptPanel
        ref="promptPanelRef"
        class="flex min-h-0 min-w-0 flex-1 flex-col"
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

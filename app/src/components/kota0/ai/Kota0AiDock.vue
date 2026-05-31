<script setup lang="ts">
import { computed, ref, unref, watch } from "vue";
import type { Ref } from "vue";
import Kota0AiDockCollapsed from "@/components/kota0/ai/Kota0AiDockCollapsed.vue";
import Kota0AiDockOpen from "@/components/kota0/ai/Kota0AiDockOpen.vue";
import { useKota0AiToast, type Kota0AiToastItem } from "@/components/kota0/ai/useKota0AiToast";
import { useKota0MicRecorder } from "@/components/kota0/ai/useKota0MicRecorder";

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

/** Matches {@link Kota0AiDockOpen} `defineExpose` — template ref typing is loose for exposed refs. */
type DockOpenExpose = {
  sending: Ref<boolean>;
  submitUserMessageFromPanel: (text: string) => Promise<void>;
};

const dockOpenRef = ref<DockOpenExpose | null>(null);

const panelSending = computed(() => {
  const p = dockOpenRef.value;
  return p?.sending ? unref(p.sending) : false;
});

const { items: toastItems, pushToast, dismiss } = useKota0AiToast();

function onToastAction(t: Kota0AiToastItem): void {
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
} = useKota0MicRecorder({
  async onTranscript(text: string) {
    clearRailToastSlots();
    const trimmed = text.trim();
    if (!trimmed) {
      pushToast({ message: "No speech detected.", durationMs: 2600 });
      return;
    }
    const sendingId = pushToast({ message: "Sending…", persistent: true });
    try {
      await dockOpenRef.value?.submitUserMessageFromPanel(trimmed);
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
  () => !props.globalPromptOpen && (!props.activeAppId || panelSending.value),
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

    <Kota0AiDockCollapsed
      v-if="!aiPanelOpen"
      :global-prompt-open="globalPromptOpen"
      :rail-recording="railRecording"
      :collapsed-mic-disabled="collapsedMicDisabled"
      :collapsed-global-prompt-disabled="collapsedGlobalPromptDisabled"
      @toggle-ai-panel="$emit('toggleAiPanel')"
      @toggle-global-prompt="$emit('toggleGlobalPrompt')"
      @mic-click="onCollapsedMicClick"
    />

    <Kota0AiDockOpen
      v-show="aiPanelOpen"
      ref="dockOpenRef"
      @collapse-panel="$emit('toggleAiPanel')"
      @resize-pointer-down="$emit('resizePointerDown', $event)"
      @resize-pointer-move="$emit('resizePointerMove', $event)"
      @resize-pointer-up="$emit('resizePointerUp', $event)"
      @resize-pointer-cancel="$emit('resizePointerCancel', $event)"
      @resize-lost-capture="$emit('resizeLostCapture', $event)"
      @reset-panel-width="$emit('resetPanelWidth')"
      @nudge-panel-width="$emit('nudgePanelWidth', $event)"
    />
  </aside>
</template>

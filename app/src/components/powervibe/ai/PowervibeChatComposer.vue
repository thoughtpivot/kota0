<script setup lang="ts">
import { Loader2, Mic, SendHorizontal } from "lucide-vue-next";
import { computed, ref, useTemplateRef } from "vue";
import { usePowervibeMicRecorder } from "@/components/powervibe/ai/usePowervibeMicRecorder";

const props = withDefaults(
  defineProps<{
    /** Mirrors previous textarea: not sendable (no app, or already sending a turn). */
    disabled: boolean;
    sending: boolean;
    /** Hint text for the empty input. */
    placeholder?: string;
    /** Distinct id when multiple composers mount (e.g. sidebar + global bar). */
    inputId?: string;
    /** Shorter textarea and tighter chrome (e.g. global quick prompt). */
    compact?: boolean;
    /** Hide inline mic (sidebar keeps voice; quick prompt can stay type-only). */
    showMic?: boolean;
  }>(),
  {
    placeholder: "Describe what you want to build…",
    inputId: "powervibe-ai-input",
    compact: false,
    showMic: true,
  },
);

const emit = defineEmits<{
  submit: [text: string];
}>();

const draft = ref("");

const textareaRef = useTemplateRef<HTMLTextAreaElement>("textareaRef");

function focusInput(): void {
  textareaRef.value?.focus();
}

defineExpose({ focusInput });

const { isRecording, isTranscribing, micError, transcribeError, toggleRecording } = usePowervibeMicRecorder({
  onTranscript(text: string) {
    const cur = draft.value.trim();
    draft.value = cur ? `${cur}\n\n${text}` : text;
  },
});

function submit() {
  const t = draft.value.trim();
  if (!t || isRecording.value || isTranscribing.value) return;
  draft.value = "";
  emit("submit", t);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}

async function onMicClick(e: MouseEvent): Promise<void> {
  e.preventDefault();
  if (micError.value) micError.value = null;
  if (transcribeError.value) transcribeError.value = null;
  await toggleRecording();
}

/** Block starting a new recording; stopping while already recording stays allowed. */
function micDisabled(): boolean {
  return isTranscribing.value || (!isRecording.value && (props.disabled || props.sending));
}

function sendDisabled(): boolean {
  return (
    props.disabled ||
    props.sending ||
    isRecording.value ||
    isTranscribing.value ||
    !draft.value.trim()
  );
}

const inputDisabled = (): boolean => props.disabled || props.sending;

const textareaRows = (): number => (props.compact ? 2 : 3);

const textareaClass = computed(() => {
  const base =
    "w-full resize-y rounded-md border border-input bg-background text-foreground shadow-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2";
  if (props.compact) {
    const pad =
      props.showMic ? "py-2 pl-2 pr-11 pb-8" : "py-2 pl-2 pr-10 pb-8";
    return `${base} min-h-[2.75rem] ${pad} text-sm`;
  }
  const pad = props.showMic ? "py-2 pl-2 pr-[5.25rem] pb-10" : "py-2 pl-2 pr-14 pb-10";
  return `${base} min-h-[4.5rem] ${pad} text-xs md:text-sm`;
});

const actionsCornerClass = computed(() =>
  props.compact ? "bottom-1.5 right-1.5" : "bottom-2 right-2",
);
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="submit">
    <label class="sr-only" :for="props.inputId">Message</label>
    <div class="relative">
      <textarea
        :id="props.inputId"
        ref="textareaRef"
        v-model="draft"
        :rows="textareaRows()"
        :class="textareaClass"
        :placeholder="props.placeholder"
        :disabled="inputDisabled()"
        @keydown="onKeydown"
      />
      <div
        class="absolute z-10 flex items-center gap-0.5"
        :class="actionsCornerClass"
        role="group"
        aria-label="Message actions"
      >
        <button
          v-if="props.showMic"
          type="button"
          class="btn btn-ghost btn-square btn-sm size-9 shrink-0 touch-manipulation text-muted-foreground hover:text-foreground"
          :class="
            isRecording ?
              'text-destructive hover:bg-destructive/10 hover:text-destructive'
            : ''
          "
          :disabled="micDisabled()"
          :aria-pressed="isRecording"
          aria-label="Toggle voice recording"
          :title="isRecording ? 'Stop recording and transcribe' : 'Record voice'"
          @click="onMicClick"
        >
          <Mic class="size-[1.125rem] shrink-0" aria-hidden="true" />
        </button>
        <button
          type="submit"
          class="btn btn-ghost btn-square btn-sm size-9 shrink-0 touch-manipulation text-muted-foreground hover:text-foreground disabled:opacity-40"
          :class="props.compact ? 'size-8' : ''"
          :disabled="sendDisabled()"
          aria-label="Send message"
          title="Send"
        >
          <Loader2
            v-if="props.sending"
            class="size-[1.125rem] shrink-0 animate-spin"
            aria-hidden="true"
          />
          <SendHorizontal v-else class="size-[1.125rem] shrink-0" aria-hidden="true" />
        </button>
      </div>
    </div>
    <template v-if="props.showMic">
      <p v-if="isRecording" class="flex items-center gap-2 text-xs font-medium text-destructive">
        <span class="inline-flex size-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
        Recording… click the microphone to stop and transcribe into this box.
      </p>
      <p v-if="isTranscribing" class="text-xs text-muted-foreground">Transcribing…</p>
      <p v-if="micError" class="text-xs text-destructive">{{ micError }}</p>
      <p v-if="transcribeError" class="text-xs text-destructive">{{ transcribeError }}</p>
    </template>
  </form>
</template>

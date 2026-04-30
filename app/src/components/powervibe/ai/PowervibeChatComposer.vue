<script setup lang="ts">
import { ref } from "vue";

withDefaults(
  defineProps<{
    /** Mirrors previous textarea: not sendable (no app, or already sending a turn). */
    disabled: boolean;
    sending: boolean;
    /** Hint text for the empty input. */
    placeholder?: string;
  }>(),
  {
    placeholder: "Describe what you want to build…",
  },
);

const emit = defineEmits<{
  submit: [text: string];
}>();

const draft = ref("");

function submit() {
  const t = draft.value.trim();
  if (!t) return;
  draft.value = "";
  emit("submit", t);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="submit">
    <label class="sr-only" for="powervibe-ai-input">Message</label>
    <textarea
      id="powervibe-ai-input"
      v-model="draft"
      rows="3"
      class="min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-2 py-2 text-xs text-foreground shadow-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2 md:text-sm"
      :placeholder="placeholder"
      :disabled="disabled"
      @keydown="onKeydown"
    />
    <button
      type="submit"
      class="btn btn-primary btn-sm"
      :disabled="disabled || !draft.trim()"
    >
      {{ sending ? "Sending…" : "Send" }}
    </button>
  </form>
</template>

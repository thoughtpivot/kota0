<script setup lang="ts">
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { usePreferredDark } from "@vueuse/core";
import { basicSetup } from "codemirror";
import { computed } from "vue";
import { Codemirror } from "vue-codemirror";

const model = defineModel<string>({ required: true });

const props = withDefaults(
  defineProps<{
    /** When true, the document is read-only (e.g. while loading from API). */
    disabled?: boolean;
    language?: "sfc" | "ts";
  }>(),
  { language: "sfc" },
);

const isDark = usePreferredDark();

const shellTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      maxHeight: "100%",
      display: "flex",
      flexDirection: "column",
      fontSize: "0.75rem",
      lineHeight: "1.45",
      backgroundColor: "var(--color-background)",
      color: "var(--color-foreground)",
    },
    ".cm-scroller": {
      flex: "1 1 0",
      minHeight: "0",
      overflow: "auto",
      fontFamily: "var(--font-mono)",
    },
    ".cm-content": { caretColor: "var(--color-foreground)" },
    ".cm-gutters": {
      backgroundColor: "var(--color-muted)",
      color: "var(--color-muted-foreground)",
      border: "none",
      borderRight: "1px solid var(--color-border)",
    },
    ".cm-activeLineGutter": { backgroundColor: "transparent" },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in oklab, var(--color-muted) 50%, transparent)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "color-mix(in oklab, var(--color-primary) 22%, transparent) !important",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "var(--color-foreground)",
    },
  },
  { dark: false },
);

const extensions = computed(() => {
  const core =
    props.language === "ts" ?
      [basicSetup, javascript({ typescript: true }), EditorView.lineWrapping]
    : [basicSetup, html({ autoCloseTags: false }), EditorView.lineWrapping];
  if (isDark.value) {
    return [...core, oneDark];
  }
  return [...core, shellTheme];
});
</script>

<template>
  <div class="nvibe-cm-shell h-full min-h-0 w-full overflow-hidden rounded-md border border-input bg-background shadow-sm">
    <Codemirror
      v-model="model"
      class="h-full min-h-0"
      :style="{ height: '100%' }"
      :extensions="extensions"
      :disabled="disabled"
      :indent-with-tab="true"
      :tab-size="2"
      :placeholder="language === 'ts' ? 'App.backend.ts…' : 'Generated App.vue…'"
    />
  </div>
</template>

<style scoped>
/* Flex chain + min-height:0 so .cm-scroller can grow and scroll for very long files */
.nvibe-cm-shell :deep(.cm-editor) {
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.nvibe-cm-shell :deep(.cm-scroller) {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
}

.nvibe-cm-shell :deep(.cm-focused) {
  outline: none;
}
</style>

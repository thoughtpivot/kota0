/**
 * Builds a valid Vue SFC that renders the assistant markdown in the preview iframe,
 * reusing the shell's markdown pipeline (same-origin, same Vite graph).
 */
export function wrapAssistantMarkdownAsPreviewSfc(markdown: string): string {
  const lit = JSON.stringify(markdown);
  return `<script setup lang="ts">
import { computed } from "vue";
import { renderChatMarkdown } from "@/lib/renderChatMarkdown";

const markdown = ${lit};
const html = computed(() => renderChatMarkdown(markdown));
</script>

<template>
  <div class="kota0-applied-root min-h-full overflow-auto bg-white p-4 text-sm text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div class="kota0-applied-md" v-html="html" />
  </div>
</template>

<style scoped>
.kota0-applied-md :deep(p) {
  margin: 0.35em 0;
}
.kota0-applied-md :deep(ul),
.kota0-applied-md :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.25rem;
}
.kota0-applied-md :deep(a) {
  text-decoration: underline;
  color: #2563eb;
}
.kota0-applied-md :deep(code) {
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
  background: #f5f5f5;
}
.dark .kota0-applied-md :deep(code) {
  background: #262626;
}
</style>
`;
}

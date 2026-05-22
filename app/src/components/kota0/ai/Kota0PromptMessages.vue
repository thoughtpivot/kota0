<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from "vue";
import {
  K0_PROMPT_CONTROLLER,
  type Kota0PromptController,
} from "@/components/kota0/ai/useKota0PromptController";

const c = inject(K0_PROMPT_CONTROLLER);
if (!c) throw new Error("Kota0PromptMessages requires K0_PROMPT_CONTROLLER");

const ctrl = c as Kota0PromptController;

const listRef = ref<HTMLElement | null>(null);

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

/**
 * Split streaming text at the *last unclosed* triple-backtick fence so the prose renders
 * live but an in-progress code block becomes a "Generating …" chip instead of dumping
 * raw code character-by-character into the bubble.
 */
const fenceLabels: Record<string, string> = {
  vue: "App.vue",
  ts: "App.backend.ts",
  typescript: "App.backend.ts",
  env: ".env",
};
const streamingSplit = computed<{ prose: string; openFenceLang: string | null }>(() => {
  const raw = ctrl.streamingAssistantText;
  if (!raw) return { prose: "", openFenceLang: null };
  const lines = raw.split("\n");
  let openIdx = -1;
  let lang: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(/^```\s*([a-zA-Z0-9_+-]*)\s*$/);
    if (!m) continue;
    if (openIdx === -1) {
      openIdx = i;
      lang = m[1] ? m[1].toLowerCase() : null;
    } else {
      openIdx = -1;
      lang = null;
    }
  }
  if (openIdx === -1) return { prose: raw, openFenceLang: null };
  return { prose: lines.slice(0, openIdx).join("\n"), openFenceLang: lang ?? "" };
});
const streamingFenceLabel = computed<string>(() => {
  const lang = streamingSplit.value.openFenceLang;
  if (lang === null) return "";
  if (lang && fenceLabels[lang]) return fenceLabels[lang]!;
  return lang || "code";
});

watch(() => ctrl.messages, () => void scrollToBottom(), { deep: true });
watch(() => ctrl.streamReceivedChars, () => void scrollToBottom());
watch(() => ctrl.streamingAssistantText, () => void scrollToBottom());
watch(() => ctrl.sending, () => void scrollToBottom());
</script>

<template>
  <div
    ref="listRef"
    class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
    role="log"
    aria-live="polite"
    :aria-busy="ctrl.sending"
  >
    <template v-for="m in ctrl.messages" :key="`${m.id}-${ctrl.shikiReady ? 1 : 0}`">
      <article
        v-if="m.kind === 'plan'"
        class="flex justify-start"
        v-memo="[m.id, m.content, m.kind, ctrl.applying, ctrl.sending]"
      >
        <div class="w-full max-w-[min(100%,42rem)] rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs shadow-sm md:text-sm">
          <template v-if="ctrl.parsePlanContent(m.content)">
            <p class="text-[0.7rem] font-medium uppercase tracking-wide text-primary">Plan</p>
            <p class="mt-1 font-medium text-foreground">{{ ctrl.parsePlanContent(m.content)!.intent }}</p>
            <ul v-if="(ctrl.parsePlanContent(m.content)!.changes ?? []).length > 0" class="mt-2 list-disc space-y-0.5 pl-4 text-foreground">
              <li v-for="(c, i) in ctrl.parsePlanContent(m.content)!.changes" :key="i">
                <span class="font-mono text-[0.7rem] text-muted-foreground">[{{ c.kind }}] {{ c.file }}:</span>
                {{ c.summary }}
              </li>
            </ul>
            <p
              v-if="(ctrl.parsePlanContent(m.content)!.preserveExplicitly ?? []).length > 0"
              class="mt-2 rounded border border-amber-400/40 bg-amber-50/40 px-2 py-1 text-[0.7rem] text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
            >
              <strong>Will preserve:</strong>
              {{ ctrl.parsePlanContent(m.content)!.preserveExplicitly.join(", ") }}
            </p>
            <ul
              v-if="(ctrl.parsePlanContent(m.content)!.openQuestions ?? []).length > 0"
              class="mt-2 list-disc space-y-0.5 pl-4 text-muted-foreground"
            >
              <li v-for="(q, i) in ctrl.parsePlanContent(m.content)!.openQuestions" :key="i">{{ q }}</li>
            </ul>
            <p
              v-else
              class="mt-2 text-muted-foreground"
            >
              Shall I start implementing?
            </p>
          </template>
          <template v-else>
            <p class="text-muted-foreground">(Plan unreadable — fall back to typing the request again.)</p>
          </template>
          <p class="mt-2 text-[0.6rem] opacity-70">{{ new Date(m.createdAt).toLocaleTimeString() }}</p>
        </div>
      </article>
      <article
        v-else-if="m.kind === 'fresh_start'"
        class="flex justify-center"
        v-memo="[m.id]"
      >
        <div class="rounded-full border border-dashed border-border bg-muted/40 px-3 py-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          — Start fresh —
        </div>
      </article>
      <article
        v-else
        v-memo="[m.id, m.content, m.role, m.createdAt, ctrl.shikiReady]"
        class="flex"
        :class="
          m.role === 'user' ? 'justify-end' : m.role === 'system' ? 'justify-center' : 'justify-start'
        "
      >
        <div
          class="max-w-[min(100%,100%)] rounded-lg px-3 py-2 text-xs leading-relaxed shadow-sm md:text-sm"
          :class="
            m.role === 'user'
              ? 'bubble-user bg-primary text-primary-foreground'
              : m.role === 'system'
                ? 'max-w-[min(100%,42rem)] border border-dashed border-border bg-muted/40 text-muted-foreground'
                : 'bubble-assistant border border-border bg-card text-card-foreground'
          "
        >
          <div
            class="plan-chat-md"
            :class="{ 'plan-chat-md--fence': ctrl.hasExpandableCodeFenceInMessage(m.content) }"
            v-html="ctrl.displayChatMarkdown(m.content)"
            @click="ctrl.onChatMarkdownClick($event, m)"
          />
          <p class="mt-1 text-[0.6rem] opacity-70">{{ new Date(m.createdAt).toLocaleTimeString() }}</p>
        </div>
      </article>
    </template>

    <article
      v-if="ctrl.sending && !ctrl.streamingAssistantText"
      class="flex justify-start"
      aria-label="Assistant is thinking"
    >
      <div
        class="bubble-assistant max-w-[min(100%,100%)] rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground shadow-sm md:text-sm"
      >
        <p class="flex items-center gap-2 font-medium text-foreground">
          <span class="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          Thinking…
        </p>
      </div>
    </article>
    <article
      v-else-if="ctrl.sending && ctrl.streamingAssistantText"
      class="flex justify-start"
      aria-label="Assistant is generating a reply"
    >
      <div
        class="bubble-assistant max-w-[min(100%,100%)] rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-card-foreground shadow-sm md:text-sm"
      >
        <div
          v-if="streamingSplit.prose"
          class="plan-chat-md"
          v-html="ctrl.displayChatMarkdown(streamingSplit.prose)"
        />
        <div
          v-if="streamingSplit.openFenceLang !== null"
          class="mt-1 inline-flex items-center gap-2 rounded-md border border-border bg-muted/60 px-2 py-1 text-[0.7rem] text-muted-foreground"
        >
          <span class="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          Generating <code class="rounded bg-background px-1 py-0.5 font-mono text-[0.65rem]">{{ streamingFenceLabel }}</code>…
        </div>
        <span
          v-else
          class="ml-0.5 inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-pulse bg-primary align-middle"
          aria-hidden="true"
        />
      </div>
    </article>
  </div>
</template>

<style scoped>
.plan-chat-md :deep(p) {
  margin: 0.35em 0;
}
.plan-chat-md :deep(p:first-child) {
  margin-top: 0;
}
.plan-chat-md :deep(p:last-child) {
  margin-bottom: 0;
}
.plan-chat-md :deep(ul),
.plan-chat-md :deep(ol) {
  margin: 0.35em 0;
  padding-left: 1.25rem;
}
.plan-chat-md :deep(li) {
  margin: 0.15em 0;
}
.plan-chat-md :deep(blockquote) {
  margin: 0.35em 0;
  padding-left: 0.75rem;
  border-left: 3px solid hsl(var(--border));
  opacity: 0.95;
}
.plan-chat-md :deep(code) {
  font-size: 0.9em;
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.plan-chat-md :deep(pre) {
  margin: 0.5em 0;
  padding: 0.5rem 0.65rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  font-size: 0.85em;
}
.plan-chat-md :deep(pre code) {
  padding: 0;
  background: transparent;
}

.bubble-assistant .plan-chat-md :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
  color: hsl(var(--primary));
}
.bubble-assistant .plan-chat-md :deep(a:hover) {
  opacity: 0.9;
}
.bubble-assistant .plan-chat-md :deep(code) {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}
.bubble-assistant .plan-chat-md :deep(pre) {
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
}
.bubble-assistant .plan-chat-md :deep(pre.shiki) {
  background: #0d1117;
  color: #e6edf3;
  border-color: hsl(var(--border));
}
.bubble-assistant .plan-chat-md :deep(pre.shiki code) {
  display: block;
  width: max-content;
  min-width: 100%;
  padding: 0.5rem 0.65rem;
  font-size: 0.8em;
  line-height: 1.45;
  background: transparent;
}

.bubble-assistant .plan-chat-md--fence :deep(pre) {
  max-height: 8.5rem;
  cursor: zoom-in;
}
.bubble-assistant .plan-chat-md--fence :deep(pre.shiki) {
  font-size: 0.68em;
  line-height: 1.38;
}
.bubble-assistant .plan-chat-md--fence :deep(pre.shiki code) {
  font-size: inherit;
  padding: 0.3rem 0.4rem;
  line-height: inherit;
}

.bubble-user .plan-chat-md :deep(a) {
  text-decoration: underline;
  text-underline-offset: 2px;
  color: inherit;
  opacity: 0.95;
}
.bubble-user .plan-chat-md :deep(a:hover) {
  opacity: 1;
}
.bubble-user .plan-chat-md :deep(code) {
  background: hsl(var(--primary-foreground) / 0.15);
  color: inherit;
}
.bubble-user .plan-chat-md :deep(pre) {
  background: hsl(var(--primary-foreground) / 0.12);
  border: 1px solid hsl(var(--primary-foreground) / 0.25);
}
.bubble-user .plan-chat-md :deep(pre code) {
  color: inherit;
}

.bubble-user ::selection,
.bubble-user :deep(::selection) {
  background: #fde68a;
  color: #111827;
}
</style>

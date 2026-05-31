<script setup lang="ts">
import Kota0PlanCardInline from "@/components/kota0/ai/Kota0PlanCardInline.vue";
import { useChatAutoScroll } from "@/components/kota0/ai/useChatAutoScroll";
import type { Kota0PromptController } from "@/components/kota0/ai/useKota0PromptController";

const props = defineProps<{ controller: Kota0PromptController }>();
const ctrl = props.controller;

const { listRef } = useChatAutoScroll([
  () => ctrl.messages,
  () => ctrl.sending,
  () => ctrl.liveAssistantParts,
]);
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
        v-memo="[m.id, m.content, m.kind]"
      >
        <div class="w-full max-w-[min(100%,42rem)]">
          <Kota0PlanCardInline
            v-if="ctrl.parsePlanContent(m.content)"
            :plan="ctrl.parsePlanContent(m.content)!"
          />
          <div
            v-else
            class="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-muted-foreground md:text-sm"
          >
            (Plan unreadable — fall back to typing the request again.)
          </div>
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
        v-memo="[m.id, m.content, m.role, m.createdAt, ctrl.shikiReady, (m.parts ?? []).length]"
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
          <template v-if="m.role === 'assistant' && m.parts && m.parts.length > 0">
            <template v-for="(part, i) in m.parts" :key="`${m.id}-p-${i}`">
              <div
                v-if="part.type === 'text' && part.text.trim().length > 0"
                class="plan-chat-md"
                :class="{ 'plan-chat-md--fence': ctrl.hasExpandableCodeFenceInMessage(part.text) }"
                v-html="ctrl.displayChatMarkdown(part.text)"
                @click="ctrl.onChatMarkdownClick($event, m)"
              />
              <div
                v-else-if="part.type === 'tool-call'"
                class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[10px] font-medium text-foreground"
                :title="part.summary"
              >
                <code class="font-mono">{{ part.tool }}</code>
                <span v-if="part.summary" class="truncate max-w-[24ch] text-muted-foreground">{{ part.summary }}</span>
              </div>
              <div
                v-else-if="part.type === 'tool-result'"
                class="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                :class="
                  part.ok
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-400/40 bg-rose-500/10 text-rose-200'
                "
                :title="part.summary"
              >
                <span>{{ part.ok ? "✓" : "✗" }}</span>
                <code class="font-mono">{{ part.tool }}</code>
              </div>
            </template>
            <p v-if="(m.parts ?? []).every((p) => p.type !== 'text' || p.text.trim().length === 0) && m.content.trim().length > 0"
              class="plan-chat-md mt-1"
              v-html="ctrl.displayChatMarkdown(m.content)"
              @click="ctrl.onChatMarkdownClick($event, m)"
            />
          </template>
          <div
            v-else
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
      v-if="ctrl.sending && ctrl.liveAssistantParts.length > 0"
      class="flex justify-start"
      aria-label="Agent is applying"
    >
      <div
        class="bubble-assistant max-w-[min(100%,100%)] rounded-lg border border-border bg-card px-3 py-2 text-xs text-card-foreground shadow-sm md:text-sm"
      >
        <p class="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span class="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          {{ ctrl.workflowStatusLabel() || "Applying…" }}
        </p>
        <template v-for="(part, i) in ctrl.liveAssistantParts" :key="`live-p-${i}`">
          <div
            v-if="part.type === 'status' && part.text.length > 0"
            class="mt-2 flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-foreground"
          >
            <span class="mt-1 inline-flex size-1.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            <span>
              <span>{{ part.text }}</span>
              <span
                v-if="part.tone === 'classify' && part.reason"
                class="mt-0.5 block text-[0.65rem] italic text-muted-foreground"
              >
                Why: {{ part.reason }}
              </span>
            </span>
          </div>
          <div v-else-if="part.type === 'plan'" class="mt-2">
            <Kota0PlanCardInline :plan="part.plan" />
          </div>
          <div
            v-else-if="part.type === 'text' && part.text.length > 0"
            class="plan-chat-md mt-1"
            v-html="ctrl.displayChatMarkdown(part.text)"
          />
          <div
            v-else-if="part.type === 'tool-call'"
            class="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground"
            :title="part.summary"
          >
            <code class="font-mono">{{ part.tool }}</code>
            <span v-if="part.summary" class="truncate max-w-[24ch] text-muted-foreground">{{ part.summary }}</span>
          </div>
          <div
            v-else-if="part.type === 'tool-result'"
            class="mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
            :class="
              part.ok
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-400/40 bg-rose-500/10 text-rose-200'
            "
          >
            <span>{{ part.ok ? "✓" : "✗" }}</span>
            <code class="font-mono">{{ part.tool }}</code>
          </div>
        </template>
      </div>
    </article>
    <article
      v-else-if="ctrl.sending"
      class="flex justify-start"
      aria-label="Assistant is thinking"
    >
      <div
        class="bubble-assistant max-w-[min(100%,100%)] rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground shadow-sm md:text-sm"
      >
        <p class="flex items-center gap-2 font-medium text-foreground">
          <span class="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
          {{ ctrl.workflowStatusLabel() || "Thinking…" }}
        </p>
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

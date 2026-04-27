<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";
import { nextTick, onMounted, ref, watch } from "vue";
import { Button } from "@/components/ui/button";
import { initShikiChatMarkdown, renderChatMarkdown } from "@/lib/renderChatMarkdown";
import NvibeSourceEditor from "@/subjects/nvibe/NvibeSourceEditor.vue";
import { stripLegacyNvibeChatSections } from "@/subjects/nvibe/nvibeChatDisplay";
import { useNvibePlanChat } from "@/subjects/nvibe/useNvibePlanChat";
import { patchNvibeApp, putNvibeAppSource } from "@/subjects/nvibe/nvibeAppApi";
import { wrapAssistantMarkdownAsPreviewSfc } from "@/subjects/nvibe/wrapAssistantAsPreviewSfc";
import { extractVueFenceFromMarkdown } from "@shared/nvibeExtractVueFence.ts";
import { isValidNvibeAppSfc } from "@/subjects/nvibe/nvibeSfcQuickCheck";
import type { ChatMessage } from "@/types/chat";

const emit = defineEmits<{
  /** AI **Apply**: proposed `App.vue` persisted + preview refreshed in parent. */
  applied: [];
  collapsePanel: [];
}>();

const props = withDefaults(
  defineProps<{
    /** Domain app id from Scribe `data.app_id`; apply requires this. */
    activeAppId: string | null;
    /** Incremented by parent after Code tab **Apply** so chat reloads (system row from Scribe). */
    refreshChatKey?: number;
  }>(),
  {
    refreshChatKey: 0,
  },
);

const {
  messages,
  sending,
  loading,
  error: chatError,
  canSend,
  sendUserMessage,
  lastAssistantMessage,
  lastProposedAppVue,
  clearProposedAppVue,
  loadMessages,
} = useNvibePlanChat(() => props.activeAppId);

/** Edited SFC from the expand dialog — wins over last-turn extraction until cleared. */
const draftSfcOverride = ref<string | null>(null);
const codeDlg = ref<HTMLDialogElement | null>(null);
const codeModalDraft = ref("");

watch(lastAssistantMessage, () => {
  draftSfcOverride.value = null;
});

watch(
  () => props.refreshChatKey,
  (k) => {
    if (k > 0) void loadMessages();
  },
);

const input = ref("");
const listRef = ref<HTMLElement | null>(null);
/** Bumps when Shiki finishes loading so message bubbles re-render with highlighted fences. */
const shikiReady = ref(false);

onMounted(() => {
  void initShikiChatMarkdown().then(() => {
    shikiReady.value = true;
  });
});
const applyError = ref<string | null>(null);
const applying = ref(false);

async function scrollToBottom() {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(messages, () => void scrollToBottom(), { deep: true });

async function onSubmit() {
  const t = input.value;
  input.value = "";
  await sendUserMessage(t);
  void scrollToBottom();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void onSubmit();
  }
}

function hasVueFenceInMessage(content: string): boolean {
  return !!extractVueFenceFromMarkdown(content);
}

function displayChatMarkdown(content: string): string {
  return renderChatMarkdown(stripLegacyNvibeChatSections(content));
}

function openCodeDialogFromMessage(content: string): void {
  const fence = extractVueFenceFromMarkdown(content);
  if (!fence) return;
  codeModalDraft.value = fence;
  void nextTick(() => {
    const el = codeDlg.value;
    if (!el || el.open) return;
    el.showModal();
  });
}

function closeCodeDialog(): void {
  const el = codeDlg.value;
  if (el?.open) el.close();
}

watch(
  () => props.activeAppId,
  () => {
    draftSfcOverride.value = null;
    closeCodeDialog();
  },
);

function onChatMarkdownClick(e: MouseEvent, m: ChatMessage): void {
  const t = e.target as HTMLElement | null;
  if (!t?.closest("pre")) return;
  if (!hasVueFenceInMessage(m.content)) return;
  e.preventDefault();
  openCodeDialogFromMessage(m.content);
}

function saveDraftFromDialog(): void {
  const s = codeModalDraft.value.trim();
  if (!isValidNvibeAppSfc(s)) {
    applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
    return;
  }
  applyError.value = null;
  draftSfcOverride.value = s;
  closeCodeDialog();
}

async function persistSfcFromDialog(): Promise<void> {
  const appId = props.activeAppId;
  const s = codeModalDraft.value.trim();
  if (!appId || applying.value) return;
  if (!isValidNvibeAppSfc(s)) {
    applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
    return;
  }
  applying.value = true;
  applyError.value = null;
  const r = await putNvibeAppSource(appId, s, { sourceOrigin: "ai_apply" });
  if (!r.ok) {
    applying.value = false;
    applyError.value = r.message;
    return;
  }
  const pr = await patchNvibeApp(appId, { status: "applied" });
  applying.value = false;
  if (!pr.ok) {
    applyError.value = pr.message;
    return;
  }
  draftSfcOverride.value = null;
  clearProposedAppVue();
  closeCodeDialog();
  emit("applied");
}

function resolveSfcForApply(): string | null {
  const draft = draftSfcOverride.value;
  if (draft && isValidNvibeAppSfc(draft)) return draft;
  const proposed = lastProposedAppVue.value;
  const md = lastAssistantMessage.value;
  if (proposed && isValidNvibeAppSfc(proposed)) return proposed;
  if (md) {
    const fence = extractVueFenceFromMarkdown(md);
    if (fence && isValidNvibeAppSfc(fence)) return fence;
    return wrapAssistantMarkdownAsPreviewSfc(md);
  }
  return null;
}

async function applyFromAi() {
  const appId = props.activeAppId;
  if (!appId || applying.value) return;
  const sfc = resolveSfcForApply();
  if (!sfc) return;
  applying.value = true;
  applyError.value = null;
  const r = await putNvibeAppSource(appId, sfc, { sourceOrigin: "ai_apply" });
  if (!r.ok) {
    applying.value = false;
    applyError.value = r.message;
    return;
  }
  const pr = await patchNvibeApp(appId, { status: "applied" });
  applying.value = false;
  if (!pr.ok) {
    applyError.value = pr.message;
    return;
  }
  draftSfcOverride.value = null;
  clearProposedAppVue();
  emit("applied");
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <div class="shrink-0 border-b border-border px-3 py-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-8 shrink-0 md:hidden"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </Button>
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="hidden size-8 shrink-0 md:inline-flex"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            :disabled="
              (!lastAssistantMessage && !lastProposedAppVue && !draftSfcOverride) || !activeAppId || applying
            "
            @click="applyFromAi"
          >
            {{ applying ? "Applying…" : "Apply" }}
          </Button>
        </div>
      </div>
      <p v-if="applyError" class="mt-1 text-xs text-destructive">{{ applyError }}</p>
      <p v-if="chatError" class="mt-1 text-xs text-destructive">{{ chatError }}</p>
      <p v-if="loading && activeAppId" class="mt-1 text-xs text-muted-foreground">Loading…</p>
    </div>

    <div
      ref="listRef"
      class="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      role="log"
      aria-live="polite"
    >
      <article
        v-for="m in messages"
        :key="`${m.id}-${shikiReady ? 1 : 0}`"
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
            :class="{ 'plan-chat-md--fence': hasVueFenceInMessage(m.content) }"
            v-html="displayChatMarkdown(m.content)"
            @click="onChatMarkdownClick($event, m)"
          />
          <p class="mt-1 text-[0.6rem] opacity-70">{{ new Date(m.createdAt).toLocaleTimeString() }}</p>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <dialog
        ref="codeDlg"
        class="nvibe-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.vue</p>
          <Button type="button" variant="ghost" size="sm" @click="closeCodeDialog">Close</Button>
        </div>
        <p class="shrink-0 px-4 pt-2 text-xs text-muted-foreground">
          Opened from a fenced Vue block in the thread. Edit here, then <strong>Apply now</strong> to write
          Scribe, or <strong>Use for Apply</strong> and press <strong>Apply</strong> in the header.
        </p>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <NvibeSourceEditor v-model="codeModalDraft" class="h-full min-h-0" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <Button type="button" variant="outline" size="sm" @click="closeCodeDialog">Cancel</Button>
          <Button type="button" variant="secondary" size="sm" @click="saveDraftFromDialog">Use for Apply</Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            :disabled="!activeAppId || applying"
            @click="persistSfcFromDialog"
          >
            {{ applying ? "Applying…" : "Apply now" }}
          </Button>
        </div>
      </dialog>
    </Teleport>

    <div class="shrink-0 border-t border-border p-3">
      <form class="flex flex-col gap-2" @submit.prevent="onSubmit">
        <label class="sr-only" for="nvibe-ai-input">Message</label>
        <textarea
          id="nvibe-ai-input"
          v-model="input"
          rows="3"
          class="min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-2 py-2 text-xs text-foreground shadow-sm outline-none ring-ring placeholder:text-muted-foreground focus-visible:ring-2 md:text-sm"
          placeholder="Describe what you want to build…"
          :disabled="!canSend || !activeAppId"
          @keydown="onKeydown"
        />
        <Button type="submit" size="sm" :disabled="!canSend || !input.trim()">
          {{ sending ? "Sending…" : "Send" }}
        </Button>
      </form>
    </div>
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
</style>

<style>
/* `::backdrop` must be unscoped */
.nvibe-code-expand-dialog::backdrop {
  background: rgba(15, 23, 42, 0.55);
}
</style>

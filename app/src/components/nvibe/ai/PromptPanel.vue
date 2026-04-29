<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { initShikiChatMarkdown, renderChatMarkdown } from "@/lib/renderChatMarkdown";
import NvibeSourceEditor from "@/components/nvibe/viewer/NvibeSourceEditor.vue";
import NvibeChatComposer from "@/components/nvibe/ai/NvibeChatComposer.vue";
import { stripLegacyNvibeChatSections } from "@/components/nvibe/ai/nvibeChatDisplay";
import { useNvibePlanChat } from "@/components/nvibe/ai/useNvibePlanChat";
import { fetchNvibeApp, patchNvibeApp, putNvibeApp } from "@/components/nvibe/apps/nvibeAppApi";
import { extractTsFenceFromMarkdown } from "@shared/nvibeExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/nvibeExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/nvibeExtractVueFence.ts";
import { mergeDotEnvPatch } from "@shared/nvibeMergeDotEnvPatch.ts";
import { isValidNvibeAppSfc } from "@/components/nvibe/viewer/nvibeSfcQuickCheck";
import type { ChatMessage } from "@/components/nvibe/ai/chat.types";

const emit = defineEmits<{
  /** AI **Apply**: Scribe + preview refreshed in parent. */
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
  streamReceivedChars,
  loading,
  error: chatError,
  canSend,
  sendUserMessage,
  lastAssistantMessage,
  lastProposedAppVue,
  lastProposedAppBackend,
  lastProposedBundleEnv,
  clearProposedAppVue,
  loadMessages,
} = useNvibePlanChat(() => props.activeAppId);

/** Edited SFC from the expand dialog — wins over last-turn extraction until cleared. */
const draftSfcOverride = ref<string | null>(null);
const codeDlg = ref<HTMLDialogElement | null>(null);
const codeModalDraft = ref("");
const backendDlg = ref<HTMLDialogElement | null>(null);
const backendModalDraft = ref("");

watch(lastAssistantMessage, () => {
  draftSfcOverride.value = null;
});

watch(
  () => props.refreshChatKey,
  (k) => {
    if (k > 0) void loadMessages();
  },
);

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

const canApplyFromAi = computed(() => {
  if (draftSfcOverride.value) return true;
  if (lastProposedAppVue.value) return true;
  if (lastProposedAppBackend.value) return true;
  if (lastProposedBundleEnv.value) return true;
  const md = lastAssistantMessage.value;
  if (md) {
    if (extractVueFenceFromMarkdown(md)) return true;
    if (extractTsFenceFromMarkdown(md)) return true;
    if (extractEnvFenceFromMarkdown(md)) return true;
  }
  return false;
});

async function scrollToBottom() {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
}

watch(messages, () => void scrollToBottom(), { deep: true });

async function onComposerSubmit(text: string) {
  await sendUserMessage(text);
  void scrollToBottom();
}

function hasVueFenceInMessage(content: string): boolean {
  return !!extractVueFenceFromMarkdown(content);
}

function hasTsFenceInMessage(content: string): boolean {
  return !!extractTsFenceFromMarkdown(content);
}

function hasExpandableCodeFenceInMessage(content: string): boolean {
  return hasVueFenceInMessage(content) || hasTsFenceInMessage(content);
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

function openBackendDialogFromMessage(content: string): void {
  const fence = extractTsFenceFromMarkdown(content);
  if (!fence) return;
  backendModalDraft.value = fence;
  void nextTick(() => {
    const el = backendDlg.value;
    if (!el || el.open) return;
    el.showModal();
  });
}

function closeCodeDialog(): void {
  const el = codeDlg.value;
  if (el?.open) el.close();
}

function closeBackendDialog(): void {
  const el = backendDlg.value;
  if (el?.open) el.close();
}

watch(
  () => props.activeAppId,
  () => {
    draftSfcOverride.value = null;
    closeCodeDialog();
    closeBackendDialog();
  },
);

function onChatMarkdownClick(e: MouseEvent, m: ChatMessage): void {
  const t = e.target as HTMLElement | null;
  if (!t?.closest("pre")) return;
  const c = m.content;
  if (hasVueFenceInMessage(c)) {
    e.preventDefault();
    openCodeDialogFromMessage(c);
    return;
  }
  if (hasTsFenceInMessage(c)) {
    e.preventDefault();
    openBackendDialogFromMessage(c);
  }
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
  const cur = await fetchNvibeApp(appId);
  if (!cur.ok) {
    applying.value = false;
    applyError.value = cur.message;
    return;
  }
  const r = await putNvibeApp(
    appId,
    { source: s, backendSource: cur.app.backendSource },
    { sourceOrigin: "ai_apply" },
  );
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

async function persistBackendFromDialog(): Promise<void> {
  const appId = props.activeAppId;
  const s = backendModalDraft.value.trim();
  if (!appId || applying.value) return;
  if (!s) {
    applyError.value = "App.backend.ts cannot be empty.";
    return;
  }
  applying.value = true;
  applyError.value = null;
  const cur = await fetchNvibeApp(appId);
  if (!cur.ok) {
    applying.value = false;
    applyError.value = cur.message;
    return;
  }
  const r = await putNvibeApp(
    appId,
    { source: cur.app.source, backendSource: s },
    { sourceOrigin: "ai_apply" },
  );
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
  clearProposedAppVue();
  closeBackendDialog();
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
  }
  return null;
}

function resolveBackendForApply(): string | null {
  const p = lastProposedAppBackend.value;
  if (p && p.trim().length > 0) return p.trim();
  const md = lastAssistantMessage.value;
  if (md) {
    const fence = extractTsFenceFromMarkdown(md);
    if (fence && fence.trim().length > 0) return fence.trim();
  }
  return null;
}

function resolveBundleEnvForApply(): string | null {
  const p = lastProposedBundleEnv.value;
  if (p && p.trim().length > 0) return p.trim();
  const md = lastAssistantMessage.value;
  if (md) {
    const fence = extractEnvFenceFromMarkdown(md);
    if (fence && fence.trim().length > 0) return fence.trim();
  }
  return null;
}

async function applyFromAi() {
  const appId = props.activeAppId;
  if (!appId || applying.value) return;
  const cur = await fetchNvibeApp(appId);
  if (!cur.ok) {
    applyError.value = cur.message;
    return;
  }
  const proposedVue = resolveSfcForApply();
  const proposedBe = resolveBackendForApply();
  const proposedEnv = resolveBundleEnvForApply();
  if (!proposedVue && !proposedBe && !proposedEnv) return;
  const nextSource = proposedVue !== null ? proposedVue : cur.app.source;
  const nextBackend = proposedBe !== null ? proposedBe : cur.app.backendSource;
  applying.value = true;
  applyError.value = null;
  const payload: { source: string; backendSource: string; bundleEnv?: string } = {
    source: nextSource,
    backendSource: nextBackend,
  };
  if (proposedEnv !== null) {
    const currentEnv = typeof cur.app.bundleEnv === "string" ? cur.app.bundleEnv : "";
    payload.bundleEnv = mergeDotEnvPatch(currentEnv, proposedEnv);
  }
  const r = await putNvibeApp(appId, payload, { sourceOrigin: "ai_apply" });
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
        <div class="flex min-w-0 items-center gap-1">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm size-8 shrink-0 md:hidden"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-square btn-sm hidden size-8 shrink-0 md:inline-flex"
            aria-label="Hide AI panel"
            @click="emit('collapsePanel')"
          >
            <ChevronLeft class="size-4" />
          </button>
          <button
            type="button"
            class="inline-flex h-8 shrink-0 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canApplyFromAi || !activeAppId || applying"
            @click="applyFromAi"
          >
            {{ applying ? "Applying…" : "Apply" }}
          </button>
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
      :aria-busy="sending"
    >
      <article
        v-for="m in messages"
        :key="`${m.id}-${shikiReady ? 1 : 0}`"
        v-memo="[m.id, m.content, m.role, m.createdAt, shikiReady]"
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
            :class="{ 'plan-chat-md--fence': hasExpandableCodeFenceInMessage(m.content) }"
            v-html="displayChatMarkdown(m.content)"
            @click="onChatMarkdownClick($event, m)"
          />
          <p class="mt-1 text-[0.6rem] opacity-70">{{ new Date(m.createdAt).toLocaleTimeString() }}</p>
        </div>
      </article>

      <article v-if="sending && streamReceivedChars === null" class="flex justify-start" aria-label="Assistant is thinking">
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
        v-else-if="sending && streamReceivedChars !== null"
        class="flex justify-start"
        aria-label="Assistant is generating a reply"
      >
        <div
          class="bubble-assistant max-w-[min(100%,100%)] rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground shadow-sm md:text-sm"
        >
          <p class="flex items-center gap-2 font-medium text-foreground">
            <span class="inline-flex size-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            Receiving response…
            <span class="font-mono text-[0.65rem] text-muted-foreground"
              >{{ streamReceivedChars.toLocaleString() }} chars</span
            >
          </p>
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
          <button type="button" class="btn btn-ghost btn-sm" @click="closeCodeDialog">Close</button>
        </div>
        <p class="shrink-0 px-4 pt-2 text-xs text-muted-foreground">Saves to App.vue in Scribe.</p>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <NvibeSourceEditor v-model="codeModalDraft" class="h-full min-h-0" language="sfc" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="closeCodeDialog">Cancel</button>
          <button type="button" class="btn btn-outline btn-sm" @click="saveDraftFromDialog">Use for Apply</button>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!activeAppId || applying"
            @click="persistSfcFromDialog"
          >
            {{ applying ? "Applying…" : "Apply now" }}
          </button>
        </div>
      </dialog>
    </Teleport>

    <Teleport to="body">
      <dialog
        ref="backendDlg"
        class="nvibe-code-expand-dialog fixed left-1/2 top-1/2 z-[400] max-h-[92vh] w-[min(96vw,72rem)] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background p-0 text-foreground shadow-2xl outline-none [open]:flex"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p class="text-sm font-medium">App.backend.ts</p>
          <button type="button" class="btn btn-ghost btn-sm" @click="closeBackendDialog">Close</button>
        </div>
        <p class="shrink-0 px-4 pt-2 text-xs text-muted-foreground">Saves to App.backend.ts in Scribe.</p>
        <div class="min-h-0 flex-1 px-3 pb-2 pt-2" style="height: min(62vh, 640px)">
          <NvibeSourceEditor v-model="backendModalDraft" class="h-full min-h-0" language="ts" />
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button type="button" class="btn btn-outline btn-sm" @click="closeBackendDialog">Cancel</button>
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-md bg-[#3B82F6] px-3 text-xs font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!activeAppId || applying"
            @click="persistBackendFromDialog"
          >
            {{ applying ? "Applying…" : "Apply now" }}
          </button>
        </div>
      </dialog>
    </Teleport>

    <div class="shrink-0 border-t border-border p-3">
      <NvibeChatComposer
        :disabled="!canSend || !activeAppId"
        :sending="sending"
        @submit="onComposerSubmit"
      />
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

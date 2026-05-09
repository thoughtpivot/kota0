import type { InjectionKey } from "vue";
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";
import { initShikiChatMarkdown, renderChatMarkdown } from "@/lib/renderChatMarkdown";
import { stripLegacyKota0ChatSections } from "@/components/kota0/ai/kota0ChatDisplay";
import { useKota0PlanChat } from "@/components/kota0/ai/useKota0PlanChat";
import { fetchKota0App, patchKota0App, putKota0App } from "@/components/kota0/apps/kota0AppApi";
import { useKota0AiAutoApplyPref } from "@/components/kota0/apps/useKota0AiAutoApplyPref";
import { extractTsFenceFromMarkdown } from "@shared/kota0ExtractBackendFence.ts";
import { extractEnvFenceFromMarkdown } from "@shared/kota0ExtractEnvFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/kota0ExtractVueFence.ts";
import { mergeDotEnvPatch } from "@shared/kota0MergeDotEnvPatch.ts";
import { isValidKota0AppSfc } from "@/components/kota0/viewer/kota0SfcQuickCheck";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";

export type Kota0PromptControllerOptions = {
  activeAppId: MaybeRefOrGetter<string | null>;
  refreshChatKey: MaybeRefOrGetter<number>;
  onApplied: () => void;
};

export function useKota0PromptController(opts: Kota0PromptControllerOptions) {
  const activeId = () => toValue(opts.activeAppId);

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
  } = useKota0PlanChat(() => activeId());

  const { aiAutoApply } = useKota0AiAutoApplyPref();

  /** After `sendUserMessage` finishes (`sending` → false), run auto-apply once (avoids racing `lastAssistantMessage`). */
  const pendingAutoApplyAfterSend = ref(false);

  const draftSfcOverride = ref<string | null>(null);
  const codeModalDraft = ref("");
  const backendModalDraft = ref("");
  const vueDialogOpen = ref(false);
  const backendDialogOpen = ref(false);

  const activeAppId = computed(() => activeId());

  watch(lastAssistantMessage, () => {
    draftSfcOverride.value = null;
  });

  watch(
    () => toValue(opts.refreshChatKey),
    (k) => {
      if (k > 0) void loadMessages();
    },
  );

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

  async function submitUserMessageFromPanel(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !activeId() || sending.value) return;
    if (aiAutoApply.value) pendingAutoApplyAfterSend.value = true;
    await sendUserMessage(trimmed);
  }

  async function onComposerSubmit(text: string): Promise<void> {
    await submitUserMessageFromPanel(text);
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
    return renderChatMarkdown(stripLegacyKota0ChatSections(content));
  }

  function openCodeDialogFromMessage(content: string): void {
    const fence = extractVueFenceFromMarkdown(content);
    if (!fence) return;
    codeModalDraft.value = fence;
    vueDialogOpen.value = true;
  }

  function openBackendDialogFromMessage(content: string): void {
    const fence = extractTsFenceFromMarkdown(content);
    if (!fence) return;
    backendModalDraft.value = fence;
    backendDialogOpen.value = true;
  }

  function closeCodeDialog(): void {
    vueDialogOpen.value = false;
  }

  function closeBackendDialog(): void {
    backendDialogOpen.value = false;
  }

  watch(activeAppId, () => {
    draftSfcOverride.value = null;
    vueDialogOpen.value = false;
    backendDialogOpen.value = false;
  });

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
    if (!isValidKota0AppSfc(s)) {
      applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
      return;
    }
    applyError.value = null;
    draftSfcOverride.value = s;
    closeCodeDialog();
  }

  async function persistSfcFromDialog(): Promise<void> {
    const appId = activeId();
    const s = codeModalDraft.value.trim();
    if (!appId || applying.value) return;
    if (!isValidKota0AppSfc(s)) {
      applyError.value = "That isn’t a valid App.vue SFC yet (fix errors, then try again).";
      return;
    }
    applying.value = true;
    applyError.value = null;
    const cur = await fetchKota0App(appId);
    if (!cur.ok) {
      applying.value = false;
      applyError.value = cur.message;
      return;
    }
    const r = await putKota0App(
      appId,
      { source: s, backendSource: cur.app.backendSource },
      { sourceOrigin: "ai_apply" },
    );
    if (!r.ok) {
      applying.value = false;
      applyError.value = r.message;
      return;
    }
    const pr = await patchKota0App(appId, { status: "applied" });
    applying.value = false;
    if (!pr.ok) {
      applyError.value = pr.message;
      return;
    }
    draftSfcOverride.value = null;
    clearProposedAppVue();
    closeCodeDialog();
    opts.onApplied();
  }

  async function persistBackendFromDialog(): Promise<void> {
    const appId = activeId();
    const s = backendModalDraft.value.trim();
    if (!appId || applying.value) return;
    if (!s) {
      applyError.value = "App.backend.ts cannot be empty.";
      return;
    }
    applying.value = true;
    applyError.value = null;
    const cur = await fetchKota0App(appId);
    if (!cur.ok) {
      applying.value = false;
      applyError.value = cur.message;
      return;
    }
    const r = await putKota0App(
      appId,
      { source: cur.app.source, backendSource: s },
      { sourceOrigin: "ai_apply" },
    );
    if (!r.ok) {
      applying.value = false;
      applyError.value = r.message;
      return;
    }
    const pr = await patchKota0App(appId, { status: "applied" });
    applying.value = false;
    if (!pr.ok) {
      applyError.value = pr.message;
      return;
    }
    clearProposedAppVue();
    closeBackendDialog();
    opts.onApplied();
  }

  function resolveSfcForApply(): string | null {
    const draft = draftSfcOverride.value;
    if (draft && isValidKota0AppSfc(draft)) return draft;
    const proposed = lastProposedAppVue.value;
    const md = lastAssistantMessage.value;
    if (proposed && isValidKota0AppSfc(proposed)) return proposed;
    if (md) {
      const fence = extractVueFenceFromMarkdown(md);
      if (fence && isValidKota0AppSfc(fence)) return fence;
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

  async function applyFromAi(): Promise<void> {
    const appId = activeId();
    if (!appId || applying.value) return;
    const cur = await fetchKota0App(appId);
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
    const r = await putKota0App(appId, payload, { sourceOrigin: "ai_apply" });
    if (!r.ok) {
      applying.value = false;
      applyError.value = r.message;
      return;
    }
    const pr = await patchKota0App(appId, { status: "applied" });
    applying.value = false;
    if (!pr.ok) {
      applyError.value = pr.message;
      return;
    }
    draftSfcOverride.value = null;
    clearProposedAppVue();
    opts.onApplied();
  }

  watch(sending, async (isSending, wasSending) => {
    if (wasSending !== true || isSending !== false) return;
    if (!pendingAutoApplyAfterSend.value) return;
    pendingAutoApplyAfterSend.value = false;
    if (!aiAutoApply.value || !activeId() || chatError.value) return;
    await nextTick();
    if (canApplyFromAi.value) await applyFromAi();
  });

  return reactive({
    messages,
    sending,
    streamReceivedChars,
    loading,
    chatError,
    canSend,
    aiAutoApply,
    draftSfcOverride,
    codeModalDraft,
    backendModalDraft,
    vueDialogOpen,
    backendDialogOpen,
    shikiReady,
    applyError,
    applying,
    canApplyFromAi,
    activeAppId,
    submitUserMessageFromPanel,
    onComposerSubmit,
    hasVueFenceInMessage,
    hasTsFenceInMessage,
    hasExpandableCodeFenceInMessage,
    displayChatMarkdown,
    openCodeDialogFromMessage,
    openBackendDialogFromMessage,
    closeCodeDialog,
    closeBackendDialog,
    onChatMarkdownClick,
    saveDraftFromDialog,
    persistSfcFromDialog,
    persistBackendFromDialog,
    applyFromAi,
  });
}

export type Kota0PromptController = ReturnType<typeof useKota0PromptController>;

export const K0_PROMPT_CONTROLLER: InjectionKey<Kota0PromptController> = Symbol(
  "kota0PromptController",
);

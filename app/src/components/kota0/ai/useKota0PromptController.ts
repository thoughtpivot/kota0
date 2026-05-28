import type { InjectionKey } from "vue";
import {
  computed,
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
import {
  fetchKota0App,
  patchKota0App,
  putKota0App,
  type Kota0PlanEnvelope,
} from "@/components/kota0/apps/kota0AppApi";
import { extractTsFenceFromMarkdown } from "@shared/kota0ExtractBackendFence.ts";
import { extractVueFenceFromMarkdown } from "@shared/kota0ExtractVueFence.ts";
import { isValidKota0AppSfc } from "@/components/kota0/viewer/kota0SfcQuickCheck";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";

export type Kota0AppliedPayload = { bundleFingerprint?: string };

export type Kota0PromptControllerOptions = {
  activeAppId: MaybeRefOrGetter<string | null>;
  refreshChatKey: MaybeRefOrGetter<number>;
  onApplied: (payload?: Kota0AppliedPayload) => void;
};

export function useKota0PromptController(opts: Kota0PromptControllerOptions) {
  const activeId = () => toValue(opts.activeAppId);

  const {
    messages,
    sending,
    liveToolCalls,
    liveAssistantParts,
    workflowPhase,
    lastWasComplex,
    lastClassifyReason,
    loading,
    error: chatError,
    canSend,
    sendUserMessage,
    lastAssistantMessage,
    loadMessages,
  } = useKota0PlanChat(() => activeId());

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

  async function submitUserMessageFromPanel(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !activeId() || sending.value) return;
    const result = await sendUserMessage(trimmed);
    if (result.applied) {
      opts.onApplied({ bundleFingerprint: result.bundleFingerprint });
    }
  }

  /** Decode a `kind:"plan"` chat row's `content` (JSON envelope) for UI rendering. */
  function parsePlanContent(content: string): Kota0PlanEnvelope | null {
    try {
      const raw = JSON.parse(content) as unknown;
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Partial<Kota0PlanEnvelope>;
      if (typeof o.intent !== "string" || !Array.isArray(o.changes)) return null;
      return raw as Kota0PlanEnvelope;
    } catch {
      return null;
    }
  }

  function workflowStatusLabel(): string {
    switch (workflowPhase.value) {
      case "classifying":
        return "Classifying…";
      case "planning":
        return "Planning…";
      case "applying":
        return "Applying…";
      case "done":
        return "Done";
      default:
        return "";
    }
  }

  function showPlanWorkflowStatus(message: ChatMessage): boolean {
    if (message.kind !== "plan" || !sending.value) return false;
    return lastWasComplex.value === true;
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
    closeCodeDialog();
    opts.onApplied({ bundleFingerprint: r.data.bundleFingerprint });
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
    closeBackendDialog();
    opts.onApplied({ bundleFingerprint: r.data.bundleFingerprint });
  }

  return reactive({
    messages,
    sending,
    liveToolCalls,
    liveAssistantParts,
    workflowPhase,
    lastWasComplex,
    lastClassifyReason,
    loading,
    chatError,
    canSend,
    draftSfcOverride,
    codeModalDraft,
    backendModalDraft,
    vueDialogOpen,
    backendDialogOpen,
    shikiReady,
    applyError,
    applying,
    activeAppId,
    submitUserMessageFromPanel,
    parsePlanContent,
    workflowStatusLabel,
    showPlanWorkflowStatus,
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
  });
}

export type Kota0PromptController = ReturnType<typeof useKota0PromptController>;

export const K0_PROMPT_CONTROLLER: InjectionKey<Kota0PromptController> = Symbol(
  "kota0PromptController",
);

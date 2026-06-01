/**
 * Prompt controller — thin orchestrator for the AI chat panel.
 *
 * Composes three single-purpose concerns and re-exposes a flat reactive surface
 * (the shape consumers inject via {@link K0_PROMPT_CONTROLLER}):
 *  - {@link usePlanChat}     — chat thread + streaming workflow
 *  - {@link useChatMarkdown} — markdown render + fence detection
 *  - {@link useCodeDialogs}  — open/edit/Apply fenced code in a modal
 */
import type { InjectionKey } from "vue";
import { computed, reactive, toValue, watch, type MaybeRefOrGetter } from "vue";
import { usePlanChat } from "@/components/kota0/ai/dock/usePlanChat";
import { useChatMarkdown } from "@/components/kota0/ai/dock/useChatMarkdown";
import {
  useCodeDialogs,
  type AppliedPayload,
} from "@/components/kota0/ai/dock/useCodeDialogs";

export type { AppliedPayload };

export type PromptControllerOptions = {
  activeAppId: MaybeRefOrGetter<string | null>;
  refreshChatKey: MaybeRefOrGetter<number>;
  onApplied: (payload?: AppliedPayload) => void;
};

export function usePromptController(opts: PromptControllerOptions) {
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
  } = usePlanChat(() => activeId());

  const md = useChatMarkdown();
  const dialogs = useCodeDialogs({
    activeId,
    lastAssistantMessage: () => lastAssistantMessage.value,
    onApplied: opts.onApplied,
  });

  const activeAppId = computed(() => activeId());

  watch(
    () => toValue(opts.refreshChatKey),
    (k) => {
      if (k > 0) void loadMessages();
    },
  );

  async function submitUserMessageFromPanel(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !activeId() || sending.value) return;
    const result = await sendUserMessage(trimmed);
    if (result.applied) {
      opts.onApplied({ bundleFingerprint: result.bundleFingerprint });
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

  async function onComposerSubmit(text: string): Promise<void> {
    await submitUserMessageFromPanel(text);
  }

  return reactive({
    // chat thread + workflow (usePlanChat)
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
    // markdown render + fence detection (useChatMarkdown)
    shikiReady: md.shikiReady,
    hasVueFenceInMessage: md.hasVueFenceInMessage,
    hasTsFenceInMessage: md.hasTsFenceInMessage,
    hasExpandableCodeFenceInMessage: md.hasExpandableCodeFenceInMessage,
    displayChatMarkdown: md.displayChatMarkdown,
    parsePlanContent: md.parsePlanContent,
    // code dialogs (useCodeDialogs)
    draftSfcOverride: dialogs.draftSfcOverride,
    codeModalDraft: dialogs.codeModalDraft,
    backendModalDraft: dialogs.backendModalDraft,
    vueDialogOpen: dialogs.vueDialogOpen,
    backendDialogOpen: dialogs.backendDialogOpen,
    applyError: dialogs.applyError,
    applying: dialogs.applying,
    openCodeDialogFromMessage: dialogs.openCodeDialogFromMessage,
    openBackendDialogFromMessage: dialogs.openBackendDialogFromMessage,
    closeCodeDialog: dialogs.closeCodeDialog,
    closeBackendDialog: dialogs.closeBackendDialog,
    onChatMarkdownClick: dialogs.onChatMarkdownClick,
    saveDraftFromDialog: dialogs.saveDraftFromDialog,
    persistSfcFromDialog: dialogs.persistSfcFromDialog,
    persistBackendFromDialog: dialogs.persistBackendFromDialog,
    // controller coordination
    activeAppId,
    submitUserMessageFromPanel,
    workflowStatusLabel,
    onComposerSubmit,
  });
}

export type PromptController = ReturnType<typeof usePromptController>;

export const K0_PROMPT_CONTROLLER: InjectionKey<PromptController> = Symbol(
  "kota0PromptController",
);

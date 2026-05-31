/**
 * Prompt controller — thin orchestrator for the AI chat panel.
 *
 * Composes three single-purpose concerns and re-exposes a flat reactive surface
 * (the shape consumers inject via {@link K0_PROMPT_CONTROLLER}):
 *  - {@link useKota0PlanChat}     — chat thread + streaming workflow
 *  - {@link useKota0ChatMarkdown} — markdown render + fence detection
 *  - {@link useKota0CodeDialogs}  — open/edit/Apply fenced code in a modal
 */
import type { InjectionKey } from "vue";
import { computed, reactive, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useKota0PlanChat } from "@/components/kota0/ai/useKota0PlanChat";
import { useKota0ChatMarkdown } from "@/components/kota0/ai/useKota0ChatMarkdown";
import {
  useKota0CodeDialogs,
  type Kota0AppliedPayload,
} from "@/components/kota0/ai/useKota0CodeDialogs";

export type { Kota0AppliedPayload };

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

  const md = useKota0ChatMarkdown();
  const dialogs = useKota0CodeDialogs({
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
    // chat thread + workflow (useKota0PlanChat)
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
    // markdown render + fence detection (useKota0ChatMarkdown)
    shikiReady: md.shikiReady,
    hasVueFenceInMessage: md.hasVueFenceInMessage,
    hasTsFenceInMessage: md.hasTsFenceInMessage,
    hasExpandableCodeFenceInMessage: md.hasExpandableCodeFenceInMessage,
    displayChatMarkdown: md.displayChatMarkdown,
    parsePlanContent: md.parsePlanContent,
    // code dialogs (useKota0CodeDialogs)
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

export type Kota0PromptController = ReturnType<typeof useKota0PromptController>;

export const K0_PROMPT_CONTROLLER: InjectionKey<Kota0PromptController> = Symbol(
  "kota0PromptController",
);

import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import {
  findPendingPlan,
  isFirstUserPrompt,
  isPlanConfirmation,
} from "@/components/kota0/ai/kota0ChatPhase";
import { kota0PlanFirstEnabled } from "@/components/kota0/ai/kota0PlanFirst";
import type { Kota0LastTurnPayload, Kota0PlanEnvelope } from "@/components/kota0/apps/kota0AppApi";
import {
  clearKota0Messages,
  fetchKota0Messages,
  postKota0Apply,
  postKota0Message,
  postKota0MessageStream,
  postKota0Plan,
} from "@/components/kota0/apps/kota0AppApi";

export type Kota0SendApplyOutcome = {
  applied: boolean;
  bundleFingerprint?: string;
};

export type Kota0AcceptPlanResult = {
  changed: boolean;
  bundleFingerprint?: string;
};

function kota0ChatStreamEnabled(): boolean {
  const v = import.meta.env.VITE_K0_CHAT_STREAM;
  return v !== "0" && v !== "false";
}

/** Per-app AI chat thread stored in Scribe (`k0_chat_message`). */
export function useKota0PlanChat(activeAppId: MaybeRefOrGetter<string | null>) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Latest model turn metadata (not stored in Scribe); used for Apply → SFC. */
  const lastKota0Turn = ref<Kota0LastTurnPayload | null>(null);
  /** Cumulative streamed JSON length from Gemini (null until first chunk when streaming). */
  const streamReceivedChars = ref<number | null>(null);
  /** Cumulative assistant text streamed from Gemini for the in-flight turn (empty until first delta). */
  const streamingAssistantText = ref<string>("");

  async function hydrate(): Promise<void> {
    loading.value = true;
    error.value = null;
    const id = toValue(activeAppId);
    if (!id) {
      messages.value = [];
      loading.value = false;
      return;
    }
    try {
      const r = await fetchKota0Messages(id);
      if (r.ok) {
        messages.value = r.messages;
      } else {
        messages.value = [];
        error.value = r.message;
      }
    } catch (e) {
      messages.value = [];
      error.value = e instanceof Error ? e.message : "Failed to load chat";
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => toValue(activeAppId),
    (id, prev) => {
      if (id !== prev) {
        lastKota0Turn.value = null;
        /** Do not show the previous app's Scribe thread while the new one loads. */
        messages.value = [];
      }
      void hydrate();
    },
    { immediate: true },
  );

  /**
   * Plan-first turn: persists user text + a `kind:"plan"` message and returns the
   * plan envelope. Apply runs only after the user confirms in a follow-up message.
   */
  async function sendForPlan(text: string, freshStart = false): Promise<Kota0PlanEnvelope | null> {
    const id = toValue(activeAppId);
    const trimmed = text.trim();
    if (!id || !trimmed || sending.value) return null;
    sending.value = true;
    error.value = null;
    try {
      const r = await postKota0Plan(id, trimmed, freshStart);
      if (r.ok) {
        messages.value = r.messages;
        return r.plan;
      }
      error.value = r.message?.trim() || `Kota0 plan failed (HTTP ${r.status}).`;
      return null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to plan";
      return null;
    } finally {
      sending.value = false;
    }
  }

  /**
   * Apply turn: takes a plan the user confirmed in chat and asks the server to
   * translate it into patches + persist the new source.
   */
  async function acceptPlan(
    plan: Kota0PlanEnvelope,
    opts?: { confirmationText?: string },
  ): Promise<Kota0AcceptPlanResult> {
    const id = toValue(activeAppId);
    if (!id || sending.value) return { changed: false };
    sending.value = true;
    error.value = null;
    try {
      const r = await postKota0Apply(id, plan, opts);
      if (r.ok) {
        messages.value = r.messages;
        const anyChanged = r.changed.source || r.changed.backend || r.changed.env;
        return {
          changed: anyChanged,
          bundleFingerprint: r.bundleFingerprint || undefined,
        };
      }
      error.value = r.message?.trim() || `Kota0 apply failed (HTTP ${r.status}).`;
      return { changed: false };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to apply";
      return { changed: false };
    } finally {
      sending.value = false;
    }
  }

  async function confirmAndApply(text: string, plan: Kota0PlanEnvelope): Promise<Kota0SendApplyOutcome> {
    const r = await acceptPlan(plan, { confirmationText: text.trim() });
    return {
      applied: r.changed,
      bundleFingerprint: r.bundleFingerprint,
    };
  }

  async function sendIdeationMessage(text: string): Promise<void> {
    const id = toValue(activeAppId);
    const trimmed = text.trim();
    if (!id || !trimmed || sending.value) return;
    sending.value = true;
    error.value = null;
    streamReceivedChars.value = null;
    streamingAssistantText.value = "";
    try {
      if (kota0ChatStreamEnabled()) {
        await postKota0MessageStream(id, trimmed, {
          onDelta: (n, textDelta) => {
            streamReceivedChars.value = n;
            if (textDelta) streamingAssistantText.value += textDelta;
          },
          onDone: (p) => {
            messages.value = p.messages;
            lastKota0Turn.value = p.lastKota0Turn;
          },
          onHttpError: (status, message) => {
            const m = message?.trim() ?? "";
            error.value = m || `Kota0 chat request failed (HTTP ${status}).`;
          },
          onStreamError: (message) => {
            const m = message?.trim() ?? "";
            error.value = m || "Kota0 chat stream failed before a complete reply.";
          },
        });
      } else {
        const r = await postKota0Message(id, trimmed);
        if (r.ok) {
          messages.value = r.messages;
          lastKota0Turn.value = r.lastKota0Turn;
        } else {
          const m = r.message?.trim() ?? "";
          error.value = m || `Kota0 chat failed (HTTP ${r.status}).`;
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending.value = false;
      streamReceivedChars.value = null;
      streamingAssistantText.value = "";
    }
  }

  async function sendUserMessage(text: string): Promise<Kota0SendApplyOutcome> {
    const trimmed = text.trim();
    if (!trimmed || sending.value || !toValue(activeAppId)) return { applied: false };

    if (kota0PlanFirstEnabled()) {
      if (isFirstUserPrompt(messages.value)) {
        await sendForPlan(trimmed);
        return { applied: false };
      }
      const pending = findPendingPlan(messages.value);
      if (pending && isPlanConfirmation(trimmed)) {
        return confirmAndApply(trimmed, pending);
      }
    }

    await sendIdeationMessage(trimmed);
    return { applied: false };
  }

  async function clearThread(): Promise<void> {
    const id = toValue(activeAppId);
    if (!id) return;
    error.value = null;
    try {
      const r = await clearKota0Messages(id);
      if (r.ok) {
        messages.value = r.messages;
        lastKota0Turn.value = null;
      } else {
        const m = r.message?.trim() ?? "";
        error.value = m || `Failed to clear chat (HTTP ${r.status}).`;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to clear chat";
    }
  }

  /** Do not block send while chat is reloading — only block during POST. */
  const canSend = computed(() => !sending.value && Boolean(toValue(activeAppId)));

  const lastAssistantMessage = computed((): string | null => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m?.role === "assistant") return m.content;
    }
    return null;
  });

  const lastProposedAppVue = computed((): string | null => {
    const p = lastKota0Turn.value?.proposedAppVue;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  const lastProposedAppBackend = computed((): string | null => {
    const p = lastKota0Turn.value?.proposedAppBackend;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  const lastProposedBundleEnv = computed((): string | null => {
    const p = lastKota0Turn.value?.proposedBundleEnv;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  function clearProposedAppVue(): void {
    lastKota0Turn.value = null;
  }

  return {
    messages,
    sending,
    streamReceivedChars,
    streamingAssistantText,
    loading,
    error,
    canSend,
    sendUserMessage,
    sendForPlan,
    acceptPlan,
    confirmAndApply,
    clearThread,
    lastAssistantMessage,
    lastProposedAppVue,
    lastProposedAppBackend,
    lastProposedBundleEnv,
    clearProposedAppVue,
    loadMessages: hydrate,
  };
}

export { kota0PlanFirstEnabled } from "@/components/kota0/ai/kota0PlanFirst";

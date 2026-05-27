import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { fetchKota0Messages, postKota0MessageStream } from "@/components/kota0/apps/kota0AppApi";

/** One live tool-call event surfaced to the chat UI while an apply is streaming. */
export type Kota0LiveToolCall = {
  tool: string;
  summary: string;
  /** epoch ms — used as a stable v-for key and to drive subtle entrance animations. */
  at: number;
};

export type Kota0WorkflowPhase = "idle" | "classifying" | "planning" | "applying" | "done";

export type Kota0SendApplyOutcome = {
  applied: boolean;
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
  const liveToolCalls = ref<Kota0LiveToolCall[]>([]);
  const workflowPhase = ref<Kota0WorkflowPhase>("idle");
  const lastWasComplex = ref<boolean | null>(null);

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
        messages.value = [];
      }
      void hydrate();
    },
    { immediate: true },
  );

  async function sendUserMessage(text: string): Promise<Kota0SendApplyOutcome> {
    const trimmed = text.trim();
    const id = toValue(activeAppId);
    if (!trimmed || sending.value || !id) return { applied: false };

    if (!kota0ChatStreamEnabled()) {
      error.value = "Chat streaming is required for the Kota0 workflow (set VITE_K0_CHAT_STREAM).";
      return { applied: false };
    }

    sending.value = true;
    error.value = null;
    liveToolCalls.value = [];
    workflowPhase.value = "classifying";
    lastWasComplex.value = null;

    let applied = false;
    let bundleFingerprint: string | undefined;

    try {
      await postKota0MessageStream(id, trimmed, {
        onClassify: (complex) => {
          lastWasComplex.value = complex;
          workflowPhase.value = complex ? "planning" : "applying";
        },
        onPlan: () => {
          workflowPhase.value = "applying";
        },
        onToolCall: (tool, summary) => {
          workflowPhase.value = "applying";
          liveToolCalls.value.push({ tool, summary, at: Date.now() });
        },
        onDone: (payload) => {
          messages.value = payload.messages;
          workflowPhase.value = "done";
          const c = payload.changed;
          applied = Boolean(c?.source || c?.backend || c?.env);
          bundleFingerprint = payload.bundleFingerprint;
          if (payload.status >= 400) {
            error.value = `Kota0 workflow failed (HTTP ${payload.status}).`;
          }
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending.value = false;
      if (workflowPhase.value === "classifying" || workflowPhase.value === "planning" || workflowPhase.value === "applying") {
        workflowPhase.value = "idle";
      }
    }

    return { applied, bundleFingerprint };
  }

  const canSend = computed(() => !sending.value && Boolean(toValue(activeAppId)));

  const lastAssistantMessage = computed((): string | null => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m?.role === "assistant") return m.content;
    }
    return null;
  });

  return {
    messages,
    sending,
    liveToolCalls,
    workflowPhase,
    lastWasComplex,
    loading,
    error,
    canSend,
    sendUserMessage,
    lastAssistantMessage,
    loadMessages: hydrate,
  };
}

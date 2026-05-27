import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import type { Kota0LastTurnPayload, Kota0PlanEnvelope, Kota0ProposedSources } from "@/components/kota0/apps/kota0AppApi";
import {
  clearKota0Messages,
  fetchKota0Messages,
  postKota0ApplyStream,
  postKota0MessageStream,
  postKota0Plan,
} from "@/components/kota0/apps/kota0AppApi";

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
  const lastKota0Turn = ref<Kota0LastTurnPayload | null>(null);
  const streamReceivedChars = ref<number | null>(null);
  const streamingAssistantText = ref<string>("");
  const liveToolCalls = ref<Kota0LiveToolCall[]>([]);
  const workflowPhase = ref<Kota0WorkflowPhase>("idle");
  const lastClassifyReason = ref<string | null>(null);
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
        lastKota0Turn.value = null;
        messages.value = [];
      }
      void hydrate();
    },
    { immediate: true },
  );

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

  async function acceptPlan(
    plan: Kota0PlanEnvelope,
    opts?: { confirmationText?: string; proposedSources?: Kota0ProposedSources },
  ): Promise<Kota0AcceptPlanResult> {
    const id = toValue(activeAppId);
    if (!id || sending.value) return { changed: false };
    sending.value = true;
    error.value = null;
    liveToolCalls.value = [];
    workflowPhase.value = "applying";
    let final: { status: number; body: Record<string, unknown> } | null = null;
    try {
      await postKota0ApplyStream(
        id,
        plan,
        {
          onToolCall: (tool, summary) => {
            liveToolCalls.value.push({ tool, summary, at: Date.now() });
          },
          onDone: (payload) => {
            final = payload;
          },
          onHttpError: (status, message) => {
            error.value = (message?.trim() || `Kota0 apply failed (HTTP ${status}).`);
          },
          onStreamError: (message) => {
            error.value = (message?.trim() || "Kota0 apply stream failed before a complete reply.");
          },
        },
        opts,
      );
      if (!final) {
        if (!error.value) error.value = "Kota0 apply stream ended without a result.";
        return { changed: false };
      }
      const f = final as { status: number; body: Record<string, unknown> };
      const body = f.body;
      const rawMessages = Array.isArray(body.messages) ? (body.messages as unknown[]) : [];
      const nextMessages = rawMessages.filter(
        (m): m is ChatMessage =>
          !!m &&
          typeof m === "object" &&
          typeof (m as ChatMessage).id === "string" &&
          typeof (m as ChatMessage).content === "string" &&
          typeof (m as ChatMessage).createdAt === "string",
      );
      messages.value = nextMessages;
      if (f.status >= 400) {
        const msgBody = body as { message?: unknown };
        if (typeof msgBody.message === "string") {
          error.value = msgBody.message;
        } else {
          error.value = `Kota0 apply failed (HTTP ${f.status}).`;
        }
        return { changed: false };
      }
      const changedRaw =
        body.changed && typeof body.changed === "object"
          ? (body.changed as Record<string, unknown>)
          : {};
      const anyChanged =
        changedRaw.source === true || changedRaw.backend === true || changedRaw.env === true;
      const fp =
        typeof body.bundleFingerprint === "string" && body.bundleFingerprint.length > 0
          ? body.bundleFingerprint
          : undefined;
      workflowPhase.value = "done";
      return { changed: anyChanged, bundleFingerprint: fp };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to apply";
      return { changed: false };
    } finally {
      sending.value = false;
    }
  }

  async function applyFromIdeation(
    plan: Kota0PlanEnvelope,
    proposedSources: Kota0ProposedSources,
  ): Promise<Kota0AcceptPlanResult> {
    return acceptPlan(plan, { proposedSources });
  }

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
    lastClassifyReason.value = null;
    lastWasComplex.value = null;

    let applied = false;
    let bundleFingerprint: string | undefined;

    try {
      await postKota0MessageStream(id, trimmed, {
        onClassify: (complex, reason) => {
          lastWasComplex.value = complex;
          lastClassifyReason.value = reason;
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
    liveToolCalls,
    workflowPhase,
    lastClassifyReason,
    lastWasComplex,
    loading,
    error,
    canSend,
    sendUserMessage,
    sendForPlan,
    acceptPlan,
    applyFromIdeation,
    clearThread,
    lastAssistantMessage,
    lastProposedAppVue,
    lastProposedAppBackend,
    lastProposedBundleEnv,
    clearProposedAppVue,
    loadMessages: hydrate,
  };
}

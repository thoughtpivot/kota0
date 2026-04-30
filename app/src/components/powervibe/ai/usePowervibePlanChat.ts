import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import type { ChatMessage } from "@/components/powervibe/ai/chat.types";
import type { PowervibeLastTurnPayload } from "@/components/powervibe/apps/powervibeAppApi";
import {
  clearPowervibeMessages,
  fetchPowervibeMessages,
  postPowervibeMessage,
  postPowervibeMessageStream,
} from "@/components/powervibe/apps/powervibeAppApi";

function powervibeChatStreamEnabled(): boolean {
  const v = import.meta.env.VITE_POWERVIBE_CHAT_STREAM;
  return v === "1" || v === "true";
}

/** Per-app AI chat thread stored in Scribe (`nvibe_chat_message`). */
export function usePowervibePlanChat(activeAppId: MaybeRefOrGetter<string | null>) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Latest model turn metadata (not stored in Scribe); used for Apply → SFC. */
  const lastPowervibeTurn = ref<PowervibeLastTurnPayload | null>(null);
  /** Cumulative streamed JSON length from Gemini (null until first chunk when streaming). */
  const streamReceivedChars = ref<number | null>(null);

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
      const r = await fetchPowervibeMessages(id);
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
        lastPowervibeTurn.value = null;
        /** Do not show the previous app’s Scribe thread while the new one loads. */
        messages.value = [];
      }
      void hydrate();
    },
    { immediate: true },
  );

  async function sendUserMessage(text: string): Promise<void> {
    const id = toValue(activeAppId);
    const trimmed = text.trim();
    if (!id || !trimmed || sending.value) return;
    sending.value = true;
    error.value = null;
    streamReceivedChars.value = null;
    try {
      if (powervibeChatStreamEnabled()) {
        await postPowervibeMessageStream(id, trimmed, {
          onDelta: (n) => {
            streamReceivedChars.value = n;
          },
          onDone: (p) => {
            messages.value = p.messages;
            lastPowervibeTurn.value = p.lastPowervibeTurn;
          },
          onHttpError: (status, message) => {
            const m = message?.trim() ?? "";
            error.value = m || `PowerVibe chat request failed (HTTP ${status}).`;
          },
          onStreamError: (message) => {
            const m = message?.trim() ?? "";
            error.value = m || "PowerVibe chat stream failed before a complete reply.";
          },
        });
      } else {
        const r = await postPowervibeMessage(id, trimmed);
        if (r.ok) {
          messages.value = r.messages;
          lastPowervibeTurn.value = r.lastPowervibeTurn;
        } else {
          const m = r.message?.trim() ?? "";
          error.value = m || `PowerVibe chat failed (HTTP ${r.status}).`;
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending.value = false;
      streamReceivedChars.value = null;
    }
  }

  async function clearThread(): Promise<void> {
    const id = toValue(activeAppId);
    if (!id) return;
    error.value = null;
    try {
      const r = await clearPowervibeMessages(id);
      if (r.ok) {
        messages.value = r.messages;
        lastPowervibeTurn.value = null;
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
    const p = lastPowervibeTurn.value?.proposedAppVue;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  const lastProposedAppBackend = computed((): string | null => {
    const p = lastPowervibeTurn.value?.proposedAppBackend;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  const lastProposedBundleEnv = computed((): string | null => {
    const p = lastPowervibeTurn.value?.proposedBundleEnv;
    return typeof p === "string" && p.trim().length > 0 ? p.trim() : null;
  });

  function clearProposedAppVue(): void {
    lastPowervibeTurn.value = null;
  }

  return {
    messages,
    sending,
    streamReceivedChars,
    loading,
    error,
    canSend,
    sendUserMessage,
    clearThread,
    lastAssistantMessage,
    lastProposedAppVue,
    lastProposedAppBackend,
    lastProposedBundleEnv,
    clearProposedAppVue,
    loadMessages: hydrate,
  };
}

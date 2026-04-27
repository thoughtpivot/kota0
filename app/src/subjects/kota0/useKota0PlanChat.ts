import type { MaybeRefOrGetter } from "vue";
import { computed, ref, toValue, watch } from "vue";
import type { ChatMessage } from "@/types/chat";
import type { Kota0LastTurnPayload } from "@/subjects/kota0/kota0AppApi";
import { clearKota0Messages, fetchKota0Messages, postKota0Message } from "@/subjects/kota0/kota0AppApi";

/** Per-app AI chat thread stored in Scribe (`kota0_chat_message`). */
export function useKota0PlanChat(activeAppId: MaybeRefOrGetter<string | null>) {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  /** Latest model turn metadata (not stored in Scribe); used for Apply → SFC. */
  const lastKota0Turn = ref<Kota0LastTurnPayload | null>(null);

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
      if (prev !== undefined && prev !== id) {
        lastKota0Turn.value = null;
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
    try {
      const r = await postKota0Message(id, trimmed);
      if (r.ok) {
        messages.value = r.messages;
        lastKota0Turn.value = r.lastKota0Turn;
      } else {
        error.value = r.message;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending.value = false;
    }
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
        error.value = r.message;
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

  function clearProposedAppVue(): void {
    lastKota0Turn.value = null;
  }

  return {
    messages,
    sending,
    loading,
    error,
    canSend,
    sendUserMessage,
    clearThread,
    lastAssistantMessage,
    lastProposedAppVue,
    clearProposedAppVue,
    loadMessages: hydrate,
  };
}

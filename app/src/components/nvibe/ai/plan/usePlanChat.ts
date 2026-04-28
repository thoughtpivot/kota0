import { computed, ref, watch } from "vue";
import type { ChatMessage } from "@/components/nvibe/ai/chat.types";
import type { PlanTurn } from "@shared/planTurn.ts";
import { requestPlanTurn } from "./planApi";

const STORAGE_KEY = "vibe-plan-chat-messages-v1";

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stubTurn(userText: string): PlanTurn {
  const snippet = userText.trim().slice(0, 120) || "(empty message)";
  return {
    assistantMessage: `Got it — you said: “${snippet}”. Here is a stub plan reply until the Gemini API is reachable.`,
    planBullets: [
      "Clarify the one screen or flow you want first",
      "List inputs, outputs, and who uses it",
      "Pick success criteria (what “done” looks like)",
    ],
    openQuestions: [
      "What is the primary user action on day one?",
      "Any must-have integrations (auth, data, 3D, etc.)?",
    ],
  };
}

function formatAssistantMessage(turn: PlanTurn): string {
  const bullets = turn.planBullets.map((b) => `- ${b}`).join("\n");
  const qs = turn.openQuestions.map((q) => `- ${q}`).join("\n");
  return `${turn.assistantMessage}\n\n**Plan**\n\n${bullets}\n\n**Open questions**\n\n${qs}`;
}

export function usePlanChat() {
  const messages = ref<ChatMessage[]>([]);
  const sending = ref(false);

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value));
    } catch {
      /* ignore quota / private mode */
    }
  }

  function hydrate() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      messages.value = parsed.filter(
        (m): m is ChatMessage =>
          m &&
          typeof m === "object" &&
          typeof (m as ChatMessage).id === "string" &&
          ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
          typeof (m as ChatMessage).content === "string",
      );
    } catch {
      /* ignore */
    }
  }

  function seedWelcome() {
    if (messages.value.length > 0) return;
    messages.value.push({
      id: id(),
      role: "assistant",
      content:
        "Welcome to **nVibe — Prompt**. What do you want to build? Describe the app in a sentence or two — we will iterate here; use **Apply** to push the latest assistant reply into the generated `App.vue` shown in Preview.",
      createdAt: new Date().toISOString(),
    });
    persist();
  }

  hydrate();
  seedWelcome();

  watch(messages, persist, { deep: true });

  const canSend = computed(() => !sending.value);

  const lastAssistantMessage = computed((): string | null => {
    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m?.role === "assistant") return m.content;
    }
    return null;
  });

  async function sendUserMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending.value) return;
    sending.value = true;
    messages.value.push({
      id: id(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    });

    const history = [...messages.value];
    const api = await requestPlanTurn(history);
    const turn = api.ok ? api.turn : stubTurn(trimmed);
    const prefix =
      api.ok ? "" : `_(Plan service unavailable: ${api.reason}. Showing a template reply.)_\n\n`;
    messages.value.push({
      id: id(),
      role: "assistant",
      content: prefix + formatAssistantMessage(turn),
      createdAt: new Date().toISOString(),
    });
    sending.value = false;
  }

  function clearThread() {
    messages.value = [];
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    seedWelcome();
  }

  return { messages, sending, canSend, sendUserMessage, clearThread, lastAssistantMessage };
}

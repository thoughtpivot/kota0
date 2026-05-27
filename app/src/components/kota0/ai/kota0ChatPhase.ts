import type { ChatMessage } from "@/components/kota0/ai/chat.types";

/** Messages after the last `fresh_start` marker (or the full thread if none). */
export function getThreadSlice(messages: ChatMessage[]): ChatMessage[] {
  let startIdx = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.kind === "fresh_start") {
      startIdx = i + 1;
      break;
    }
  }
  return messages.slice(startIdx);
}

export type QaMessage = { role: "user" | "assistant"; content: string };

/** User/assistant turns after the last plan row. */
export function getQaTailSincePlan(messages: ChatMessage[]): QaMessage[] {
  const thread = getThreadSlice(messages);
  let planIdx = -1;
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i];
    if (m?.role === "assistant" && m.kind === "plan") {
      planIdx = i;
      break;
    }
  }
  if (planIdx === -1) return [];

  const tail: QaMessage[] = [];
  for (let i = planIdx + 1; i < thread.length; i++) {
    const m = thread[i];
    if (!m) continue;
    if (m.role === "user" || m.role === "assistant") {
      tail.push({ role: m.role, content: m.content });
    }
  }
  return tail;
}

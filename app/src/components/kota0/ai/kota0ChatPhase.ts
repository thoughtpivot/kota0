import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import type { Kota0Plan } from "@shared/kota0Plan.ts";

export type ChatPhase = "plan" | "iterate";

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

function isUserTurn(m: ChatMessage): boolean {
  return m.role === "user" && m.kind !== "fresh_start";
}

/** True when the next outgoing user message is the first in the current thread slice. */
export function isFirstUserPrompt(messages: ChatMessage[]): boolean {
  return getThreadSlice(messages).filter(isUserTurn).length === 0;
}

function parsePlanEnvelope(content: string): Kota0Plan | null {
  try {
    const raw = JSON.parse(content) as unknown;
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Partial<Kota0Plan>;
    if (typeof o.intent !== "string" || !Array.isArray(o.changes)) return null;
    return raw as Kota0Plan;
  } catch {
    return null;
  }
}

export function getChatPhase(messages: ChatMessage[]): ChatPhase {
  if (isFirstUserPrompt(messages)) return "plan";
  return "iterate";
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

/** Parse plan JSON from a persisted chat row (for UI rendering). */
export function parsePlanFromMessageContent(content: string): Kota0Plan | null {
  return parsePlanEnvelope(content);
}

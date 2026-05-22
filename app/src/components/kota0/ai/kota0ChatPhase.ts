import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import type { Kota0Plan } from "@shared/kota0Plan.ts";

export type ChatPhase = "plan" | "awaiting_confirm" | "iterate";

const CONFIRMATION_PREFIX =
  /^(yes|yep|yeah|yup|sure|ok(?:ay)?|go ahead|start implementing|looks good|ship it|do it|lgtm|please implement|sounds good|let'?s do it|proceed)\b/i;

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

/**
 * Returns the plan envelope from the last assistant `kind:"plan"` row that has
 * not yet been followed by a non-plan assistant reply (apply completed).
 */
export function findPendingPlan(messages: ChatMessage[]): Kota0Plan | null {
  const thread = getThreadSlice(messages);
  let lastPlanIdx = -1;
  for (let i = thread.length - 1; i >= 0; i--) {
    const m = thread[i];
    if (m?.role === "assistant" && m.kind === "plan") {
      lastPlanIdx = i;
      break;
    }
  }
  if (lastPlanIdx === -1) return null;

  for (let i = lastPlanIdx + 1; i < thread.length; i++) {
    const m = thread[i];
    if (m?.role === "assistant" && m.kind !== "plan") {
      return null;
    }
  }

  const planRow = thread[lastPlanIdx];
  if (!planRow) return null;
  return parsePlanEnvelope(planRow.content);
}

/** Heuristic: explicit confirmation to start implementing (not a new feature request). */
export function isPlanConfirmation(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > 120) return false;
  if (trimmed.includes("?")) return false;
  if (CONFIRMATION_PREFIX.test(trimmed)) return true;
  if (trimmed.length <= 24 && /^(yes|yep|yeah|yup|sure|ok|okay|go|do it|ship)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function getChatPhase(messages: ChatMessage[]): ChatPhase {
  if (isFirstUserPrompt(messages)) return "plan";
  if (findPendingPlan(messages)) return "awaiting_confirm";
  return "iterate";
}

export type QaMessage = { role: "user" | "assistant"; content: string };

/** User/assistant turns after the last plan row (excludes the confirmation about to be sent). */
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

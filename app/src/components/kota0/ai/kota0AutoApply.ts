import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { getChatPhase } from "@/components/kota0/ai/kota0ChatPhase";
import { kota0PlanFirstEnabled } from "@/components/kota0/ai/kota0PlanFirst";

/** Whether to arm post-send auto-apply for the outgoing user message. */
export function shouldArmAutoApplyAfterSend(
  messages: ChatMessage[],
  aiAutoApply: boolean,
  planFirstEnabled: boolean = kota0PlanFirstEnabled(),
): boolean {
  if (!aiAutoApply) return false;
  if (!planFirstEnabled) return true;
  return getChatPhase(messages) === "iterate";
}

/** True when auto-apply is on but plan-first blocks it until after plan confirmation. */
export function isAutoApplyDeferredByPlanPhase(
  messages: ChatMessage[],
  aiAutoApply: boolean,
  planFirstEnabled: boolean = kota0PlanFirstEnabled(),
): boolean {
  if (!aiAutoApply || !planFirstEnabled) return false;
  const phase = getChatPhase(messages);
  return phase === "plan" || phase === "awaiting_confirm";
}

import type { ChatMessage } from "@/components/kota0/ai/chat.types";
import { findPendingPlan } from "@/components/kota0/ai/kota0ChatPhase";

/** Whether to arm post-send auto-apply for the outgoing user message. */
export function shouldArmAutoApplyAfterSend(
  messages: ChatMessage[],
  planModeEnabled: boolean,
): boolean {
  if (planModeEnabled) return false;
  if (findPendingPlan(messages)) return false;
  return true;
}

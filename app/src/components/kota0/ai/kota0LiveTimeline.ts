import type { Kota0MessagePart, Kota0WorkflowPhase } from "@/components/kota0/ai/chat.types";
import type { Kota0PlanEnvelope } from "@/components/kota0/apps/kota0AppApi";

type ApplyingSubPhase = "post_plan_narrator" | "agent";

export type LiveTimelineState = {
  parts: Kota0MessagePart[];
  workflowPhase: Kota0WorkflowPhase;
  lastClassifyReason: string;
  applyingSubPhase: ApplyingSubPhase;
};

export function createLiveTimelineState(): LiveTimelineState {
  return {
    parts: [],
    workflowPhase: "classifying",
    lastClassifyReason: "",
    applyingSubPhase: "post_plan_narrator",
  };
}

function pushStatus(
  state: LiveTimelineState,
  text: string,
  tone: "narrator" | "classify",
  reason?: string,
): void {
  state.parts.push({
    type: "status",
    text,
    tone,
    reason,
    at: Date.now(),
  });
}

function mergeNarratorStatus(
  state: LiveTimelineState,
  delta: string,
  tone: "narrator" | "classify",
  reason?: string,
): void {
  const last = state.parts.at(-1);
  if (last?.type === "status" && last.tone === tone) {
    last.text += delta;
    if (reason && !last.reason) last.reason = reason;
    return;
  }
  pushStatus(state, delta, tone, reason);
}

export function handleLiveTimelineTextDelta(state: LiveTimelineState, delta: string): void {
  if (state.workflowPhase === "classifying") {
    mergeNarratorStatus(state, delta, "narrator");
    return;
  }

  if (state.workflowPhase === "planning") {
    mergeNarratorStatus(state, delta, "classify", state.lastClassifyReason || undefined);
    return;
  }

  if (state.applyingSubPhase === "post_plan_narrator") {
    const hasPlan = state.parts.some((part) => part.type === "plan");
    if (hasPlan) {
      mergeNarratorStatus(state, delta, "narrator");
    } else {
      mergeNarratorStatus(state, delta, "classify", state.lastClassifyReason || undefined);
    }
    state.applyingSubPhase = "agent";
    return;
  }

  const last = state.parts.at(-1);
  if (last?.type === "text") {
    last.text += delta;
    return;
  }
  state.parts.push({ type: "text", text: delta });
}

/**
 * One-shot mode: the streamed reply IS the assistant's markdown content (no classify / plan /
 * narrator precede it). Route subsequent text-deltas straight into a `text` part so they render
 * as formatted markdown live, instead of accumulating in a plain-text narrator status.
 */
export function handleLiveTimelineReplyStart(state: LiveTimelineState): void {
  state.workflowPhase = "applying";
  state.applyingSubPhase = "agent";
}

export function handleLiveTimelineClassify(
  state: LiveTimelineState,
  complex: boolean,
  reason: string,
): void {
  state.lastClassifyReason = reason;
  state.workflowPhase = complex ? "planning" : "applying";
  state.applyingSubPhase = "post_plan_narrator";
}

export function handleLiveTimelinePlan(state: LiveTimelineState, plan: Kota0PlanEnvelope): void {
  state.parts.push({ type: "plan", plan, at: Date.now() });
  state.workflowPhase = "applying";
  state.applyingSubPhase = "post_plan_narrator";
}

export function handleLiveTimelineToolCall(
  state: LiveTimelineState,
  tool: string,
  summary: string,
): void {
  state.workflowPhase = "applying";
  state.applyingSubPhase = "agent";
  state.parts.push({ type: "tool-call", tool, summary, at: Date.now() });
}

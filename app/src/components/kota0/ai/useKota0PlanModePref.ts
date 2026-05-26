import { ref, watch } from "vue";
import { kota0PlanFirstEnabled } from "@/components/kota0/ai/kota0PlanFirst";

const PLAN_MODE_KEY = "vibe-kota0-plan-mode-v1";

function readPlanMode(): boolean {
  try {
    const v = localStorage.getItem(PLAN_MODE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore — fallback to env default */
  }
  // No persisted preference yet: seed from the legacy VITE_K0_PLAN_FIRST flag.
  return kota0PlanFirstEnabled();
}

function persistPlanMode(on: boolean): void {
  try {
    localStorage.setItem(PLAN_MODE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Persisted toggle: when ON, every user message in the chat composer routes
 * through the plan turn (plan card → user accepts → apply) instead of going
 * straight to the apply turn. Sticky across reloads / app switches.
 */
export function useKota0PlanModePref() {
  const planModeEnabled = ref(readPlanMode());
  watch(planModeEnabled, (on) => {
    persistPlanMode(on);
  });
  return { planModeEnabled };
}

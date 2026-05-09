import { ref, watch } from "vue";

const AI_AUTO_APPLY_KEY = "vibe-kota0-ai-auto-apply-v1";

function readAiAutoApply(): boolean {
  try {
    const v = sessionStorage.getItem(AI_AUTO_APPLY_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* ignore */
  }
  return false;
}

function persistAiAutoApply(on: boolean): void {
  try {
    sessionStorage.setItem(AI_AUTO_APPLY_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Persisted “auto-apply assistant proposals after send” toggle (sessionStorage). */
export function useKota0AiAutoApplyPref() {
  const aiAutoApply = ref(readAiAutoApply());
  watch(aiAutoApply, (on) => {
    persistAiAutoApply(on);
  });
  return { aiAutoApply };
}

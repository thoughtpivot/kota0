/**
 * Rotating loading tip — one concern.
 *
 * Advances a "did you know" tip on an interval while the component is mounted.
 * Extracted from `Kota0WorkspaceViewer` so the SFC doesn't own interval state.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { pickKota0LoadingTip, type Kota0LoadingTip } from "@/components/kota0/viewer/kota0LoadingTips";

const TIP_ROTATION_MS = 8_000;

/** `seed` keys tip selection per app so different apps see a different starting tip. */
export function useKota0LoadingTipRotation(seed: () => string) {
  const tipTickIndex = ref(0);
  let tipRotationTimer: ReturnType<typeof setInterval> | null = null;

  const currentTip = computed<Kota0LoadingTip>(() =>
    pickKota0LoadingTip(seed() || "anon", tipTickIndex.value),
  );

  onMounted(() => {
    if (tipRotationTimer !== null) return;
    tipRotationTimer = setInterval(() => {
      tipTickIndex.value += 1;
    }, TIP_ROTATION_MS);
  });

  onBeforeUnmount(() => {
    if (tipRotationTimer !== null) {
      clearInterval(tipRotationTimer);
      tipRotationTimer = null;
    }
  });

  return { currentTip };
}

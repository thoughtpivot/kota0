/**
 * Rotating tips shown beneath the preview loading overlay so wait time feels
 * productive. Team-edited list — keep entries short, actionable, and platform-specific.
 */

export type Kota0LoadingTip = {
  id: string;
  title: string;
  body: string;
};

export const KOTA0_LOADING_TIPS: readonly Kota0LoadingTip[] = [
  {
    id: "edit-code-directly",
    title: "Edit code directly",
    body:
      "Switch to the Code tab to tweak App.vue, App.backend.ts, or .env without re-prompting the AI.",
  },
  {
    id: "specific-prompts-win",
    title: "Specific prompts beat generic ones",
    body:
      'Ask for "a table sortable by date" instead of "make it nice" — the agent makes far better choices with shape.',
  },
  {
    id: "scaffold-a-backend",
    title: "Need a backend? Ask for it",
    body:
      'Say "add a Koa route that returns latest entries as JSON" and the AI scaffolds the handler in App.backend.ts.',
  },
  {
    id: "tailwind-everywhere",
    title: "Tailwind utilities are built in",
    body:
      "Every utility class you'd use in plain Tailwind works out of the box in your App.vue — no setup needed.",
  },
  {
    id: "persist-with-scribe",
    title: "Persist data with one sentence",
    body:
      'Say "save submitted form data" and the AI wires the per-app Scribe table for you automatically.',
  },
  {
    id: "console-tab",
    title: "Console tab streams live bundle logs",
    body:
      "When a preview is stuck or behaves oddly, the Console tab shows Flight's stdout/stderr in real time.",
  },
  {
    id: "start-fresh",
    title: "Reset context, keep code",
    body:
      'Click "Start fresh" in chat to clear prompt history without losing the App.vue or backend you have built.',
  },
  {
    id: "first-boot-slow",
    title: "First boot is the slow one",
    body:
      "Subsequent restarts skip npm install and reuse the Vite cache — usually under a few seconds.",
  },
  {
    id: "deploy-share-url",
    title: "One click to share",
    body:
      "When the preview works, hit Deploy to get a shareable URL backed by the same per-app data.",
  },
  {
    id: "preview-is-real",
    title: "The preview iframe is real",
    body: "Click into it to test interactions, type into forms, navigate routes — it behaves like a deployed app.",
  },
] as const;

/**
 * Deterministic tip picker for a given app + tick. Cycling through the list in a stable
 * order per app means switching apps does not always reset the user to tip #1.
 */
export function pickKota0LoadingTip(seed: string, tickIndex: number): Kota0LoadingTip {
  const total = KOTA0_LOADING_TIPS.length;
  if (total === 0) {
    throw new Error("KOTA0_LOADING_TIPS is empty");
  }
  const base = stableSeedToIndex(seed, total);
  const idx = (base + Math.max(0, Math.floor(tickIndex))) % total;
  return KOTA0_LOADING_TIPS[idx]!;
}

function stableSeedToIndex(seed: string, modulo: number): number {
  if (modulo <= 0) return 0;
  /** djb2 — tiny + deterministic. Avoids `crypto` import in browser-only code. */
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % modulo;
}

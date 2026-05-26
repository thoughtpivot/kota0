import type { Kota0PlanEnvelope, Kota0ProposedSources } from "@/components/kota0/apps/kota0AppApi";

/** Build a rewrite plan + proposed sources from ideation fence payloads. */
export function synthesizePlanFromFences(input: {
  userText: string;
  source?: string | null;
  backendSource?: string | null;
  bundleEnv?: string | null;
}): { plan: Kota0PlanEnvelope; proposedSources: Kota0ProposedSources } | null {
  const changes: Kota0PlanEnvelope["changes"] = [];
  const proposedSources: Kota0ProposedSources = {};

  if (input.source) {
    changes.push({ file: "App.vue", summary: "Apply generated App.vue", kind: "rewrite" });
    proposedSources.source = input.source;
  }
  if (input.backendSource) {
    changes.push({
      file: "App.backend.ts",
      summary: "Apply generated App.backend.ts",
      kind: "rewrite",
    });
    proposedSources.backendSource = input.backendSource;
  }
  if (input.bundleEnv) {
    changes.push({ file: ".env", summary: "Merge bundle secrets", kind: "rewrite" });
    proposedSources.bundleEnv = input.bundleEnv;
  }

  if (changes.length === 0) return null;

  const intent = input.userText.trim().slice(0, 200) || "Apply generated changes";
  return {
    plan: {
      intent,
      changes,
      preserveExplicitly: [],
      openQuestions: [],
    },
    proposedSources,
  };
}

#!/usr/bin/env node
/**
 * Static checks: ideation + Plan system prompts still mention Scribe persistence contracts.
 * Run in CI or before release: `npm run powervibe:prompt-invariants`
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

function assertContains(label, text, needle) {
  if (!text.includes(needle)) {
    console.error(`FAIL ${label}: missing expected substring:\n  ${needle}`);
    process.exitCode = 1;
  }
}

const ideation = read("app/src/components/powervibe/ai/plan/powervibeIdeationRun.ts");
const planRun = read("app/src/components/powervibe/ai/plan/planRun.ts");
const depsSummary = read("app/src/components/powervibe/viewer/powervibeWorkspaceDepsSummary.ts");
const powervibeBackend = read("app/src/components/powervibe/Powervibe.backend.ts");

assertContains("powervibeIdeationRun.ts", ideation, "**Data / persistence:**");
assertContains("powervibeIdeationRun.ts", ideation, "ThoughtPivot Scribe");
assertContains("powervibeIdeationRun.ts", ideation, "SCRIBE_URL");
assertContains("powervibeIdeationRun.ts", ideation, "process.env.SCRIBE_URL");
assertContains("powervibeIdeationRun.ts", ideation, "@shared/scribeRestClient");
assertContains("powervibeIdeationRun.ts", ideation, "scribeRestClient");
assertContains("powervibeIdeationRun.ts", ideation, "README axios examples");
assertContains("powervibeIdeationRun.ts", ideation, "omit the envelope");
assertContains("powervibeIdeationRun.ts", ideation, "SCRIBE_DEFAULT_ROW_JSON_SCHEMA");
assertContains("powervibeIdeationRun.ts", ideation, "date_modified");
assertContains("powervibeIdeationRun.ts", ideation, "modified_by");
assertContains("powervibeIdeationRun.ts", ideation, "scribe.example.com");
assertContains("powervibeIdeationRun.ts", ideation, "localhost:3000");
assertContains("powervibeIdeationRun.ts", ideation, "**`App.vue` must never talk to Scribe:**");
assertContains(
  "powervibeIdeationRun.ts",
  ideation,
  "**Persistence & AI — ship working backends:**",
);
assertContains("powervibeIdeationRun.ts", ideation, "**Modern defaults:**");
assertContains("powervibeIdeationRun.ts", ideation, "**Bundle Secrets — show everything in chat:**");
assertContains("powervibeIdeationRun.ts", ideation, "**End-to-end turns:**");

assertContains("planRun.ts", planRun, "**Modern stack:**");
assertContains("planRun.ts", planRun, "ThoughtPivot Scribe");
assertContains("planRun.ts", planRun, "SCRIBE_URL");
assertContains("planRun.ts", planRun, "@shared/scribeRestClient");
assertContains("planRun.ts", planRun, "example.com");
assertContains("planRun.ts", planRun, "created_by");
assertContains("planRun.ts", planRun, "**`App.vue` must never call Scribe directly**");
assertContains("planRun.ts", planRun, "powervibePlatformAiCompleteText");
assertContains("planRun.ts", planRun, "powervibePlatformAiCompleteText({ prompt:");
assertContains("planRun.ts", planRun, "/api/powervibe/apps/:appId/ai/complete");

assertContains("powervibeIdeationRun.ts", ideation, "powervibePlatformAiCompleteText");
assertContains("powervibeIdeationRun.ts", ideation, "powervibePlatformAiCompleteText({ prompt:");
assertContains("powervibeIdeationRun.ts", ideation, "POWERVIBE_PLATFORM_API_ORIGIN");

assertContains("powervibeWorkspaceDepsSummary.ts", depsSummary, "@shared/powervibePlatformAi");

assertContains("Powervibe.backend.ts", powervibeBackend, "/api/powervibe/apps/:appId/ai/complete");

if (process.exitCode === 1) {
  console.error("\npowervibe:prompt-invariants failed.");
  process.exit(1);
}
console.log("powervibe:prompt-invariants OK");

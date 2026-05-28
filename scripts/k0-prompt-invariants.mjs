#!/usr/bin/env node
/**
 * Static checks: ideation + Plan system prompts still mention Scribe persistence contracts.
 * Run in CI or before release: `npm run kota0:prompt-invariants`
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

const ideation = read("app/src/components/kota0/ai/plan/kota0IdeationRun.ts");
const planRun = read("app/src/components/kota0/ai/plan/planRun.ts");
const depsSummary = read("app/src/components/kota0/viewer/kota0WorkspaceDepsSummary.ts");
const kota0Backend = read("app/src/components/kota0/Kota0.backend.ts");
const applyLoop = read("app/src/components/kota0/ai/plan/kota0ApplyAgentLoop.ts");
const scribeContract = read("app/src/components/kota0/ai/kota0ScribeBackendContract.ts");

assertContains("kota0IdeationRun.ts", ideation, "**Data / persistence:**");
assertContains("kota0IdeationRun.ts", ideation, "ThoughtPivot Scribe");
assertContains("kota0IdeationRun.ts", ideation, "SCRIBE_URL");
assertContains("kota0IdeationRun.ts", ideation, "process.env.SCRIBE_URL");
assertContains("kota0IdeationRun.ts", ideation, "@shared/scribeRestClient");
assertContains("kota0IdeationRun.ts", ideation, "scribeRestClient");
assertContains("kota0IdeationRun.ts", ideation, "README axios examples");
assertContains("kota0IdeationRun.ts", ideation, "omit the envelope");
assertContains("kota0IdeationRun.ts", ideation, "SCRIBE_DEFAULT_ROW_JSON_SCHEMA");
assertContains("kota0IdeationRun.ts", ideation, "date_modified");
assertContains("kota0IdeationRun.ts", ideation, "modified_by");
assertContains("kota0IdeationRun.ts", ideation, "scribe.example.com");
assertContains("kota0IdeationRun.ts", ideation, "localhost:3000");
assertContains("kota0IdeationRun.ts", ideation, "**`App.vue` must never talk to Scribe:**");
assertContains(
  "kota0IdeationRun.ts",
  ideation,
  "**Persistence & AI — ship working backends:**",
);
assertContains("kota0IdeationRun.ts", ideation, "**Modern defaults:**");
assertContains("kota0IdeationRun.ts", ideation, "**Bundle Secrets — show everything in chat:**");
assertContains("kota0IdeationRun.ts", ideation, "**End-to-end turns:**");

assertContains("planRun.ts", planRun, "**Modern stack:**");
assertContains("planRun.ts", planRun, "ThoughtPivot Scribe");
assertContains("planRun.ts", planRun, "SCRIBE_URL");
assertContains("planRun.ts", planRun, "@shared/scribeRestClient");
assertContains("planRun.ts", planRun, "example.com");
assertContains("planRun.ts", planRun, "created_by");
assertContains("planRun.ts", planRun, "**`App.vue` must never call Scribe directly**");
assertContains("planRun.ts", planRun, "kota0PlatformAiCompleteText");
assertContains("planRun.ts", planRun, "kota0PlatformAiCompleteText({ prompt:");
assertContains("planRun.ts", planRun, "/api/kota0/apps/:appId/ai/complete");

assertContains("kota0IdeationRun.ts", ideation, "kota0PlatformAiCompleteText");
assertContains("kota0IdeationRun.ts", ideation, "kota0PlatformAiCompleteText({ prompt:");
assertContains("kota0IdeationRun.ts", ideation, "K0_PLATFORM_API_ORIGIN");

assertContains("kota0WorkspaceDepsSummary.ts", depsSummary, "@shared/kota0PlatformAi");

assertContains("Kota0.backend.ts", kota0Backend, "/api/kota0/apps/:appId/ai/complete");

assertContains("kota0ApplyAgentLoop.ts", applyLoop, "KOTA0_SCRIBE_BACKEND_CONTRACT");
assertContains("kota0ScribeBackendContract.ts", scribeContract, "forComponent");
assertContains("kota0ScribeBackendContract.ts", scribeContract, "scribe.set");
assertContains("kota0ScribeBackendContract.ts", scribeContract, "k0_demo_greetings");

if (process.exitCode === 1) {
  console.error("\nkota0:prompt-invariants failed.");
  process.exit(1);
}
console.log("k0:prompt-invariants OK");

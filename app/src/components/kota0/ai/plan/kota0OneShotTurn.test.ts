/**
 * One-shot turn: a single mocked model call returns markdown with optional
 * full-file fences. Confirms (a) a valid ```vue fence becomes `proposedSource`,
 * (b) prose-only (Q&A) proposes nothing, (c) an invalid SFC is rejected but the
 * markdown is preserved, (d) ```ts / ```env fences are also extracted, and
 * (e) text deltas stream through `onTextDelta`.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { setKota0AiModelForTest } from "@/components/kota0/ai/kota0AiProvider";
import { runKota0OneShotTurn } from "@/components/kota0/ai/plan/kota0OneShotTurn";
import type {
  Kota0IdeationSystemExtras,
  Kota0ScribeBackendHeadMeta,
  Kota0ScribeHeadMeta,
} from "@/components/kota0/ai/plan/kota0IdeationRun";
import { buildMockAgentModel } from "../../../../../../scripts/kota0-evals/mockAgentModel";

const sfcMeta: Kota0ScribeHeadMeta = {
  fetchedAtIso: new Date().toISOString(),
  utf8Bytes: 0,
  lineCount: 0,
  rawCharLength: 0,
};
const backendMeta: Kota0ScribeBackendHeadMeta = { utf8Bytes: 0, lineCount: 0, rawCharLength: 0 };
const extras: Kota0IdeationSystemExtras = {
  workspaceDepsSummary: null,
  headOutline: null,
  bundleEnvForSystem: null,
};

function runWith(markdown: string, onTextDelta?: (d: string) => void) {
  setKota0AiModelForTest(buildMockAgentModel([{ text: markdown, toolCalls: [] }]));
  return runKota0OneShotTurn({
    messages: [{ role: "user", content: "do it" }],
    heads: { sfc: "", backend: "" },
    sfcMeta,
    backendMeta,
    extras,
    onTextDelta,
  }).finally(() => setKota0AiModelForTest(null));
}

describe("runKota0OneShotTurn", () => {
  it("extracts a valid ```vue fence as proposedSource and streams the text", async () => {
    const md = "Here's your app.\n\n```vue\n<template>\n  <div>Hi</div>\n</template>\n```\n";
    const deltas: string[] = [];
    const r = await runWith(md, (d) => deltas.push(d));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.match(r.markdown, /Here's your app/);
    assert.ok(r.proposedSource && r.proposedSource.includes("<template>"), "expected SFC source");
    assert.equal(r.proposedBackend, null);
    assert.equal(r.proposedEnv, null);
    assert.ok(deltas.join("").includes("<template>"), "streamed deltas should carry the code");
  });

  it("proposes nothing for a prose-only (Q&A) reply", async () => {
    const r = await runWith("You can use vue-chartjs for charts.");
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.proposedSource, null);
    assert.equal(r.proposedBackend, null);
    assert.equal(r.proposedEnv, null);
  });

  it("rejects an invalid SFC fence (proposedSource null) but keeps the markdown", async () => {
    // Two <template> blocks → @vue/compiler-sfc reports a parse error.
    const md =
      "```vue\n<template><div>a</div></template>\n<template><div>b</div></template>\n```";
    const r = await runWith(md);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.proposedSource, null);
    assert.match(r.markdown, /template/);
  });

  it("also extracts ```ts and ```env fences", async () => {
    const md = [
      "Wiring up persistence.",
      "```vue\n<template><div>x</div></template>\n```",
      "```ts\nimport router from '@koa/router';\nexport default router;\n```",
      "```env\nFOO=bar\n```",
    ].join("\n\n");
    const r = await runWith(md);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.proposedSource, "expected SFC source");
    assert.ok(r.proposedBackend && r.proposedBackend.includes("@koa/router"), "expected backend");
    assert.equal(r.proposedEnv, "FOO=bar");
  });

  it("returns ok:false for an empty message list", async () => {
    setKota0AiModelForTest(buildMockAgentModel([{ text: "noop", toolCalls: [] }]));
    try {
      const r = await runKota0OneShotTurn({
        messages: [],
        heads: { sfc: "", backend: "" },
        sfcMeta,
        backendMeta,
        extras,
      });
      assert.equal(r.ok, false);
    } finally {
      setKota0AiModelForTest(null);
    }
  });
});

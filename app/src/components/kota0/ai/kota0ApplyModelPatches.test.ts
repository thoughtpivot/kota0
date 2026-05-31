import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyModelPatchText } from "@/components/kota0/ai/kota0ApplyModelPatches";
import { buildKota0AgentTools } from "@/components/kota0/ai/tools/kota0AgentTools";
import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

const baseHead = {
  source: ["<template>", "  <div>App</div>", "</template>"].join("\n"),
  backendSource: 'export default {};\n',
  bundleEnv: "",
};

function planWith(changes: Kota0Plan["changes"]): Kota0Plan {
  return { intent: "test", userOutline: [], changes, preserveExplicitly: [], openQuestions: [] };
}

describe("applyModelPatchText — plan-kind gating", () => {
  it("rejects a full-file vue fence when plan kind is `modify`", () => {
    const plan = planWith([{ file: "App.vue", summary: "tweak hello", kind: "modify" }]);
    const modelText = [
      "```vue",
      "<template>",
      "  <div>Completely different app</div>",
      "</template>",
      "```",
    ].join("\n");
    const r = applyModelPatchText(modelText, baseHead, plan);
    assert.equal(r.source, baseHead.source, "HEAD must NOT be overwritten");
    assert.equal(r.rejections.length >= 1, true);
    const rej = r.rejections.find((x) => x.file === "App.vue");
    assert.ok(rej, "expected a rejection for App.vue");
    assert.equal(rej!.reason, "full_file_not_allowed");
  });

  it("accepts a full-file vue fence when plan kind is `rewrite`", () => {
    const plan = planWith([{ file: "App.vue", summary: "redesign", kind: "rewrite" }]);
    const replacement = [
      "<template>",
      "  <main>Brand new</main>",
      "</template>",
    ].join("\n");
    const modelText = ["```vue", replacement, "```"].join("\n");
    const r = applyModelPatchText(modelText, baseHead, plan);
    assert.equal(r.source, replacement);
    assert.equal(r.rejections.length, 0);
  });

  it("rejects when both a patch and a full-file fence target the same file", () => {
    const plan = planWith([{ file: "App.vue", summary: "redesign", kind: "rewrite" }]);
    const modelText = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      " <template>",
      "-  <div>App</div>",
      "+  <div>Updated</div>",
      " </template>",
      "",
      "```vue",
      "<template>",
      "  <div>Other</div>",
      "</template>",
      "```",
    ].join("\n");
    const r = applyModelPatchText(modelText, baseHead, plan);
    const rej = r.rejections.find((x) => x.file === "App.vue");
    assert.ok(rej, "expected a rejection for mixed patch + rewrite");
    assert.equal(rej!.reason, "mixed_patch_and_rewrite");
  });

  it("flags `no_patch_emitted` when the plan modifies a file but the model produced nothing", () => {
    const plan = planWith([{ file: "App.vue", summary: "tweak", kind: "modify" }]);
    const modelText = "# Just some prose, no patches.";
    const r = applyModelPatchText(modelText, baseHead, plan);
    const rej = r.rejections.find((x) => x.file === "App.vue");
    assert.ok(rej, "expected a no_patch_emitted rejection");
    assert.equal(rej!.reason, "no_patch_emitted");
  });

  it("applies a clean patch when plan kind is `modify` (the happy path)", () => {
    const plan = planWith([{ file: "App.vue", summary: "rename", kind: "modify" }]);
    const modelText = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      " <template>",
      "-  <div>App</div>",
      "+  <div>Renamed</div>",
      " </template>",
    ].join("\n");
    const r = applyModelPatchText(modelText, baseHead, plan);
    assert.equal(r.fallbacks.length, 0);
    assert.equal(r.rejections.length, 0);
    assert.match(r.source, /<div>Renamed<\/div>/);
  });
});

describe("applyChanges tool — plan-kind gating", () => {
  // The tool requires a full Kota0AgentToolContext; only repo + rematerialize
  // are actually exercised by these unit tests, so stub the rest.
  function stubContext(plan: Kota0Plan) {
    const persisted: { source?: string; backendSource?: string; bundleEnv?: string }[] = [];
    const rematerialized: { source: string; backendSource: string; bundleEnv?: string }[] = [];
    const steps: { tool: string; summary: string; ok: boolean }[] = [];
    const repo = {
      getApp: async () => ({
        app_id: "test",
        name: "Test",
        status: "active",
        source: baseHead.source,
        backendSource: baseHead.backendSource,
        bundleEnv: baseHead.bundleEnv,
      }),
      updateAppSources: async (
        _appId: string,
        patch: { source?: string; backendSource?: string; bundleEnv?: string },
      ) => {
        persisted.push(patch);
      },
      getScribeRowIdForApp: async () => 1,
    };
    return {
      ctx: {
        appId: "test-app",
        plan,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub of repo subset
        repo: repo as any,
        rematerialize: async (next: { source: string; backendSource: string; bundleEnv?: string }) => {
          rematerialized.push(next);
        },
        recordStep: (s: { tool: string; summary: string; ok: boolean }) => {
          steps.push(s);
        },
      },
      persisted,
      rematerialized,
      steps,
    };
  }

  it("rejects writing a file the plan didn't mark rewrite/add", async () => {
    const plan = planWith([{ file: "App.vue", summary: "tweak", kind: "modify" }]);
    const { ctx, persisted, steps } = stubContext(plan);
    const tools = buildKota0AgentTools(ctx);
    const r = (await tools.applyChanges.execute!(
      { source: "<template><div>x</div></template>" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI SDK ToolCallOptions stub
      {} as any,
    )) as { ok: false; reason: string; retryHint?: string };
    assert.equal(r.ok, false);
    assert.equal(r.reason, "plan_kind_mismatch");
    assert.equal(typeof r.retryHint, "string");
    assert.match(r.retryHint!, /applyPatch/i);
    assert.equal(persisted.length, 0, "must not persist when plan kind mismatches");
    const rej = steps.find((s) => s.tool === "applyChanges" && !s.ok);
    assert.ok(rej, "should have recorded the rejected step");
    assert.match(rej!.summary, /plan_kind_mismatch/);
  });

  it("rejects writing an App.vue with SFC parse errors", async () => {
    const plan = planWith([{ file: "App.vue", summary: "rewrite", kind: "rewrite" }]);
    const { ctx, persisted } = stubContext(plan);
    const tools = buildKota0AgentTools(ctx);
    const r = (await tools.applyChanges.execute!(
      { source: "<template><div>unclosed" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    )) as { ok: false; reason: string };
    assert.equal(r.ok, false);
    assert.equal(r.reason, "sfc_parse_error");
    assert.equal(persisted.length, 0);
  });

  it("persists + rematerializes when files are rewrite/add", async () => {
    const plan = planWith([
      { file: "App.vue", summary: "rewrite", kind: "rewrite" },
      { file: "App.backend.ts", summary: "add backend", kind: "add" },
    ]);
    const { ctx, persisted, rematerialized } = stubContext(plan);
    const tools = buildKota0AgentTools(ctx);
    const newSource = "<template><div>NEW</div></template>";
    const newBackend = "import Router from '@koa/router'; export default new Router().routes();";
    const r = (await tools.applyChanges.execute!(
      { source: newSource, backendSource: newBackend },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    )) as { ok: true; wrote: { source: boolean; backendSource: boolean; bundleEnv: boolean } };
    assert.equal(r.ok, true);
    assert.equal(r.wrote.source, true);
    assert.equal(r.wrote.backendSource, true);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]!.source, newSource);
    assert.equal(persisted[0]!.backendSource, newBackend);
    assert.equal(rematerialized.length, 1);
    assert.equal(rematerialized[0]!.source, newSource);
  });

  it("applyPatch failure includes retryHint and a specific step summary", async () => {
    const plan = planWith([{ file: "App.vue", summary: "rename", kind: "modify" }]);
    const { ctx, steps } = stubContext(plan);
    const tools = buildKota0AgentTools(ctx);
    const badPatch = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      "-  <div>Does not exist</div>",
      "+  <div>Still wrong</div>",
    ].join("\n");
    const r = (await tools.applyPatch.execute!(
      { patchText: badPatch },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    )) as { ok: false; reason: string; retryHint?: string };
    assert.equal(r.ok, false);
    assert.equal(r.reason, "patch_failed");
    assert.equal(typeof r.retryHint, "string");
    assert.match(r.retryHint!, /Copy context lines character-for-character/i);
    const step = steps.find((s) => s.tool === "applyPatch" && !s.ok);
    assert.ok(step);
    assert.match(step!.summary, /anchor_not_found/);
  });
});

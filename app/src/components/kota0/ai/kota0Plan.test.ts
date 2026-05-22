import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Kota0PlanSchema,
  planHasRiskyRemoval,
  planNeedsFullRewrite,
  safeParseKota0Plan,
} from "@shared/kota0Plan.ts";

describe("Kota0PlanSchema", () => {
  it("accepts a minimal plan", () => {
    const r = Kota0PlanSchema.safeParse({
      intent: "add a counter",
      changes: [{ file: "App.vue", summary: "add ref + button", kind: "add" }],
      preserveExplicitly: [],
      openQuestions: [],
    });
    assert.equal(r.success, true);
  });

  it("rejects an unknown file", () => {
    const r = Kota0PlanSchema.safeParse({
      intent: "x",
      changes: [{ file: "README.md", summary: "no", kind: "add" }],
    });
    assert.equal(r.success, false);
  });

  it("rejects an unknown change kind", () => {
    const r = Kota0PlanSchema.safeParse({
      intent: "x",
      changes: [{ file: "App.vue", summary: "no", kind: "yeet" }],
    });
    assert.equal(r.success, false);
  });

  it("fills defaults for missing arrays", () => {
    const r = Kota0PlanSchema.safeParse({ intent: "hello" });
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.deepEqual(r.data.changes, []);
    assert.deepEqual(r.data.preserveExplicitly, []);
    assert.deepEqual(r.data.openQuestions, []);
  });
});

describe("safeParseKota0Plan", () => {
  it("parses a JSON string", () => {
    const out = safeParseKota0Plan(JSON.stringify({ intent: "x" }));
    assert.equal(out.ok, true);
  });

  it("returns a reason on bad JSON", () => {
    const out = safeParseKota0Plan("{ not json");
    assert.equal(out.ok, false);
  });

  it("returns a reason on shape mismatch", () => {
    const out = safeParseKota0Plan(JSON.stringify({ intent: 42 }));
    assert.equal(out.ok, false);
  });
});

describe("plan helpers", () => {
  it("planNeedsFullRewrite triggers on rewrite kind", () => {
    assert.equal(
      planNeedsFullRewrite({
        intent: "x",
        changes: [
          { file: "App.vue", summary: "a", kind: "add" },
          { file: "App.vue", summary: "b", kind: "rewrite" },
        ],
        preserveExplicitly: [],
        openQuestions: [],
      }),
      true,
    );
    assert.equal(
      planNeedsFullRewrite({
        intent: "x",
        changes: [{ file: "App.vue", summary: "a", kind: "add" }],
        preserveExplicitly: [],
        openQuestions: [],
      }),
      false,
    );
  });

  it("planHasRiskyRemoval flags removal when preserve list is non-empty", () => {
    assert.equal(
      planHasRiskyRemoval({
        intent: "x",
        changes: [{ file: "App.vue", summary: "drop counter", kind: "remove" }],
        preserveExplicitly: ["counter"],
        openQuestions: [],
      }),
      true,
    );
    assert.equal(
      planHasRiskyRemoval({
        intent: "x",
        changes: [{ file: "App.vue", summary: "drop counter", kind: "remove" }],
        preserveExplicitly: [],
        openQuestions: [],
      }),
      false,
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  kota0NarratorText,
  runKota0ChatWorkflow,
} from "@/components/kota0/ai/kota0ChatWorkflow";
import type { Kota0Plan } from "@/components/kota0/ai/kota0Plan";

const baseInput = {
  appId: "test",
  userText: "rename the button",
  incoming: [{ role: "user" as const, content: "rename the button" }],
  heads: { sfc: "<template></template>", backend: "" },
  sfcMeta: { fetchedAtIso: "2026-01-01", utf8Bytes: 10, lineCount: 1, rawCharLength: 10 },
  backendMeta: { utf8Bytes: 0, lineCount: 0, rawCharLength: 0 },
  extras: {
    workspaceDepsSummary: "",
    headOutline: "",
    bundleEnvForSystem: "",
  },
  priorRevisions: [],
};

describe("kota0NarratorText", () => {
  it("pre_classify", () => {
    assert.equal(
      kota0NarratorText("pre_classify"),
      "Reading your request and figuring out the right approach…",
    );
  });

  it("post_classify_complex interpolates reason", () => {
    assert.equal(
      kota0NarratorText("post_classify_complex", "feature: backend route + UI"),
      "Looks like feature: backend route + UI. Drafting a plan first.",
    );
  });

  it("post_classify_complex falls back when reason empty", () => {
    assert.equal(
      kota0NarratorText("post_classify_complex", "  "),
      "Looks like this needs more planning. Drafting a plan first.",
    );
  });

  it("post_classify_trivial", () => {
    assert.equal(
      kota0NarratorText("post_classify_trivial"),
      "Small change — jumping straight to it.",
    );
  });

  it("post_plan", () => {
    assert.equal(kota0NarratorText("post_plan"), "Plan ready. Now executing:");
  });
});

describe("runKota0ChatWorkflow", () => {
  it("trivial → skip plan, apply with synthetic plan", async () => {
    const events: string[] = [];
    const narratorDeltas: string[] = [];
    let classifyReason = "";
    let planPersisted = false;
    let appliedIntent = "";
    let appliedUserOutline: string[] = [];

    const outcome = await runKota0ChatWorkflow({
      ...baseInput,
      classifyFn: async () => ({ complex: false, reason: "trivial", ms: 5 }),
      persistPlan: async () => {
        planPersisted = true;
      },
      runApply: async (plan) => {
        appliedIntent = plan.intent;
        appliedUserOutline = plan.userOutline;
        return { status: 200, body: { ok: true, changed: { source: true }, messages: [] } };
      },
      onEvent: (ev) => {
        events.push(ev.type);
        if (ev.type === "classify") classifyReason = ev.reason;
        if (ev.type === "text-delta") narratorDeltas.push(ev.delta);
      },
    });

    assert.equal(planPersisted, false);
    assert.equal(events.includes("plan"), false);
    assert.equal(events.includes("classify"), true);
    assert.equal(classifyReason, "trivial");
    assert.ok(appliedIntent.includes("rename"));
    assert.equal(appliedUserOutline.length, 1, "synthetic trivial plan carries a userOutline bullet so the plan card has something to render");
    assert.equal(outcome.status, 200);
    assert.equal(narratorDeltas[0], kota0NarratorText("pre_classify"));
    assert.ok(
      narratorDeltas.some((d) => d === kota0NarratorText("post_classify_trivial")),
      "trivial narrator should appear",
    );
    const classifyIdx = events.indexOf("classify");
    const preClassifyIdx = events.indexOf("text-delta");
    assert.ok(preClassifyIdx < classifyIdx, "pre-classify narrator before classify");
  });

  it("complex → plan emitted then applied", async () => {
    const events: string[] = [];
    const narratorDeltas: string[] = [];
    let classifyReason = "";
    const samplePlan: Kota0Plan = {
      intent: "add export",
      userOutline: ["Add a CSV download for the current data"],
      changes: [{ file: "App.backend.ts", summary: "csv route", kind: "add" }],
      preserveExplicitly: [],
      openQuestions: [],
    };

    const outcome = await runKota0ChatWorkflow({
      ...baseInput,
      userText: "add export to CSV",
      classifyFn: async () => ({ complex: true, reason: "feature", ms: 7 }),
      runPlanFn: async () => ({ ok: true as const, plan: samplePlan }),
      persistPlan: async () => {},
      runApply: async () => ({
        status: 200,
        body: { ok: true, changed: { backend: true }, messages: [] },
      }),
      onEvent: (ev) => {
        events.push(ev.type);
        if (ev.type === "classify") classifyReason = ev.reason;
        if (ev.type === "plan") assert.equal(ev.plan.intent, "add export");
        if (ev.type === "text-delta") narratorDeltas.push(ev.delta);
      },
    });

    assert.equal(events.includes("classify"), true);
    assert.equal(events.includes("plan"), true);
    assert.equal(classifyReason, "feature");
    assert.equal(outcome.status, 200);

    const classifyIdx = events.indexOf("classify");
    const planIdx = events.indexOf("plan");
    const firstTextDeltaIdx = events.indexOf("text-delta");
    assert.ok(firstTextDeltaIdx < classifyIdx, "pre-classify narrator before classify");
    assert.ok(
      events.slice(classifyIdx + 1, planIdx).includes("text-delta"),
      "narrator between classify and plan",
    );
    assert.equal(narratorDeltas[0], kota0NarratorText("pre_classify"));
    assert.ok(
      narratorDeltas.some(
        (d) => d === kota0NarratorText("post_classify_complex", "feature"),
      ),
    );
    assert.ok(narratorDeltas.some((d) => d === kota0NarratorText("post_plan")));
  });

  it("text-delta events from apply forward to the SSE sink", async () => {
    const events: string[] = [];
    let textCollected = "";
    await runKota0ChatWorkflow({
      ...baseInput,
      classifyFn: async () => ({ complex: false, reason: "trivial", ms: 5 }),
      persistPlan: async () => {},
      runApply: async (_plan, onEvent) => {
        onEvent?.({ type: "text-delta", delta: "Renaming the button now." });
        onEvent?.({ type: "tool-call", tool: "applyPatch", summary: "210 chars" });
        onEvent?.({ type: "text-delta", delta: " Restarting preview." });
        onEvent?.({ type: "tool-call", tool: "finish", summary: "done" });
        return { status: 200, body: { ok: true, messages: [] } };
      },
      onEvent: (ev) => {
        events.push(ev.type);
        if (ev.type === "text-delta") textCollected += ev.delta;
      },
    });

    assert.ok(events[0] === "text-delta", "pre-classify narrator first");
    assert.ok(events.includes("classify"));
    assert.ok(events.includes("tool-call"));
    assert.ok(textCollected.includes("Renaming the button now."));
    assert.ok(textCollected.includes("Restarting preview."));
    assert.ok(textCollected.includes(kota0NarratorText("pre_classify")));
    assert.ok(textCollected.includes(kota0NarratorText("post_classify_trivial")));
  });

  it("classifier failure path uses complex plan+apply when runPlan stubbed", async () => {
    const events: string[] = [];
    await runKota0ChatWorkflow({
      ...baseInput,
      classifyFn: async () => ({ complex: true, reason: "classifier_error", ms: 300 }),
      runPlanFn: async () => ({
        ok: false as const,
        reason: "stub",
        stubPlan: {
          intent: "fallback",
          userOutline: [],
          changes: [],
          preserveExplicitly: [],
          openQuestions: [],
        },
      }),
      persistPlan: async () => {},
      runApply: async () => ({ status: 200, body: { messages: [] } }),
      onEvent: (ev) => events.push(ev.type),
    });
    assert.equal(events.includes("plan"), true);
  });
});

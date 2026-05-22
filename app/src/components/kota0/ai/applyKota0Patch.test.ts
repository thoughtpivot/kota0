import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyKota0FilePatch,
  applyKota0Patches,
  parseKota0Patch,
} from "@/components/kota0/ai/applyKota0Patch";

describe("parseKota0Patch", () => {
  it("parses a single-file patch with one hunk", () => {
    const text = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      " <template>",
      "-  <div>old</div>",
      "+  <div>new</div>",
      " </template>",
    ].join("\n");
    const r = parseKota0Patch(text);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.patches.length, 1);
    assert.equal(r.patches[0]!.file, "App.vue");
    assert.equal(r.patches[0]!.hunks.length, 1);
    assert.equal(r.patches[0]!.hunks[0]!.lines.length, 4);
  });

  it("ignores unified-diff hunk header content", () => {
    // The header that broke us in the wild: model emits `-21,11 +20,11` and the
    // old applier captured that as the anchor. Now the body locates the change.
    const text = [
      "=== PATCH App.vue ===",
      "@@ -21,11 +20,11 @@",
      " context",
      "-old",
      "+new",
    ].join("\n");
    const r = parseKota0Patch(text);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.patches[0]!.hunks[0]!.lines.length, 3);
  });

  it("rejects empty input", () => {
    const r = parseKota0Patch("");
    assert.equal(r.ok, false);
  });
});

describe("applyKota0FilePatch", () => {
  it("replaces a removed block using context lines as locator", () => {
    const base = [
      "<template>",
      "  <div>old line A</div>",
      "  <div>old line B</div>",
      "</template>",
    ].join("\n");
    const r = applyKota0FilePatch(base, {
      file: "App.vue",
      hunks: [
        {
          lines: [
            { kind: "context", text: "<template>" },
            { kind: "removed", text: "  <div>old line A</div>" },
            { kind: "removed", text: "  <div>old line B</div>" },
            { kind: "added", text: "  <div>new line</div>" },
            { kind: "context", text: "</template>" },
          ],
        },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(
      r.content,
      ["<template>", "  <div>new line</div>", "</template>"].join("\n"),
    );
  });

  it("inserts when a hunk has only context + added", () => {
    const base = "line1\nline2\nline3";
    const r = applyKota0FilePatch(base, {
      file: ".env",
      hunks: [
        {
          lines: [
            { kind: "context", text: "line2" },
            { kind: "added", text: "INSERTED" },
            { kind: "context", text: "line3" },
          ],
        },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.content, "line1\nline2\nINSERTED\nline3");
  });

  it("fails with anchor_not_found when search block is absent", () => {
    const r = applyKota0FilePatch("a\nb", {
      file: "App.vue",
      hunks: [{ lines: [{ kind: "context", text: "no-such-line" }, { kind: "added", text: "x" }] }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "anchor_not_found");
  });

  it("fails with anchor_not_unique when search block appears twice", () => {
    const r = applyKota0FilePatch("dup\nmid\ndup", {
      file: "App.vue",
      hunks: [{ lines: [{ kind: "context", text: "dup" }, { kind: "added", text: "x" }] }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "anchor_not_unique");
  });

  it("fails with no_locator on pure-insert without any context or removed line", () => {
    const r = applyKota0FilePatch("a\nb", {
      file: "App.vue",
      hunks: [{ lines: [{ kind: "added", text: "x" }] }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "no_locator");
  });
});

describe("applyKota0Patches", () => {
  it("returns successes in `applied` and bails into `fallbacks` on bad hunks", () => {
    const text = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      " <template>",
      "+  <p>added</p>",
      " </template>",
      "=== PATCH App.backend.ts ===",
      "@@ ... @@",
      " nonexistent-anchor",
      "+console.log(\"x\");",
    ].join("\n");
    const parsed = parseKota0Patch(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const summary = applyKota0Patches(parsed.patches, {
      appVue: "<template>\n</template>",
      appBackend: "// a backend file",
      bundleEnv: "",
    });
    assert.equal(summary.applied.length, 1);
    assert.equal(summary.applied[0]!.file, "App.vue");
    assert.match(summary.applied[0]!.nextContent, /<p>added<\/p>/);
    assert.equal(summary.fallbacks.length, 1);
    assert.equal(summary.fallbacks[0]!.file, "App.backend.ts");
    assert.equal(summary.fallbacks[0]!.reason, "anchor_not_found");
  });

  it("round-trips 'add counter then add button' across two turns without losing the counter", () => {
    const initialVue = ["<template>", "  <div>App</div>", "</template>"].join("\n");
    const turn1 = [
      "=== PATCH App.vue ===",
      "@@ -1,3 +1,4 @@",
      " <template>",
      "   <div>App</div>",
      "+  <p>Count: {{ count }}</p>",
      " </template>",
    ].join("\n");
    const parsed1 = parseKota0Patch(turn1);
    assert.equal(parsed1.ok, true);
    if (!parsed1.ok) return;
    const s1 = applyKota0Patches(parsed1.patches, {
      appVue: initialVue,
      appBackend: "",
      bundleEnv: "",
    });
    assert.equal(s1.fallbacks.length, 0);
    const afterTurn1 = s1.applied[0]!.nextContent;
    assert.match(afterTurn1, /Count: \{\{ count \}\}/);

    const turn2 = [
      "=== PATCH App.vue ===",
      "@@ ... @@",
      "   <p>Count: {{ count }}</p>",
      "+  <button @click=\"count++\">+</button>",
      " </template>",
    ].join("\n");
    const parsed2 = parseKota0Patch(turn2);
    assert.equal(parsed2.ok, true);
    if (!parsed2.ok) return;
    const s2 = applyKota0Patches(parsed2.patches, {
      appVue: afterTurn1,
      appBackend: "",
      bundleEnv: "",
    });
    assert.equal(s2.fallbacks.length, 0);
    const afterTurn2 = s2.applied[0]!.nextContent;
    assert.match(afterTurn2, /Count: \{\{ count \}\}/);
    assert.match(afterTurn2, /<button @click="count\+\+">\+<\/button>/);
  });

  it("accepts the standard `-foo`/`+foo` style (no space after marker)", () => {
    const text = [
      "=== PATCH App.vue ===",
      "@@ -1,2 +1,2 @@",
      "-<div>old</div>",
      "+<div>new</div>",
    ].join("\n");
    const parsed = parseKota0Patch(text);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const s = applyKota0Patches(parsed.patches, {
      appVue: "<div>old</div>\n",
      appBackend: "",
      bundleEnv: "",
    });
    assert.equal(s.fallbacks.length, 0);
    assert.match(s.applied[0]!.nextContent, /<div>new<\/div>/);
  });
});

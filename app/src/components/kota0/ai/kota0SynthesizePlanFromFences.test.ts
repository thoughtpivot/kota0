import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { synthesizePlanFromFences } from "@/components/kota0/ai/kota0SynthesizePlanFromFences";

describe("synthesizePlanFromFences", () => {
  it("returns null when no fences are present", () => {
    assert.equal(synthesizePlanFromFences({ userText: "hello" }), null);
  });

  it("builds rewrite changes for each provided file", () => {
    const r = synthesizePlanFromFences({
      userText: "make a todo app",
      source: "<template><div>Todo</div></template>",
      backendSource: "export default {};",
    });
    assert.ok(r);
    assert.equal(r!.plan.changes.length, 2);
    assert.equal(r!.plan.changes.every((c) => c.kind === "rewrite"), true);
    assert.equal(r!.proposedSources.source, "<template><div>Todo</div></template>");
    assert.equal(r!.proposedSources.backendSource, "export default {};");
  });
});

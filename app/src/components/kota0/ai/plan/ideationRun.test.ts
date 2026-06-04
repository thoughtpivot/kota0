/**
 * One-shot system instruction: greenfield vs iterative edit rules and recent-edits injection.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildOneShotSystemInstruction,
  K0_ONESHOT_GREENFIELD_UI_RULES,
  K0_ONESHOT_ITERATIVE_EDIT_RULES,
  type IdeationSystemExtras,
  type ScribeBackendHeadMeta,
  type ScribeHeadMeta,
} from "@/components/kota0/ai/plan/ideationRun";

const sfcMeta: ScribeHeadMeta = {
  fetchedAtIso: "2025-01-01T00:00:00.000Z",
  utf8Bytes: 10,
  lineCount: 2,
  rawCharLength: 10,
};
const backendMeta: ScribeBackendHeadMeta = { utf8Bytes: 5, lineCount: 1, rawCharLength: 5 };
const heads = { sfc: "<template><p>hi</p></template>", backend: "export default [];" };
const baseExtras: IdeationSystemExtras = {
  workspaceDepsSummary: null,
  headOutline: null,
  bundleEnvForSystem: null,
};

describe("buildOneShotSystemInstruction", () => {
  it("includes greenfield ship-ready rules for starter placeholder apps", () => {
    const sys = buildOneShotSystemInstruction(heads, sfcMeta, backendMeta, {
      ...baseExtras,
      placeholder: true,
    });
    assert.match(sys, /Ship-ready ```vue \(critical\)/);
    assert.match(sys, /Starter placeholder notice/);
    assert.doesNotMatch(sys, /Iterative edit mode \(existing app/);
    assert.doesNotMatch(sys, /Preserve all unmentioned regions/);
  });

  it("includes iterative edit rules for existing apps", () => {
    const sys = buildOneShotSystemInstruction(heads, sfcMeta, backendMeta, {
      ...baseExtras,
      placeholder: false,
    });
    assert.match(sys, /Iterative edit mode \(existing app/);
    assert.match(sys, /Preserve all unmentioned regions/);
    assert.doesNotMatch(sys, /Ship-ready ```vue \(critical\)/);
    assert.doesNotMatch(sys, /Starter placeholder notice/);
  });

  it("appends recentEditsSection when provided", () => {
    const recent = "=== Recent edits — keep extending in this style ===\n--- Rev 1 → HEAD ---\n=== end Recent edits ===";
    const sys = buildOneShotSystemInstruction(heads, sfcMeta, backendMeta, baseExtras, {
      recentEditsSection: recent,
    });
    assert.match(sys, /Recent edits — keep extending/);
    assert.ok(sys.indexOf(recent) < sys.indexOf(K0_ONESHOT_ITERATIVE_EDIT_RULES));
  });

  it("exports greenfield and iterative rule constants", () => {
    assert.match(K0_ONESHOT_GREENFIELD_UI_RULES, /editorial density/);
    assert.match(K0_ONESHOT_ITERATIVE_EDIT_RULES, /surgical merge/);
  });
});

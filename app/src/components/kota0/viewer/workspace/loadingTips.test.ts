import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  KOTA0_LOADING_TIPS,
  pickLoadingTip,
} from "@/components/kota0/viewer/workspace/loadingTips";

describe("pickLoadingTip", () => {
  it("is deterministic for the same seed + tick", () => {
    const a = pickLoadingTip("app-1", 3);
    const b = pickLoadingTip("app-1", 3);
    assert.equal(a.id, b.id);
  });

  it("advances through all tips in sequence as tick increments", () => {
    const seen = new Set<string>();
    for (let i = 0; i < KOTA0_LOADING_TIPS.length; i++) {
      seen.add(pickLoadingTip("app-1", i).id);
    }
    assert.equal(seen.size, KOTA0_LOADING_TIPS.length, "every tip is reachable from a single seed");
  });

  it("wraps after exhausting the list", () => {
    const first = pickLoadingTip("app-1", 0);
    const wrapped = pickLoadingTip("app-1", KOTA0_LOADING_TIPS.length);
    assert.equal(first.id, wrapped.id);
  });

  it("different seeds start at different offsets", () => {
    const startA = pickLoadingTip("app-1", 0).id;
    let differs = false;
    for (const s of ["app-2", "app-3", "app-4", "app-5", "app-6"]) {
      if (pickLoadingTip(s, 0).id !== startA) {
        differs = true;
        break;
      }
    }
    assert.ok(differs, "at least one alternate seed picks a different starting tip");
  });
});

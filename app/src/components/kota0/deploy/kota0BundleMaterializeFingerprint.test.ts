import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bundleMaterializeFingerprint } from "@/components/kota0/deploy/kota0BundleMaterializeFingerprint";

describe("bundleMaterializeFingerprint", () => {
  it("is stable for the same inputs", () => {
    const a = bundleMaterializeFingerprint("<template></template>", "export {}");
    const b = bundleMaterializeFingerprint("<template></template>", "export {}");
    assert.equal(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });

  it("changes when source changes", () => {
    const a = bundleMaterializeFingerprint("<template>A</template>", "export {}");
    const b = bundleMaterializeFingerprint("<template>B</template>", "export {}");
    assert.notEqual(a, b);
  });
});

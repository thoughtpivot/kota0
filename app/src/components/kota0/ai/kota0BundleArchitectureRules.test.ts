import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { KOTA0_BUNDLE_ARCHITECTURE_RULES } from "@/components/kota0/ai/kota0BundleArchitectureRules";

describe("KOTA0_BUNDLE_ARCHITECTURE_RULES", () => {
  it("documents allowed @shared modules and forbids @shared/bundleApi", () => {
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /@shared\/scribeRestClient/);
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /@shared\/bundleRedisClient/);
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /@shared\/kota0PlatformAi/);
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /\.\/src\/bundleApi/);
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /There is no `@shared\/bundleApi`/);
    assert.match(KOTA0_BUNDLE_ARCHITECTURE_RULES, /verifyAppConnectivity/);
  });
});

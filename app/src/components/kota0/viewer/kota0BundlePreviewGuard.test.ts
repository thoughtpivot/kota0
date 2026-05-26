import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { bundleFlightIdentityPing } from "@/components/kota0/viewer/kota0BundleFlightIdentity";

describe("bundleFlightIdentityPing", () => {
  it("accepts hello when appId matches", async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, appId: "app-a", message: "hi" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    try {
      const ok = await bundleFlightIdentityPing(addr.port, "app-a", 2000);
      assert.equal(ok, true);
      const bad = await bundleFlightIdentityPing(addr.port, "app-b", 2000);
      assert.equal(bad, false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});

describe("mergeApplyPatchRetry", () => {
  it("keeps pass-1 successes and applies pass-2 fixes for failed files", async () => {
    const { mergeApplyPatchRetry } = await import("@/components/kota0/ai/kota0ApplyModelPatches");
    const head = { source: "vue-head", backendSource: "be-head", bundleEnv: "" };
    const pass1 = {
      source: "vue-updated",
      backendSource: "be-head",
      bundleEnv: "",
      fallbacks: [{ file: "App.backend.ts", reason: "anchor_not_found" as const, detail: "x" }],
      rejections: [],
    };
    const pass2 = {
      source: "vue-head",
      backendSource: "be-fixed",
      bundleEnv: "",
      fallbacks: [],
      rejections: [],
    };
    const merged = mergeApplyPatchRetry(head, pass1, pass2);
    assert.equal(merged.source, "vue-updated");
    assert.equal(merged.backendSource, "be-fixed");
    assert.equal(merged.fallbacks.length, 0);
    assert.equal(merged.rejections.length, 0);
  });
});

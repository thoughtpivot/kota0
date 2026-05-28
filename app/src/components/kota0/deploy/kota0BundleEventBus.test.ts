import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  broadcastBundleStatus,
  subscribeBundleStatus,
} from "@/components/kota0/deploy/kota0BundleEventBus";

describe("kota0BundleEventBus", () => {
  it("subscribe receives broadcast events", () => {
    const seen: string[] = [];
    const unsub = subscribeBundleStatus((evt) => {
      seen.push(`${evt.appId}:${evt.phase}:${evt.ready}`);
    });
    broadcastBundleStatus({
      type: "bundle-status",
      appId: "app-a",
      phase: "running",
      ready: true,
      bundleFingerprint: "fp1",
      phaseSince: 1,
    });
    unsub();
    broadcastBundleStatus({
      type: "bundle-status",
      appId: "app-b",
      phase: "building",
      ready: false,
      bundleFingerprint: null,
      phaseSince: 2,
    });
    assert.deepEqual(seen, ["app-a:running:true"]);
  });
});

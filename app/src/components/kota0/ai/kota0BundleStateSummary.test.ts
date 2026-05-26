import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";

import { buildKota0BundleStateSummary } from "@/components/kota0/ai/kota0BundleStateSummary";
import {
  setBundleAppStatus,
  writeBundleSharedState,
} from "@/components/kota0/deploy/kota0BundleSharedState";
import { appendKota0RuntimeError, clearKota0RuntimeErrors } from "@/components/kota0/runtime/kota0RuntimeErrorStore";

let tmpDir = "";
const APP = "summary-test-app";

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "k0-state-summary-"));
  process.env.K0_BUNDLES_DIR = tmpDir;
  await writeBundleSharedState({ servingAppId: null, appStatus: {} });
  clearKota0RuntimeErrors(APP);
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("buildKota0BundleStateSummary", () => {
  it("renders 'idle' state with no logs or runtime errors", async () => {
    const summary = await buildKota0BundleStateSummary(APP);
    assert.match(summary, /phase: idle/);
    assert.match(summary, /lastBuildError: none/);
    assert.match(summary, /servingAppId: \(none\)/);
    assert.doesNotMatch(summary, /Recent bundle Flight output/);
    assert.doesNotMatch(summary, /Recent runtime errors/);
  });

  it("renders 'failed' state with structured lastBuildError", async () => {
    await setBundleAppStatus(APP, {
      phase: "failed",
      lastBuildError: {
        kind: "missing_import",
        message: 'Rollup failed to resolve import "leaflet"',
        module: "leaflet",
        importedFrom: "App.vue",
        rawLines: ["[vite]: Rollup failed to resolve import \"leaflet\""],
        at: Date.now(),
      },
    });
    const summary = await buildKota0BundleStateSummary(APP);
    assert.match(summary, /phase: failed/);
    assert.match(summary, /lastBuildError: missing_import/);
    assert.match(summary, /module="leaflet"/);
  });

  it("includes recent runtime errors when present", async () => {
    appendKota0RuntimeError(APP, {
      kind: "error",
      message: "ReferenceError: foo is not defined",
      at: new Date().toISOString(),
      receivedAt: Date.now(),
      url: "http://localhost:4000/",
    });
    const summary = await buildKota0BundleStateSummary(APP);
    assert.match(summary, /Recent runtime errors/);
    assert.match(summary, /ReferenceError: foo is not defined/);
  });
});

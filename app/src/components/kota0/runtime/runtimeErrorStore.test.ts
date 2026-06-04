import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  appendRuntimeError,
  readRuntimeErrors,
  clearRuntimeErrors,
  _RuntimeErrorStoreSizeForTest,
} from "@/components/kota0/runtime/runtimeErrorStore";

const FIXTURE_APP = "app-test-runtime-store";

describe("kota0RuntimeErrorStore", () => {
  beforeEach(() => {
    clearRuntimeErrors(FIXTURE_APP);
  });

  it("appends and reads back errors in insertion order", () => {
    appendRuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "first",
      at: "2026-05-23T00:00:00Z",
      receivedAt: 1,
      url: "http://test/",
    });
    appendRuntimeError(FIXTURE_APP, {
      kind: "unhandledrejection",
      message: "second",
      at: "2026-05-23T00:00:01Z",
      receivedAt: 2,
      url: "http://test/",
    });
    const errs = readRuntimeErrors(FIXTURE_APP);
    assert.equal(errs.length, 2);
    assert.equal(errs[0]!.message, "first");
    assert.equal(errs[1]!.kind, "unhandledrejection");
  });

  it("filters by since timestamp", () => {
    appendRuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "old",
      at: "",
      receivedAt: 10,
      url: "",
    });
    appendRuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "new",
      at: "",
      receivedAt: 20,
      url: "",
    });
    const errs = readRuntimeErrors(FIXTURE_APP, { since: 15 });
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.message, "new");
  });

  it("caps stored errors per app", () => {
    for (let i = 0; i < 80; i++) {
      appendRuntimeError(FIXTURE_APP, {
        kind: "error",
        message: `e${i}`,
        at: "",
        receivedAt: i,
        url: "",
      });
    }
    const errs = readRuntimeErrors(FIXTURE_APP);
    assert.equal(errs.length, 50);
    // Oldest 30 should have been evicted, so the first remaining is e30.
    assert.equal(errs[0]!.message, "e30");
  });

  it("clear removes only the target app's errors", () => {
    appendRuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "x",
      at: "",
      receivedAt: 1,
      url: "",
    });
    appendRuntimeError("other-app-runtime-store", {
      kind: "error",
      message: "y",
      at: "",
      receivedAt: 1,
      url: "",
    });
    clearRuntimeErrors(FIXTURE_APP);
    assert.equal(readRuntimeErrors(FIXTURE_APP).length, 0);
    assert.equal(readRuntimeErrors("other-app-runtime-store").length, 1);
    // Cleanup the other one too so the in-memory map doesn't leak across tests.
    clearRuntimeErrors("other-app-runtime-store");
    assert.equal(_RuntimeErrorStoreSizeForTest(), 0);
  });
});

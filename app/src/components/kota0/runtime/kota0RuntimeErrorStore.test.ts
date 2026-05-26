import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  appendKota0RuntimeError,
  readKota0RuntimeErrors,
  clearKota0RuntimeErrors,
  _kota0RuntimeErrorStoreSizeForTest,
} from "@/components/kota0/runtime/kota0RuntimeErrorStore";

const FIXTURE_APP = "app-test-runtime-store";

describe("kota0RuntimeErrorStore", () => {
  beforeEach(() => {
    clearKota0RuntimeErrors(FIXTURE_APP);
  });

  it("appends and reads back errors in insertion order", () => {
    appendKota0RuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "first",
      at: "2026-05-23T00:00:00Z",
      receivedAt: 1,
      url: "http://test/",
    });
    appendKota0RuntimeError(FIXTURE_APP, {
      kind: "unhandledrejection",
      message: "second",
      at: "2026-05-23T00:00:01Z",
      receivedAt: 2,
      url: "http://test/",
    });
    const errs = readKota0RuntimeErrors(FIXTURE_APP);
    assert.equal(errs.length, 2);
    assert.equal(errs[0]!.message, "first");
    assert.equal(errs[1]!.kind, "unhandledrejection");
  });

  it("filters by since timestamp", () => {
    appendKota0RuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "old",
      at: "",
      receivedAt: 10,
      url: "",
    });
    appendKota0RuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "new",
      at: "",
      receivedAt: 20,
      url: "",
    });
    const errs = readKota0RuntimeErrors(FIXTURE_APP, { since: 15 });
    assert.equal(errs.length, 1);
    assert.equal(errs[0]!.message, "new");
  });

  it("caps stored errors per app", () => {
    for (let i = 0; i < 80; i++) {
      appendKota0RuntimeError(FIXTURE_APP, {
        kind: "error",
        message: `e${i}`,
        at: "",
        receivedAt: i,
        url: "",
      });
    }
    const errs = readKota0RuntimeErrors(FIXTURE_APP);
    assert.equal(errs.length, 50);
    // Oldest 30 should have been evicted, so the first remaining is e30.
    assert.equal(errs[0]!.message, "e30");
  });

  it("clear removes only the target app's errors", () => {
    appendKota0RuntimeError(FIXTURE_APP, {
      kind: "error",
      message: "x",
      at: "",
      receivedAt: 1,
      url: "",
    });
    appendKota0RuntimeError("other-app-runtime-store", {
      kind: "error",
      message: "y",
      at: "",
      receivedAt: 1,
      url: "",
    });
    clearKota0RuntimeErrors(FIXTURE_APP);
    assert.equal(readKota0RuntimeErrors(FIXTURE_APP).length, 0);
    assert.equal(readKota0RuntimeErrors("other-app-runtime-store").length, 1);
    // Cleanup the other one too so the in-memory map doesn't leak across tests.
    clearKota0RuntimeErrors("other-app-runtime-store");
    assert.equal(_kota0RuntimeErrorStoreSizeForTest(), 0);
  });
});

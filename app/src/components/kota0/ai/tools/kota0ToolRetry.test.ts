import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultIsTransient,
  withRetry,
  shortErrorSummary,
} from "@/components/kota0/ai/tools/kota0ToolRetry";

describe("defaultIsTransient", () => {
  it("matches common transient infra errors", () => {
    assert.equal(defaultIsTransient(new Error("listen EADDRINUSE :::4000")), true);
    assert.equal(defaultIsTransient(new Error("connect ECONNREFUSED 127.0.0.1:4000")), true);
    assert.equal(defaultIsTransient(new Error("ETIMEDOUT")), true);
    assert.equal(defaultIsTransient(new Error("EBUSY: resource busy or locked")), true);
    assert.equal(
      defaultIsTransient(new Error("Cannot connect to the Docker daemon at unix:///var/run/docker.sock")),
      true,
    );
    assert.equal(defaultIsTransient("Flight failed to bind :4000 after 2 attempts"), true);
  });

  it("does NOT match logical/non-transient errors", () => {
    assert.equal(defaultIsTransient(new Error("anchor_not_found")), false);
    assert.equal(defaultIsTransient(new Error("plan_kind_mismatch")), false);
    assert.equal(defaultIsTransient(new Error("Invalid SFC")), false);
    assert.equal(defaultIsTransient(null), false);
    assert.equal(defaultIsTransient(undefined), false);
  });
});

describe("withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    let calls = 0;
    const r = await withRetry(
      async () => {
        calls += 1;
        return "ok";
      },
      { attempts: 3, baseDelayMs: 1, isTransient: () => true },
    );
    assert.equal(r, "ok");
    assert.equal(calls, 1);
  });

  it("retries up to `attempts` times on transient errors then throws the last", async () => {
    let calls = 0;
    const retries: number[] = [];
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("EADDRINUSE");
        },
        {
          attempts: 3,
          baseDelayMs: 1,
          isTransient: defaultIsTransient,
          onRetry: ({ attempt }) => retries.push(attempt),
        },
      ),
      /EADDRINUSE/,
    );
    assert.equal(calls, 3);
    assert.deepEqual(retries, [1, 2]); // two onRetry events between three attempts
  });

  it("does NOT retry when the error is non-transient", async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("anchor_not_found");
        },
        { attempts: 5, baseDelayMs: 1, isTransient: defaultIsTransient },
      ),
      /anchor_not_found/,
    );
    assert.equal(calls, 1);
  });

  it("succeeds on a later attempt after transient failures", async () => {
    let calls = 0;
    const r = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("ECONNREFUSED");
        return "ok-on-3";
      },
      { attempts: 5, baseDelayMs: 1, isTransient: defaultIsTransient },
    );
    assert.equal(r, "ok-on-3");
    assert.equal(calls, 3);
  });
});

describe("shortErrorSummary", () => {
  it("truncates long error messages", () => {
    const long = "x".repeat(500);
    const r = shortErrorSummary(new Error(long));
    assert.ok(r.length <= 121);
    assert.ok(r.endsWith("…"));
  });

  it("returns a clean message for short errors", () => {
    assert.equal(shortErrorSummary(new Error("nope")), "nope");
    assert.equal(shortErrorSummary("plain string"), "plain string");
    assert.equal(shortErrorSummary(undefined), "unknown error");
  });
});

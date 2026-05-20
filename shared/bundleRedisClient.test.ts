import assert from "node:assert/strict";
import test from "node:test";
import { createBundleRedisClient } from "@shared/bundleRedisClient.ts";

test("createBundleRedisClient throws when K0_APP_REDIS_PREFIX is unset", () => {
  const prev = process.env.K0_APP_REDIS_PREFIX;
  delete process.env.K0_APP_REDIS_PREFIX;
  try {
    assert.throws(() => createBundleRedisClient(), /K0_APP_REDIS_PREFIX is not set/);
  } finally {
    if (prev === undefined) delete process.env.K0_APP_REDIS_PREFIX;
    else process.env.K0_APP_REDIS_PREFIX = prev;
  }
});

test("createBundleRedisClient applies the env prefix as keyPrefix and connects lazily", async () => {
  process.env.K0_APP_REDIS_PREFIX = "app_11111111_1111_1111_1111_111111111111:";
  // lazyConnect avoids opening a TCP connection just to read the option back.
  const client = createBundleRedisClient({ options: { lazyConnect: true } });
  try {
    assert.equal(client.options.keyPrefix, "app_11111111_1111_1111_1111_111111111111:");
  } finally {
    client.disconnect();
    delete process.env.K0_APP_REDIS_PREFIX;
  }
});

test("explicit prefix override beats env (test-only escape hatch)", () => {
  process.env.K0_APP_REDIS_PREFIX = "app_env:";
  const client = createBundleRedisClient({ prefix: "app_override:", options: { lazyConnect: true } });
  try {
    assert.equal(client.options.keyPrefix, "app_override:");
  } finally {
    client.disconnect();
    delete process.env.K0_APP_REDIS_PREFIX;
  }
});

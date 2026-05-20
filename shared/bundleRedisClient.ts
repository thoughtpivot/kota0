/**
 * Per-app Redis client for bundle `App.backend.ts`. Enforces `K0_APP_REDIS_PREFIX` so apps
 * cannot read each other's keys — mirrors the Scribe Gateway's table-prefix isolation.
 *
 * Usage from a bundle backend:
 *   import { createBundleRedisClient } from "@shared/bundleRedisClient";
 *   const redis = createBundleRedisClient();
 *   await redis.set("session:abc", "x"); // actually writes `app_<uuid>:session:abc`
 *
 * The platform itself must NOT call this — it talks to Redis directly via Flight's own client.
 *
 * Caveats (inherent to ioredis `keyPrefix`):
 * - `EVAL`/Lua script `KEYS[]` are NOT auto-prefixed — pass already-prefixed keys explicitly.
 * - Pub/Sub channels are NOT prefixed; namespace channels by hand if you use them.
 */
import Redis, { type RedisOptions } from "ioredis";

export type BundleRedisClientConfig = {
  /** Override the env-derived prefix (tests only — bundles in production should rely on env). */
  prefix?: string;
  /** Override host/port; defaults to FLIGHT_REDIS_HOST / FLIGHT_REDIS_PORT. */
  host?: string;
  port?: number;
  /** Passed through to ioredis. */
  options?: Omit<RedisOptions, "host" | "port" | "keyPrefix">;
};

function readPrefixFromEnv(): string {
  const raw = process.env.K0_APP_REDIS_PREFIX?.trim() ?? "";
  if (!raw) {
    throw new Error(
      "[bundleRedisClient] K0_APP_REDIS_PREFIX is not set. " +
        "This client is meant for bundle backends; the platform should use Flight's Redis client instead.",
    );
  }
  return raw;
}

export function createBundleRedisClient(config: BundleRedisClientConfig = {}): Redis {
  const prefix = config.prefix ?? readPrefixFromEnv();
  const host = config.host ?? process.env.FLIGHT_REDIS_HOST ?? "127.0.0.1";
  const port = config.port ?? (Number(process.env.FLIGHT_REDIS_PORT) || 6379);
  return new Redis({
    host,
    port,
    keyPrefix: prefix,
    ...config.options,
  });
}

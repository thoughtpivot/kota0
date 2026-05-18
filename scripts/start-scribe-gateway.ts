/**
 * Standalone Scribe Gateway process.
 *
 * Run via `npm run start:gateway` (started automatically by `start:workspace`).
 * Loads the key registry from disk, watches the file for updates written by platform
 * workers (new apps provisioned, deleted apps revoked), then starts the HTTP gateway.
 *
 * The gateway is intentionally separate from the platform Flight cluster so that:
 *   - Only one server binds the gateway port, regardless of worker count.
 *   - The authoritative registry lives in one process that stays in sync via fs.watch.
 */
import "@/lib/env";
import path from "node:path";
import { scribeKeyRegistry } from "@/components/kota0/gateway/ScribeKeyRegistry";
import { resolveKota0BundlesRoot } from "@/components/kota0/deploy/kota0BundlePaths";
import { startScribeGateway } from "@/components/kota0/gateway/ScribeGateway";

const registryPath = path.join(resolveKota0BundlesRoot(), ".scribe-gateway-keys.json");

scribeKeyRegistry.configure(registryPath);
await scribeKeyRegistry.load();
scribeKeyRegistry.startWatching();
startScribeGateway();

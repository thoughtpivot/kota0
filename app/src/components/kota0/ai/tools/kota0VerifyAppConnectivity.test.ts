import { createServer, type Server } from "node:http";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bundleFlightIdentityPing } from "@/components/kota0/viewer/kota0BundleFlightIdentity";
import { verifyKota0AppConnectivity } from "@/components/kota0/ai/tools/kota0VerifyAppConnectivity";

const TEST_APP_ID = "11111111-1111-1111-1111-111111111111";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve(addr.port);
    });
  });
}

describe("verifyKota0AppConnectivity", () => {
  it("returns not_running when bundle Flight is not serving the app", async () => {
    const result = await verifyKota0AppConnectivity({ appId: TEST_APP_ID, port: 59999 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_running");
  });

  it("bundleFlightIdentityPing validates hello JSON against expected appId", async () => {
    const appId = TEST_APP_ID;
    const server = createServer((req, res) => {
      if (req.url === "/api/kota0-app/hello" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, appId }));
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });

    const port = await listen(server);
    try {
      assert.equal(await bundleFlightIdentityPing(port, appId, 2000), true);
      assert.equal(await bundleFlightIdentityPing(port, "other-app-id", 2000), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

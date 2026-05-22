import http from "node:http";

/** Default template serves this JSON route from `App.backend.ts`. */
export const BUNDLE_HELLO_PATH = "/api/kota0-app/hello";

function httpGetBody(port: number, path: string, timeoutMs: number): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/**
 * True when bundle Flight on `port` responds to hello with matching `appId`.
 * Node-only — no `@/` imports so Vite's config/plugin chain can load this module.
 */
export async function bundleFlightIdentityPing(
  port: number,
  expectedAppId: string,
  timeoutMs: number,
): Promise<boolean> {
  const id = expectedAppId.trim();
  if (!id) return false;
  const res = await httpGetBody(port, BUNDLE_HELLO_PATH, timeoutMs);
  if (!res || res.status < 200 || res.status >= 400) return false;
  try {
    const parsed = JSON.parse(res.body) as { appId?: unknown };
    return typeof parsed.appId === "string" && parsed.appId === id;
  } catch {
    return false;
  }
}

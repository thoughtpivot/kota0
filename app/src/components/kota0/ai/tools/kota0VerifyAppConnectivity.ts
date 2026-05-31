import http from "node:http";
import { BUNDLE_HELLO_PATH, bundleFlightIdentityPing } from "@/components/kota0/viewer/kota0BundleFlightIdentity";
import { getFlightConsoleRecent } from "@/components/kota0/deploy/kota0ConsoleLogHub";
import { getKota0BundleSnapshot } from "@/components/kota0/deploy/kota0BundleSnapshot";

const DEFAULT_BUNDLE_FLIGHT_PORT = 4000;
const BODY_SNIPPET_MAX = 512;

export type Kota0ConnectivityProbeRoute = {
  method: "GET" | "POST";
  path: string;
  jsonBody?: unknown;
};

export type Kota0ConnectivityProbeResult = {
  method: "GET" | "POST";
  path: string;
  status: number;
  ok: boolean;
  bodySnippet: string;
  logLinesDuringRequest: string[];
};

export type Kota0VerifyAppConnectivityResult =
  | {
      ok: true;
      hello: { ok: true; appId: string; status: number; bodySnippet: string };
      probes: Kota0ConnectivityProbeResult[];
    }
  | {
      ok: false;
      reason: "not_running" | "hello_failed" | "probe_failed";
      snapshot: Awaited<ReturnType<typeof getKota0BundleSnapshot>>;
      hello?:
        | { ok: false; status: number; bodySnippet: string }
        | { ok: true; appId: string; status: number; bodySnippet: string };
      probes?: Kota0ConnectivityProbeResult[];
    };

function httpRequest(
  port: number,
  method: "GET" | "POST",
  reqPath: string,
  jsonBody: unknown | undefined,
  timeoutMs: number,
): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const payload =
      jsonBody !== undefined && method === "POST" ?
        Buffer.from(JSON.stringify(jsonBody), "utf8")
      : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
        method,
        timeout: timeoutMs,
        headers:
          payload ?
            {
              "Content-Type": "application/json",
              "Content-Length": String(payload.length),
            }
          : undefined,
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
    if (payload) req.write(payload);
    req.end();
  });
}

function snippet(body: string): string {
  const t = body.trim();
  if (t.length <= BODY_SNIPPET_MAX) return t;
  return `${t.slice(0, BODY_SNIPPET_MAX)}…`;
}

async function probeRoute(
  port: number,
  route: Kota0ConnectivityProbeRoute,
): Promise<Kota0ConnectivityProbeResult> {
  const logBefore = getFlightConsoleRecent().length;
  const res = await httpRequest(port, route.method, route.path, route.jsonBody, 8000);
  const logAfter = getFlightConsoleRecent();
  const logLinesDuringRequest = logAfter.slice(Math.max(0, logBefore)).map((e) => e.text);
  const status = res?.status ?? 0;
  const bodySnippet = res ? snippet(res.body) : "(no response)";
  const ok = Boolean(res && status >= 200 && status < 400);
  return {
    method: route.method,
    path: route.path,
    status,
    ok,
    bodySnippet,
    logLinesDuringRequest,
  };
}

export async function verifyKota0AppConnectivity(input: {
  appId: string;
  port?: number;
  routes?: Kota0ConnectivityProbeRoute[];
}): Promise<Kota0VerifyAppConnectivityResult> {
  const appId = input.appId.trim();
  const port = input.port ?? DEFAULT_BUNDLE_FLIGHT_PORT;
  const snapshot = await getKota0BundleSnapshot(appId);

  if (snapshot.phase !== "running" || !snapshot.isServing) {
    return { ok: false, reason: "not_running", snapshot };
  }

  const helloRes = await httpRequest(port, "GET", BUNDLE_HELLO_PATH, undefined, 2500);
  const helloOk = await bundleFlightIdentityPing(port, appId, 2500);
  const helloBody = helloRes ? snippet(helloRes.body) : "(no response)";
  if (!helloOk || !helloRes) {
    return {
      ok: false,
      reason: "hello_failed",
      snapshot,
      hello: { ok: false, status: helloRes?.status ?? 0, bodySnippet: helloBody },
    };
  }

  const probes: Kota0ConnectivityProbeResult[] = [];
  for (const route of input.routes ?? []) {
    probes.push(await probeRoute(port, route));
  }

  const probesOk = probes.every((p) => p.ok);
  if (!probesOk) {
    return {
      ok: false,
      reason: "probe_failed",
      snapshot,
      hello: { ok: true, appId, status: helloRes.status, bodySnippet: helloBody },
      probes,
    };
  }

  return {
    ok: true,
    hello: { ok: true, appId, status: helloRes.status, bodySnippet: helloBody },
    probes,
  };
}

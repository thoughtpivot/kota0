import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER,
  ensurePowervibeBundleProbeRoutesFirst,
  sanitizePowervibeBackendRoutesForKoa,
  validatePowervibeAppBackendForFlight,
} from "@/components/powervibe/viewer/powervibeAppBackendForFlight.ts";

describe("sanitizePowervibeBackendRoutesForKoa", () => {
  test("rewrites bare /api/auth/* before quote", () => {
    const src = `router.get("/api/auth/*", handler)`;
    assert.ok(sanitizePowervibeBackendRoutesForKoa(src).includes("/api/auth/*path"));
  });
});

describe("ensurePowervibeBundleProbeRoutesFirst", () => {
  test("inserts probe imports and registers after new Router()", () => {
    const src = `import Router from "@koa/router";
const router = new Router();
router.post("/api/powervibe-app/ai-test", async () => {});
export default router.routes();
`;
    const out = ensurePowervibeBundleProbeRoutesFirst(src);
    assert.ok(out.includes("@shared/powervibeBundlePlatformAiRoutes"));
    assert.ok(out.includes(POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER));
    assert.ok(out.includes("registerPowervibeBundleHelloRoute(router)"));
    assert.ok(out.includes("registerPowervibeBundleAiTestRoute(router)"));
    const routerIdx = out.indexOf("new Router()");
    const markerIdx = out.indexOf(POWERVIBE_BUNDLE_PROBE_ROUTES_MARKER);
    const userPostIdx = out.indexOf('router.post("/api/powervibe-app/ai-test"');
    assert.ok(markerIdx > routerIdx && userPostIdx > markerIdx);
  });

  test("is idempotent when marker already present", () => {
    const once = ensurePowervibeBundleProbeRoutesFirst(`import Router from "@koa/router";
const router = new Router();
export default router.routes();
`);
    const twice = ensurePowervibeBundleProbeRoutesFirst(once);
    assert.equal(twice, once);
  });
});

describe("validatePowervibeAppBackendForFlight", () => {
  const minimalOk = `
import Router from "@koa/router";
const router = new Router();
router.get("/api/powervibe-app/hello", (ctx) => { ctx.body = { ok: true }; });
export default router.routes();
`;

  test("accepts minimal valid backend", () => {
    assert.equal(validatePowervibeAppBackendForFlight(minimalOk).ok, true);
  });

  test("rejects GoogleGenerativeAI with @google/genai", () => {
    const bad = `
import { GoogleGenerativeAI } from "@google/genai";
import Router from "@koa/router";
const router = new Router();
const x = new GoogleGenerativeAI("");
export default router.routes();
`;
    const r = validatePowervibeAppBackendForFlight(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.message.includes("GoogleGenAI"));
  });

  test("rejects getGenerativeModel", () => {
    const bad = `
import Router from "@koa/router";
const router = new Router();
router.get("/x", (ctx) => {
  void something.getGenerativeModel({ model: "x" });
});
export default router.routes();
`;
    const r = validatePowervibeAppBackendForFlight(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.message.includes("models.generateContent"));
  });
});

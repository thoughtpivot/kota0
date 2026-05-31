import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  K0_BUNDLE_PROBE_ROUTES_MARKER,
  coerceBareRouterExportToRoutes,
  coerceKoaAppExportToRouterDefault,
  coerceOrphanAppReferencesToRouter,
  ensureKota0BundleProbeRoutesFirst,
  normalizeKota0AppBackendForFlight,
  sanitizeKota0BackendRoutesForKoa,
  validateKota0AppBackendForFlight,
} from "@/components/kota0/viewer/kota0AppBackendForFlight.ts";

describe("sanitizeKota0BackendRoutesForKoa", () => {
  test("rewrites bare /api/auth/* before quote", () => {
    const src = `router.get("/api/auth/*", handler)`;
    assert.ok(sanitizeKota0BackendRoutesForKoa(src).includes("/api/auth/*path"));
  });
});

describe("coerceKoaAppExportToRouterDefault", () => {
  test("replaces Koa app export with router.routes default export", () => {
    const src = `import Router from '@koa/router';
import Koa from 'koa';

const router = new Router();

router.get('/api/x', (ctx) => { ctx.body = { ok: true }; });

export const app = new Koa();
app.use(router.routes());
app.use(router.allowedMethods());
`;
    const out = coerceKoaAppExportToRouterDefault(src);
    assert.ok(!out.includes("import Koa"));
    assert.ok(!out.includes("export const app"));
    assert.ok(out.includes("export default router.routes()"));
  });
});

describe("coerceBareRouterExportToRoutes", () => {
  test("fixes export default router to export default router.routes()", () => {
    const src = `import Router from '@koa/router';
const router = new Router();
router.get('/api/roster', async (ctx) => { ctx.body = []; });
export default router;
`;
    const out = coerceBareRouterExportToRoutes(src);
    assert.ok(out.includes("export default router.routes();"));
    assert.ok(!out.includes("export default router;"));
  });

  test("does not touch export default router.routes()", () => {
    const src = `export default router.routes();`;
    assert.equal(coerceBareRouterExportToRoutes(src), src);
  });
});

describe("coerceOrphanAppReferencesToRouter", () => {
  test("rewrites orphan app.use / export default app to router", () => {
    const src = `import Router from '@koa/router';
import bodyParser from '@koa/bodyparser';

const router = new Router();

router.post('/api/x', async (ctx) => {
  ctx.body = ctx.request.body;
});

app.use(bodyParser());
export default app;
`;
    const out = coerceOrphanAppReferencesToRouter(src);
    assert.ok(out.includes("router.use(bodyParser());"));
    assert.ok(!out.includes("app.use("));
    assert.ok(out.includes("export default router.routes();"));
    assert.ok(!out.includes("export default app"));
  });
});

describe("normalizeKota0AppBackendForFlight", () => {
  test("coerces Koa app pattern from currency-converter style backends", () => {
    const src = readCurrencyConverterFixture();
    const out = normalizeKota0AppBackendForFlight(src);
    assert.equal(validateKota0AppBackendForFlight(out).ok, true);
    assert.ok(out.includes("export default router.routes()"));
  });

  test("coerces bare router export", () => {
    const src = `import Router from '@koa/router';
const router = new Router();
router.get('/api/roster', async (ctx) => { ctx.body = []; });
export default router;
`;
    const out = normalizeKota0AppBackendForFlight(src);
    assert.equal(validateKota0AppBackendForFlight(out).ok, true);
    assert.ok(out.includes("export default router.routes();"));
  });
});

function readCurrencyConverterFixture(): string {
  return `import Router from '@koa/router';
import Koa from 'koa';

const router = new Router();

router.post('/api/convert', async (ctx) => {
  ctx.body = { result: 1 };
});

export const app = new Koa();
app.use(router.routes());
app.use(router.allowedMethods());
`;
}

describe("ensureKota0BundleProbeRoutesFirst", () => {
  test("inserts probe imports and registers after new Router()", () => {
    const src = `import Router from "@koa/router";
const router = new Router();
router.post("/api/kota0-app/ai-test", async () => {});
export default router.routes();
`;
    const out = ensureKota0BundleProbeRoutesFirst(src);
    assert.ok(out.includes("@shared/kota0BundlePlatformAiRoutes"));
    assert.ok(out.includes(K0_BUNDLE_PROBE_ROUTES_MARKER));
    assert.ok(out.includes("registerKota0BundleHelloRoute(router)"));
    assert.ok(out.includes("registerKota0BundleAiTestRoute(router)"));
    const routerIdx = out.indexOf("new Router()");
    const markerIdx = out.indexOf(K0_BUNDLE_PROBE_ROUTES_MARKER);
    const userPostIdx = out.indexOf('router.post("/api/kota0-app/ai-test"');
    assert.ok(markerIdx > routerIdx && userPostIdx > markerIdx);
  });

  test("is idempotent when marker already present", () => {
    const once = ensureKota0BundleProbeRoutesFirst(`import Router from "@koa/router";
const router = new Router();
export default router.routes();
`);
    const twice = ensureKota0BundleProbeRoutesFirst(once);
    assert.equal(twice, once);
  });

  test("creates separate unprefixed probe router for prefixed Router", () => {
    const src = `import Router from "@koa/router";
const router = new Router({ prefix: '/api/sandwich' });
router.post("/generate", async (ctx) => { ctx.body = {}; });
export default router.routes();
`;
    const out = ensureKota0BundleProbeRoutesFirst(src);
    assert.ok(out.includes(K0_BUNDLE_PROBE_ROUTES_MARKER));
    assert.ok(out.includes("const __k0Probe = new Router()"));
    assert.ok(out.includes("registerKota0BundleHelloRoute(__k0Probe)"));
    assert.ok(out.includes("registerKota0BundleAiTestRoute(__k0Probe)"));
    assert.ok(out.includes("__k0Root.use(__k0Probe.routes()"));
    assert.ok(out.includes("__k0Root.use(router.routes()"));
    assert.ok(out.includes("export default __k0Root.routes()"));
    assert.ok(!out.includes("registerKota0BundleHelloRoute(router)"));
  });

  test("prefixed router is idempotent when marker present", () => {
    const src = `import Router from "@koa/router";
const router = new Router({ prefix: '/api/sandwich' });
export default router.routes();
`;
    const once = ensureKota0BundleProbeRoutesFirst(src);
    const twice = ensureKota0BundleProbeRoutesFirst(once);
    assert.equal(twice, once);
  });
});

describe("validateKota0AppBackendForFlight", () => {
  const minimalOk = `
import Router from "@koa/router";
const router = new Router();
router.get("/api/kota0-app/hello", (ctx) => { ctx.body = { ok: true }; });
export default router.routes();
`;

  test("accepts minimal valid backend", () => {
    assert.equal(validateKota0AppBackendForFlight(minimalOk).ok, true);
  });

  test("rejects GoogleGenerativeAI with @google/genai", () => {
    const bad = `
import { GoogleGenerativeAI } from "@google/genai";
import Router from "@koa/router";
const router = new Router();
const x = new GoogleGenerativeAI("");
export default router.routes();
`;
    const r = validateKota0AppBackendForFlight(bad);
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
    const r = validateKota0AppBackendForFlight(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.message.includes("models.generateContent"));
  });
});

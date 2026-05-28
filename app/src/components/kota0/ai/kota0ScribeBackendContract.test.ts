import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectInvalidBundleScribeUsage,
  KOTA0_SCRIBE_BACKEND_CONTRACT,
} from "@/components/kota0/ai/kota0ScribeBackendContract";
import { validateKota0AppBackendForFlight } from "@/components/kota0/viewer/kota0AppBackendForFlight.ts";

describe("detectInvalidBundleScribeUsage", () => {
  it("rejects scribe.set", () => {
    const msg = detectInvalidBundleScribeUsage(`await scribe.set('k', 'v');`);
    assert.ok(msg?.includes("scribe.set"));
  });

  it("rejects scribe.get with bare key", () => {
    const msg = detectInvalidBundleScribeUsage(`const x = await scribe.get('hydration_log');`);
    assert.ok(msg?.includes("hydration_log"));
  });

  it("allows scribe.get with REST path", () => {
    assert.equal(detectInvalidBundleScribeUsage(`await scribe.get('/notes/all');`), null);
  });

  it("rejects mutating routes without forComponent", () => {
    const src = `import { createScribeRestClient } from '@shared/scribeRestClient';
const scribe = createScribeRestClient();
router.post('/api/x', async () => {});
export default router.routes();`;
    assert.ok(detectInvalidBundleScribeUsage(src)?.includes("forComponent"));
  });

  it("allows starter-style forComponent CRUD", () => {
    const src = `const scribe = createScribeRestClient();
const greetings = scribe.forComponent('k0_demo_greetings');
router.post('/api/x', async () => { await greetings.create({ phrase: 'hi' }); });
export default router.routes();`;
    assert.equal(detectInvalidBundleScribeUsage(src), null);
  });
});

describe("validateKota0AppBackendForFlight scribe guard", () => {
  it("rejects hydration-style KV misuse", () => {
    const bad = `import { createScribeRestClient } from '@shared/scribeRestClient';
const router = new Router();
const scribe = createScribeRestClient();
router.post('/api/hydration/add', async (ctx) => {
  const data = await scribe.get('hydration_log');
  await scribe.set('hydration_log', JSON.stringify(data));
});
export default router.routes();`;
    const r = validateKota0AppBackendForFlight(bad);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.message.includes("scribe.set") || r.message.includes("hydration_log"));
  });
});

describe("KOTA0_SCRIBE_BACKEND_CONTRACT", () => {
  it("mentions forComponent and forbids scribe.set", () => {
    assert.ok(KOTA0_SCRIBE_BACKEND_CONTRACT.includes("forComponent"));
    assert.ok(KOTA0_SCRIBE_BACKEND_CONTRACT.includes("Never"));
    assert.ok(KOTA0_SCRIBE_BACKEND_CONTRACT.includes("scribe.set"));
  });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  sanitizePowervibeBackendRoutesForKoa,
  validatePowervibeAppBackendForFlight,
} from "@/components/powervibe/viewer/powervibeAppBackendForFlight.ts";

describe("sanitizePowervibeBackendRoutesForKoa", () => {
  test("rewrites bare /api/auth/* before quote", () => {
    const src = `router.get("/api/auth/*", handler)`;
    assert.ok(sanitizePowervibeBackendRoutesForKoa(src).includes("/api/auth/*path"));
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

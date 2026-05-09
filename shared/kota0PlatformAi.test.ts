import assert from "node:assert/strict";
import test from "node:test";
import { buildKota0PlatformAiRequestPayload } from "@shared/kota0PlatformAi.ts";

test("buildKota0PlatformAiRequestPayload rejects a bare prompt string (strict JSON hazard)", () => {
  assert.throws(
    () => buildKota0PlatformAiRequestPayload("hello"),
    /k0_platform_ai_invalid_body/,
  );
});

test("buildKota0PlatformAiRequestPayload rejects empty prompt", () => {
  assert.throws(
    () => buildKota0PlatformAiRequestPayload({ prompt: "   " }),
    /non-empty/,
  );
});

test("buildKota0PlatformAiRequestPayload returns object that serializes as JSON object", () => {
  const payload = buildKota0PlatformAiRequestPayload({ prompt: " hi " });
  const wire = JSON.stringify(payload);
  assert.ok(wire.trimStart().startsWith("{"), `expected object JSON, got: ${wire.slice(0, 20)}`);
  assert.deepEqual(payload, { prompt: "hi" });
});

test("buildKota0PlatformAiRequestPayload preserves optional fields", () => {
  const payload = buildKota0PlatformAiRequestPayload({
    prompt: "x",
    systemInstruction: "sys",
    maxOutputTokens: 256,
  });
  assert.deepEqual(payload, { prompt: "x", systemInstruction: "sys", maxOutputTokens: 256 });
});

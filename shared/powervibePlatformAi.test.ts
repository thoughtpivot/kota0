import assert from "node:assert/strict";
import test from "node:test";
import { buildPowervibePlatformAiRequestPayload } from "@shared/powervibePlatformAi.ts";

test("buildPowervibePlatformAiRequestPayload rejects a bare prompt string (strict JSON hazard)", () => {
  assert.throws(
    () => buildPowervibePlatformAiRequestPayload("hello"),
    /powervibe_platform_ai_invalid_body/,
  );
});

test("buildPowervibePlatformAiRequestPayload rejects empty prompt", () => {
  assert.throws(
    () => buildPowervibePlatformAiRequestPayload({ prompt: "   " }),
    /non-empty/,
  );
});

test("buildPowervibePlatformAiRequestPayload returns object that serializes as JSON object", () => {
  const payload = buildPowervibePlatformAiRequestPayload({ prompt: " hi " });
  const wire = JSON.stringify(payload);
  assert.ok(wire.trimStart().startsWith("{"), `expected object JSON, got: ${wire.slice(0, 20)}`);
  assert.deepEqual(payload, { prompt: "hi" });
});

test("buildPowervibePlatformAiRequestPayload preserves optional fields", () => {
  const payload = buildPowervibePlatformAiRequestPayload({
    prompt: "x",
    systemInstruction: "sys",
    maxOutputTokens: 256,
  });
  assert.deepEqual(payload, { prompt: "x", systemInstruction: "sys", maxOutputTokens: 256 });
});

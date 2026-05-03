import assert from "node:assert/strict";
import test from "node:test";
import {
  POWERVIBE_PLATFORM_AI_MAX_INPUT_BYTES,
  validatePowervibePlatformAiPayload,
} from "@/components/powervibe/ai/powervibeWorkspaceAiCompletion";

test("validatePowervibePlatformAiPayload rejects non-object body", () => {
  const r = validatePowervibePlatformAiPayload(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validatePowervibePlatformAiPayload rejects empty prompt", () => {
  const r = validatePowervibePlatformAiPayload({ prompt: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validatePowervibePlatformAiPayload accepts prompt only", () => {
  const r = validatePowervibePlatformAiPayload({ prompt: "hello" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.prompt, "hello");
});

test("validatePowervibePlatformAiPayload rejects oversized input", () => {
  const big = "x".repeat(POWERVIBE_PLATFORM_AI_MAX_INPUT_BYTES + 1);
  const r = validatePowervibePlatformAiPayload({ prompt: big });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "payload_too_large");
});

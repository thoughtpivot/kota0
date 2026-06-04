import assert from "node:assert/strict";
import test from "node:test";
import {
  K0_PLATFORM_AI_MAX_INPUT_BYTES,
  validatePlatformAiPayload,
} from "@/components/kota0/ai/provider/workspaceAiCompletion";

test("validatePlatformAiPayload rejects non-object body", () => {
  const r = validatePlatformAiPayload(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validatePlatformAiPayload rejects empty prompt", () => {
  const r = validatePlatformAiPayload({ prompt: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validatePlatformAiPayload accepts prompt only", () => {
  const r = validatePlatformAiPayload({ prompt: "hello" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.prompt, "hello");
});

test("validatePlatformAiPayload rejects oversized input", () => {
  const big = "x".repeat(K0_PLATFORM_AI_MAX_INPUT_BYTES + 1);
  const r = validatePlatformAiPayload({ prompt: big });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "payload_too_large");
});

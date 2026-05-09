import assert from "node:assert/strict";
import test from "node:test";
import {
  K0_PLATFORM_AI_MAX_INPUT_BYTES,
  validateKota0PlatformAiPayload,
} from "@/components/kota0/ai/kota0WorkspaceAiCompletion";

test("validateKota0PlatformAiPayload rejects non-object body", () => {
  const r = validateKota0PlatformAiPayload(null);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validateKota0PlatformAiPayload rejects empty prompt", () => {
  const r = validateKota0PlatformAiPayload({ prompt: "   " });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "bad_body");
});

test("validateKota0PlatformAiPayload accepts prompt only", () => {
  const r = validateKota0PlatformAiPayload({ prompt: "hello" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.prompt, "hello");
});

test("validateKota0PlatformAiPayload rejects oversized input", () => {
  const big = "x".repeat(K0_PLATFORM_AI_MAX_INPUT_BYTES + 1);
  const r = validateKota0PlatformAiPayload({ prompt: big });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "payload_too_large");
});

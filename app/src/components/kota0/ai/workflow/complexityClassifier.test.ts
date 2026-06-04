import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT,
  resolveClassifierTimeoutMs,
  resolveClassifierModelId,
} from "@/components/kota0/ai/workflow/complexityClassifier";

describe("resolveClassifierTimeoutMs", () => {
  const prev = process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;
    else process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = prev;
  });

  it("defaults to 4000ms", () => {
    delete process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;
    assert.equal(resolveClassifierTimeoutMs(), KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT);
  });

  it("honors env override within bounds", () => {
    process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = "8000";
    assert.equal(resolveClassifierTimeoutMs(), 8000);
  });

  it("falls back when env is too low", () => {
    process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = "100";
    assert.equal(resolveClassifierTimeoutMs(), KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT);
  });
});

describe("resolveClassifierModelId", () => {
  const prev = process.env.K0_AI_CLASSIFIER_MODEL;

  afterEach(() => {
    if (prev === undefined) delete process.env.K0_AI_CLASSIFIER_MODEL;
    else process.env.K0_AI_CLASSIFIER_MODEL = prev;
  });

  it("defaults to flash-lite", () => {
    delete process.env.K0_AI_CLASSIFIER_MODEL;
    assert.equal(resolveClassifierModelId(), "gemini-2.5-flash-lite");
  });
});

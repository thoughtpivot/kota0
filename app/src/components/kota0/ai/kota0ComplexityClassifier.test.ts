import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT,
  resolveKota0ClassifierTimeoutMs,
  resolveKota0ClassifierModelId,
} from "@/components/kota0/ai/kota0ComplexityClassifier";

describe("resolveKota0ClassifierTimeoutMs", () => {
  const prev = process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;

  afterEach(() => {
    if (prev === undefined) delete process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;
    else process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = prev;
  });

  it("defaults to 4000ms", () => {
    delete process.env.K0_AI_CLASSIFIER_TIMEOUT_MS;
    assert.equal(resolveKota0ClassifierTimeoutMs(), KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT);
  });

  it("honors env override within bounds", () => {
    process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = "8000";
    assert.equal(resolveKota0ClassifierTimeoutMs(), 8000);
  });

  it("falls back when env is too low", () => {
    process.env.K0_AI_CLASSIFIER_TIMEOUT_MS = "100";
    assert.equal(resolveKota0ClassifierTimeoutMs(), KOTA0_CLASSIFIER_TIMEOUT_MS_DEFAULT);
  });
});

describe("resolveKota0ClassifierModelId", () => {
  const prev = process.env.K0_AI_CLASSIFIER_MODEL;

  afterEach(() => {
    if (prev === undefined) delete process.env.K0_AI_CLASSIFIER_MODEL;
    else process.env.K0_AI_CLASSIFIER_MODEL = prev;
  });

  it("defaults to flash-lite", () => {
    delete process.env.K0_AI_CLASSIFIER_MODEL;
    assert.equal(resolveKota0ClassifierModelId(), "gemini-2.5-flash-lite");
  });
});

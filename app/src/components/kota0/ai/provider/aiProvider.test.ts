import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAiProvider,
  resolveAiModelId,
  resolveAiMode,
  aiModelDescription,
} from "@/components/kota0/ai/provider/aiProvider";

function withEnv(patch: Record<string, string | undefined>, fn: () => void): void {
  const prior: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prior[k] = process.env[k];
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(patch)) {
      if (prior[k] === undefined) delete process.env[k];
      else process.env[k] = prior[k];
    }
  }
}

describe("resolveAiProvider", () => {
  it("defaults to google when K0_AI_PROVIDER is unset", () => {
    withEnv({ K0_AI_PROVIDER: undefined }, () => {
      assert.equal(resolveAiProvider(), "google");
    });
  });

  it("accepts explicit google", () => {
    withEnv({ K0_AI_PROVIDER: "google" }, () => {
      assert.equal(resolveAiProvider(), "google");
    });
  });

  it("throws on unsupported providers", () => {
    withEnv({ K0_AI_PROVIDER: "anthropic" }, () => {
      assert.throws(() => resolveAiProvider(), /not supported yet/);
    });
  });
});

describe("resolveAiModelId", () => {
  it("prefers K0_AI_MODEL when set", () => {
    withEnv({ K0_AI_MODEL: "gemini-3-pro-preview", GEMINI_MODEL: "gemini-2.5-flash" }, () => {
      assert.equal(resolveAiModelId(), "gemini-3-pro-preview");
    });
  });

  it("falls back to GEMINI_MODEL for back-compat", () => {
    withEnv({ K0_AI_MODEL: undefined, GEMINI_MODEL: "gemini-2.5-pro" }, () => {
      assert.equal(resolveAiModelId(), "gemini-2.5-pro");
    });
  });

  it("falls back to DEFAULT_GEMINI_MODEL when neither env var is set", () => {
    withEnv({ K0_AI_MODEL: undefined, GEMINI_MODEL: undefined }, () => {
      const id = resolveAiModelId();
      assert.ok(id.startsWith("gemini-"), `expected a gemini default, got: ${id}`);
    });
  });
});

describe("resolveAiMode", () => {
  it("defaults to oneshot when K0_AI_MODE is unset", () => {
    withEnv({ K0_AI_MODE: undefined }, () => {
      assert.equal(resolveAiMode(), "oneshot");
    });
  });

  it("returns agentic when K0_AI_MODE=agentic", () => {
    withEnv({ K0_AI_MODE: "agentic" }, () => {
      assert.equal(resolveAiMode(), "agentic");
    });
  });

  it("is case- and whitespace-tolerant", () => {
    withEnv({ K0_AI_MODE: "  AGENTIC  " }, () => {
      assert.equal(resolveAiMode(), "agentic");
    });
  });

  it("falls back to oneshot for any unrecognized value", () => {
    withEnv({ K0_AI_MODE: "turbo" }, () => {
      assert.equal(resolveAiMode(), "oneshot");
    });
  });
});

describe("aiModelDescription", () => {
  it("returns provider + modelId without requiring the API key", () => {
    withEnv({ K0_AI_PROVIDER: "google", K0_AI_MODEL: "gemini-test-fixture" }, () => {
      const d = aiModelDescription();
      assert.equal(d.provider, "google");
      assert.equal(d.modelId, "gemini-test-fixture");
    });
  });
});

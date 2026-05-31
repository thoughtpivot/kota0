import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveKota0AiProvider,
  resolveKota0AiModelId,
  resolveKota0AiMode,
  kota0AiModelDescription,
} from "@/components/kota0/ai/kota0AiProvider";

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

describe("resolveKota0AiProvider", () => {
  it("defaults to google when K0_AI_PROVIDER is unset", () => {
    withEnv({ K0_AI_PROVIDER: undefined }, () => {
      assert.equal(resolveKota0AiProvider(), "google");
    });
  });

  it("accepts explicit google", () => {
    withEnv({ K0_AI_PROVIDER: "google" }, () => {
      assert.equal(resolveKota0AiProvider(), "google");
    });
  });

  it("throws on unsupported providers", () => {
    withEnv({ K0_AI_PROVIDER: "anthropic" }, () => {
      assert.throws(() => resolveKota0AiProvider(), /not supported yet/);
    });
  });
});

describe("resolveKota0AiModelId", () => {
  it("prefers K0_AI_MODEL when set", () => {
    withEnv({ K0_AI_MODEL: "gemini-3-pro-preview", GEMINI_MODEL: "gemini-2.5-flash" }, () => {
      assert.equal(resolveKota0AiModelId(), "gemini-3-pro-preview");
    });
  });

  it("falls back to GEMINI_MODEL for back-compat", () => {
    withEnv({ K0_AI_MODEL: undefined, GEMINI_MODEL: "gemini-2.5-pro" }, () => {
      assert.equal(resolveKota0AiModelId(), "gemini-2.5-pro");
    });
  });

  it("falls back to DEFAULT_GEMINI_MODEL when neither env var is set", () => {
    withEnv({ K0_AI_MODEL: undefined, GEMINI_MODEL: undefined }, () => {
      const id = resolveKota0AiModelId();
      assert.ok(id.startsWith("gemini-"), `expected a gemini default, got: ${id}`);
    });
  });
});

describe("resolveKota0AiMode", () => {
  it("defaults to oneshot when K0_AI_MODE is unset", () => {
    withEnv({ K0_AI_MODE: undefined }, () => {
      assert.equal(resolveKota0AiMode(), "oneshot");
    });
  });

  it("returns agentic when K0_AI_MODE=agentic", () => {
    withEnv({ K0_AI_MODE: "agentic" }, () => {
      assert.equal(resolveKota0AiMode(), "agentic");
    });
  });

  it("is case- and whitespace-tolerant", () => {
    withEnv({ K0_AI_MODE: "  AGENTIC  " }, () => {
      assert.equal(resolveKota0AiMode(), "agentic");
    });
  });

  it("falls back to oneshot for any unrecognized value", () => {
    withEnv({ K0_AI_MODE: "turbo" }, () => {
      assert.equal(resolveKota0AiMode(), "oneshot");
    });
  });
});

describe("kota0AiModelDescription", () => {
  it("returns provider + modelId without requiring the API key", () => {
    withEnv({ K0_AI_PROVIDER: "google", K0_AI_MODEL: "gemini-test-fixture" }, () => {
      const d = kota0AiModelDescription();
      assert.equal(d.provider, "google");
      assert.equal(d.modelId, "gemini-test-fixture");
    });
  });
});

const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = "test";

const FIXTURE = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "fixtures/api.json"), "utf8")
);

/**
 * The module memoizes a singleton at require time and reads the committed
 * pricing.json snapshot. Tests redirect that file to the fixture so lookup
 * behavior is deterministic and independent from the live snapshot.
 */
function freshInstance() {
  const { ModelPricing } = require("../../../../utils/helpers/modelPricing");
  ModelPricing.instance = null;
  return new ModelPricing();
}

describe("ModelPricing", () => {
  const originalReadFileSync = fs.readFileSync.bind(fs);

  beforeAll(() => {
    jest.spyOn(fs, "readFileSync").mockImplementation((filePath, ...args) => {
      if (String(filePath).endsWith("pricing.json"))
        return JSON.stringify(FIXTURE);
      return originalReadFileSync(filePath, ...args);
    });
  });

  beforeEach(() => {
    jest.resetModules();
  });

  describe("static snapshot loading", () => {
    it("loads the committed snapshot and serves known costs", () => {
      const pricing = freshInstance();

      expect(
        pricing.getCostBreakdown("openai", "gpt-4o", {
          prompt_tokens: 1_000_000,
          completion_tokens: 0,
        })
      ).toEqual({ inputCost: 2.5, outputCost: 0, totalCost: 2.5 });
    });

    it("reuses the in-memory singleton after first load", () => {
      const first = freshInstance();
      const { ModelPricing } = require("../../../../utils/helpers/modelPricing");

      expect(new ModelPricing()).toBe(first);
    });

    it("slims absent and null cost entries while keeping zero costs", () => {
      const pricing = freshInstance();

      expect(
        pricing.getCostBreakdown("openai", "gpt-oss-free", {
          prompt_tokens: 1000,
          completion_tokens: 1000,
        })
      ).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0 });
      expect(
        pricing.getCostBreakdown("openai", "gpt-subscription-only", {
          prompt_tokens: 1000,
        })
      ).toBeNull();
      expect(
        pricing.getCostBreakdown("openrouter", "some-model", {
          prompt_tokens: 1000,
        })
      ).toBeNull();
    });
  });

  describe("getCostBreakdown", () => {
    let pricing;

    beforeEach(() => {
      pricing = freshInstance();
    });

    it("computes exact input/output/total costs", () => {
      expect(
        pricing.getCostBreakdown("openai", "gpt-4o-mini", {
          prompt_tokens: 1000,
          completion_tokens: 500,
        })
      ).toEqual({
        inputCost: (1000 / 1_000_000) * 0.15,
        outputCost: (500 / 1_000_000) * 0.6,
        totalCost: (1000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.6,
      });
    });

    it("returns zeros for local/self-hosted providers without a lookup", () => {
      for (const slug of ["ollama", "lmstudio", "koboldcpp"]) {
        expect(
          pricing.getCostBreakdown(slug, "whatever-model", {
            prompt_tokens: 1000,
            completion_tokens: 1000,
          })
        ).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0 });
      }
    });

    it("returns zeros for a model with published zero pricing", () => {
      expect(
        pricing.getCostBreakdown("openai", "gpt-oss-free", {
          prompt_tokens: 1000,
          completion_tokens: 1000,
        })
      ).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0 });
    });

    it("returns null for unknown pricing", () => {
      // Unmapped provider slug
      expect(pricing.getCostBreakdown("generic-openai", "gpt-4o")).toBeNull();
      // Unknown model on a known provider
      expect(pricing.getCostBreakdown("openai", "not-a-model")).toBeNull();
      // Model whose upstream cost is null (slimmed away)
      expect(pricing.getCostBreakdown("openrouter", "some-model")).toBeNull();
      // Model with no published pricing (slimmed away)
      expect(
        pricing.getCostBreakdown("openai", "gpt-subscription-only")
      ).toBeNull();
      // No provider at all
      expect(pricing.getCostBreakdown(null, "gpt-4o")).toBeNull();
    });

    it("matches model ids case-insensitively", () => {
      expect(
        pricing.getCostBreakdown("openai", "GPT-4o", {
          prompt_tokens: 1_000_000,
        })
      ).toEqual({ inputCost: 2.5, outputCost: 0, totalCost: 2.5 });
    });

    it("normalizes bedrock region prefixes and version suffixes", () => {
      // Region-prefixed user config matches the unprefixed dataset key,
      // never the differently-priced eu. variant.
      expect(
        pricing.getCostBreakdown(
          "bedrock",
          "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
          { prompt_tokens: 1_000_000 }
        )
      ).toEqual({ inputCost: 3, outputCost: 0, totalCost: 3 });
      expect(
        pricing.getCostBreakdown(
          "bedrock",
          "anthropic.claude-sonnet-4-5-20250929",
          { prompt_tokens: 1_000_000 }
        )
      ).toEqual({ inputCost: 3, outputCost: 0, totalCost: 3 });
    });

    it("applies long-context tier pricing above the tier threshold", () => {
      expect(
        pricing.getCostBreakdown("gemini", "gemini-tiered", {
          prompt_tokens: 100_000,
          completion_tokens: 1000,
        })
      ).toEqual({
        inputCost: (100_000 / 1_000_000) * 1.25,
        outputCost: (1000 / 1_000_000) * 10,
        totalCost: (100_000 / 1_000_000) * 1.25 + (1000 / 1_000_000) * 10,
      });
      expect(
        pricing.getCostBreakdown("gemini", "gemini-tiered", {
          prompt_tokens: 300_000,
          completion_tokens: 1000,
        })
      ).toEqual({
        inputCost: (300_000 / 1_000_000) * 2.5,
        outputCost: (1000 / 1_000_000) * 15,
        totalCost: (300_000 / 1_000_000) * 2.5 + (1000 / 1_000_000) * 15,
      });
    });

    it("applies legacy context_over_200k pricing when no tiers exist", () => {
      expect(
        pricing.getCostBreakdown("gemini", "gemini-legacy-200k", {
          prompt_tokens: 300_000,
          completion_tokens: 0,
        })
      ).toEqual({ inputCost: (300_000 / 1_000_000) * 2, outputCost: 0, totalCost: (300_000 / 1_000_000) * 2 });
    });

    it("clamps negative and non-finite token counts to zero cost", () => {
      // A provider misreporting counts must never produce a negative or
      // infinite dollar amount.
      expect(
        pricing.getCostBreakdown("openai", "gpt-4o", {
          prompt_tokens: -100_000,
          completion_tokens: -50_000,
        })
      ).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0 });
      expect(
        pricing.getCostBreakdown("openai", "gpt-4o", {
          prompt_tokens: Infinity,
          completion_tokens: NaN,
        })
      ).toEqual({ inputCost: 0, outputCost: 0, totalCost: 0 });
    });

    it("treats malformed usage payloads as zero tokens for a known model", () => {
      for (const usage of [
        undefined,
        null,
        "not-usage",
        [1, 2],
        { prompt_tokens: "junk", completion_tokens: { nested: 5 } },
      ]) {
        expect(pricing.getCostBreakdown("openai", "gpt-4o", usage)).toEqual({
          inputCost: 0,
          outputCost: 0,
          totalCost: 0,
        });
      }
    });

    it("coerces numeric-string token counts instead of dropping them", () => {
      expect(
        pricing.getCostBreakdown("openai", "gpt-4o", {
          prompt_tokens: "1000000",
          completion_tokens: "0",
        })
      ).toEqual({ inputCost: 2.5, outputCost: 0, totalCost: 2.5 });
    });

    it("ignores malformed tier entries and falls back to base rates", () => {
      expect(
        pricing.getCostBreakdown("gemini", "gemini-garbage-tiers", {
          prompt_tokens: 1_000_000,
          completion_tokens: 0,
        })
      ).toEqual({ inputCost: 1, outputCost: 0, totalCost: 1 });
    });

    it("degrades a corrupt applicable tier to unknown, never a wrong price", () => {
      // The tier applies (prompt > size) but its rate is garbage - report
      // no cost rather than a number computed from junk.
      expect(
        pricing.getCostBreakdown("gemini", "gemini-corrupt-tier", {
          prompt_tokens: 1_000_000,
          completion_tokens: 0,
        })
      ).toBeNull();
    });

    it("resolves openrouter vendor/model ids directly", () => {
      expect(
        pricing.getCostBreakdown("openrouter", "anthropic/claude-sonnet-4.5", {
          prompt_tokens: 1_000_000,
          completion_tokens: 0,
        })
      ).toEqual({ inputCost: 3, outputCost: 0, totalCost: 3 });
    });

    it("returns null when model is a non-string type", () => {
      for (const model of [123, {}, [], true, 0]) {
        expect(
          pricing.getCostBreakdown("openai", model, {
            prompt_tokens: 1000,
            completion_tokens: 0,
          })
        ).toBeNull();
      }
    });

    it("returns null when providerSlug is a non-string type", () => {
      for (const slug of [123, true, {}, []]) {
        expect(
          pricing.getCostBreakdown(slug, "gpt-4o", {
            prompt_tokens: 1000,
            completion_tokens: 0,
          })
        ).toBeNull();
      }
    });

    it("handles extremely large token counts without Infinity or NaN", () => {
      const result = pricing.getCostBreakdown("openai", "gpt-4o", {
        prompt_tokens: Number.MAX_SAFE_INTEGER,
        completion_tokens: Number.MAX_SAFE_INTEGER,
      });
      expect(result).not.toBeNull();
      expect(Number.isFinite(result.inputCost)).toBe(true);
      expect(Number.isFinite(result.outputCost)).toBe(true);
      expect(Number.isFinite(result.totalCost)).toBe(true);
    });

    it("rounds costs to avoid floating-point artifacts", () => {
      const result = pricing.getCostBreakdown("openai", "gpt-4o-mini", {
        prompt_tokens: 522,
        completion_tokens: 11,
      });
      const asString = JSON.stringify(result);
      expect(asString).not.toMatch(/\d{10,}/);
      expect(asString).not.toMatch(/e[+-]/);
    });
  });

  describe("addCostToMetrics", () => {
    beforeEach(() => {
      freshInstance();
    });

    it("decorates metrics when pricing is known", () => {
      const {
        addCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing");
      const metrics = {
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        model: "gpt-4o",
      };
      expect(addCostToMetrics(metrics, { provider: "openai" })).toEqual({
        ...metrics,
        inputCost: 2.5,
        outputCost: 0,
        totalCost: 2.5,
      });
    });

    it("prefers an explicitly passed model over metrics.model", () => {
      const {
        addCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing");
      const decorated = addCostToMetrics(
        { prompt_tokens: 1_000_000, completion_tokens: 0, model: "gpt-4o" },
        { provider: "openai", model: "gpt-4o-mini" }
      );
      expect(decorated.inputCost).toBe(0.15);
    });

    it("returns metrics unchanged when pricing is unknown", () => {
      const {
        addCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing");
      const metrics = {
        prompt_tokens: 100,
        completion_tokens: 10,
        model: "some-local-model",
      };
      expect(
        addCostToMetrics(metrics, { provider: "generic-openai" })
      ).toEqual(metrics);
      expect(addCostToMetrics({}, { provider: "openai" })).toEqual({});
    });

    it("passes non-object metrics through untouched without crashing", () => {
      const {
        addCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing");
      for (const metrics of [null, "metrics", 42]) {
        expect(() =>
          addCostToMetrics(metrics, { provider: "openai" })
        ).not.toThrow();
        expect(addCostToMetrics(metrics, { provider: "openai" })).toBe(metrics);
      }
      // undefined falls back to the default parameter and comes back empty
      expect(addCostToMetrics(undefined, { provider: "openai" })).toEqual({});
    });

    it("does not mutate the metrics object it was given", () => {
      const {
        addCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing");
      const metrics = {
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        model: "gpt-4o",
      };
      const decorated = addCostToMetrics(metrics, { provider: "openai" });
      expect(decorated).not.toBe(metrics);
      expect(metrics).not.toHaveProperty("totalCost");
    });
  });

  describe("addChatCostToMetrics provider/model resolution", () => {
    const METRICS = {
      prompt_tokens: 1_000_000,
      completion_tokens: 0,
      model: "gpt-4o",
    };
    let addChatCostToMetrics;
    const originalLLMProvider = process.env.LLM_PROVIDER;

    beforeEach(() => {
      freshInstance();
      ({
        addChatCostToMetrics,
      } = require("../../../../utils/helpers/modelPricing"));
      delete process.env.LLM_PROVIDER;
    });

    afterEach(() => {
      if (originalLLMProvider === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = originalLLMProvider;
    });

    it("prefers the router delegate over workspace and env settings", () => {
      process.env.LLM_PROVIDER = "anthropic";
      const decorated = addChatCostToMetrics(METRICS, {
        routingMetadata: {
          routedTo: { provider: "openai", model: "gpt-4o-mini" },
        },
        workspace: { chatProvider: "generic-openai" },
        connector: { model: "gpt-4o" },
      });
      // gpt-4o-mini's rate, not gpt-4o's - both provider and model came
      // from the router delegate.
      expect(decorated.inputCost).toBe(0.15);
    });

    it("falls back to the workspace provider and connector model", () => {
      const decorated = addChatCostToMetrics(METRICS, {
        workspace: { chatProvider: "openai" },
        connector: { model: "gpt-4o-mini" },
      });
      expect(decorated.inputCost).toBe(0.15);
    });

    it("falls back to the env provider and metrics.model last", () => {
      process.env.LLM_PROVIDER = "openai";
      const decorated = addChatCostToMetrics(METRICS, {});
      expect(decorated).toEqual({
        ...METRICS,
        inputCost: 2.5,
        outputCost: 0,
        totalCost: 2.5,
      });
    });

    it("returns metrics unchanged when no provider can be resolved", () => {
      expect(addChatCostToMetrics(METRICS, {})).toEqual(METRICS);
      expect(
        addChatCostToMetrics(METRICS, {
          routingMetadata: { routedTo: null },
          workspace: { chatProvider: null },
          connector: null,
        })
      ).toEqual(METRICS);
    });
  });
});

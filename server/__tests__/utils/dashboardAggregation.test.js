/* eslint-env jest, node */
jest.mock("../../utils/helpers/modelPricing", () => ({
  MODEL_PRICING: {
    getCostBreakdown: jest.fn(),
  },
}));

const { MODEL_PRICING } = require("../../utils/helpers/modelPricing");
const {
  computeUsage,
  computeFeedback,
  computeCosts,
} = require("../../utils/dashboard");

describe("dashboard aggregation", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns zero usage for no chats", () => {
    expect(computeUsage([])).toEqual({
      conversations: 0,
      messages: 0,
      activeUsers: 0,
      lastActivityAt: null,
      byDay: [],
    });
  });

  it("aggregates feedback by score and category", () => {
    const chats = [
      { feedbackScore: true, feedbackCategory: null },
      { feedbackScore: false, feedbackCategory: "informacao_incorreta" },
      { feedbackScore: false, feedbackCategory: "informacao_incorreta" },
      { feedbackScore: false, feedbackCategory: "outro" },
      { feedbackScore: null, feedbackCategory: null },
    ];

    expect(computeFeedback(chats)).toEqual({
      total: 4,
      positive: 1,
      negative: 3,
      positiveRate: 0.25,
      byCategory: {
        informacao_incorreta: 2,
        informacao_desatualizada: 0,
        nao_encontrou_resposta: 0,
        resposta_confusa: 0,
        outro: 1,
      },
    });
  });

  it("returns zero feedback categories for no feedback", () => {
    expect(computeFeedback([{ feedbackScore: null }])).toEqual({
      total: 0,
      positive: 0,
      negative: 0,
      positiveRate: 0,
      byCategory: {
        informacao_incorreta: 0,
        informacao_desatualizada: 0,
        nao_encontrou_resposta: 0,
        resposta_confusa: 0,
        outro: 0,
      },
    });
  });

  it("aggregates cost by model using current pricing", () => {
    const chat = {
      workspaceId: 7,
      response: JSON.stringify({
        metrics: {
          provider: "OpenAiLLM",
          model: "gpt-4o",
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      }),
    };
    MODEL_PRICING.getCostBreakdown.mockReturnValue({
      inputCost: 0.001,
      outputCost: 0.002,
      totalCost: 0.003,
    });

    const result = computeCosts(
      [chat],
      {
        workspaces: [
          { id: 7, chatProvider: "openai", chatModel: "gpt-4o" },
        ],
        pricing: MODEL_PRICING,
      }
    );

    expect(MODEL_PRICING.getCostBreakdown).toHaveBeenCalledWith(
      "openai",
      "gpt-4o",
      { prompt_tokens: 100, completion_tokens: 50 }
    );
    expect(result).toEqual({
      totalUsd: 0.003,
      byModel: [
        {
          model: "gpt-4o",
          calls: 1,
          inputTokens: 100,
          outputTokens: 50,
          costUsd: 0.003,
        },
      ],
    });
  });

  it("keeps calls and tokens when pricing is unknown", () => {
    const chat = {
      workspaceId: 7,
      response: JSON.stringify({
        metrics: {
          provider: "OpenAiLLM",
          model: "gpt-4o",
          prompt_tokens: 10,
          completion_tokens: 20,
        },
      }),
    };
    MODEL_PRICING.getCostBreakdown.mockReturnValue(null);

    const result = computeCosts([chat], {
      workspaces: [],
      pricing: MODEL_PRICING,
    });

    expect(result).toEqual({
      totalUsd: 0,
      byModel: [
        {
          model: "gpt-4o",
          calls: 1,
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0,
        },
      ],
    });
  });

  it("returns no models for no chats", () => {
    expect(computeCosts([], { workspaces: [], pricing: MODEL_PRICING })).toEqual({
      totalUsd: 0,
      byModel: [],
    });
  });
});

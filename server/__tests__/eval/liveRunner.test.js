/* eslint-env jest, node */
jest.mock("../../models/evalDataset", () => ({
  EvalDataset: { get: jest.fn() },
  EvalQuestion: {},
}));
jest.mock("../../models/evalRun", () => ({
  EvalResult: { create: jest.fn() },
  EvalRun: {
    get: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
    fail: jest.fn(),
  },
}));
jest.mock("../../utils/observability/ai", () => ({
  recordEvalRun: jest.fn(),
  recordEvalQuestion: jest.fn(),
  recordEvalLatency: jest.fn(),
}));

const { EvalDataset } = require("../../models/evalDataset");
const { EvalResult, EvalRun } = require("../../models/evalRun");
const { runEval } = require("../../utils/evalRunner");
const { liveEvalEnabled } = require("../../utils/evalLiveRunner");

const questions = [
  {
    id: "question-1",
    question: "Qual o horário?",
    expectedAnswer: "08h às 18h",
    expectedSource: "cardapio.pdf",
  },
  {
    id: "question-2",
    question: "Qual o telefone?",
    expectedAnswer: "(11) 99999-9999",
    expectedSource: "contato.pdf",
  },
];

function liveServices() {
  return {
    embed: jest.fn(async () => ({ vector: [0.1, 0.2] })),
    vectorSearch: jest.fn(async ({ question, company }) => ({
      sources:
        question.id === "question-2"
          ? []
          : [{ filename: question.expectedSource, score: 0.9 }],
      latencyMs: 3,
      company,
    })),
    generate: jest.fn(async ({ question, sources }) => ({
      text: sources.length
        ? `${question.expectedAnswer}\n\nFonte: ${question.expectedSource}`
        : "Não encontrei resposta.",
      costUsd: 0.01,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    })),
  };
}

describe("live eval runner", () => {
  beforeEach(() => jest.clearAllMocks());

  test("runs with injected providers and saves live metrics", async () => {
    EvalRun.get.mockResolvedValue({
      id: "run-live",
      datasetId: "dataset-live",
      organizationId: "org-1",
      configSnapshot: { topK: 4 },
    });
    EvalDataset.get.mockResolvedValue({
      id: "dataset-live",
      company: "restaurante-a",
      questions,
    });
    EvalRun.start.mockResolvedValue({ id: "run-live", status: "running" });
    EvalRun.complete.mockResolvedValue({ id: "run-live", status: "completed" });
    EvalResult.create.mockImplementation(async (data) => ({
      result: data,
      error: null,
    }));
    const services = liveServices();

    const result = await runEval({
      runId: "run-live",
      config: { topK: 4 },
      mode: "live",
      services,
    });

    expect(result.ok).toBe(true);
    expect(services.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ company: "restaurante-a" })
    );
    expect(EvalResult.create.mock.calls[0][0]).toMatchObject({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      retrievalAccuracy: true,
    });
    expect(result.metrics).toMatchObject({
      retrievalAccuracy: 0.5,
      answerCorrectness: 0.5,
      citationCorrectness: 0.5,
      totalCostUsd: 0.02,
      totalTokens: 30,
      latencyP50Ms: expect.any(Number),
      latencyP95Ms: expect.any(Number),
    });
    expect(EvalRun.complete).toHaveBeenCalledWith(
      "run-live",
      expect.objectContaining({
        totalQuestions: 2,
        metrics: expect.objectContaining({ latencyP95Ms: expect.any(Number) }),
      })
    );
  });

  test("tracks live mode from EVAL_LIVE env", () => {
    process.env.EVAL_LIVE = "true";
    expect(liveEvalEnabled()).toBe(true);
    process.env.EVAL_LIVE = "false";
    expect(liveEvalEnabled()).toBe(false);
  });

  test("keeps mock mode as the default", async () => {
    EvalRun.get.mockResolvedValue({
      id: "run-mock",
      datasetId: "dataset-mock",
      organizationId: "org-1",
      configSnapshot: { topK: 4 },
    });
    EvalDataset.get.mockResolvedValue({
      id: "dataset-mock",
      questions,
    });
    EvalRun.start.mockResolvedValue({ id: "run-mock", status: "running" });
    EvalRun.complete.mockResolvedValue({ id: "run-mock", status: "completed" });
    EvalResult.create.mockImplementation(async (data) => ({
      result: data,
      error: null,
    }));
    delete process.env.EVAL_LIVE;

    const result = await runEval({
      runId: "run-mock",
      config: { topK: 4 },
    });

    expect(result.ok).toBe(true);
    expect(result.metrics.totalCostUsd).toBeCloseTo(0.002);
  });
});

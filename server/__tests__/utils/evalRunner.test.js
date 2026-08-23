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

const questions = [
  {
    id: "question-1",
    question: "Qual o horário?",
    expectedAnswer: "08h às 18h",
    expectedSource: "cardapio.pdf",
  },
  {
    id: "question-2",
    question: "Qual o endereço?",
    expectedAnswer: "Rua A, 10",
    expectedSource: "endereco.pdf",
  },
  {
    id: "question-3",
    question: "Qual o telefone?",
    expectedAnswer: "(11) 99999-9999",
    expectedSource: "contato.pdf",
  },
];

describe("evalRunner", () => {
  beforeEach(() => jest.clearAllMocks());

  test("runs a dataset and computes aggregate metrics", async () => {
    EvalRun.get.mockResolvedValue({
      id: "run-1",
      datasetId: "dataset-1",
      organizationId: "org-1",
      configSnapshot: { topK: 4 },
    });
    EvalDataset.get.mockResolvedValue({
      id: "dataset-1",
      questions,
    });
    EvalRun.start.mockResolvedValue({ id: "run-1", status: "running" });
    EvalRun.complete.mockResolvedValue({ id: "run-1", status: "completed" });
    EvalResult.create.mockImplementation(async (data) => ({
      result: data,
      error: null,
    }));

    const result = await runEval({
      runId: "run-1",
      config: { topK: 4 },
      mocks: {
        embed: jest.fn(async () => ({ vector: [0.1, 0.2] })),
        vectorSearch: jest.fn(async ({ question }) => ({
          sources:
            question.id === "question-3"
              ? []
              : [{ filename: question.expectedSource, score: 0.9 }],
        })),
        generate: jest.fn(async ({ question, sources }) => ({
          text: sources.length
            ? `${question.expectedAnswer}\n\nFonte: ${question.expectedSource}`
            : "Não encontrei resposta.",
          costUsd: 0.01,
        })),
      },
    });

    expect(result.ok).toBe(true);
    expect(EvalResult.create).toHaveBeenCalledTimes(3);
    expect(EvalResult.create.mock.calls[0][0]).toMatchObject({
      retrievalAccuracy: true,
      answerCorrectness: true,
      citationCorrectness: true,
    });
    expect(EvalResult.create.mock.calls[2][0]).toMatchObject({
      retrievalAccuracy: false,
      answerCorrectness: false,
      citationCorrectness: false,
    });
    expect(result.metrics.retrievalAccuracy).toBeCloseTo(2 / 3);
    expect(result.metrics.answerCorrectness).toBeCloseTo(2 / 3);
    expect(result.metrics.citationCorrectness).toBeCloseTo(2 / 3);
    expect(result.metrics.totalCostUsd).toBeCloseTo(0.03);
    expect(EvalRun.complete).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({
        totalQuestions: 3,
        metrics: expect.objectContaining({ avgLatencyMs: expect.any(Number) }),
      })
    );
  });

  test("marks the run failed when the dataset is missing", async () => {
    EvalRun.get.mockResolvedValue({ id: "run-1", datasetId: "dataset-1" });
    EvalDataset.get.mockResolvedValue(null);
    const result = await runEval({ runId: "run-1" });
    expect(result.ok).toBe(false);
    expect(EvalRun.fail).toHaveBeenCalledWith(
      "run-1",
      "Evaluation dataset not found."
    );
  });
});

/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  eval_run: {
    create: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  eval_result: {
    create: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { EvalResult, EvalRun } = require("../../models/evalRun");

const run = {
  id: "run-1",
  datasetId: "dataset-1",
  organizationId: "org-1",
  status: "pending",
  configSnapshot: { topK: 4 },
};

describe("evalRun model", () => {
  beforeEach(() => jest.clearAllMocks());

  test("creates a pending run", async () => {
    prisma.eval_run.create.mockResolvedValue(run);
    const result = await EvalRun.create({
      datasetId: "dataset-1",
      organizationId: "org-1",
      configSnapshot: { topK: 4 },
    });
    expect(result.error).toBeNull();
    expect(prisma.eval_run.create).toHaveBeenCalledWith({
      data: {
        datasetId: "dataset-1",
        organizationId: "org-1",
        configSnapshot: { topK: 4 },
        status: "pending",
      },
    });
  });

  test("gets a run with results and questions", async () => {
    prisma.eval_run.findUnique.mockResolvedValue({
      ...run,
      results: [{ id: "result-1", question: { question: "Qual o horário?" } }],
    });
    const found = await EvalRun.get("run-1");
    expect(found.results[0].question.question).toBe("Qual o horário?");
    expect(prisma.eval_run.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          results: {
            include: { question: true },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    );
  });

  test("lists runs filtered by organization and dataset", async () => {
    prisma.eval_run.count.mockResolvedValue(1);
    prisma.eval_run.findMany.mockResolvedValue([run]);
    const result = await EvalRun.list({
      organizationId: "org-1",
      datasetId: "dataset-1",
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(prisma.eval_run.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", datasetId: "dataset-1" },
        take: 50,
        skip: 0,
      })
    );
  });

  test("starts, completes and fails a run", async () => {
    prisma.eval_run.update.mockResolvedValue({ ...run, status: "running" });
    await EvalRun.start("run-1");
    expect(prisma.eval_run.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({ status: "running" }),
    });

    prisma.eval_run.update.mockResolvedValue({
      ...run,
      status: "completed",
      totalQuestions: 3,
      metrics: { retrievalAccuracy: 1 },
    });
    await EvalRun.complete("run-1", {
      totalQuestions: 3,
      metrics: { retrievalAccuracy: 1 },
    });
    expect(prisma.eval_run.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "completed",
        totalQuestions: 3,
        metrics: { retrievalAccuracy: 1 },
      }),
    });

    prisma.eval_run.update.mockResolvedValue({ ...run, status: "failed" });
    await EvalRun.fail("run-1", new Error("boom"));
    expect(prisma.eval_run.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "failed",
        metrics: { error: "boom" },
      }),
    });
  });

  test("creates an eval result", async () => {
    const result = {
      id: "result-1",
      runId: "run-1",
      questionId: "question-1",
      retrievalAccuracy: true,
    };
    prisma.eval_result.create.mockResolvedValue(result);
    const created = await EvalResult.create({
      runId: "run-1",
      questionId: "question-1",
      retrievalAccuracy: true,
    });
    expect(created.error).toBeNull();
    expect(created.result.id).toBe("result-1");
    expect(prisma.eval_result.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: "run-1",
        questionId: "question-1",
        retrievalAccuracy: true,
      }),
    });
  });
});

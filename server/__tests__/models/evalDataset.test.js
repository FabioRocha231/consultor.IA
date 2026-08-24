/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  $transaction: jest.fn(),
  eval_dataset: {
    create: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  eval_question: {
    create: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { EvalDataset, EvalQuestion } = require("../../models/evalDataset");

const dataset = {
  id: "dataset-1",
  organizationId: "org-1",
  name: "Cardápio Q&A",
  description: "Perguntas sobre o cardápio",
  questions: [{ id: "question-1", question: "Qual o horário?" }],
};

describe("evalDataset model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
  });

  test("creates a dataset with questions in a transaction", async () => {
    prisma.eval_dataset.create.mockResolvedValue(dataset);
    const result = await EvalDataset.create({
      name: "Cardápio Q&A",
      description: "Perguntas sobre o cardápio",
      organizationId: "org-1",
      questions: [
        {
          question: "Qual o horário?",
          expectedAnswer: "08h às 18h",
          expectedSource: "cardapio.pdf",
          tags: ["horario"],
        },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.eval_dataset.create).toHaveBeenCalledWith({
      data: {
        name: "Cardápio Q&A",
        description: "Perguntas sobre o cardápio",
        company: null,
        organizationId: "org-1",
        questions: {
          create: [
            {
              question: "Qual o horário?",
              expectedAnswer: "08h às 18h",
              expectedSource: "cardapio.pdf",
              tags: ["horario"],
            },
          ],
        },
      },
      include: { questions: true },
    });
    expect(result.error).toBeNull();
    expect(result.dataset.id).toBe("dataset-1");
  });

  test("rejects invalid question payloads", async () => {
    const result = await EvalDataset.create({
      name: "Invalid",
      questions: [{ tags: "horario" }],
    });
    expect(result.dataset).toBeNull();
    expect(result.error).toContain("question");
  });

  test("gets a dataset with questions", async () => {
    prisma.eval_dataset.findUnique.mockResolvedValue(dataset);
    expect(await EvalDataset.get("dataset-1")).toEqual(dataset);
    expect(prisma.eval_dataset.findUnique).toHaveBeenCalledWith({
      where: { id: "dataset-1" },
      include: { questions: { orderBy: { createdAt: "asc" } } },
    });
  });

  test("lists datasets paginated for an organization", async () => {
    prisma.eval_dataset.count.mockResolvedValue(1);
    prisma.eval_dataset.findMany.mockResolvedValue([dataset]);
    const result = await EvalDataset.list({
      organizationId: "org-1",
      limit: 50,
      offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.datasets).toEqual([dataset]);
    expect(prisma.eval_dataset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        take: 50,
        skip: 0,
      })
    );
  });

  test("deletes a dataset", async () => {
    prisma.eval_dataset.delete.mockResolvedValue(dataset);
    expect(await EvalDataset.delete("dataset-1")).toBe(true);
    expect(prisma.eval_dataset.delete).toHaveBeenCalledWith({
      where: { id: "dataset-1" },
    });
  });

  test("creates and deletes a question", async () => {
    const question = { id: "question-2", question: "Qual o telefone?" };
    prisma.eval_question.create.mockResolvedValue(question);
    prisma.eval_question.delete.mockResolvedValue(question);

    const created = await EvalQuestion.create({
      datasetId: "dataset-1",
      question: "Qual o telefone?",
      expectedAnswer: "(11) 99999-9999",
      tags: ["contato"],
    });
    expect(created.error).toBeNull();
    expect(prisma.eval_question.create).toHaveBeenCalledWith({
      data: {
        question: "Qual o telefone?",
        expectedAnswer: "(11) 99999-9999",
        expectedSource: null,
        tags: ["contato"],
      },
    });

    expect(await EvalQuestion.delete("question-2")).toBe(true);
    expect(prisma.eval_question.delete).toHaveBeenCalledWith({
      where: { id: "question-2" },
    });
  });
});

const prisma = require("../utils/prisma");

function normalizeQuestion(question = {}) {
  if (!question || typeof question !== "object" || Array.isArray(question))
    throw new Error("Each question must be an object.");
  if (!question.question || typeof question.question !== "string")
    throw new Error("Each question must have a question string.");
  if (
    question.tags !== undefined &&
    (!Array.isArray(question.tags) ||
      question.tags.some((tag) => typeof tag !== "string"))
  )
    throw new Error("tags must be an array of strings.");
  return {
    question: String(question.question).slice(0, 2000),
    expectedAnswer:
      question.expectedAnswer === undefined || question.expectedAnswer === null
        ? null
        : String(question.expectedAnswer).slice(0, 5000),
    expectedSource:
      question.expectedSource === undefined || question.expectedSource === null
        ? null
        : String(question.expectedSource).slice(0, 500),
    tags: question.tags || [],
  };
}

const EvalDataset = {
  create: async function ({
    name,
    description = null,
    company = null,
    organizationId = null,
    questions = [],
  } = {}) {
    try {
      if (!name || typeof name !== "string")
        throw new Error("Dataset name is required.");
      if (!Array.isArray(questions))
        throw new Error("questions must be an array.");
      const normalizedQuestions = questions.map(normalizeQuestion);
      const dataset = await prisma.$transaction(async (tx) => {
        const created = await tx.eval_dataset.create({
          data: {
            name: String(name).slice(0, 255),
            description:
              description === undefined || description === null
                ? null
                : String(description).slice(0, 2000),
            company:
              company === undefined || company === null
                ? null
                : String(company).slice(0, 255),
            organizationId,
            questions: { create: normalizedQuestions },
          },
          include: { questions: true },
        });
        return created;
      });
      return { dataset, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE EVAL DATASET.", error.message);
      return { dataset: null, error: error.message };
    }
  },

  get: async function (id) {
    try {
      return await prisma.eval_dataset.findUnique({
        where: { id },
        include: { questions: { orderBy: { createdAt: "asc" } } },
      });
    } catch (error) {
      console.error("FAILED TO GET EVAL DATASET.", error.message);
      return null;
    }
  },

  list: async function ({
    organizationId,
    company,
    limit = 50,
    offset = 0,
  } = {}) {
    try {
      const where = {};
      if (organizationId) where.organizationId = organizationId;
      if (company) where.company = company;
      const [total, datasets] = await Promise.all([
        prisma.eval_dataset.count({ where }),
        prisma.eval_dataset.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
          include: { questions: true },
        }),
      ]);
      return { datasets, total };
    } catch (error) {
      console.error("FAILED TO LIST EVAL DATASETS.", error.message);
      return { datasets: [], total: 0 };
    }
  },

  delete: async function (id) {
    try {
      await prisma.eval_dataset.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error("FAILED TO DELETE EVAL DATASET.", error.message);
      return false;
    }
  },
};

const EvalQuestion = {
  create: async function ({
    datasetId,
    question,
    expectedAnswer = null,
    expectedSource = null,
    tags = [],
  } = {}) {
    try {
      if (!datasetId || typeof datasetId !== "string")
        throw new Error("datasetId is required.");
      const createdQuestion = await prisma.eval_question.create({
        data: normalizeQuestion({
          question,
          expectedAnswer,
          expectedSource,
          tags,
        }),
      });
      return { question: createdQuestion, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE EVAL QUESTION.", error.message);
      return { question: null, error: error.message };
    }
  },

  delete: async function (id) {
    try {
      await prisma.eval_question.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error("FAILED TO DELETE EVAL QUESTION.", error.message);
      return false;
    }
  },
};

module.exports = { EvalDataset, EvalQuestion };

const prisma = require("../utils/prisma");

const EvalRun = {
  create: async function ({
    datasetId,
    organizationId = null,
    configSnapshot = {},
  } = {}) {
    try {
      if (!datasetId || typeof datasetId !== "string")
        throw new Error("datasetId is required.");
      const run = await prisma.eval_run.create({
        data: {
          datasetId,
          organizationId,
          configSnapshot,
          status: "pending",
        },
      });
      return { run, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE EVAL RUN.", error.message);
      return { run: null, error: error.message };
    }
  },

  get: async function (id) {
    try {
      return await prisma.eval_run.findUnique({
        where: { id },
        include: {
          results: {
            include: { question: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    } catch (error) {
      console.error("FAILED TO GET EVAL RUN.", error.message);
      return null;
    }
  },

  list: async function ({
    organizationId,
    datasetId,
    limit = 50,
    offset = 0,
  } = {}) {
    try {
      const where = {};
      if (organizationId) where.organizationId = organizationId;
      if (datasetId) where.datasetId = datasetId;
      const [total, runs] = await Promise.all([
        prisma.eval_run.count({ where }),
        prisma.eval_run.findMany({
          where,
          orderBy: { startedAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);
      return { runs, total };
    } catch (error) {
      console.error("FAILED TO LIST EVAL RUNS.", error.message);
      return { runs: [], total: 0 };
    }
  },

  start: async function (id) {
    try {
      return await prisma.eval_run.update({
        where: { id },
        data: { status: "running", startedAt: new Date() },
      });
    } catch (error) {
      console.error("FAILED TO START EVAL RUN.", error.message);
      return null;
    }
  },

  complete: async function (id, { totalQuestions = 0, metrics = null } = {}) {
    try {
      return await prisma.eval_run.update({
        where: { id },
        data: {
          status: "completed",
          completedAt: new Date(),
          totalQuestions,
          metrics,
        },
      });
    } catch (error) {
      console.error("FAILED TO COMPLETE EVAL RUN.", error.message);
      return null;
    }
  },

  fail: async function (id, error) {
    try {
      return await prisma.eval_run.update({
        where: { id },
        data: {
          status: "failed",
          completedAt: new Date(),
          metrics: {
            error: String(error?.message ?? error ?? "Unknown error"),
          },
        },
      });
    } catch (error) {
      console.error("FAILED TO FAIL EVAL RUN.", error.message);
      return null;
    }
  },
};

const EvalResult = {
  create: async function ({
    runId,
    questionId,
    answer = null,
    retrievedSources = null,
    retrievalAccuracy = null,
    answerCorrectness = null,
    citationCorrectness = null,
    latencyMs = null,
    costUsd = null,
    error = null,
  } = {}) {
    try {
      if (!runId || !questionId)
        throw new Error("runId and questionId are required.");
      const result = await prisma.eval_result.create({
        data: {
          runId,
          questionId,
          answer,
          retrievedSources,
          retrievalAccuracy,
          answerCorrectness,
          citationCorrectness,
          latencyMs,
          costUsd,
          error,
        },
      });
      return { result, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE EVAL RESULT.", error.message);
      return { result: null, error: error.message };
    }
  },
};

module.exports = { EvalRun, EvalResult };

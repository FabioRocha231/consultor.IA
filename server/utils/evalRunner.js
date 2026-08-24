const { EvalDataset } = require("../models/evalDataset");
const { EvalResult, EvalRun } = require("../models/evalRun");
const {
  recordEvalLatency,
  recordEvalQuestion,
  recordEvalRun,
} = require("./observability/ai");
const { buildLiveServices, liveEvalEnabled } = require("./evalLiveRunner");

function hashString(value = "") {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function rate(results = [], key = "") {
  const scored = results.filter((result) => typeof result?.[key] === "boolean");
  if (scored.length === 0) return null;
  return scored.filter((result) => result[key]).length / scored.length;
}

function average(values = []) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function sum(values = []) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((total, value) => total + value, 0);
}

function percentile(values = [], percent = 50) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1);
  return sorted[Math.min(sorted.length - 1, index)];
}

async function mockEmbed() {
  return { vector: [0.1, 0.2, 0.3], latencyMs: 2 };
}

async function mockVectorSearch({ question = {}, config = {} } = {}) {
  const expectedSource = question.expectedSource || null;
  const fail = hashString(question.id || question.question) % 10 === 9;
  const sources =
    expectedSource && !fail
      ? [
          {
            filename: expectedSource,
            score: 0.92,
            snippet: question.expectedAnswer || "",
          },
          { filename: "manual.pdf", score: 0.71, snippet: "" },
        ]
      : [];
  return { sources, latencyMs: 3, topK: config.topK || 4 };
}

async function mockGenerate({ question = {}, sources = [], config = {} } = {}) {
  const source = sources[0]?.filename || null;
  const answer =
    source && question.expectedAnswer
      ? `${question.expectedAnswer}\n\nFonte: ${source}`
      : "Não encontrei resposta na base de conhecimento.";
  return {
    text: answer,
    latencyMs: 25,
    costUsd: config.fallbackBehavior === "general_llm" ? 0.002 : 0.001,
  };
}

const MOCK_SERVICES = {
  embed: mockEmbed,
  vectorSearch: mockVectorSearch,
  generate: mockGenerate,
};

async function runEval({
  runId,
  config = null,
  mocks = {},
  services = null,
  mode = null,
} = {}) {
  const run = await EvalRun.get(runId);
  if (!run) return { ok: false, error: "Evaluation run not found." };

  const dataset = await EvalDataset.get(run.datasetId);
  if (!dataset) {
    await EvalRun.fail(runId, "Evaluation dataset not found.");
    return { ok: false, error: "Evaluation dataset not found." };
  }

  await EvalRun.start(runId);
  recordEvalRun({ organization: run.organizationId, status: "running" });

  const ragConfig = config || run.configSnapshot || {};
  const evalMode = mode ?? (liveEvalEnabled() ? "live" : "mock");
  const activeServices = services || {
    ...(evalMode === "live" ? await buildLiveServices() : MOCK_SERVICES),
    ...mocks,
  };
  const questions = dataset.questions || [];
  const results = [];

  for (const question of questions) {
    const startedAt = Date.now();
    try {
      const embedding = await activeServices.embed(
        question.question,
        ragConfig
      );
      const retrieval = await activeServices.vectorSearch({
        question,
        vector: embedding?.vector,
        config: ragConfig,
        company: dataset.company,
      });
      const sources = Array.isArray(retrieval?.sources)
        ? retrieval.sources
        : [];
      const retrievalAccuracy = question.expectedSource
        ? sources.some(
            (source) =>
              String(source?.filename).toLowerCase() ===
              String(question.expectedSource).toLowerCase()
          )
        : null;
      const context = sources
        .map((source) => `[${source.filename}]\n${source.snippet || ""}`)
        .join("\n\n");
      const generation = await activeServices.generate({
        question,
        sources,
        context,
        config: ragConfig,
      });
      const answer = generation?.text ?? "";
      const answerCorrectness = question.expectedAnswer
        ? answer
            .toLowerCase()
            .includes(String(question.expectedAnswer).toLowerCase())
        : null;
      const citationCorrectness = question.expectedSource
        ? answer
            .toLowerCase()
            .includes(String(question.expectedSource).toLowerCase())
        : null;
      const latencyMs = Math.max(1, Math.round(Date.now() - startedAt));
      const rawCost = Number(generation?.costUsd);
      const costUsd = Number.isFinite(rawCost) ? rawCost : null;
      const resultRecord = {
        runId,
        questionId: question.id,
        answer,
        retrievedSources: sources,
        retrievalAccuracy,
        answerCorrectness,
        citationCorrectness,
        latencyMs,
        costUsd,
        inputTokens: generation?.inputTokens ?? null,
        outputTokens: generation?.outputTokens ?? null,
        totalTokens: generation?.totalTokens ?? null,
      };
      const created = await EvalResult.create(resultRecord);
      if (created.result) results.push({ ...created.result, ...resultRecord });
      recordEvalQuestion({ organization: run.organizationId });
      recordEvalLatency({ organization: run.organizationId, latencyMs });
    } catch (error) {
      const created = await EvalResult.create({
        runId,
        questionId: question.id,
        error: String(error?.message ?? error),
      });
      if (created.result) results.push(created.result);
    }
  }

  const metrics = {
    retrievalAccuracy: rate(results, "retrievalAccuracy"),
    answerCorrectness: rate(results, "answerCorrectness"),
    citationCorrectness: rate(results, "citationCorrectness"),
    avgLatencyMs: average(results.map((result) => result.latencyMs)),
    latencyP50Ms: percentile(
      results.map((result) => result.latencyMs),
      50
    ),
    latencyP95Ms: percentile(
      results.map((result) => result.latencyMs),
      95
    ),
    totalCostUsd: sum(results.map((result) => result.costUsd)),
    totalTokens: sum(results.map((result) => result.totalTokens)),
    totalInputTokens: sum(results.map((result) => result.inputTokens)),
    totalOutputTokens: sum(results.map((result) => result.outputTokens)),
  };
  await EvalRun.complete(runId, {
    totalQuestions: questions.length,
    metrics,
  });
  recordEvalRun({ organization: run.organizationId, status: "completed" });
  return { ok: true, runId, metrics };
}

module.exports = { MOCK_SERVICES, runEval };

const {
  getEmbeddingEngineSelection,
  getLLMProvider,
  getVectorDbClass,
} = require("./helpers");
const { MODEL_PRICING } = require("./helpers/modelPricing");

function liveEvalEnabled() {
  return process.env.EVAL_LIVE === "true";
}

function sourceFilename(source = {}) {
  return (
    source.filename ||
    source.docpath ||
    source.title ||
    source.name ||
    "unknown.pdf"
  );
}

function estimatedCost({ provider, model, metrics = {} }) {
  return MODEL_PRICING.getCostBreakdown(provider, model, {
    prompt_tokens: Number(metrics.prompt_tokens) || 0,
    completion_tokens: Number(metrics.completion_tokens) || 0,
  });
}

function resolveEmbeddingEngine() {
  const provider =
    process.env.EMBEDDING_PROVIDER || process.env.EMBEDDING_ENGINE;
  if (provider) process.env.EMBEDDING_ENGINE = provider;
  return getEmbeddingEngineSelection();
}

async function buildLiveServices() {
  const embedder = resolveEmbeddingEngine();
  const llm = getLLMProvider();
  const vectorDb = getVectorDbClass();

  return {
    embed: async (text = "") => {
      const startedAt = Date.now();
      const vector = await embedder.embedTextInput(String(text));
      return {
        vector,
        latencyMs: Date.now() - startedAt,
        model: embedder.model,
      };
    },

    vectorSearch: async ({
      question = {},
      vector = [],
      config = {},
      company = null,
    } = {}) => {
      if (!company)
        throw new Error(
          "Live eval requires dataset.company to be a workspace slug."
        );
      if (!Array.isArray(vector) || vector.length === 0)
        throw new Error("Live eval received an empty embedding vector.");

      const startedAt = Date.now();
      const result = await vectorDb.performSimilaritySearch({
        namespace: company,
        input: question.question,
        LLMConnector: { embedTextInput: async () => vector },
        similarityThreshold: config.similarityThreshold,
        topN: config.topK,
      });
      const sources = (result?.sources || []).map((source) => ({
        filename: sourceFilename(source),
        score: source.score,
        snippet: source.text || "",
      }));
      return {
        sources,
        latencyMs: Date.now() - startedAt,
        topK: config.topK,
      };
    },

    generate: async ({ question = {}, context = "", config = {} } = {}) => {
      const provider = process.env.LLM_PROVIDER || "openai";
      const startedAt = Date.now();
      const instruction = config.answerOnlyFromKnowledgeBase
        ? "Answer using only the provided context. If the context does not contain the answer, say you could not find the answer."
        : "Answer the question using the provided context when relevant.";
      const messages = [
        {
          role: "system",
          content: `${instruction}\n\n${context ? `Context:\n${context}` : ""}`,
        },
        { role: "user", content: question.question || "" },
      ];
      const completion = await llm.getChatCompletion(messages, {
        temperature: 0,
      });
      const metrics = completion?.metrics || {};
      const cost = estimatedCost({ provider, model: llm.model, metrics });
      return {
        text: completion?.textResponse || "",
        latencyMs: Date.now() - startedAt,
        costUsd: cost?.totalCost ?? null,
        inputTokens: metrics.prompt_tokens ?? null,
        outputTokens: metrics.completion_tokens ?? null,
        totalTokens: metrics.total_tokens ?? null,
        provider,
        model: llm.model,
      };
    },
  };
}

module.exports = { buildLiveServices, liveEvalEnabled };

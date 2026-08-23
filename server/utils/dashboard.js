const fs = require("fs");
const path = require("path");
const { safeJsonParse } = require("./http");
const { MODEL_PRICING } = require("./helpers/modelPricing");
const { toNonNegativeNumber } = require("./helpers/numbers");
const { VALID_FEEDBACK_CATEGORIES } = require("../models/workspaceChats");

const VALID_PERIODS = new Set(["7d", "30d", "all"]);
const PRICING_FILE = path.join(
  __dirname,
  "helpers",
  "modelPricing",
  "pricing.json"
);

const CLASS_NAME_TO_PROVIDER_SLUG = {
  OpenAiLLM: "openai",
  AzureOpenAiLLM: "azure",
  AnthropicLLM: "anthropic",
  GeminiLLM: "gemini",
  TogetherAiLLM: "togetherai",
  FireworksAiLLM: "fireworksai",
  MistralLLM: "mistral",
  PerplexityLLM: "perplexity",
  OpenRouterLLM: "openrouter",
  NovitaLLM: "novita",
  GroqLLM: "groq",
  CohereLLM: "cohere",
  AWSBedrockLLM: "bedrock",
  DeepSeekLLM: "deepseek",
  XAiLLM: "xai",
  MoonshotAiLLM: "moonshotai",
  ZAiLLM: "zai",
  MinimaxLLM: "minimax",
  CerebrasLLM: "cerebras",
  LiteLLM: "litellm",
  GenericOpenAiLLM: "generic-openai",
  ApiPieLLM: "apipie",
  CometApiLLM: "cometapi",
  FoundryLLM: "foundry",
  PrivatemodeLLM: "privatemode",
  SambaNovaLLM: "sambanova",
  LemonadeLLM: "lemonade",
  OMLXLLM: "omlx",
  NvidiaNimLLM: "nvidia-nim",
  PPIOLLM: "ppio",
  GiteeAILLM: "giteeai",
  DockerModelRunnerLLM: "docker-model-runner",
  TextGenWebUILLM: "textgenwebui",
  KoboldCPPLLM: "koboldcpp",
  LMStudioLLM: "lmstudio",
  LocalAiLLM: "localai",
  OllamaAILLM: "ollama",
};

function parsePeriod(value = "7d") {
  return VALID_PERIODS.has(value) ? value : null;
}

function periodSince(period) {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function timestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function providerSlug(value = null) {
  const raw = String(value || "");
  return CLASS_NAME_TO_PROVIDER_SLUG[raw] || raw || null;
}

function roundUsd(value) {
  return Number(Number(value).toFixed(4));
}

function computeUsage(chats = []) {
  const conversationKeys = new Set();
  const userKeys = new Set();
  const byDay = new Map();
  let lastActivityAt = null;

  for (const chat of chats) {
    if (chat.thread_id !== null && chat.thread_id !== undefined) {
      conversationKeys.add(`thread:${chat.thread_id}`);
    } else if (
      chat.api_session_id !== null &&
      chat.api_session_id !== undefined
    ) {
      conversationKeys.add(`api:${chat.api_session_id}`);
    } else if (chat.user_id !== null && chat.user_id !== undefined) {
      conversationKeys.add(`user:${chat.user_id}`);
    } else {
      conversationKeys.add(`chat:${chat.id}`);
    }

    if (chat.user_id !== null && chat.user_id !== undefined)
      userKeys.add(chat.user_id);

    const day = timestamp(chat.createdAt)?.slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) || 0) + 1);

    const createdAt = timestamp(chat.createdAt);
    if (createdAt && (!lastActivityAt || createdAt > lastActivityAt))
      lastActivityAt = createdAt;
  }

  return {
    conversations: conversationKeys.size,
    messages: chats.length,
    activeUsers: userKeys.size,
    lastActivityAt,
    byDay: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, messages]) => ({ date, messages })),
  };
}

function computeFeedback(chats = []) {
  const byCategory = Object.fromEntries(
    VALID_FEEDBACK_CATEGORIES.map((category) => [category, 0])
  );
  let total = 0;
  let positive = 0;
  let negative = 0;

  for (const chat of chats) {
    if (chat.feedbackScore === null || chat.feedbackScore === undefined)
      continue;
    total += 1;
    if (chat.feedbackScore === true || chat.feedbackScore === 1) positive += 1;
    if (chat.feedbackScore === false || chat.feedbackScore === 0) negative += 1;
    if (
      chat.feedbackCategory &&
      byCategory.hasOwnProperty(chat.feedbackCategory)
    )
      byCategory[chat.feedbackCategory] += 1;
  }

  return {
    total,
    positive,
    negative,
    positiveRate: total === 0 ? 0 : Number((positive / total).toFixed(4)),
    byCategory,
  };
}

function computeCosts(
  chats = [],
  { workspaces = [], pricing = MODEL_PRICING } = {}
) {
  const workspaceById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace])
  );
  const byModel = new Map();

  for (const chat of chats) {
    const response =
      typeof chat.response === "string"
        ? safeJsonParse(chat.response, {})
        : chat.response || {};
    const metrics = response?.metrics || {};
    const workspace = workspaceById.get(chat.workspaceId) || {};
    const model = metrics.model || workspace.chatModel || null;
    if (!model) continue;

    const provider = providerSlug(metrics.provider || workspace.chatProvider);
    const breakdown = pricing.getCostBreakdown(provider, model, {
      prompt_tokens: toNonNegativeNumber(metrics.prompt_tokens),
      completion_tokens: toNonNegativeNumber(metrics.completion_tokens),
    });
    const entry = byModel.get(model) || {
      model,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    entry.calls += 1;
    entry.inputTokens += toNonNegativeNumber(metrics.prompt_tokens);
    entry.outputTokens += toNonNegativeNumber(metrics.completion_tokens);
    entry.costUsd += breakdown?.totalCost ?? 0;
    byModel.set(model, entry);
  }

  const byModelList = [...byModel.values()]
    .sort((a, b) => b.costUsd - a.costUsd)
    .map((entry) => ({
      model: entry.model,
      calls: entry.calls,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costUsd: roundUsd(entry.costUsd),
    }));
  const totalUsd = roundUsd(
    byModelList.reduce((sum, entry) => sum + entry.costUsd, 0)
  );

  return { totalUsd, byModel: byModelList };
}

function modelPricingVersion() {
  try {
    return fs.statSync(PRICING_FILE).mtime.toISOString();
  } catch {
    return null;
  }
}

module.exports = {
  VALID_PERIODS,
  CLASS_NAME_TO_PROVIDER_SLUG,
  parsePeriod,
  periodSince,
  computeUsage,
  computeFeedback,
  computeCosts,
  modelPricingVersion,
};

const DEFAULT_RAG_CONFIG = {
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 4,
  similarityThreshold: 0.25,
  rerankingEnabled: false,
  citationsRequired: true,
  answerOnlyFromKnowledgeBase: false,
  fallbackBehavior: "dont_know",
};

const RAG_CONFIG_FIELDS = Object.keys(DEFAULT_RAG_CONFIG);
const FALLBACK_BEHAVIORS = ["dont_know", "human_handoff", "general_llm"];

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function similarityThreshold(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : null;
}

function validateRagConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { ok: false, value: null, error: "ragConfig must be an object." };

  const validators = {
    chunkSize: (value) => positiveInteger(value),
    chunkOverlap: (value) =>
      Number.isInteger(value) && value >= 0 ? value : null,
    topK: (value) => positiveInteger(value),
    similarityThreshold: (value) => similarityThreshold(value),
    rerankingEnabled: (value) => (typeof value === "boolean" ? value : null),
    citationsRequired: (value) => (typeof value === "boolean" ? value : null),
    answerOnlyFromKnowledgeBase: (value) =>
      typeof value === "boolean" ? value : null,
    fallbackBehavior: (value) =>
      FALLBACK_BEHAVIORS.includes(value) ? value : null,
  };

  const unknownFields = Object.keys(input).filter(
    (field) => !(field in validators)
  );
  if (unknownFields.length > 0)
    return {
      ok: false,
      value: null,
      error: `Unknown ragConfig fields: ${unknownFields.join(", ")}`,
    };

  const value = {};
  for (const [field, validate] of Object.entries(validators)) {
    if (input[field] === undefined) continue;
    const parsed = validate(input[field]);
    if (parsed === null)
      return {
        ok: false,
        value: null,
        error: `Invalid ragConfig field: ${field}`,
      };
    value[field] = parsed;
  }

  return { ok: true, value, error: null };
}

function workspaceRagConfig(workspace = {}) {
  const config = {
    topK: positiveInteger(workspace.topN),
    similarityThreshold: similarityThreshold(workspace.similarityThreshold),
    rerankingEnabled:
      workspace.vectorSearchMode === undefined
        ? null
        : workspace.vectorSearchMode === "rerank",
    answerOnlyFromKnowledgeBase:
      workspace.chatMode === undefined ? null : workspace.chatMode === "query",
    fallbackBehavior: workspace.queryRefusalResponse
      ? "dont_know"
      : workspace.chatMode === "query"
        ? "general_llm"
        : null,
  };

  return config;
}

function resolveRagConfig({ organization = null, workspace = null } = {}) {
  const orgResult = validateRagConfig(organization?.ragConfig);
  const orgConfig = orgResult.ok ? orgResult.value : {};
  const workspaceConfig = workspaceRagConfig(workspace);
  const hasWorkspaceOverride = Object.values(workspaceConfig).some(
    (value) => value !== null
  );
  const configSource =
    Object.keys(orgConfig).length > 0
      ? "organization"
      : hasWorkspaceOverride
        ? "workspace"
        : "default";

  const config = {};
  for (const field of RAG_CONFIG_FIELDS) {
    config[field] =
      orgConfig[field] ?? workspaceConfig[field] ?? DEFAULT_RAG_CONFIG[field];
  }

  return { ...config, configSource };
}

function shouldHandleNoContext(ragConfig = {}) {
  return Boolean(
    ragConfig.answerOnlyFromKnowledgeBase &&
      ragConfig.fallbackBehavior !== "general_llm"
  );
}

function buildNoContextResponse(ragConfig = {}, workspace = {}) {
  const handoff = ragConfig.fallbackBehavior === "human_handoff";
  return {
    textResponse: handoff
      ? "This question has been escalated to a human support agent."
      : workspace?.queryRefusalResponse ||
        "There is no relevant information in this workspace to answer your query.",
    handoff,
    fallbackBehavior: handoff ? "human_handoff" : "dont_know",
  };
}

async function resolveOrganizationForRag({
  organization = null,
  workspace = null,
} = {}) {
  if (organization) return organization;
  if (workspace?.organization) return workspace.organization;

  const { Organization } = require("../models/organization");
  if (workspace?.organizationId) {
    const linked = await Organization.get(workspace.organizationId);
    if (linked) return linked;
  }

  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

module.exports = {
  DEFAULT_RAG_CONFIG,
  RAG_CONFIG_FIELDS,
  buildNoContextResponse,
  resolveOrganizationForRag,
  resolveRagConfig,
  shouldHandleNoContext,
  validateRagConfig,
};

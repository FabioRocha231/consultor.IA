const {
  context,
  metrics,
  trace,
  SpanStatusCode,
} = require("@opentelemetry/api");

const AI_SCOPE = "consultor-ia.ai";
const LLM_LATENCY_BUCKETS = [100, 500, 1000, 2000, 5000, 10000, 30000];
const RAG_SCORE_BUCKETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const snapshotState = {
  startedAt: new Date(),
  llm: {
    requests: 0,
    errors: 0,
    errorsByKind: {},
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    latency: [],
    ttft: [],
  },
  rag: {
    queries: 0,
    noResults: 0,
    fallback: 0,
    humanHandoff: 0,
    latency: [],
  },
  tool: {
    calls: 0,
    errors: 0,
    errorsByKind: {},
    latency: [],
  },
};

function getAITracer() {
  return trace.getTracer(AI_SCOPE);
}

function getAIMeter() {
  return metrics.getMeter(AI_SCOPE);
}

function isDisabled() {
  return process.env.OTEL_SDK_DISABLED === "true";
}

function setActiveSpanAttributes(attributes = {}) {
  const span = trace.getSpan(context.active());
  for (const [key, value] of Object.entries(attributes)) {
    if (
      value !== undefined &&
      value !== null &&
      ["number", "string", "boolean"].includes(typeof value)
    )
      span?.setAttribute(key, value);
  }
}

function errorKind(error = null) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  if (/rate.?limit|quota|429/.test(message)) return "rate_limit";
  if (/timeout|timed ?out|econnreset|aborted/.test(message)) return "timeout";
  if (/5\d\d|server error|internal server/.test(message)) return "provider_5xx";
  return "other";
}

function finiteNumber(value = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentile(values = [], percent = 50) {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1);
  return sorted[Math.min(sorted.length - 1, index)];
}

function getMetricSnapshot() {
  return {
    llmRequests: snapshotState.llm.requests,
    llmErrors: snapshotState.llm.errors,
    llmErrorsByKind: { ...snapshotState.llm.errorsByKind },
    llmInputTokens: snapshotState.llm.inputTokens,
    llmOutputTokens: snapshotState.llm.outputTokens,
    llmEstimatedCostUsd: snapshotState.llm.estimatedCostUsd,
    llmLatencyP50Ms: percentile(snapshotState.llm.latency, 50),
    llmLatencyP95Ms: percentile(snapshotState.llm.latency, 95),
    ttftP50Ms: percentile(snapshotState.llm.ttft, 50),
    ttftP95Ms: percentile(snapshotState.llm.ttft, 95),
    ragQueries: snapshotState.rag.queries,
    ragNoResults: snapshotState.rag.noResults,
    ragFallback: snapshotState.rag.fallback,
    ragHumanHandoff: snapshotState.rag.humanHandoff,
    ragRetrievalP50Ms: percentile(snapshotState.rag.latency, 50),
    ragRetrievalP95Ms: percentile(snapshotState.rag.latency, 95),
    toolCalls: snapshotState.tool.calls,
    toolCallErrors: snapshotState.tool.errors,
    toolCallErrorsByKind: { ...snapshotState.tool.errorsByKind },
    toolCallLatencyP50Ms: percentile(snapshotState.tool.latency, 50),
    toolCallLatencyP95Ms: percentile(snapshotState.tool.latency, 95),
    since: snapshotState.startedAt.toISOString(),
    until: new Date().toISOString(),
  };
}

function getInstruments() {
  const meter = getAIMeter();
  return {
    llmRequests: meter.createCounter("llm_requests_total"),
    llmErrors: meter.createCounter("llm_errors_total"),
    llmInputTokens: meter.createCounter("llm_input_tokens_total"),
    llmOutputTokens: meter.createCounter("llm_output_tokens_total"),
    llmLatency: meter.createHistogram("llm_latency_ms", {
      boundaries: LLM_LATENCY_BUCKETS,
    }),
    llmTimeToFirstToken: meter.createHistogram("llm_time_to_first_token_ms"),
    llmEstimatedCost: meter.createCounter("llm_estimated_cost_usd_total"),
    ragQueries: meter.createCounter("rag_queries_total"),
    ragRetrievalLatency: meter.createHistogram("rag_retrieval_latency_ms"),
    ragChunks: meter.createHistogram("rag_chunks_retrieved"),
    ragBestScore: meter.createHistogram("rag_best_similarity_score", {
      boundaries: RAG_SCORE_BUCKETS,
    }),
    ragNoResults: meter.createCounter("rag_no_results_total"),
    ragFallback: meter.createCounter("rag_fallback_total"),
    ragHumanHandoff: meter.createCounter("rag_human_handoff_total"),
    agentRuns: meter.createCounter("agent_runs_total"),
    agentFailures: meter.createCounter("agent_failures_total"),
    toolCalls: meter.createCounter("tool_calls_total"),
    toolCallErrors: meter.createCounter("tool_call_errors_total"),
    toolCallLatency: meter.createHistogram("tool_call_latency_ms"),
    documentIngestion: meter.createCounter("document_ingestion_total"),
    documentIngestionFailures: meter.createCounter(
      "document_ingestion_failures_total"
    ),
    embeddingJobs: meter.createCounter("embedding_jobs_total"),
    embeddingJobsFailed: meter.createCounter("embedding_jobs_failed"),
    evalRuns: meter.createCounter("eval_runs_total"),
    evalQuestions: meter.createCounter("eval_questions_total"),
    evalLatency: meter.createHistogram("eval_latency_ms"),
  };
}

async function withSpan(name, fn, attributes = {}) {
  if (isDisabled())
    return fn({
      setStatus() {},
      setAttribute() {},
      addEvent() {},
      recordException() {},
      end() {},
    });
  const tracer = getAITracer();
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error?.message || String(error),
      });
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

function recordLlmCall({
  provider = "unknown",
  model = "unknown",
  inputTokens = null,
  outputTokens = null,
  latencyMs = null,
  ttftMs = null,
  cost = null,
  error = null,
  organization = null,
} = {}) {
  if (isDisabled()) return;
  snapshotState.llm.requests += 1;
  const instruments = getInstruments();
  const labels = {
    provider: String(provider || "unknown"),
    model: String(model || "unknown"),
  };
  if (organization) labels.organization = String(organization);

  const result = error ? "error" : "success";
  instruments.llmRequests.add(1, { ...labels, result });
  if (error) {
    const kind = errorKind(error);
    snapshotState.llm.errors += 1;
    snapshotState.llm.errorsByKind[kind] =
      (snapshotState.llm.errorsByKind[kind] || 0) + 1;
    instruments.llmErrors.add(1, {
      ...labels,
      "error.kind": kind,
    });
  }

  const input = finiteNumber(inputTokens);
  const output = finiteNumber(outputTokens);
  if (input !== null) {
    snapshotState.llm.inputTokens += input;
    instruments.llmInputTokens.add(input, labels);
  }
  if (output !== null) {
    snapshotState.llm.outputTokens += output;
    instruments.llmOutputTokens.add(output, labels);
  }

  const latency = finiteNumber(latencyMs);
  if (latency !== null) {
    snapshotState.llm.latency.push(latency);
    instruments.llmLatency.record(latency, labels);
  }
  const ttft = finiteNumber(ttftMs);
  if (ttft !== null) {
    snapshotState.llm.ttft.push(ttft);
    instruments.llmTimeToFirstToken.record(ttft, labels);
  }
  const estimatedCost = finiteNumber(cost);
  if (estimatedCost !== null && estimatedCost > 0) {
    snapshotState.llm.estimatedCostUsd += estimatedCost;
    instruments.llmEstimatedCost.add(estimatedCost, labels);
  }

  setActiveSpanAttributes({
    "llm.provider": labels.provider,
    "llm.model": labels.model,
    "llm.input_tokens": input,
    "llm.output_tokens": output,
    "llm.latency_ms": latency,
    "llm.time_to_first_token_ms": ttft,
    "llm.estimated_cost_usd": estimatedCost,
  });
}

function recordRagCall({
  vectorDb = "unknown",
  chunks = null,
  bestScore = null,
  latencyMs = null,
  noResults = false,
  fallback = null,
  humanHandoff = false,
} = {}) {
  if (isDisabled()) return;
  snapshotState.rag.queries += 1;
  const instruments = getInstruments();
  const labels = { vector_db: String(vectorDb || "unknown") };
  instruments.ragQueries.add(1, labels);

  const chunkCount = finiteNumber(chunks);
  if (chunkCount !== null) instruments.ragChunks.record(chunkCount, labels);
  const score = finiteNumber(bestScore);
  if (score !== null) instruments.ragBestScore.record(score, labels);
  const latency = finiteNumber(latencyMs);
  if (latency !== null) {
    snapshotState.rag.latency.push(latency);
    instruments.ragRetrievalLatency.record(latency, labels);
  }
  if (noResults) {
    snapshotState.rag.noResults += 1;
    instruments.ragNoResults.add(1, labels);
  }
  if (fallback) {
    snapshotState.rag.fallback += 1;
    instruments.ragFallback.add(1, {
      ...labels,
      "fallback.kind": String(fallback),
    });
  }
  if (humanHandoff) {
    snapshotState.rag.humanHandoff += 1;
    instruments.ragHumanHandoff.add(1, labels);
  }

  setActiveSpanAttributes({
    "rag.chunks_retrieved": chunkCount,
    "rag.best_similarity_score": score,
    "rag.latency_ms": latency,
    "rag.no_results": noResults,
  });
}

function recordToolCall({
  toolName = "unknown",
  latencyMs = null,
  error = null,
} = {}) {
  if (isDisabled()) return;
  snapshotState.tool.calls += 1;
  const instruments = getInstruments();
  const labels = { "tool.name": String(toolName || "unknown") };
  instruments.toolCalls.add(1, labels);
  const latency = finiteNumber(latencyMs);
  if (latency !== null) {
    snapshotState.tool.latency.push(latency);
    instruments.toolCallLatency.record(latency, labels);
  }
  if (error) {
    const kind = errorKind(error);
    snapshotState.tool.errors += 1;
    snapshotState.tool.errorsByKind[kind] =
      (snapshotState.tool.errorsByKind[kind] || 0) + 1;
    instruments.toolCallErrors.add(1, {
      ...labels,
      "error.kind": kind,
    });
  }
  setActiveSpanAttributes({
    "tool.name": labels["tool.name"],
    "tool.latency_ms": latency,
  });
}

function recordAgentRun({
  provider = "unknown",
  error = null,
  latencyMs = null,
} = {}) {
  if (isDisabled()) return;
  const instruments = getInstruments();
  const labels = { "agent.provider": String(provider || "unknown") };
  instruments.agentRuns.add(1, labels);
  if (error)
    instruments.agentFailures.add(1, {
      ...labels,
      "error.kind": errorKind(error),
    });
  const latency = finiteNumber(latencyMs);
  setActiveSpanAttributes({
    "agent.provider": labels["agent.provider"],
    "agent.latency_ms": latency,
  });
}

function recordDocumentIngestion({
  result = "success",
  error = null,
  latencyMs = null,
} = {}) {
  if (isDisabled()) return;
  const instruments = getInstruments();
  if (error) {
    instruments.documentIngestionFailures.add(1, {
      "error.kind": errorKind(error),
    });
    return;
  }
  instruments.documentIngestion.add(1, {
    result: String(result || "success"),
  });
  const latency = finiteNumber(latencyMs);
  setActiveSpanAttributes({
    "document.result": String(result || "success"),
    "document.latency_ms": latency,
  });
}

function recordEmbeddingJob({
  result = "success",
  error = null,
  latencyMs = null,
} = {}) {
  if (isDisabled()) return;
  const instruments = getInstruments();
  if (error) {
    instruments.embeddingJobsFailed.add(1, {
      "error.kind": errorKind(error),
    });
    return;
  }
  instruments.embeddingJobs.add(1, { result: String(result || "success") });
  const latency = finiteNumber(latencyMs);
  setActiveSpanAttributes({
    "embedding.result": String(result || "success"),
    "embedding.latency_ms": latency,
  });
}

function recordFeedback({
  score = null,
  category = null,
  commentLength = null,
} = {}) {
  if (isDisabled()) return;
  if (score === null || score === undefined) return;
  setActiveSpanAttributes({
    "feedback.score": score ? "positive" : "negative",
    "feedback.category": category || undefined,
    "feedback.comment_length": commentLength ?? undefined,
  });
}

function recordEvalRun({ organization = null, status = "unknown" } = {}) {
  if (isDisabled()) return;
  const labels = { organization: String(organization || "unknown") };
  getInstruments().evalRuns.add(1, { ...labels, status: String(status) });
}

function recordEvalQuestion({ organization = null } = {}) {
  if (isDisabled()) return;
  getInstruments().evalQuestions.add(1, {
    organization: String(organization || "unknown"),
  });
}

function recordEvalLatency({ organization = null, latencyMs = null } = {}) {
  if (isDisabled()) return;
  const latency = finiteNumber(latencyMs);
  if (latency === null) return;
  getInstruments().evalLatency.record(latency, {
    organization: String(organization || "unknown"),
  });
}

module.exports = {
  getAITracer,
  getAIMeter,
  getMetricSnapshot,
  withSpan,
  recordLlmCall,
  recordRagCall,
  recordToolCall,
  recordAgentRun,
  recordDocumentIngestion,
  recordEmbeddingJob,
  recordFeedback,
  recordEvalRun,
  recordEvalQuestion,
  recordEvalLatency,
};

const { metrics, SpanStatusCode, trace } = require("@opentelemetry/api");
const {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} = require("@opentelemetry/sdk-trace-node");
const {
  getAIMeter,
  getAITracer,
  recordLlmCall,
  recordRagCall,
  recordToolCall,
  recordFeedback,
  withSpan,
} = require("../../utils/observability/ai");

let spanExporter;
let metricExporter;
let metricReader;

beforeEach(() => {
  trace.disable();
  metrics.disable();
  spanExporter = new InMemorySpanExporter();
  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  tracerProvider.register();

  metricExporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
  });
  metrics.setGlobalMeterProvider(
    new MeterProvider({ readers: [metricReader] })
  );
  spanExporter.reset();
  delete process.env.OTEL_SDK_DISABLED;
});

function collectMetrics() {
  return metricExporter
    .getMetrics()
    .flatMap((resource) =>
      resource.scopeMetrics.flatMap((scope) => scope.metrics)
    );
}

function metricPoints(name) {
  return collectMetrics()
    .find((metric) => metric.descriptor.name === name)
    ?.dataPoints.map((point) => ({
      attributes: point.attributes,
      value: point.value,
    }));
}

describe("ai observability helpers", () => {
  test("withSpan creates a span with the name, attributes, and OK status", async () => {
    const result = await withSpan(
      "chat.request",
      async () => "ok",
      { "chat.workspace_slug": "acme", "chat.attachments_count": 2 }
    );

    expect(result).toBe("ok");
    const [span] = spanExporter.getFinishedSpans();
    expect(span.name).toBe("chat.request");
    expect(span.attributes).toMatchObject({
      "chat.workspace_slug": "acme",
      "chat.attachments_count": 2,
    });
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  test("withSpan ends with ERROR when the callback throws", async () => {
    await expect(
      withSpan("llm.generate", async () => {
        throw new Error("rate limited");
      })
    ).rejects.toThrow("rate limited");

    const [span] = spanExporter.getFinishedSpans();
    expect(span.name).toBe("llm.generate");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  test("recordLlmCall emits request and token metrics with labels", async () => {
    await withSpan("llm.generate", () =>
      recordLlmCall({
        provider: "openai",
        model: "gpt-4.1-nano",
        inputTokens: 10,
        outputTokens: 5,
        latencyMs: 250,
        cost: 0.001,
      })
    );
    await metricReader.forceFlush();

    expect(metricPoints("llm_requests_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            provider: "openai",
            model: "gpt-4.1-nano",
            result: "success",
          }),
        }),
      ])
    );
    expect(metricPoints("llm_input_tokens_total")[0].value).toBe(10);
    expect(metricPoints("llm_output_tokens_total")[0].value).toBe(5);
  });

  test("recordLlmCall emits error kind on failure", async () => {
    await recordLlmCall({
      provider: "anthropic",
      model: "claude",
      error: new Error("429 Too Many Requests"),
    });
    await metricReader.forceFlush();

    expect(metricPoints("llm_errors_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            provider: "anthropic",
            model: "claude",
            "error.kind": "rate_limit",
          }),
        }),
      ])
    );
    expect(metricPoints("llm_requests_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            provider: "anthropic",
            model: "claude",
            result: "error",
          }),
        }),
      ])
    );
  });

  test("recordRagCall emits chunks and best score metrics", async () => {
    await recordRagCall({
      vectorDb: "qdrant",
      chunks: 3,
      bestScore: 0.87,
      latencyMs: 42,
    });
    await metricReader.forceFlush();

    expect(metricPoints("rag_chunks_retrieved")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({ vector_db: "qdrant" }),
        }),
      ])
    );
    expect(metricPoints("rag_best_similarity_score")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({ vector_db: "qdrant" }),
        }),
      ])
    );
  });

  test("recordToolCall emits tool name", async () => {
    await recordToolCall({ toolName: "web-search", latencyMs: 10 });
    await metricReader.forceFlush();

    expect(metricPoints("tool_calls_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({ "tool.name": "web-search" }),
        }),
      ])
    );
  });

  test("recordFeedback adds feedback attributes to an active span", async () => {
    await withSpan("chat.request", () =>
      recordFeedback({
        score: false,
        category: "informacao_incorreta",
        commentLength: 11,
      })
    );

    const [span] = spanExporter.getFinishedSpans();
    expect(span.attributes).toMatchObject({
      "feedback.score": "negative",
      "feedback.category": "informacao_incorreta",
      "feedback.comment_length": 11,
    });
  });

  test("nested spans keep chat.request -> rag -> llm.generate hierarchy and TTFT event", async () => {
    await withSpan(
      "chat.request",
      () =>
        withSpan(
          "rag.vector_search",
          () =>
            withSpan(
              "llm.generate",
              (span) => {
                span.addEvent("llm.first_token", {
                  "llm.time_to_first_token_ms": 123,
                });
                return "ok";
              },
              { "llm.streaming": true }
            ),
          { "vector.db": "qdrant" }
        ),
      { "chat.mode": "query" }
    );

    const finishedSpans = spanExporter.getFinishedSpans();
    const chatSpan = finishedSpans.find(
      (span) => span.name === "chat.request"
    );
    const llmSpan = finishedSpans.find(
      (span) => span.name === "llm.generate"
    );
    const ragSpan = finishedSpans.find(
      (span) => span.name === "rag.vector_search"
    );
    expect(chatSpan.name).toBe("chat.request");
    expect(ragSpan.parentSpanContext.spanId).toBe(chatSpan.spanContext().spanId);
    expect(llmSpan.name).toBe("llm.generate");
    expect(llmSpan.parentSpanContext.spanId).toBe(ragSpan.spanContext().spanId);
    expect(llmSpan.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "llm.first_token",
          attributes: expect.objectContaining({
            "llm.time_to_first_token_ms": 123,
          }),
        }),
      ])
    );
  });

  test("nested spans keep chat.request -> agent.reasoning -> tool.call hierarchy", async () => {
    await withSpan(
      "chat.request",
      () =>
        withSpan(
          "agent.reasoning",
          () =>
            withSpan(
              "tool.call",
              () => "ok",
              { "tool.name": "search" }
            ),
          { "agent.provider": "openai", "agent.iteration": 1 }
        ),
      { "chat.workspace_slug": "acme" }
    );

    const finishedSpans = spanExporter.getFinishedSpans();
    const chatSpan = finishedSpans.find(
      (span) => span.name === "chat.request"
    );
    const agentSpan = finishedSpans.find(
      (span) => span.name === "agent.reasoning"
    );
    const toolSpan = finishedSpans.find((span) => span.name === "tool.call");
    expect(agentSpan.parentSpanContext.spanId).toBe(
      chatSpan.spanContext().spanId
    );
    expect(toolSpan.parentSpanContext.spanId).toBe(
      agentSpan.spanContext().spanId
    );
  });

  test("spans never receive prompt, response, or embedding content", async () => {
    await withSpan(
      "chat.request",
      async () => {
        await recordLlmCall({ provider: "openai", model: "gpt" });
        await recordRagCall({
          vectorDb: "qdrant",
          chunks: 1,
          bestScore: 0.9,
        });
        await recordToolCall({ toolName: "search" });
        return "ok";
      },
      { "chat.workspace_slug": "acme" }
    );

    const forbiddenKeys = ["messages", "prompt", "content", "response", "embedding"];
    const span = spanExporter.getFinishedSpans()[0];
    const attributeKeys = [
      ...Object.keys(span.attributes),
      ...span.events.flatMap((event) => Object.keys(event.attributes)),
    ];
    for (const key of attributeKeys) {
      expect(forbiddenKeys.some((forbidden) => key.includes(forbidden))).toBe(
        false
      );
    }
  });

  test("OTEL_SDK_DISABLED=true suppresses spans and metrics", async () => {
    process.env.OTEL_SDK_DISABLED = "true";
    await withSpan("chat.request", async () => "ok");
    await recordLlmCall({ provider: "openai", model: "gpt" });
    await metricReader.forceFlush();

    expect(spanExporter.getFinishedSpans()).toEqual([]);
    expect(metricPoints("llm_requests_total")).toBeUndefined();
  });

  test("getAITracer and getAIMeter use the ai scope", () => {
    expect(getAITracer()).toBeDefined();
    expect(getAIMeter()).toBeDefined();
  });
});

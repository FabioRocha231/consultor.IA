/* eslint-env jest, node */
describe("dashboard metric snapshot", () => {
  let ai;

  beforeEach(() => {
    delete process.env.OTEL_SDK_DISABLED;
    jest.isolateModules(() => {
      ai = require("../../utils/observability/ai");
    });
  });

  it("returns counters and percentiles from recorded calls", () => {
    ai.recordLlmCall({
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 10,
      outputTokens: 5,
      latencyMs: 250,
      ttftMs: 80,
      cost: 0.001,
    });
    ai.recordLlmCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 500,
      ttftMs: 120,
      error: new Error("timeout"),
    });
    ai.recordRagCall({ latencyMs: 95 });
    ai.recordRagCall({ latencyMs: 380 });
    ai.recordToolCall({ toolName: "createLead", latencyMs: 120 });

    const snapshot = ai.getMetricSnapshot();

    expect(snapshot.llmRequests).toBe(2);
    expect(snapshot.llmErrors).toBe(1);
    expect(snapshot.llmErrorsByKind).toEqual({ timeout: 1 });
    expect(snapshot.llmLatencyP50Ms).toBe(250);
    expect(snapshot.llmLatencyP95Ms).toBe(500);
    expect(snapshot.ttftP50Ms).toBe(80);
    expect(snapshot.ttftP95Ms).toBe(120);
    expect(snapshot.ragRetrievalP50Ms).toBe(95);
    expect(snapshot.ragRetrievalP95Ms).toBe(380);
    expect(snapshot.toolCallLatencyP95Ms).toBe(120);
    expect(snapshot.llmInputTokens).toBe(10);
    expect(snapshot.llmOutputTokens).toBe(5);
    expect(snapshot.llmEstimatedCostUsd).toBe(0.001);
    expect(snapshot.since).toEqual(expect.any(String));
    expect(snapshot.until).toEqual(expect.any(String));
  });
});

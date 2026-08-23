/* eslint-env jest, node */
const crypto = require("crypto");
const { metrics, trace } = require("@opentelemetry/api");
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
const { postN8nWebhook } = require("../../../integrations/n8n/client");

const organization = {
  id: "org-1",
  n8nWebhookUrl: "https://org.n8n.cloud/webhook/test",
  n8nApiKey: "secret-key",
};

function successResponse(tool = "createLead", output = { lead_id: "lead-1" }) {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      ok: true,
      tool,
      output,
      error: null,
      timestamp: "2026-08-23T12:00:00.000Z",
    }),
  };
}

function failureResponse(status, code, message) {
  return {
    status,
    ok: status < 400,
    headers: { get: () => null },
    json: async () => ({
      ok: false,
      tool: "createLead",
      output: null,
      error: { code, message },
      timestamp: "2026-08-23T12:00:00.000Z",
    }),
  };
}

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

  metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE
  );
  metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
  });
  metrics.setGlobalMeterProvider(
    new MeterProvider({ readers: [metricReader] })
  );
  spanExporter.reset();
  delete process.env.OTEL_SDK_DISABLED;
  delete process.env.N8N_HTTP_TIMEOUT_MS;
  global.fetch = jest.fn();
});

afterEach(() => {
  delete global.fetch;
  trace.disable();
  metrics.disable();
  jest.useRealTimers();
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

describe("n8n client", () => {
  test("posts the envelope with HMAC signature and correlation headers", async () => {
    global.fetch.mockResolvedValue(successResponse());

    const result = await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );

    expect(result.ok).toBe(true);
    expect(result.output.lead_id).toBe("lead-1");
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe(organization.n8nWebhookUrl);
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Correlation-Id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.headers["traceparent"]).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/
    );
    expect(options.headers["X-N8N-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);

    const payload = JSON.parse(options.body);
    expect(payload.schema_version).toBe("1.0");
    expect(payload.tool).toBe("createLead");
    expect(payload.organization_id).toBe("org-1");
    expect(payload.input).toEqual({
      name: "Joana",
      email: "joana@example.com",
      source: "site",
    });
    expect(payload.correlation_id).toBe(options.headers["X-Correlation-Id"]);
    expect(payload.idempotency_key).toBe(options.headers["Idempotency-Key"]);
    expect(payload.trace_id).toBe(options.headers["traceparent"].split("-")[1]);

    const expectedSignature = crypto
      .createHmac("sha256", organization.n8nApiKey)
      .update(options.body)
      .digest("hex");
    expect(options.headers["X-N8N-Signature"]).toBe(
      `sha256=${expectedSignature}`
    );
  });

  test("retries 503 once, reusing idempotency and correlation ids", async () => {
    global.fetch
      .mockResolvedValueOnce({
        status: 503,
        ok: false,
        headers: { get: (name) => (name === "retry-after" ? "0" : null) },
        json: async () => ({}),
      })
      .mockResolvedValueOnce(successResponse());

    const result = await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    const firstBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(secondBody.idempotency_key).toBe(firstBody.idempotency_key);
    expect(secondBody.correlation_id).toBe(firstBody.correlation_id);
  });

  test("does not retry 4xx responses", async () => {
    global.fetch.mockResolvedValue(failureResponse(400, "4xx", "bad request"));

    const result = await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      code: "4xx",
      message: "n8n returned HTTP 400",
    });
  });

  test("returns a network error envelope when fetch rejects", async () => {
    global.fetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("network");
    expect(result.error.message).toContain("ECONNREFUSED");
  });

  test("retries timeout once before failing", async () => {
    jest.useFakeTimers();
    let calls = 0;
    global.fetch = jest.fn((_url, options) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new Error("n8n request timed out"))
        );
      });
    });
    process.env.N8N_HTTP_TIMEOUT_MS = "50";

    const promise = postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );
    await jest.advanceTimersByTimeAsync(2100);
    const result = await promise;

    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("timeout");
  });

  test("emits the n8n.webhook span and metrics", async () => {
    global.fetch.mockResolvedValue(successResponse());

    const result = await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );
    await metricReader.forceFlush();

    expect(result.ok).toBe(true);
    const [span] = spanExporter.getFinishedSpans();
    expect(span.name).toBe("n8n.webhook");
    expect(span.attributes).toMatchObject({
      "n8n.tool": "createLead",
      "n8n.url_host": "org.n8n.cloud",
      "n8n.status_code": 200,
      "n8n.attempt": 1,
    });
    expect(span.attributes["n8n.duration_ms"]).toEqual(expect.any(Number));

    expect(metricPoints("n8n_requests_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            tool: "createLead",
            organization: "org-1",
            result: "success",
          }),
        }),
      ])
    );
    expect(metricPoints("n8n_latency_ms")[0].attributes.tool).toBe(
      "createLead"
    );
  });

  test("records failure metrics with error kind", async () => {
    global.fetch.mockResolvedValue(failureResponse(500, "5xx", "boom"));

    await postN8nWebhook(
      "createLead",
      { name: "Joana", email: "joana@example.com", source: "site" },
      { organization }
    );
    await metricReader.forceFlush();

    expect(metricPoints("n8n_failures_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({
            tool: "createLead",
            "error.kind": "5xx",
          }),
        }),
      ])
    );
    expect(metricPoints("n8n_requests_total")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attributes: expect.objectContaining({ result: "error" }),
        }),
      ])
    );
  });
});

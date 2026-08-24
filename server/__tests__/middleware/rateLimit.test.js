const express = require("express");
const { metrics } = require("@opentelemetry/api");
const {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  chatLimiter,
  defaultKeyGenerator,
  loginLimiter,
  makeKeyGenerator,
  makeLimiter,
} = require("../../utils/middleware/rateLimit");

let metricExporter;
let metricReader;

async function startServer(limiter) {
  const app = express();
  app.get("/", limiter, (_request, response) =>
    response.status(200).json({ ok: true })
  );
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function request(baseUrl) {
  const response = await fetch(baseUrl);
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function collectMetrics() {
  await metricReader.forceFlush();
  const resourceMetrics = await metricExporter.getMetrics();
  return resourceMetrics.flatMap((resource) =>
    resource.scopeMetrics.flatMap((scope) => scope.metrics)
  );
}

beforeAll(() => {
  metrics.disable();
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
  delete process.env.RATE_LIMIT_ENABLED;
});

afterAll(async () => {
  await metricReader.forceFlush().catch(() => {});
  metrics.disable();
  delete process.env.RATE_LIMIT_ENABLED;
});

describe("rate limiting middleware", () => {
  test("loginLimiter returns 429 after five requests in the window", async () => {
    const { server, baseUrl } = await startServer(loginLimiter);
    try {
      const statuses = [];
      for (let index = 0; index < 6; index += 1) {
        statuses.push((await request(baseUrl)).status);
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
      expect((await request(baseUrl)).body).toMatchObject({
        error: "rate_limited",
        route: "login",
      });
    } finally {
      await closeServer(server);
    }
  });

  test("chatLimiter returns 429 after thirty requests in the window", async () => {
    const { server, baseUrl } = await startServer(chatLimiter);
    try {
      const statuses = [];
      for (let index = 0; index < 31; index += 1) {
        statuses.push((await request(baseUrl)).status);
      }
      expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(
        true
      );
      expect(statuses[30]).toBe(429);
    } finally {
      await closeServer(server);
    }
  });

  test("RATE_LIMIT_ENABLED=false disables limits", async () => {
    process.env.RATE_LIMIT_ENABLED = "false";
    const disabledLimiter = makeLimiter({
      windowMs: 60_000,
      max: 1,
      name: "disabled_test",
    });
    const { server, baseUrl } = await startServer(disabledLimiter);
    try {
      expect((await request(baseUrl)).status).toBe(200);
      expect((await request(baseUrl)).status).toBe(200);
    } finally {
      delete process.env.RATE_LIMIT_ENABLED;
      await closeServer(server);
    }
  });

  test("key generator uses user.id when authenticated and IP otherwise", () => {
    const userKeyGenerator = makeKeyGenerator();
    const userRequest = { ip: "203.0.113.9", user: { id: 42 } };
    expect(userKeyGenerator(userRequest, { locals: {} })).toBe("user:42");
    expect(userRequest.rateLimitKeyType).toBe("user");

    const ipRequest = { ip: "203.0.113.9" };
    expect(defaultKeyGenerator(ipRequest, { locals: {} })).toBe("203.0.113.9");
    expect(ipRequest.rateLimitKeyType).toBe("ip");
  });

  test("blocked requests increment rate_limit_blocked_total", async () => {
    const limiter = makeLimiter({
      windowMs: 60_000,
      max: 1,
      name: "metric_test",
    });
    const { server, baseUrl } = await startServer(limiter);
    try {
      await request(baseUrl);
      const blocked = await request(baseUrl);
      expect(blocked.status).toBe(429);

      const metric = (await collectMetrics()).find(
        (entry) => entry.descriptor.name === "rate_limit_blocked_total"
      );
      expect(metric).toBeDefined();
      const point = metric.dataPoints.find(
        (entry) => entry.attributes.route === "metric_test"
      );
      expect(point).toBeDefined();
      expect(point.attributes).toMatchObject({
        route: "metric_test",
        key_type: "ip",
      });
      expect(point.value).toBe(1);
    } finally {
      await closeServer(server);
    }
  });
});

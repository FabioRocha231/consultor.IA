const express = require("express");
const { metrics } = require("@opentelemetry/api");
const {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const { httpMetricsMiddleware } = require("../../utils/middleware/httpMetrics");

let metricExporter;
let metricReader;

async function startServer() {
  const app = express();
  app.use(httpMetricsMiddleware);
  app.get("/hello", (_request, response) =>
    response.status(200).json({ ok: true })
  );
  app.post("/submit", (_request, response) =>
    response.status(400).json({ error: "bad_request" })
  );
  app.get("/error", (_request, response) =>
    response.status(500).json({ error: "server_error" })
  );
  app.use((_request, response) => response.status(404).json({ error: "nf" }));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function collectMetrics() {
  await metricReader.forceFlush();
  return metricExporter.getMetrics().flatMap((resource) =>
    resource.scopeMetrics.flatMap((scope) => scope.metrics)
  );
}

async function metric(name) {
  return (await collectMetrics()).find(
    (entry) => entry.descriptor.name === name
  );
}

beforeEach(() => {
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
});

afterEach(async () => {
  await metricReader.forceFlush().catch(() => {});
  metrics.disable();
});

describe("http metrics middleware", () => {
  test("records 200 responses as 2xx without incrementing the error counter", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/hello`)).status).toBe(200);

      const duration = await metric("http_request_duration_seconds");
      const errors = await metric("http_errors_total");
      expect(duration).toBeDefined();
      expect(
        duration.dataPoints.find(
          (point) => point.attributes.status_class === "2xx"
        )
      ).toBeDefined();
      expect(errors).toBeUndefined();
    } finally {
      await closeServer(server);
    }
  });

  test("increments the error counter with 4xx", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/submit`, { method: "POST" })).status).toBe(
        400
      );

      const errors = await metric("http_errors_total");
      expect(errors).toBeDefined();
      const point = errors.dataPoints.find(
        (entry) => entry.attributes.status_class === "4xx"
      );
      expect(point.attributes).toMatchObject({
        method: "POST",
        route: "/submit",
        status_class: "4xx",
      });
      expect(point.value).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test("increments the error counter with 5xx", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/error`)).status).toBe(500);

      const errors = await metric("http_errors_total");
      const point = errors.dataPoints.find(
        (entry) => entry.attributes.status_class === "5xx"
      );
      expect(point.value).toBe(1);
    } finally {
      await closeServer(server);
    }
  });

  test("uses unmatched for unknown routes", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/missing`)).status).toBe(404);

      const duration = await metric("http_request_duration_seconds");
      const point = duration.dataPoints.find(
        (entry) => entry.attributes.route === "unmatched"
      );
      expect(point.attributes).toMatchObject({
        method: "GET",
        route: "unmatched",
        status_class: "4xx",
      });
    } finally {
      await closeServer(server);
    }
  });

  test("records GET and POST methods with distinct routes", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/hello`)).status).toBe(200);
      expect(
        (await fetch(`${baseUrl}/submit`, { method: "POST" })).status
      ).toBe(400);

      const duration = await metric("http_request_duration_seconds");
      expect(
        duration.dataPoints.find(
          (point) =>
            point.attributes.method === "GET" &&
            point.attributes.route === "/hello"
        )
      ).toBeDefined();
      expect(
        duration.dataPoints.find(
          (point) =>
            point.attributes.method === "POST" &&
            point.attributes.route === "/submit"
        )
      ).toBeDefined();
    } finally {
      await closeServer(server);
    }
  });

  test("records latency greater than zero", async () => {
    const { server, baseUrl } = await startServer();
    try {
      expect((await fetch(`${baseUrl}/hello`)).status).toBe(200);

      const duration = await metric("http_request_duration_seconds");
      const point = duration.dataPoints.find(
        (entry) => entry.attributes.route === "/hello"
      );
      expect(point.value.sum).toBeGreaterThan(0);
    } finally {
      await closeServer(server);
    }
  });
});

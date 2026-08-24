const { metrics } = require("@opentelemetry/api");
const {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} = require("@opentelemetry/sdk-metrics");
const {
  recordFeedbackCounters,
} = require("../../../utils/observability/ai");

let metricExporter;
let metricReader;

async function collectMetrics() {
  await metricReader.forceFlush();
  return metricExporter
    .getMetrics()
    .flatMap((resource) =>
      resource.scopeMetrics.flatMap((scope) => scope.metrics)
    );
}

async function metricPoints(name) {
  return (await collectMetrics())
    .find((metric) => metric.descriptor.name === name)
    ?.dataPoints.map((point) => ({
      attributes: point.attributes,
      value: point.value,
    }));
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
  delete process.env.OTEL_SDK_DISABLED;
});

afterEach(async () => {
  await metricReader.forceFlush().catch(() => {});
  metrics.disable();
});

describe("feedback metric counters", () => {
  test("increments positive counter with category", async () => {
    recordFeedbackCounters({ score: true, category: "accurate" });

    expect(await metricPoints("feedback_positive_total")).toEqual([
      expect.objectContaining({
        attributes: { category: "accurate" },
        value: 1,
      }),
    ]);
    expect(await metricPoints("feedback_negative_total")).toBeUndefined();
  });

  test("increments negative counter with category", async () => {
    recordFeedbackCounters({ score: false, category: "inaccurate" });

    expect(await metricPoints("feedback_negative_total")).toEqual([
      expect.objectContaining({
        attributes: { category: "inaccurate" },
        value: 1,
      }),
    ]);
  });

  test("normalizes missing category to unspecified", async () => {
    recordFeedbackCounters({ score: false, category: null });

    expect(await metricPoints("feedback_negative_total")).toEqual([
      expect.objectContaining({
        attributes: { category: "unspecified" },
        value: 1,
      }),
    ]);
  });

  test("does not increment counters for null score", async () => {
    recordFeedbackCounters({ score: null, category: "accurate" });

    expect(await metricPoints("feedback_positive_total")).toBeUndefined();
    expect(await metricPoints("feedback_negative_total")).toBeUndefined();
  });
});

const { metrics } = require("@opentelemetry/api");
const {
  OTLPMetricExporter,
} = require("@opentelemetry/exporter-metrics-otlp-http");
const { metrics: sdkMetrics } = require("@opentelemetry/sdk-node");

function createMetricReader() {
  return new sdkMetrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 30_000,
  });
}

function getMeter(name = "consultor-ia") {
  return metrics.getMeter(name);
}

module.exports = {
  createMetricReader,
  getMeter,
};

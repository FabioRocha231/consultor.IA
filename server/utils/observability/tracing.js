const { trace } = require("@opentelemetry/api");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");

function createTraceExporter() {
  return new OTLPTraceExporter();
}

function getTracer(name = "consultor-ia") {
  return trace.getTracer(name);
}

module.exports = {
  createTraceExporter,
  getTracer,
};

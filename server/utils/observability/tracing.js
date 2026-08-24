const { trace } = require("@opentelemetry/api");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { redactSpanAttributes } = require("./redaction");
const { isSensitiveDebugEnabled } = require("./sensitiveDebug");

function createTraceExporter() {
  return new OTLPTraceExporter();
}

function redactReadableSpan(span) {
  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status: span.status,
    attributes: redactSpanAttributes(span.attributes),
    links: span.links,
    events: (span.events || []).map((event) => ({
      ...event,
      attributes: redactSpanAttributes(event.attributes || {}),
    })),
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

class SensitiveDebugBatchSpanProcessor extends BatchSpanProcessor {
  onEnd(span) {
    if (isSensitiveDebugEnabled()) {
      super.onEnd(redactReadableSpan(span));
      return;
    }
    if (span.attributes?.["sensitive.debug"] === true) return;
    super.onEnd(span);
  }
}

function createSpanProcessor() {
  return new SensitiveDebugBatchSpanProcessor(createTraceExporter());
}

function getTracer(name = "consultor-ia") {
  return trace.getTracer(name);
}

module.exports = {
  SensitiveDebugBatchSpanProcessor,
  createTraceExporter,
  createSpanProcessor,
  getTracer,
};

const {
  context,
  metrics,
  trace,
  SpanStatusCode,
} = require("@opentelemetry/api");

const INTEGRATIONS_SCOPE = "consultor-ia.integrations";

function getIntegrationTracer() {
  return trace.getTracer(INTEGRATIONS_SCOPE);
}

function getIntegrationMeter() {
  return metrics.getMeter(INTEGRATIONS_SCOPE);
}

function isDisabled() {
  return process.env.OTEL_SDK_DISABLED === "true";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function setSpanAttributes(span, attributes = {}) {
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) span.setAttribute(key, value);
    }
    return;
  }
  const activeSpan = trace.getSpan(context.active());
  for (const [key, value] of Object.entries(attributes)) {
    if (
      value !== undefined &&
      value !== null &&
      ["number", "string", "boolean"].includes(typeof value)
    )
      activeSpan?.setAttribute(key, value);
  }
}

function getInstruments() {
  const meter = getIntegrationMeter();
  return {
    n8nRequests: meter.createCounter("n8n_requests_total"),
    n8nFailures: meter.createCounter("n8n_failures_total"),
    n8nLatency: meter.createHistogram("n8n_latency_ms"),
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
  const tracer = getIntegrationTracer();
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

/**
 * Record one logical n8n webhook call.
 * @param {{tool?: string, organization?: string, result?: "success"|"error", errorKind?: string|null, latencyMs?: number|null, attempt?: number|null, statusCode?: number|null, span?: object|null}} params
 */
function recordN8nCall({
  tool = "unknown",
  organization = null,
  result = "success",
  errorKind = null,
  latencyMs = null,
  attempt = null,
  statusCode = null,
  span = null,
} = {}) {
  if (isDisabled()) return;
  const instruments = getInstruments();
  const labels = {
    tool: String(tool || "unknown"),
    organization: organization ? String(organization) : "unknown",
  };
  instruments.n8nRequests.add(1, {
    ...labels,
    result: result === "error" ? "error" : "success",
  });
  if (result === "error")
    instruments.n8nFailures.add(1, {
      ...labels,
      "error.kind": String(errorKind || "other"),
    });
  const latency = finiteNumber(latencyMs);
  if (latency !== null)
    instruments.n8nLatency.record(latency, { tool: labels.tool });

  setSpanAttributes(span, {
    "n8n.tool": labels.tool,
    "n8n.status_code": statusCode,
    "n8n.duration_ms": latency,
    "n8n.attempt": attempt,
    "n8n.error_kind": errorKind || null,
  });
}

module.exports = {
  getIntegrationMeter,
  getIntegrationTracer,
  recordN8nCall,
  withSpan,
};

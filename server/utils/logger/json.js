const { trace, context } = require("@opentelemetry/api");
const { format } = require("winston");
const { getRequestContext } = require("../../middleware/requestContext");
const { redact } = require("./redact");

const LEVEL = Symbol.for("level");
const SPLAT = Symbol.for("splat");

function currentTraceIds() {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const { traceId, spanId } = span.spanContext();
  return { trace_id: traceId, span_id: spanId };
}

module.exports = format((info) => {
  const { level, message, ...metadata } = info;
  const request = getRequestContext() || {};
  const output = {
    level,
    timestamp: new Date().toISOString(),
    msg: message,
    service: process.env.OTEL_SERVICE_NAME || "consultor-ia",
    ...redact(metadata),
    request_id: request.requestId || info.request_id,
    ...currentTraceIds(),
  };
  output[LEVEL] = info[LEVEL] || level;
  output[SPLAT] = info[SPLAT];
  return output;
})();

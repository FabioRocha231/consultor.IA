const { getMeter } = require("../observability/metrics");

const HTTP_SCOPE = "consultor-ia.http";
const HTTP_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function getHttpInstruments() {
  const meter = getMeter(HTTP_SCOPE);
  return {
    httpRequestDuration: meter.createHistogram(
      "http_request_duration_seconds",
      { boundaries: HTTP_LATENCY_BUCKETS }
    ),
    httpErrors: meter.createCounter("http_errors_total"),
  };
}

function statusClass(statusCode) {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

function resolveRoute(request) {
  if (request.route?.path)
    return request.baseUrl
      ? `${request.baseUrl}${request.route.path}`
      : request.route.path;
  if (request.baseUrl) return request.baseUrl;
  return "unmatched";
}

function httpMetricsMiddleware(request, response, next) {
  const startedAt = process.hrtime.bigint();
  response.on("finish", () => {
    const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const labels = {
      method: request.method,
      route: resolveRoute(request),
      status_class: statusClass(response.statusCode),
    };
    getHttpInstruments().httpRequestDuration.record(elapsedSeconds, labels);
    if (response.statusCode >= 400)
      getHttpInstruments().httpErrors.add(1, labels);
  });
  next();
}

module.exports = {
  httpMetricsMiddleware,
};

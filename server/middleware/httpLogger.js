const { getLogger } = require("../utils/logger");
const { getRequestContext } = require("./requestContext");

const httpLogger = () => (req, res, next) => {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const request = getRequestContext() || {};
    getLogger().info("http.request", {
      request_id: request.requestId || req.request_id,
      trace_id: request.traceId || req.trace_id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(3)),
    });
  });
  next();
};

module.exports = {
  httpLogger,
};

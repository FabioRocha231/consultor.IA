const { AsyncLocalStorage } = require("node:async_hooks");
const { v4: uuidv4 } = require("uuid");

const requestContextStorage = new AsyncLocalStorage();

function traceIdFromTraceparent(headerValue = "") {
  const parts = String(headerValue).split("-");
  return parts[1] || null;
}

function requestContext(req, _res, next) {
  const header = (name) => req.get?.(name) || req.headers?.[name.toLowerCase()];
  const requestId = header("x-request-id") || uuidv4();
  req.request_id = requestId;
  req.trace_id = traceIdFromTraceparent(header("traceparent")) || req.trace_id;
  requestContextStorage.run({ requestId, traceId: req.trace_id }, () => next());
}

function getRequestContext() {
  return requestContextStorage.getStore();
}

module.exports = {
  requestContext,
  getRequestContext,
  traceIdFromTraceparent,
};

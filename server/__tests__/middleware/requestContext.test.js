const {
  requestContext,
  getRequestContext,
  traceIdFromTraceparent,
} = require("../../middleware/requestContext");

function makeRequest(headers = {}) {
  return {
    headers,
    get(name) {
      return headers[name.toLowerCase()];
    },
  };
}

function runMiddleware(req) {
  return new Promise((resolve) => {
    requestContext(req, {}, () => resolve(getRequestContext()));
  });
}

describe("requestContext middleware", () => {
  test("generates a request_id when absent", async () => {
    const req = makeRequest();
    const store = await runMiddleware(req);

    expect(req.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(store.requestId).toBe(req.request_id);
  });

  test("propagates request_id and extracts trace_id from traceparent", async () => {
    const req = makeRequest({
      "x-request-id": "req-123",
      traceparent:
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    });
    const store = await runMiddleware(req);

    expect(req.request_id).toBe("req-123");
    expect(req.trace_id).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(store.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  test("parses the trace id from a traceparent header", () => {
    expect(
      traceIdFromTraceparent(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
      )
    ).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });
});

/* eslint-env jest, node */
const crypto = require("crypto");
const {
  N8N_TOOL_NAMES,
  createPayloadEnvelope,
  createResponseEnvelope,
  createSignature,
  isValidToolName,
  validatePayloadEnvelope,
  verifySignature,
} = require("../../../integrations/n8n/contract");

const validPayload = {
  schema_version: "1.0",
  correlation_id: "corr-1",
  trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
  organization_id: "org-1",
  tool: "createLead",
  idempotency_key: "idem-1",
  input: { name: "Joana", email: "joana@example.com", source: "site" },
  timestamp: "2026-08-23T12:00:00.000Z",
};

describe("n8n contract", () => {
  test("validates every required payload field", () => {
    expect(validatePayloadEnvelope(validPayload)).toEqual([]);

    const missing = [
      "schema_version",
      "correlation_id",
      "trace_id",
      "organization_id",
      "tool",
      "idempotency_key",
      "input",
      "timestamp",
    ];
    for (const field of missing) {
      const invalid = { ...validPayload };
      delete invalid[field];
      expect(validatePayloadEnvelope(invalid)).toContainEqual(
        expect.stringContaining(field)
      );
    }
  });

  test("createPayloadEnvelope returns a complete envelope", () => {
    const payload = createPayloadEnvelope({
      tool: "createLead",
      input: { name: "Joana", email: "joana@example.com", source: "site" },
      organization: { id: "org-1" },
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      timestamp: validPayload.timestamp,
    });
    expect(payload).toEqual(validPayload);
  });

  test("only the six explicit tool names are valid", () => {
    expect(N8N_TOOL_NAMES).toEqual([
      "scheduleAppointment",
      "getAvailableSlots",
      "createLead",
      "findCustomer",
      "getOrderStatus",
      "requestHumanSupport",
    ]);
    for (const tool of N8N_TOOL_NAMES) expect(isValidToolName(tool)).toBe(true);
    expect(isValidToolName("callArbitraryUrl")).toBe(false);
    expect(isValidToolName("fetch")).toBe(false);
  });

  test("creates and verifies the HMAC-SHA256 signature", () => {
    const body = JSON.stringify(validPayload);
    const signature = createSignature(body, "secret-key");
    const expected = crypto
      .createHmac("sha256", "secret-key")
      .update(body)
      .digest("hex");
    expect(signature).toBe(`sha256=${expected}`);
    expect(verifySignature(body, "secret-key", signature)).toBe(true);
    expect(verifySignature(body, "wrong-key", signature)).toBe(false);
  });

  test("response envelope validation accepts success and error shapes", () => {
    const success = createResponseEnvelope({
      ok: true,
      tool: "createLead",
      output: { lead_id: "lead-1", status: "new" },
      timestamp: validPayload.timestamp,
    });
    expect(success.ok).toBe(true);

    const failure = createResponseEnvelope({
      ok: false,
      tool: "createLead",
      error: { code: "5xx", message: "n8n unavailable" },
      timestamp: validPayload.timestamp,
    });
    expect(failure.error).toEqual({ code: "5xx", message: "n8n unavailable" });
  });
});

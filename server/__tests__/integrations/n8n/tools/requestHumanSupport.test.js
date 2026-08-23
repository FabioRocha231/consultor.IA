/* eslint-env jest, node */
jest.mock("../../../../integrations/n8n/client", () => ({
  postN8nWebhook: jest.fn(),
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const {
  requestHumanSupport,
} = require("../../../../integrations/n8n/tools/requestHumanSupport");
const { postN8nWebhook } = require("../../../../integrations/n8n/client");
const {
  resolveOrganizationContext,
} = require("../../../../integrations/n8n/tools/context");

const context = {
  organization: {
    id: "org-1",
    n8nWebhookUrl: "https://org.n8n.cloud/webhook/test",
    n8nApiKey: "secret-key",
  },
  traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
};

describe("requestHumanSupport tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue(context);
  });

  test("calls the n8n client with the tool input", async () => {
    postN8nWebhook.mockResolvedValue({
      ok: true,
      output: { ticket_id: "ticket-456", eta_iso: "2026-08-23T13:00:00.000Z" },
    });

    const result = await requestHumanSupport.handler({
      conversation_id: "conv-1",
      reason: "Customer needs billing help",
      urgency: "high",
    });

    expect(postN8nWebhook).toHaveBeenCalledWith(
      "requestHumanSupport",
      {
        conversation_id: "conv-1",
        reason: "Customer needs billing help",
        urgency: "high",
      },
      context
    );
    expect(result).toContain("ticket-456");
  });

  test("returns a graceful failure envelope when n8n fails", async () => {
    postN8nWebhook.mockResolvedValue({
      ok: false,
      error: { code: "5xx", message: "support API unavailable" },
    });

    const result = await requestHumanSupport.handler({
      conversation_id: "conv-1",
      reason: "Customer needs billing help",
    });

    expect(JSON.parse(result)).toEqual({
      ok: false,
      error: "support API unavailable",
    });
  });

  test("returns a graceful failure envelope when fields are missing", async () => {
    const result = await requestHumanSupport.handler({
      conversation_id: "conv-1",
    });

    expect(JSON.parse(result)).toEqual({
      ok: false,
      error: "Missing required fields: conversation_id, reason.",
    });
    expect(postN8nWebhook).not.toHaveBeenCalled();
  });
});

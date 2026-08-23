/* eslint-env jest, node */
jest.mock("../../../../integrations/n8n/client", () => ({
  postN8nWebhook: jest.fn(),
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const { createLead } = require("../../../../integrations/n8n/tools/createLead");
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

describe("createLead tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue(context);
  });

  test("calls the n8n client with the tool input", async () => {
    postN8nWebhook.mockResolvedValue({
      ok: true,
      output: { lead_id: "lead-123", status: "new" },
    });

    const result = await createLead.handler({
      name: "Joana",
      email: "joana@example.com",
      phone: "11999999999",
      source: "website",
      notes: "Interested in plan B",
    });

    expect(postN8nWebhook).toHaveBeenCalledWith(
      "createLead",
      {
        name: "Joana",
        email: "joana@example.com",
        phone: "11999999999",
        source: "website",
        notes: "Interested in plan B",
      },
      context
    );
    expect(result).toContain("lead-123");
  });

  test("returns a readable error when n8n fails", async () => {
    postN8nWebhook.mockResolvedValue({
      ok: false,
      error: { code: "5xx", message: "CRM unavailable" },
    });

    const result = await createLead.handler({
      name: "Joana",
      email: "joana@example.com",
      source: "website",
    });

    expect(result).toContain("Failed to create lead");
    expect(result).toContain("CRM unavailable");
  });

  test("returns a readable error when required fields are missing", async () => {
    const result = await createLead.handler({ name: "Joana" });

    expect(result).toContain("Missing required fields");
    expect(postN8nWebhook).not.toHaveBeenCalled();
  });
});

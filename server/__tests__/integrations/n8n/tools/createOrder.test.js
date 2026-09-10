/* eslint-env jest, node */
jest.mock("../../../../models/orders", () => ({
  Order: { create: jest.fn() },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const { createOrder } = require("../../../../integrations/n8n/tools/createOrder");
const { Order } = require("../../../../models/orders");
const {
  resolveOrganizationContext,
} = require("../../../../integrations/n8n/tools/context");

const aibitat = {
  super: {
    handlerProps: {
      invocation: { workspace: { organizationId: "org-1" } },
    },
  },
};

describe("createOrder tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      traceparent: null,
    });
  });

  test("creates an order and returns a readable summary", async () => {
    Order.create.mockResolvedValue({
      order: {
        id: 7,
        customerName: "Joana",
        customerPhone: "11999999999",
        totalCents: 4590,
        items: [
          { menuItemId: 1, quantity: 1 },
          { menuItemId: 2, quantity: 2 },
        ],
      },
      error: null,
    });

    const result = await createOrder.handler.call(aibitat, {
      customerPhone: "11999999999",
      customerName: "Joana",
      items: [{ menuItemId: 1, quantity: 1 }],
      notes: "Entregar após 19h",
    });

    expect(resolveOrganizationContext).toHaveBeenCalledWith(aibitat.super);
    expect(Order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        customerPhone: "11999999999",
        customerName: "Joana",
        notes: "Entregar após 19h",
        idempotencyKey: expect.any(String),
      })
    );
    expect(result).toContain("Pedido #7");
    expect(result).toContain("R$ 45,90");
  });

  test("returns a readable error when required args are missing", async () => {
    const result = await createOrder.handler.call(aibitat, {
      customerPhone: "11999999999",
    });

    expect(result).toContain("Missing required fields");
    expect(Order.create).not.toHaveBeenCalled();
  });

  test("returns a readable error when order creation fails", async () => {
    Order.create.mockResolvedValue({
      order: null,
      error: "Some menu items do not belong to this organization.",
    });

    const result = await createOrder.handler.call(aibitat, {
      customerPhone: "11999999999",
      customerName: "Joana",
      items: [{ menuItemId: 99, quantity: 1 }],
    });

    expect(result).toContain("Falha ao criar pedido");
  });
  test("returns an interactive marker with button payload after creating an order", async () => {
    Order.create.mockResolvedValue({
      order: {
        id: 42,
        customerName: "Joana",
        customerPhone: "11999999999",
        totalCents: 4590,
        items: [{ menuItemId: 1, quantity: 1 }],
      },
      error: null,
    });
    aibitat.super.skipHandleExecution = false;

    const result = await createOrder.handler.call(aibitat, {
      customerPhone: "11999999999",
      customerName: "Joana",
      items: [{ menuItemId: 1, quantity: 1 }],
    });

    expect(typeof result).toBe("string");
    expect(result.startsWith("__INTERACTIVE__:")).toBe(true);
    expect(aibitat.super.skipHandleExecution).toBe(true);

    const decoded = JSON.parse(result.slice("__INTERACTIVE__:".length));
    expect(decoded.text).toContain("Pedido #42");
    expect(decoded.interactive.type).toBe("button");
    expect(Array.isArray(decoded.interactive.buttons)).toBe(true);
    expect(decoded.interactive.buttons).toHaveLength(3);
    expect(decoded.interactive.buttons.map((b) => b.reply.id)).toEqual([
      "confirm_42",
      "cancel_42",
      "edit_42",
    ]);
  });
});

/* eslint-env jest, node */
jest.mock("../../../../models/orders", () => ({
  Order: { updateStatus: jest.fn() },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const {
  updateOrderStatus,
} = require("../../../../integrations/n8n/tools/updateOrderStatus");
const { canTransition } = require("../../../../models/orderStateMachine");
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

describe("updateOrderStatus tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      traceparent: null,
    });
  });

  test("state machine allows only valid transitions", () => {
    expect(canTransition("pending", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready")).toBe(true);
    expect(canTransition("ready", "delivered")).toBe(true);
    expect(canTransition("pending", "delivered")).toBe(false);
    expect(canTransition("delivered", "confirmed")).toBe(false);
    expect(canTransition("unknown", "pending")).toBe(false);
  });

  test("updates an order status through the model", async () => {
    Order.updateStatus.mockResolvedValue({
      order: { id: 1, status: "confirmed" },
      error: null,
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "confirmed",
    });

    expect(resolveOrganizationContext).toHaveBeenCalledWith(aibitat.super);
    expect(Order.updateStatus).toHaveBeenCalledWith({
      id: 1,
      organizationId: "org-1",
      newStatus: "confirmed",
    });
    expect(result).toContain("Pedido #1 atualizado para confirmed");
  });

  test("returns a readable error when the transition is rejected", async () => {
    Order.updateStatus.mockResolvedValue({
      order: null,
      error: "Invalid order status transition: pending -> delivered",
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "delivered",
    });

    expect(result).toContain("Falha ao atualizar pedido");
    expect(result).toContain("Invalid order status transition");
  });
});

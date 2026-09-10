/* eslint-env jest, node */
jest.mock("../../../../models/orders", () => ({
  Order: { updateStatus: jest.fn() },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));
jest.mock("../../../../utils/middleware/multiUserProtected", () => ({
  ROLES: { admin: "admin", manager: "manager", default: "default" },
}));
jest.mock("../../../../integrations/whatsapp/client", () => ({
  sendWhatsAppText: jest.fn(),
}));
jest.mock("../../../../models/externalCommunicationConnector", () => ({
  ExternalCommunicationConnector: { getStrict: jest.fn() },
  WHATSAPP_SECRET_FIELDS: [],
}));

const {
  updateOrderStatus,
} = require("../../../../integrations/n8n/tools/updateOrderStatus");
const { canTransition } = require("../../../../models/orderStateMachine");
const { Order } = require("../../../../models/orders");
const { sendWhatsAppText } = require("../../../../integrations/whatsapp/client");
const {
  ExternalCommunicationConnector,
} = require("../../../../models/externalCommunicationConnector");
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
      user: null,
      traceparent: null,
    });
    ExternalCommunicationConnector.getStrict.mockResolvedValue(null);
    sendWhatsAppText.mockResolvedValue({ status: 200 });
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
      order: { id: 1, status: "confirmed", customerPhone: "5511999999999" },
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

  test("allows admin role and notifies the customer", async () => {
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      user: { role: "admin" },
      traceparent: null,
    });
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: { phoneNumberId: "123", accessToken: "token" },
    });
    Order.updateStatus.mockResolvedValue({
      order: { id: 1, status: "confirmed", customerPhone: "5511999999999" },
      error: null,
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "confirmed",
    });

    expect(result).toContain("atualizado");
    expect(result).toContain("cliente notificado");
    expect(sendWhatsAppText).toHaveBeenCalledWith({
      phoneNumberId: "123",
      accessToken: "token",
      to: "5511999999999",
      text: "Restaurante: Pedido #1 — Confirmado! Em breve a cozinha começa a preparar.",
    });
  });

  test("denies non-admin roles before updating", async () => {
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      user: { role: "manager" },
      traceparent: null,
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "confirmed",
    });

    expect(result).toContain("Permissão negada");
    expect(Order.updateStatus).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  test("passes in single-user mode and notifies the customer", async () => {
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: { phoneNumberId: "123", accessToken: "token" },
    });
    Order.updateStatus.mockResolvedValue({
      order: { id: 1, status: "preparing", customerPhone: "5511999999999" },
      error: null,
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "preparing",
    });

    expect(result).toContain("atualizado");
    expect(result).toContain("cliente notificado");
    expect(sendWhatsAppText).toHaveBeenCalledWith(
      expect.objectContaining({ to: "5511999999999" })
    );
  });

  test("keeps the status update when WhatsApp notification fails", async () => {
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: { phoneNumberId: "123", accessToken: "token" },
    });
    sendWhatsAppText.mockRejectedValue(new Error("api down"));
    Order.updateStatus.mockResolvedValue({
      order: { id: 1, status: "ready", customerPhone: "5511999999999" },
      error: null,
    });

    const result = await updateOrderStatus.handler.call(aibitat, {
      orderId: 1,
      status: "ready",
    });

    expect(result).toContain("atualizado");
    expect(result).toContain("falha ao notificar");
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

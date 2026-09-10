/* eslint-env jest, node */
jest.mock("../../../models/externalCommunicationConnector", () => ({
  ExternalCommunicationConnector: { getStrict: jest.fn() },
  WHATSAPP_SECRET_FIELDS: [],
}));
jest.mock("../../../integrations/whatsapp/client", () => ({
  sendWhatsAppText: jest.fn(),
}));

const {
  notifyOrderStatusChange,
  formatStatusNotification,
} = require("../../../utils/notifications/orderStatus");
const {
  ExternalCommunicationConnector,
} = require("../../../models/externalCommunicationConnector");
const { sendWhatsAppText } = require("../../../integrations/whatsapp/client");

describe("notifyOrderStatusChange helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("sends WhatsApp when connector is active and order has phone", async () => {
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: { phoneNumberId: "123", accessToken: "token" },
    });
    sendWhatsAppText.mockResolvedValue({ status: 200 });

    const order = { id: 7, status: "preparing", customerPhone: "5511999" };
    const result = await notifyOrderStatusChange(order);

    expect(result).toEqual({ sent: true });
    expect(sendWhatsAppText).toHaveBeenCalledWith({
      phoneNumberId: "123",
      accessToken: "token",
      to: "5511999",
      text: "Restaurante: Pedido #7 — Seu pedido está sendo preparado! 🍳",
    });
  });

  test("skips silently when connector is inactive", async () => {
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: false,
      config: {},
    });

    const result = await notifyOrderStatusChange({ id: 1, status: "ready", customerPhone: "5511" });

    expect(result).toEqual({ sent: false, reason: "whatsapp_connector_inactive" });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  test("never propagates send error to caller", async () => {
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: { phoneNumberId: "123", accessToken: "token" },
    });
    sendWhatsAppText.mockRejectedValue(new Error("Cloud API down"));

    const result = await notifyOrderStatusChange({ id: 5, status: "delivered", customerPhone: "5511" });

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("Cloud API down");
  });

  test("formatStatusNotification renders PT-BR status messages", () => {
    expect(formatStatusNotification({ id: 1, status: "ready" })).toBe(
      "Restaurante: Pedido #1 — Pronto para retirada/entrega! 🎉"
    );
    expect(formatStatusNotification({ id: 1, status: "unknown" })).toBe(
      "Restaurante: Pedido #1 — Status atualizado para unknown."
    );
  });
});

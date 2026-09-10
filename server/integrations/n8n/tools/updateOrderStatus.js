const { Order, DEFAULT_ORGANIZATION_ID } = require("../../../models/orders");
const { ROLES } = require("../../../utils/middleware/multiUserProtected");
const { sendWhatsAppText } = require("../../whatsapp/client");
const {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
} = require("../../../models/externalCommunicationConnector");
const { decryptToken } = require("../../../utils/telegramBot/utils");

const { resolveOrganizationContext } = require("./context");

function decryptWhatsAppConfig(config = {}) {
  const decrypted = { ...config };
  for (const field of WHATSAPP_SECRET_FIELDS) {
    if (typeof decrypted[field] === "string" && decrypted[field])
      decrypted[field] = decryptToken(decrypted[field]);
  }
  return decrypted;
}

function formatStatusNotification(order) {
  const messages = {
    pending: "Aguardando pagamento na entrega/retirada.",
    confirmed: "Confirmado! Em breve a cozinha começa a preparar.",
    preparing: "Seu pedido está sendo preparado! 🍳",
    ready: "Pronto para retirada/entrega! 🎉",
    delivered: "Entregue. Bom apetite!",
    cancelled: "Cancelado. Entre em contato se precisar.",
  };
  const msg =
    messages[order.status] || `Status atualizado para ${order.status}.`;
  return `Restaurante: Pedido #${order.id} — ${msg}`;
}

const updateOrderStatus = {
  name: "updateOrderStatus",
  description:
    "Atualiza o status de um pedido local. Restrito a admin/handoff humano; em single-user mode qualquer chamada passa.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      orderId: {
        type: "integer",
        description: "Número do pedido.",
      },
      status: {
        type: "string",
        enum: [
          "pending",
          "confirmed",
          "preparing",
          "ready",
          "delivered",
          "cancelled",
        ],
        description: "Novo status válido do pedido.",
      },
    },
    required: ["orderId", "status"],
    additionalProperties: false,
  },
  async handler({ orderId, status } = {}) {
    if (!orderId || !status)
      return "[updateOrderStatus] Missing required fields: orderId, status.";
    try {
      const context = await resolveOrganizationContext(this?.super);
      const organizationId =
        context?.organization?.id || DEFAULT_ORGANIZATION_ID;
      const user = context?.user;
      const isMultiUser = !!user;
      if (isMultiUser && user.role !== ROLES.admin) {
        return `[updateOrderStatus] Permissão negada: apenas admin pode atualizar status. Você é ${user.role}.`;
      }

      const { order, error } = await Order.updateStatus({
        id: Number(orderId),
        organizationId,
        newStatus: status,
      });
      if (!order)
        return `[updateOrderStatus] Falha ao atualizar pedido: ${
          error || "erro desconhecido"
        }`;

      let notification = "";
      try {
        const connector =
          await ExternalCommunicationConnector.getStrict("whatsapp");
        if (connector?.active) {
          const config = decryptWhatsAppConfig(connector.config || {});
          const messages = await formatStatusNotification(order);
          await sendWhatsAppText({
            phoneNumberId: config.phoneNumberId,
            accessToken: config.accessToken,
            to: order.customerPhone,
            text: messages,
          });
          notification = " (cliente notificado via WhatsApp)";
        }
      } catch (notifyErr) {
        notification = ` (falha ao notificar cliente: ${notifyErr.message})`;
      }

      return `Pedido #${order.id} atualizado para ${order.status}.${notification}`;
    } catch (error) {
      return `[updateOrderStatus] Falha ao atualizar pedido: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { updateOrderStatus };

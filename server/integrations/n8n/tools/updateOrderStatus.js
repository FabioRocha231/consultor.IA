const { Order, DEFAULT_ORGANIZATION_ID } = require("../../../models/orders");
const { ROLES } = require("../../../utils/middleware/multiUserProtected");

const { resolveOrganizationContext } = require("./context");
const {
  notifyOrderStatusChange,
} = require("../../../utils/notifications/orderStatus");

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

      const result = await notifyOrderStatusChange(order);
      const notification = result.sent
        ? " (cliente notificado via WhatsApp)"
        : result.reason === "whatsapp_connector_inactive"
          ? ""
          : ` (falha ao notificar cliente: ${result.reason})`;

      return `Pedido #${order.id} atualizado para ${order.status}.${notification}`;
    } catch (error) {
      return `[updateOrderStatus] Falha ao atualizar pedido: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { updateOrderStatus };

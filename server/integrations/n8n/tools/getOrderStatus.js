const { Order, DEFAULT_ORGANIZATION_ID } = require("../../../models/orders");
const { resolveOrganizationContext } = require("./context");

function formatBRL(priceCents) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const getOrderStatus = {
  name: "getOrderStatus",
  description:
    "Retorna o status, total e itens de um pedido local pelo número do pedido.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      orderId: {
        type: "integer",
        description: "Número do pedido.",
      },
    },
    required: ["orderId"],
    additionalProperties: false,
  },
  async handler({ orderId } = {}) {
    if (!orderId) return "[getOrderStatus] Missing required field: orderId.";
    try {
      const context = await resolveOrganizationContext(this?.super);
      const organizationId =
        context?.organization?.id || DEFAULT_ORGANIZATION_ID;
      const order = await Order.get({
        id: Number(orderId),
        organizationId,
      });
      if (!order) return `[getOrderStatus] Pedido #${orderId} não encontrado.`;
      const lines = order.items.map(
        (item) =>
          `• ${item.quantity}x #${item.menuItemId} — R$ ${formatBRL(
            item.unitPriceCents * item.quantity
          )}`
      );
      return `Pedido #${order.id} — ${order.status}. Total: R$ ${formatBRL(
        order.totalCents
      )}. Itens:\n${lines.join("\n")}`;
    } catch (error) {
      return `[getOrderStatus] Falha ao buscar pedido: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { getOrderStatus };

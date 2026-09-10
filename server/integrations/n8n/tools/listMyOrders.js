const { Order, DEFAULT_ORGANIZATION_ID } = require("../../../models/orders");
const { resolveOrganizationContext } = require("./context");

function formatBRL(priceCents) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const listMyOrders = {
  name: "listMyOrders",
  description:
    "Lista os pedidos mais recentes de um cliente local pelo telefone.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      customerPhone: {
        type: "string",
        description: "Telefone do cliente.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 20,
      },
    },
    required: ["customerPhone"],
    additionalProperties: false,
  },
  async handler({ customerPhone, limit = 20 } = {}) {
    if (!customerPhone)
      return "[listMyOrders] Missing required field: customerPhone.";
    try {
      const context = await resolveOrganizationContext(this?.super);
      const organizationId =
        context?.organization?.id || DEFAULT_ORGANIZATION_ID;
      const { orders } = await Order.listByCustomerPhone({
        organizationId,
        customerPhone,
        limit,
      });
      if (orders.length === 0)
        return `[listMyOrders] Nenhum pedido encontrado para ${customerPhone}.`;
      const lines = orders.map(
        (order) =>
          `• Pedido #${order.id} — ${order.status} — R$ ${formatBRL(
            order.totalCents
          )}`
      );
      return `Últimos pedidos de ${customerPhone}:\n${lines.join("\n")}`;
    } catch (error) {
      return `[listMyOrders] Falha ao listar pedidos: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { listMyOrders };

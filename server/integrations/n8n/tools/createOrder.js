const { randomUUID } = require("crypto");
const { Order, DEFAULT_ORGANIZATION_ID } = require("../../../models/orders");
const { resolveOrganizationContext } = require("./context");
const {
  buildOrderConfirmationPayload,
  INTERACTIVE_MARKER,
} = require("../../whatsapp/interactive");

function formatBRL(priceCents) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const createOrder = {
  name: "createOrder",
  description:
    "Cria um pedido local do restaurante com itens do cardápio. Use depois de identificar o cliente e os itens desejados.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      customerPhone: {
        type: "string",
        description: "Telefone do cliente que fez o pedido.",
      },
      customerName: {
        type: "string",
        description: "Nome do cliente que fez o pedido.",
      },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            menuItemId: {
              type: "integer",
              description: "ID do item do cardápio.",
            },
            quantity: {
              type: "integer",
              minimum: 1,
              description: "Quantidade do item.",
            },
            notes: {
              type: "string",
              description: "Observação opcional do item.",
            },
          },
          required: ["menuItemId", "quantity"],
          additionalProperties: false,
        },
      },
      notes: {
        type: "string",
        description: "Endereço de entrega ou observações livres do pedido.",
      },
    },
    required: ["customerPhone", "customerName", "items"],
    additionalProperties: false,
  },
  async handler({
    customerPhone,
    customerName,
    items = [],
    notes = null,
  } = {}) {
    if (
      !customerPhone ||
      !customerName ||
      !Array.isArray(items) ||
      items.length === 0
    )
      return "[createOrder] Missing required fields: customerPhone, customerName, items.";
    try {
      const context = await resolveOrganizationContext(this?.super);
      const organizationId =
        context?.organization?.id || DEFAULT_ORGANIZATION_ID;
      const { order, error } = await Order.create({
        organizationId,
        customerPhone,
        customerName,
        items,
        notes,
        idempotencyKey: randomUUID(),
      });
      if (!order)
        return `[createOrder] Falha ao criar pedido: ${error || "erro desconhecido"}`;
      const itemSummary = order.items
        .map((item) => `${item.quantity}x #${item.menuItemId}`)
        .join(", ");
      const text = `Pedido #${order.id} criado para ${order.customerName} (${order.customerPhone}). Total: R$ ${formatBRL(
        order.totalCents
      )}. Itens: ${itemSummary}.`;
      const interactive = buildOrderConfirmationPayload(order, {
        bodyText: text,
        footerText: "Confirme, cancele ou edite o pedido.",
      });
      if (this?.super) this.super.skipHandleExecution = true;
      return `${INTERACTIVE_MARKER}${JSON.stringify({ text, interactive })}`;
    } catch (error) {
      return `[createOrder] Falha ao criar pedido: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { createOrder };

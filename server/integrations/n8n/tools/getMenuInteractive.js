const {
  buildMenuListPayload,
  INTERACTIVE_MARKER,
} = require("../../whatsapp/interactive");
const { loadMenuItems, formatMenuItems } = require("./getMenu");

function formatInteractiveResult(text, interactive) {
  return `${INTERACTIVE_MARKER}${JSON.stringify({ text, interactive })}`;
}

const getMenuInteractive = {
  name: "getMenuInteractive",
  description:
    "Retorna o cardápio em formato de lista interativa do WhatsApp. Use quando a resposta será enviada pelo canal WhatsApp para reduzir a necessidade de o cliente digitar.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Categoria opcional (ex.: 'Pizzas', 'Bebidas').",
      },
      query: {
        type: "string",
        description: "Termo de busca opcional (ex.: 'margherita').",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
    },
    additionalProperties: false,
  },
  async handler({ category = null, query = null, limit = 20 } = {}) {
    try {
      const limited = await loadMenuItems(this?.super, {
        category,
        query,
        limit,
      });
      if (limited.length === 0)
        return "[getMenuInteractive] Nenhum item encontrado.";

      const text = formatMenuItems(limited);
      const availableItems = limited.filter((item) => item.available !== false);
      if (availableItems.length === 0) return text;

      const interactive = buildMenuListPayload(availableItems, {
        headerText: "Cardápio",
        bodyText: text,
        footerText: "Escolha uma opção abaixo.",
        buttonLabel: "Ver cardápio",
      });
      if (this?.super) this.super.skipHandleExecution = true;
      return formatInteractiveResult(text, interactive);
    } catch (error) {
      return `[getMenuInteractive] Falha ao buscar cardápio: ${error.message}`;
    }
  },
};

module.exports = {
  getMenuInteractive,
  formatInteractiveResult,
};

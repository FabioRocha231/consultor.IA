const { resolveOrganizationContext } = require("./context");
const { MenuItem } = require("../../../models/menuItems");

function formatBRL(priceCents) {
  return (priceCents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const getMenu = {
  name: "getMenu",
  description:
    "Retorna itens do cardápio do restaurante. Use para responder perguntas sobre produtos, preços, disponibilidade, categorias.",
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
      const context = await resolveOrganizationContext(this?.super);
      const organizationId = context?.organization?.id || "default";
      const items = query
        ? await MenuItem.findByQuery({ organizationId, query })
        : await MenuItem.list({
            organizationId,
            category,
            availableOnly: false,
          });
      const limited = items.slice(0, Math.min(limit, 50));
      if (limited.length === 0) return "[getMenu] Nenhum item encontrado.";

      const grouped = limited.reduce((acc, item) => {
        const key = item.category || "Outros";
        acc[key] = acc[key] || [];
        acc[key].push(item);
        return acc;
      }, {});
      const lines = [];
      for (const [categoryName, list] of Object.entries(grouped)) {
        lines.push(`*${categoryName}*`);
        for (const item of list) {
          const price = formatBRL(item.priceCents);
          const available = item.available ? "" : " _(indisponível)_";
          lines.push(`• ${item.name} — R$ ${price}${available}`);
          if (item.description) lines.push(`  ${item.description}`);
        }
        lines.push("");
      }
      return lines.join("\n").trim();
    } catch (error) {
      return `[getMenu] Falha ao buscar cardápio: ${error.message}`;
    }
  },
};

module.exports = { getMenu };

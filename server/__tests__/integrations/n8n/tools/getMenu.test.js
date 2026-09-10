/* eslint-env jest, node */
jest.mock("../../../../models/menuItems", () => ({
  MenuItem: {
    findByQuery: jest.fn(),
    list: jest.fn(),
  },
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const { getMenu } = require("../../../../integrations/n8n/tools/getMenu");
const { MenuItem } = require("../../../../models/menuItems");
const {
  resolveOrganizationContext,
} = require("../../../../integrations/n8n/tools/context");

describe("getMenu tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      traceparent: null,
    });
  });

  test("lists a category and formats prices in pt-BR", async () => {
    MenuItem.list.mockResolvedValue([
      {
        category: "Pizzas",
        name: "Margherita",
        description: "Molho, mozzarella e manjericão.",
        priceCents: 4590,
        available: true,
      },
      {
        category: "Pizzas",
        name: "Grande",
        priceCents: 123456,
        available: false,
      },
    ]);

    const result = await getMenu.handler({ category: "Pizzas", limit: 10 });

    expect(MenuItem.list).toHaveBeenCalledWith({
      organizationId: "org-1",
      category: "Pizzas",
      availableOnly: false,
    });
    expect(result).toContain("*Pizzas*");
    expect(result).toContain("• Margherita — R$ 45,90");
    expect(result).toContain("• Grande — R$ 1.234,56 _(indisponível)_");
    expect(result).not.toContain("R$ 459,00");
  });

  test("uses findByQuery when a query is provided", async () => {
    MenuItem.findByQuery.mockResolvedValue([
      {
        category: "Pizzas",
        name: "Margherita",
        priceCents: 1000,
        available: true,
      },
    ]);

    const result = await getMenu.handler({ query: "margherita" });

    expect(MenuItem.findByQuery).toHaveBeenCalledWith({
      organizationId: "org-1",
      query: "margherita",
    });
    expect(result).toContain("Margherita");
  });

  test("returns a friendly empty response", async () => {
    MenuItem.list.mockResolvedValue([]);

    const result = await getMenu.handler({});

    expect(result).toBe("[getMenu] Nenhum item encontrado.");
  });

  test("returns a readable error when lookup fails", async () => {
    MenuItem.list.mockRejectedValue(new Error("db down"));

    const result = await getMenu.handler({});

    expect(result).toBe("[getMenu] Falha ao buscar cardápio: db down");
  });
});

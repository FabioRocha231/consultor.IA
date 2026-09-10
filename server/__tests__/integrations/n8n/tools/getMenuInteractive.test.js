/* eslint-env jest, node */
jest.mock("../../../../models/menuItems", () => ({
  MenuItem: {
    findByQuery: jest.fn(),
    list: jest.fn(),
  },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../../../integrations/n8n/tools/context", () => ({
  resolveOrganizationContext: jest.fn(),
}));

const {
  getMenuInteractive,
  formatInteractiveResult,
} = require("../../../../integrations/n8n/tools/getMenuInteractive");
const { INTERACTIVE_MARKER } = require("../../../../integrations/whatsapp/interactive");
const { MenuItem } = require("../../../../models/menuItems");
const {
  resolveOrganizationContext,
} = require("../../../../integrations/n8n/tools/context");

function menuItem(overrides = {}) {
  return {
    id: 1,
    category: "Pizzas",
    name: "Margherita",
    description: "Molho e mussarela",
    priceCents: 4590,
    available: true,
    ...overrides,
  };
}

describe("getMenuInteractive tool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resolveOrganizationContext.mockResolvedValue({
      organization: { id: "org-1" },
      traceparent: null,
    });
  });

  test("returns a valid JSON interactive payload behind the magic marker", async () => {
    MenuItem.list.mockResolvedValue([menuItem()]);
    const aibitat = { super: { skipHandleExecution: false } };

    const result = await getMenuInteractive.handler.call(aibitat, {
      category: "Pizzas",
      limit: 10,
    });

    expect(aibitat.super.skipHandleExecution).toBe(true);
    expect(result.startsWith(INTERACTIVE_MARKER)).toBe(true);
    const parsed = JSON.parse(result.slice(INTERACTIVE_MARKER.length));
    expect(parsed.text).toContain("*Pizzas*");
    expect(parsed.interactive.type).toBe("list");
    expect(parsed.interactive.sections[0].rows[0]).toEqual({
      id: "1",
      title: "Margherita",
      description: "R$ 45,90 · Molho e mussarela",
    });
  });

  test("returns a readable fallback when the menu is empty", async () => {
    MenuItem.list.mockResolvedValue([]);

    const result = await getMenuInteractive.handler.call(
      { super: {} },
      {}
    );

    expect(result).toBe("[getMenuInteractive] Nenhum item encontrado.");
  });

  test("falls back to plain text when no item is available", async () => {
    MenuItem.list.mockResolvedValue([menuItem({ available: false })]);

    const result = await getMenuInteractive.handler.call(
      { super: {} },
      {}
    );

    expect(result).not.toContain(INTERACTIVE_MARKER);
    expect(result).toContain("_(indisponível)_");
  });

  test("formatInteractiveResult always emits JSON parseable content", () => {
    const result = formatInteractiveResult("text", { type: "list" });
    expect(result.startsWith(INTERACTIVE_MARKER)).toBe(true);
    expect(JSON.parse(result.slice(INTERACTIVE_MARKER.length))).toEqual({
      text: "text",
      interactive: { type: "list" },
    });
  });
});

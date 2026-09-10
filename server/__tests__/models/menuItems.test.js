/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  menuItem: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { MenuItem } = require("../../models/menuItems");

describe("MenuItem model", () => {
  beforeEach(() => jest.clearAllMocks());

  test("rejects a negative priceCents", async () => {
    const result = await MenuItem.create({
      category: "Pizzas",
      name: "Margherita",
      priceCents: -1,
    });

    expect(result.item).toBeNull();
    expect(result.error).toContain("non-negative");
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  test("rejects an empty name", async () => {
    const result = await MenuItem.create({
      category: "Pizzas",
      name: "   ",
      priceCents: 100,
    });

    expect(result.item).toBeNull();
    expect(result.error).toContain("name");
    expect(prisma.menuItem.create).not.toHaveBeenCalled();
  });

  test("creates a normalized item with defaults", async () => {
    prisma.menuItem.create.mockResolvedValue({ id: 1 });

    const result = await MenuItem.create({
      organizationId: "org-a",
      category: " Pizzas ",
      name: " Margherita ",
      priceCents: 4590,
    });

    expect(result.error).toBeNull();
    expect(prisma.menuItem.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-a",
        category: "Pizzas",
        name: "Margherita",
        priceCents: 4590,
        currency: "BRL",
        available: true,
        position: 0,
        description: null,
        allergens: null,
        photoUrl: null,
      },
    });
  });

  test("list filters by organization and optional category", async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    await MenuItem.list({
      organizationId: "org-a",
      category: "Bebidas",
      availableOnly: true,
    });

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-a", category: "Bebidas", available: true },
      orderBy: [
        { category: "asc" },
        { position: "asc" },
        { name: "asc" },
      ],
    });
  });

  test("get enforces tenant isolation through the where clause", async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    const result = await MenuItem.get({ id: 7, organizationId: "org-a" });

    expect(result).toBeNull();
    expect(prisma.menuItem.findFirst).toHaveBeenCalledWith({
      where: { id: 7, organizationId: "org-a" },
    });
  });

  test("update only changes allowed fields for the organization", async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 7, organizationId: "org-a" });
    prisma.menuItem.update.mockResolvedValue({ id: 7, available: false });

    const result = await MenuItem.update({
      id: 7,
      organizationId: "org-a",
      available: false,
      organizationIdInjected: "org-b",
    });

    expect(result.error).toBeNull();
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { available: false },
    });
  });

  test("update trims category and name", async () => {
    prisma.menuItem.findFirst.mockResolvedValue({ id: 7, organizationId: "org-a" });
    prisma.menuItem.update.mockResolvedValue({ id: 7 });

    const result = await MenuItem.update({
      id: 7,
      organizationId: "org-a",
      category: "  Pizzas  ",
      name: "  Margherita  ",
    });

    expect(result.error).toBeNull();
    expect(prisma.menuItem.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({ category: "Pizzas", name: "Margherita" }),
    });
  });

  test("delete hard deletes only within the organization", async () => {
    prisma.menuItem.deleteMany.mockResolvedValue({ count: 1 });

    const result = await MenuItem.delete({ id: 7, organizationId: "org-a" });

    expect(result).toBe(true);
    expect(prisma.menuItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 7, organizationId: "org-a" },
    });
  });

  test("delete returns false when count is zero", async () => {
    prisma.menuItem.deleteMany.mockResolvedValue({ count: 0 });

    const result = await MenuItem.delete({ id: 99, organizationId: "org-a" });

    expect(result).toBe(false);
  });

  test("findByQuery searches name and description case-insensitively", async () => {
    prisma.menuItem.findMany.mockResolvedValue([]);

    await MenuItem.findByQuery({ organizationId: "org-a", query: "marg" });

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org-a",
        OR: [
          { name: { contains: "marg", mode: "insensitive" } },
          { description: { contains: "marg", mode: "insensitive" } },
        ],
      },
      orderBy: [
        { category: "asc" },
        { position: "asc" },
        { name: "asc" },
      ],
      take: 20,
    });
  });
});

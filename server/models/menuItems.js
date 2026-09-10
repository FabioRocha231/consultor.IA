const prisma = require("../utils/prisma");

const DEFAULT_ORGANIZATION_ID = "default";
const UPDATABLE_FIELDS = [
  "category",
  "name",
  "description",
  "priceCents",
  "currency",
  "available",
  "position",
  "allergens",
  "photoUrl",
];

function trimmedString(value, field) {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  return trimmed;
}

function nullableString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizedCreateInput(input) {
  const category = trimmedString(input.category, "category");
  const name = trimmedString(input.name, "name");
  const priceCents = input.priceCents;
  if (
    typeof priceCents !== "number" ||
    !Number.isInteger(priceCents) ||
    priceCents < 0
  )
    throw new Error("priceCents must be a non-negative integer.");

  return {
    organizationId: input.organizationId ?? DEFAULT_ORGANIZATION_ID,
    category,
    name,
    priceCents,
    currency: input.currency ?? "BRL",
    available: input.available ?? true,
    position: input.position ?? 0,
    description: nullableString(input.description),
    allergens: nullableString(input.allergens),
    photoUrl: nullableString(input.photoUrl),
  };
}

function normalizedUpdate(input) {
  const updates = {};
  for (const field of UPDATABLE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    if (field === "category")
      updates.category = trimmedString(input[field], field);
    else if (field === "name")
      updates.name = trimmedString(input[field], field);
    else if (field === "priceCents") {
      const value = input[field];
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
        throw new Error("priceCents must be a non-negative integer.");
      updates.priceCents = value;
    } else if (field === "available") {
      updates.available = Boolean(input[field]);
    } else if (field === "position") {
      const value = input[field];
      if (typeof value !== "number" || !Number.isInteger(value))
        throw new Error("position must be an integer.");
      updates.position = value;
    } else {
      updates[field] = nullableString(input[field]);
    }
  }
  return updates;
}

const MenuItem = {
  create: async function (input) {
    try {
      const item = await prisma.menuItem.create({
        data: normalizedCreateInput(input || {}),
      });
      return { item, error: null };
    } catch (error) {
      console.error("Failed to create menu item:", error.message);
      return { item: null, error: error.message };
    }
  },

  list: async function ({
    organizationId = DEFAULT_ORGANIZATION_ID,
    category = null,
    availableOnly = false,
  } = {}) {
    const where = { organizationId };
    if (category) where.category = category;
    if (availableOnly) where.available = true;
    try {
      return await prisma.menuItem.findMany({
        where,
        orderBy: [{ category: "asc" }, { position: "asc" }, { name: "asc" }],
      });
    } catch (error) {
      console.error("Failed to list menu items:", error.message);
      return [];
    }
  },

  get: async function ({ id, organizationId = DEFAULT_ORGANIZATION_ID } = {}) {
    if (!id || !organizationId) return null;
    try {
      return (
        (await prisma.menuItem.findFirst({
          where: { id: Number(id), organizationId },
        })) || null
      );
    } catch (error) {
      console.error("Failed to get menu item:", error.message);
      return null;
    }
  },

  update: async function ({
    id,
    organizationId = DEFAULT_ORGANIZATION_ID,
    ...fields
  } = {}) {
    if (!id || !organizationId)
      return { item: null, error: "Menu item not found." };
    try {
      const updates = normalizedUpdate(fields);
      if (Object.keys(updates).length === 0)
        return { item: null, error: "No valid fields to update." };
      const existing = await this.get({ id: Number(id), organizationId });
      if (!existing) return { item: null, error: "Menu item not found." };
      const item = await prisma.menuItem.update({
        where: { id: Number(id) },
        data: updates,
      });
      return { item, error: null };
    } catch (error) {
      console.error("Failed to update menu item:", error.message);
      return { item: null, error: error.message };
    }
  },

  delete: async function ({
    id,
    organizationId = DEFAULT_ORGANIZATION_ID,
  } = {}) {
    try {
      const result = await prisma.menuItem.deleteMany({
        where: { id: Number(id), organizationId },
      });
      return result.count > 0;
    } catch (error) {
      console.error("Failed to delete menu item:", error.message);
      return false;
    }
  },

  findByQuery: async function ({ organizationId, query } = {}) {
    if (!organizationId || !query?.trim()) return [];
    try {
      return await prisma.menuItem.findMany({
        where: {
          organizationId,
          OR: [
            { name: { contains: query.trim(), mode: "insensitive" } },
            { description: { contains: query.trim(), mode: "insensitive" } },
          ],
        },
        orderBy: [{ category: "asc" }, { position: "asc" }, { name: "asc" }],
        take: 20,
      });
    } catch (error) {
      console.error("Failed to search menu items:", error.message);
      return [];
    }
  },
};

module.exports = { MenuItem, DEFAULT_ORGANIZATION_ID };

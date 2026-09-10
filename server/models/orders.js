const prisma = require("../utils/prisma");
const { canTransition } = require("./orderStateMachine");

const DEFAULT_ORGANIZATION_ID = "default";

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

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0)
    throw new Error("items must be a non-empty array.");
  return items.map((item) => {
    if (!item || typeof item !== "object")
      throw new Error("Each order item must be an object.");
    if (!Number.isInteger(item.menuItemId))
      throw new Error("menuItemId must be an integer.");
    if (!Number.isInteger(item.quantity) || item.quantity <= 0)
      throw new Error("quantity must be greater than zero.");
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      notes: nullableString(item.notes),
    };
  });
}

function normalizedLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function normalizedOffset(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const Order = {
  create: async function (input = {}) {
    try {
      const organizationId = input.organizationId || DEFAULT_ORGANIZATION_ID;
      const customerPhone = trimmedString(input.customerPhone, "customerPhone");
      const customerName = trimmedString(input.customerName, "customerName");
      const idempotencyKey = trimmedString(
        input.idempotencyKey,
        "idempotencyKey"
      );
      const items = normalizeItems(input.items);
      const existing = await this.getByIdempotencyKey({
        idempotencyKey,
        organizationId,
      });
      if (existing) return { order: existing, error: null };

      const menuItemIds = [...new Set(items.map((item) => item.menuItemId))];
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds }, organizationId },
        select: { id: true, priceCents: true },
      });
      if (menuItems.length !== menuItemIds.length)
        throw new Error("Some menu items do not belong to this organization.");
      const prices = new Map(
        menuItems.map((item) => [item.id, item.priceCents])
      );
      const totalCents = items.reduce(
        (total, item) => total + prices.get(item.menuItemId) * item.quantity,
        0
      );

      const order = await prisma.$transaction(async (tx) => {
        return tx.order.create({
          data: {
            organizationId,
            customerPhone,
            customerName,
            status: "pending",
            totalCents,
            notes: nullableString(input.notes),
            idempotencyKey,
            externalRef: nullableString(input.externalRef),
            items: {
              create: items.map((item) => ({
                menuItemId: item.menuItemId,
                quantity: item.quantity,
                unitPriceCents: prices.get(item.menuItemId),
                notes: item.notes,
              })),
            },
          },
          include: { items: true },
        });
      });
      return { order, error: null };
    } catch (error) {
      console.error("Failed to create order:", error.message);
      return { order: null, error: error.message };
    }
  },

  get: async function ({ id, organizationId = DEFAULT_ORGANIZATION_ID } = {}) {
    if (!id || !organizationId) return null;
    try {
      return (
        (await prisma.order.findFirst({
          where: { id: Number(id), organizationId },
          include: { items: true },
        })) || null
      );
    } catch (error) {
      console.error("Failed to get order:", error.message);
      return null;
    }
  },

  getByIdempotencyKey: async function ({
    idempotencyKey,
    organizationId = DEFAULT_ORGANIZATION_ID,
  } = {}) {
    if (!idempotencyKey || !organizationId) return null;
    try {
      return (
        (await prisma.order.findFirst({
          where: { idempotencyKey, organizationId },
          include: { items: true },
        })) || null
      );
    } catch (error) {
      console.error("Failed to get order by idempotency key:", error.message);
      return null;
    }
  },

  list: async function ({
    organizationId = DEFAULT_ORGANIZATION_ID,
    status = null,
    customerPhone = null,
    limit = 50,
    offset = 0,
  } = {}) {
    const where = { organizationId };
    if (status) where.status = status;
    if (customerPhone) where.customerPhone = customerPhone;
    try {
      const [orders, count] = await prisma.$transaction([
        prisma.order.findMany({
          where,
          include: { items: true },
          orderBy: { id: "desc" },
          take: normalizedLimit(limit),
          skip: normalizedOffset(offset),
        }),
        prisma.order.count({ where }),
      ]);
      return { orders, count };
    } catch (error) {
      console.error("Failed to list orders:", error.message);
      return { orders: [], count: 0 };
    }
  },

  listByCustomerPhone: async function ({
    organizationId = DEFAULT_ORGANIZATION_ID,
    customerPhone,
    limit = 20,
  } = {}) {
    if (!customerPhone) return { orders: [], count: 0 };
    return this.list({ organizationId, customerPhone, limit });
  },

  updateStatus: async function ({
    id,
    organizationId = DEFAULT_ORGANIZATION_ID,
    newStatus,
  } = {}) {
    if (!id || !organizationId)
      return { order: null, error: "Order not found." };
    try {
      const existing = await this.get({ id, organizationId });
      if (!existing) return { order: null, error: "Order not found." };
      if (!canTransition(existing.status, newStatus))
        return {
          order: null,
          error: `Invalid order status transition: ${existing.status} -> ${newStatus}`,
        };
      const order = await prisma.order.update({
        where: { id: Number(id) },
        data: { status: newStatus, updatedAt: new Date() },
        include: { items: true },
      });
      return { order, error: null };
    } catch (error) {
      console.error("Failed to update order status:", error.message);
      return { order: null, error: error.message };
    }
  },
};

module.exports = { Order, DEFAULT_ORGANIZATION_ID };

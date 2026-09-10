const { Order, DEFAULT_ORGANIZATION_ID } = require("../models/orders");
const {
  notifyOrderStatusChange,
} = require("../utils/notifications/orderStatus");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  isSingleUserMode,
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");

function ordersError(response, status, message) {
  return response.status(status).json({ success: false, error: message });
}

function idempotencyKeyFromRequest(request) {
  return (
    request.get?.("Idempotency-Key") ||
    request.header?.("Idempotency-Key") ||
    ""
  ).trim();
}

function ordersEndpoints(app) {
  if (!app) return;

  app.post(
    "/orders",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const idempotencyKey = idempotencyKeyFromRequest(request);
        if (idempotencyKey.length < 16)
          return ordersError(
            response,
            400,
            "Idempotency-Key header is required (UUID or at least 16 characters)."
          );
        const body = reqBody(request) || {};
        const { order, error } = await Order.create({
          organizationId: DEFAULT_ORGANIZATION_ID,
          customerPhone: body.customerPhone,
          customerName: body.customerName,
          items: body.items,
          idempotencyKey,
          notes: body.notes,
          externalRef: body.externalRef,
        });
        if (!order) return ordersError(response, 400, error);
        return response.status(200).json({ order });
      } catch (error) {
        console.error("Order create failed:", error.message);
        return ordersError(response, 500, "Failed to create order.");
      }
    }
  );

  app.get(
    "/orders",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const { orders, count } = await Order.list({
          organizationId: DEFAULT_ORGANIZATION_ID,
          status: request.query.status || null,
          customerPhone: request.query.customerPhone || null,
          limit: request.query.limit,
          offset: request.query.offset,
        });
        return response.status(200).json({ orders, count });
      } catch (error) {
        console.error("Order list failed:", error.message);
        return ordersError(response, 500, "Failed to list orders.");
      }
    }
  );

  app.get(
    "/orders/by-phone/:phone",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const { orders, count } = await Order.listByCustomerPhone({
          organizationId: DEFAULT_ORGANIZATION_ID,
          customerPhone: request.params.phone,
          limit: request.query.limit,
        });
        return response.status(200).json({ orders, count });
      } catch (error) {
        console.error("Order list by phone failed:", error.message);
        return ordersError(response, 500, "Failed to list customer orders.");
      }
    }
  );

  app.get(
    "/orders/:id",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const order = await Order.get({
          id: Number(request.params.id),
          organizationId: DEFAULT_ORGANIZATION_ID,
        });
        if (!order) return ordersError(response, 404, "Order not found.");
        return response.status(200).json({ order });
      } catch (error) {
        console.error("Order detail failed:", error.message);
        return ordersError(response, 500, "Failed to get order.");
      }
    }
  );

  app.patch(
    "/orders/:id/status",
    [validatedRequest, isSingleUserMode, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const body = reqBody(request) || {};
        if (!body.status)
          return ordersError(response, 400, "status is required.");
        const { order, error } = await Order.updateStatus({
          id: Number(request.params.id),
          organizationId: DEFAULT_ORGANIZATION_ID,
          newStatus: body.status,
        });
        if (!order)
          return error === "Order not found."
            ? ordersError(response, 404, error)
            : ordersError(response, 400, error);

        await notifyOrderStatusChange(order);
        return response.status(200).json({ order });
      } catch (error) {
        console.error("Order status update failed:", error.message);
        return ordersError(response, 500, "Failed to update order status.");
      }
    }
  );
}

module.exports = { ordersEndpoints };

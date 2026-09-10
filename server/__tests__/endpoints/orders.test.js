/* eslint-env jest, node */

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: jest.fn((_request, _response, next) => next()),
}));
jest.mock("../../models/orders", () => ({
  Order: {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    listByCustomerPhone: jest.fn(),
    updateStatus: jest.fn(),
  },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: { isMultiUserMode: jest.fn() },
}));

const { Order } = require("../../models/orders");
const { SystemSettings } = require("../../models/systemSettings");
const { ordersEndpoints } = require("../../endpoints/orders");

function registerEndpoints() {
  const handlers = {};
  function invokeWithMiddleware(middlewares, handler, request, response) {
    async function run(index) {
      if (index >= middlewares.length) return handler(request, response);
      let nextCalled = false;
      let nextPromise = null;
      const next = () => {
        nextCalled = true;
        nextPromise = run(index + 1);
        return nextPromise;
      };
      await middlewares[index](request, response, next);
      if (nextCalled) await nextPromise;
    }
    return run(0);
  }
  const app = {
    get: (path, ...args) => {
      const handler = args[args.length - 1];
      const middlewares = args.slice(0, -1).flat();
      handlers[`GET ${path}`] = (request, response) =>
        invokeWithMiddleware(middlewares, handler, request, response);
    },
    post: (path, ...args) => {
      const handler = args[args.length - 1];
      const middlewares = args.slice(0, -1).flat();
      handlers[`POST ${path}`] = (request, response) =>
        invokeWithMiddleware(middlewares, handler, request, response);
    },
    patch: (path, ...args) => {
      const handler = args[args.length - 1];
      const middlewares = args.slice(0, -1).flat();
      handlers[`PATCH ${path}`] = (request, response) =>
        invokeWithMiddleware(middlewares, handler, request, response);
    },
  };
  ordersEndpoints(app);
  return handlers;
}

function mockResponse() {
  const response = {};
  response.locals = {};
  response.end = jest.fn(() => response);
  response.status = jest.fn(() => response);
  response.send = jest.fn(() => response);
  response.json = jest.fn((body) => {
    response.body = body;
    return response;
  });
  response.sendStatus = jest.fn((code) => {
    response.statusCode = code;
    return response;
  });
  return response;
}

function request(body = {}, params = {}, query = {}, headers = {}) {
  return {
    body,
    params,
    query,
    headers,
    get: jest.fn((name) => headers[name]),
    header: jest.fn((name) => headers[name]),
  };
}

const orderPayload = {
  customerPhone: "11999999999",
  customerName: "Joana",
  items: [{ menuItemId: 1, quantity: 2 }],
  notes: "Entregar após 19h",
};

describe("orders endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SystemSettings.isMultiUserMode.mockResolvedValue(false);
  });

  test("blocks access in multi-user mode", async () => {
    SystemSettings.isMultiUserMode.mockResolvedValue(true);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /orders"](request(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(401);
    expect(Order.list).not.toHaveBeenCalled();
  });

  test("POST requires an Idempotency-Key header", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /orders"](request(orderPayload), response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(Order.create).not.toHaveBeenCalled();
  });

  test("POST creates an order and reuses the same key for idempotency", async () => {
    Order.create.mockResolvedValue({ order: { id: 7, ...orderPayload }, error: null });
    const handlers = registerEndpoints();
    const responseA = mockResponse();
    const responseB = mockResponse();
    const commonRequest = request(orderPayload, {}, {}, {
      "Idempotency-Key": "unique-key-123456",
    });

    await handlers["POST /orders"](commonRequest, responseA);
    await handlers["POST /orders"](commonRequest, responseB);

    expect(Order.create).toHaveBeenCalledTimes(2);
    expect(Order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "default",
        idempotencyKey: "unique-key-123456",
      })
    );
    expect(responseA.body).toEqual({ order: expect.objectContaining({ id: 7 }) });
    expect(responseB.body).toEqual({ order: expect.objectContaining({ id: 7 }) });
  });

  test("GET /orders lists with status and pagination", async () => {
    Order.list.mockResolvedValue({ orders: [{ id: 1 }], count: 1 });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /orders"](
      request({}, {}, { status: "pending", limit: "25", offset: "10" }),
      response
    );

    expect(Order.list).toHaveBeenCalledWith({
      organizationId: "default",
      status: "pending",
      customerPhone: null,
      limit: "25",
      offset: "10",
    });
    expect(response.body).toEqual({ orders: [{ id: 1 }], count: 1 });
  });

  test("GET /orders/:id returns the order with items", async () => {
    Order.get.mockResolvedValue({ id: 1, items: [] });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /orders/:id"](request({}, { id: "1" }), response);

    expect(Order.get).toHaveBeenCalledWith({
      id: 1,
      organizationId: "default",
    });
    expect(response.body).toEqual({ order: { id: 1, items: [] } });
  });

  test("GET /orders/by-phone/:phone lists customer orders", async () => {
    Order.listByCustomerPhone.mockResolvedValue({
      orders: [{ id: 2 }],
      count: 1,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /orders/by-phone/:phone"](
      request({}, { phone: "11999999999" }, { limit: "10" }),
      response
    );

    expect(Order.listByCustomerPhone).toHaveBeenCalledWith({
      organizationId: "default",
      customerPhone: "11999999999",
      limit: "10",
    });
    expect(response.body).toEqual({ orders: [{ id: 2 }], count: 1 });
  });

  test("PATCH rejects an invalid state transition", async () => {
    Order.updateStatus.mockResolvedValue({
      order: null,
      error: "Invalid order status transition: pending -> delivered",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /orders/:id/status"](
      request({ status: "delivered" }, { id: "1" }),
      response
    );

    expect(Order.updateStatus).toHaveBeenCalledWith({
      id: 1,
      organizationId: "default",
      newStatus: "delivered",
    });
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.body.error).toContain("Invalid order status transition");
  });

  test("PATCH returns 404 when the order belongs to another tenant", async () => {
    Order.updateStatus.mockResolvedValue({
      order: null,
      error: "Order not found.",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /orders/:id/status"](
      request({ status: "confirmed" }, { id: "999" }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });
});

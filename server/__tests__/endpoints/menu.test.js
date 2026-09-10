/* eslint-env jest, node */

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: jest.fn((_request, _response, next) => next()),
}));
jest.mock("../../models/menuItems", () => ({
  MenuItem: {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  DEFAULT_ORGANIZATION_ID: "default",
}));
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: { isMultiUserMode: jest.fn() },
}));

const { MenuItem } = require("../../models/menuItems");
const { SystemSettings } = require("../../models/systemSettings");
const { menuEndpoints } = require("../../endpoints/menu");

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
    delete: (path, ...args) => {
      const handler = args[args.length - 1];
      const middlewares = args.slice(0, -1).flat();
      handlers[`DELETE ${path}`] = (request, response) =>
        invokeWithMiddleware(middlewares, handler, request, response);
    },
  };
  menuEndpoints(app);
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

function request(body = {}, params = {}, query = {}) {
  return {
    body,
    params,
    query,
    headers: {},
    get: jest.fn(() => undefined),
    header: jest.fn(() => undefined),
  };
}

describe("menu endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SystemSettings.isMultiUserMode.mockResolvedValue(false);
  });

  test("blocks access in multi-user mode", async () => {
    SystemSettings.isMultiUserMode.mockResolvedValue(true);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /menu/items"](request(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(401);
    expect(MenuItem.list).not.toHaveBeenCalled();
  });

  test("GET /menu/items lists items", async () => {
    MenuItem.list.mockResolvedValue([{ id: 1 }]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /menu/items"](
      request({}, {}, { category: "Pizzas", available: "true" }),
      response
    );

    expect(MenuItem.list).toHaveBeenCalledWith({
      organizationId: "default",
      category: "Pizzas",
      availableOnly: true,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ items: [{ id: 1 }] });
  });

  test("POST /menu/items returns a validation error as 400", async () => {
    MenuItem.create.mockResolvedValue({
      item: null,
      error: "priceCents must be a non-negative integer.",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /menu/items"](
      request({ category: "Pizzas", name: "Produto", priceCents: -1 }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.body).toEqual({
      success: false,
      error: "priceCents must be a non-negative integer.",
    });
  });

  test("POST /menu/items creates an item", async () => {
    MenuItem.create.mockResolvedValue({ item: { id: 1 }, error: null });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /menu/items"](
      request({ category: "Pizzas", name: "Margherita", priceCents: 4590 }),
      response
    );

    expect(MenuItem.create).toHaveBeenCalledWith({
      category: "Pizzas",
      name: "Margherita",
      priceCents: 4590,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ item: { id: 1 } });
  });

  test("GET /menu/items/:id returns 404 when missing", async () => {
    MenuItem.get.mockResolvedValue(null);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /menu/items/:id"](request({}, { id: "999" }), response);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.body.error).toBe("Menu item not found.");
  });

  test("PATCH /menu/items/:id updates and enforces tenant", async () => {
    MenuItem.update.mockResolvedValue({ item: { id: 1, available: false }, error: null });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /menu/items/:id"](
      request({ available: false }, { id: "1" }),
      response
    );

    expect(MenuItem.update).toHaveBeenCalledWith({
      id: 1,
      organizationId: "default",
      available: false,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ item: { id: 1, available: false } });
  });

  test("PATCH /menu/items/:id returns 404 for another tenant", async () => {
    MenuItem.update.mockResolvedValue({
      item: null,
      error: "Menu item not found.",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /menu/items/:id"](
      request({ name: "X" }, { id: "1" }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
  });

  test("DELETE /menu/items/:id removes the item", async () => {
    MenuItem.delete.mockResolvedValue(true);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["DELETE /menu/items/:id"](
      request({}, { id: "1" }),
      response
    );

    expect(MenuItem.delete).toHaveBeenCalledWith({
      id: 1,
      organizationId: "default",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ success: true });
  });
});

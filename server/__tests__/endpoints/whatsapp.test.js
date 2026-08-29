/* eslint-env jest, node */
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");

jest.mock("../../utils/prisma", () => ({
  whatsapp_webhook_messages: {
    findMany: jest.fn(),
    createMany: jest.fn(),
  },
}));
jest.mock("../../models/externalCommunicationConnector", () => ({
  ExternalCommunicationConnector: {
    getStrict: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    validateConfig: jest.fn(),
  },
  WHATSAPP_SECRET_FIELDS: ["appSecret", "accessToken", "verifyToken"],
}));
jest.mock("../../utils/telegramBot/utils", () => ({
  decryptToken: jest.fn((value) => value),
}));
jest.mock("../../models/eventLogs", () => ({
  EventLogs: { logEvent: jest.fn() },
}));
jest.mock("../../models/workspace", () => ({
  Workspace: { get: jest.fn() },
}));
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: { isMultiUserMode: jest.fn() },
}));
jest.mock("../../utils/userLocale", () => ({
  UserMetaCache: { setFromRequest: jest.fn() },
}));

const prisma = require("../../utils/prisma");
const {
  ExternalCommunicationConnector,
} = require("../../models/externalCommunicationConnector");
const { EventLogs } = require("../../models/eventLogs");
const { Workspace } = require("../../models/workspace");
const { SystemSettings } = require("../../models/systemSettings");
const { whatsappEndpoints } = require("../../endpoints/whatsapp");

function validConfig(overrides = {}) {
  return {
    appSecret: "app-secret",
    phoneNumberId: "phone-1",
    accessToken: "access-token",
    verifyToken: "verify-token",
    workspaceSlug: "workspace",
    ...overrides,
  };
}

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
  };
  whatsappEndpoints(app);
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

function webhookBody(messageOverrides = {}, changeOverrides = {}) {
  return webhookBodyWithMessages([
    {
      from: "wa-1",
      id: "message-1",
      timestamp: "1720000000",
      type: "text",
      text: { body: "Olá" },
      ...messageOverrides,
    },
  ], changeOverrides);
}

function webhookBodyWithMessages(messages, changeOverrides = {}) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "phone-1" },
              messages,
              ...changeOverrides,
            },
          },
        ],
      },
    ],
  });
}

function messages(count, start = 0) {
  return Array.from({ length: count }, (_, index) => ({
    from: `wa-${start + index}`,
    id: `message-${start + index}`,
    timestamp: "1720000000",
    type: "text",
    text: { body: `Olá ${start + index}` },
  }));
}

function webhookRequest(body, query = {}, headerValue = null) {
  const signature = headerValue ?? `sha256=${crypto
    .createHmac("sha256", "app-secret")
    .update(body)
    .digest("hex")}`;
  return {
    body,
    query,
    headers: { "x-hub-signature-256": signature },
    get: jest.fn(() => signature),
  };
}

function adminRequest(body = {}) {
  return {
    body,
    headers: {},
    get: jest.fn(() => undefined),
    header: jest.fn(() => undefined),
  };
}

describe("whatsapp endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AUTH_TOKEN;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "test";
    SystemSettings.isMultiUserMode.mockResolvedValue(false);
    ExternalCommunicationConnector.validateConfig.mockReturnValue({
      valid: true,
      error: null,
    });
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: validConfig(),
    });
    ExternalCommunicationConnector.upsert.mockResolvedValue({
      connector: { active: true, config: validConfig() },
      error: null,
    });
    ExternalCommunicationConnector.delete.mockResolvedValue(true);
    EventLogs.logEvent.mockResolvedValue({ eventLog: {}, message: null });
    Workspace.get.mockResolvedValue(null);
    prisma.whatsapp_webhook_messages.findMany.mockResolvedValue([]);
    prisma.whatsapp_webhook_messages.createMany.mockResolvedValue({ count: 1 });
  });

  test("verifies the Meta webhook handshake and returns the challenge", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();
    const request = webhookRequest("", {
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-token",
      "hub.challenge": "challenge-1",
    });

    await handlers["GET /whatsapp/webhook"](request, response);

    expect(response.send).toHaveBeenCalledWith("challenge-1");
    expect(response.status).not.toHaveBeenCalled();
  });

  test("returns 403 when the webhook handshake is invalid", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();
    const request = webhookRequest("", {
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong-token",
      "hub.challenge": "challenge-1",
    });

    await handlers["GET /whatsapp/webhook"](request, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.send).toHaveBeenCalledWith("Forbidden");
  });

  test("returns 503 when the handshake connector lookup fails", async () => {
    ExternalCommunicationConnector.getStrict.mockRejectedValue(
      new Error("db down")
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/webhook"](
      webhookRequest("", {
        "hub.mode": "subscribe",
        "hub.verify_token": "verify-token",
        "hub.challenge": "challenge-1",
      }),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(503);
  });

  test("GET config returns public fields without secrets", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/config"](adminRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({
      config: {
        active: true,
        phoneNumberId: "phone-1",
        workspaceSlug: "workspace",
        webhookPath: "/api/whatsapp/webhook",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("app-secret");
    expect(JSON.stringify(response.body)).not.toContain("access-token");
  });

  test("POST connect saves the config and logs the event", async () => {
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest(validConfig()),
      response
    );

    expect(Workspace.get).toHaveBeenCalledWith({ slug: "workspace" });
    expect(ExternalCommunicationConnector.upsert).toHaveBeenCalledWith(
      "whatsapp",
      { ...validConfig(), active: true }
    );
    expect(EventLogs.logEvent).toHaveBeenCalledWith("whatsapp_connected", {
      workspaceSlug: "workspace",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ success: true });
  });

  test("POST connect rejects invalid or missing config fields", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest({ ...validConfig(), accessToken: "" }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(ExternalCommunicationConnector.upsert).not.toHaveBeenCalled();
  });

  test("POST connect rejects unknown config fields", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest({ ...validConfig(), extra: "value" }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(ExternalCommunicationConnector.upsert).not.toHaveBeenCalled();
  });

  test("POST connect rejects a missing workspace", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest(validConfig()),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(ExternalCommunicationConnector.upsert).not.toHaveBeenCalled();
  });

  test("POST disconnect removes the connector and logs the event", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/disconnect"](adminRequest(), response);

    expect(ExternalCommunicationConnector.delete).toHaveBeenCalledWith(
      "whatsapp"
    );
    expect(EventLogs.logEvent).toHaveBeenCalledWith("whatsapp_disconnected");
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ success: true });
  });

  test("GET status returns active and config presence without secrets", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/status"](adminRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({
      active: true,
      configPresent: true,
    });
    expect(JSON.stringify(response.body)).not.toContain("app-secret");
    expect(JSON.stringify(response.body)).not.toContain("access-token");
  });

  test("admin routes return 500 on DB failure", async () => {
    ExternalCommunicationConnector.getStrict.mockRejectedValue(
      new Error("db down")
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/config"](adminRequest(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(500);
  });

  test("admin route passes in single-user mode", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/config"](adminRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  test("admin route returns 401 without a token when auth is configured", async () => {
    process.env.AUTH_TOKEN = "auth-token";
    process.env.JWT_SECRET = "jwt-secret";
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/config"](adminRequest(), response);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(ExternalCommunicationConnector.getStrict).not.toHaveBeenCalled();
  });

  test("admin route returns 401 when multi-user mode rejects single-user access", async () => {
    SystemSettings.isMultiUserMode
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/config"](adminRequest(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(401);
    expect(ExternalCommunicationConnector.getStrict).not.toHaveBeenCalled();
  });

  test("POST connect rejects fields above the length cap", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest({ ...validConfig(), appSecret: "x".repeat(256) }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(ExternalCommunicationConnector.upsert).not.toHaveBeenCalled();
  });

  test("connect DB failure returns 500 without leaking internals", async () => {
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    ExternalCommunicationConnector.upsert.mockResolvedValue({
      connector: null,
      error: "db down",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/connect"](
      adminRequest(validConfig()),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(500);
    expect(response.body).toBeUndefined();
  });

  test("disconnect DB failure returns 500 without leaking internals", async () => {
    ExternalCommunicationConnector.getStrict.mockRejectedValue(
      new Error("db down")
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/disconnect"](adminRequest(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(500);
    expect(response.body).toBeUndefined();
  });

  test("status DB failure returns 500 without leaking internals", async () => {
    ExternalCommunicationConnector.getStrict.mockRejectedValue(
      new Error("db down")
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /whatsapp/status"](adminRequest(), response);

    expect(response.sendStatus).toHaveBeenCalledWith(500);
    expect(response.body).toBeUndefined();
  });

  test("returns 401 for an invalid X-Hub-Signature-256", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();
    const body = webhookBody();
    const request = webhookRequest(body, {}, "sha256=invalid");

    await handlers["POST /whatsapp/webhook"](request, response);

    expect(response.sendStatus).toHaveBeenCalledWith(401);
    expect(prisma.whatsapp_webhook_messages.createMany).not.toHaveBeenCalled();
  });

  test("persists a text message as queued without processing it", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(webhookBody()),
      response
    );

    expect(prisma.whatsapp_webhook_messages.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          messageId: "message-1",
          phoneNumberId: "phone-1",
          waId: "wa-1",
          payload: expect.stringContaining('"id":"message-1"'),
          status: "queued",
          attempts: 0,
          availableAt: expect.any(Date),
        }),
      ],
      skipDuplicates: true,
    });
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  test("persists unsupported message types as queued", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(webhookBody({ type: "image", text: undefined })),
      response
    );

    expect(prisma.whatsapp_webhook_messages.createMany).toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  test("ignores messages from another phone_number_id", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(
        webhookBody({}, {
          metadata: { phone_number_id: "phone-other" },
        })
      ),
      response
    );

    expect(prisma.whatsapp_webhook_messages.createMany).not.toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  test("returns 200 when 51 messages are already persisted", async () => {
    prisma.whatsapp_webhook_messages.findMany.mockResolvedValue(
      messages(51).map((message) => ({ messageId: message.id }))
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(webhookBodyWithMessages(messages(51))),
      response
    );

    expect(prisma.whatsapp_webhook_messages.createMany).not.toHaveBeenCalled();
    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  test("persists the first 50 new messages and returns 502 for progress", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(webhookBodyWithMessages(messages(51))),
      response
    );

    expect(prisma.whatsapp_webhook_messages.createMany).toHaveBeenCalledWith({
      data: expect.any(Array),
      skipDuplicates: true,
    });
    expect(prisma.whatsapp_webhook_messages.createMany.mock.calls[0][0].data)
      .toHaveLength(50);
    expect(response.sendStatus).toHaveBeenCalledWith(502);
  });

  test("returns 503 when the connector lookup fails", async () => {
    ExternalCommunicationConnector.getStrict.mockRejectedValue(
      new Error("db down")
    );
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(webhookBody()),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(503);
  });

  test("acknowledges non-message webhook objects without processing", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [{ field: "statuses", value: {} }],
        },
      ],
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /whatsapp/webhook"](
      webhookRequest(body),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(200);
    expect(prisma.whatsapp_webhook_messages.createMany).not.toHaveBeenCalled();
  });

  test("real Express raw body verifies HMAC over the Buffer", async () => {
    const app = express();
    const router = express.Router();
    app.use("/api/whatsapp/webhook", bodyParser.raw({ type: "application/json" }));
    app.use("/api", router);
    whatsappEndpoints(router);
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
    const body = webhookBody();
    const signature = crypto
      .createHmac("sha256", "app-secret")
      .update(body)
      .digest("hex");

    try {
      const statusCode = await new Promise((resolve, reject) => {
        const request = http.request(
          {
            hostname: "127.0.0.1",
            port: server.address().port,
            path: "/api/whatsapp/webhook",
            method: "POST",
            agent: false,
            headers: {
              "content-type": "application/json",
              "x-hub-signature-256": `sha256=${signature}`,
            },
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
          }
        );
        request.on("error", reject);
        request.end(body);
      });

      expect(statusCode).toBe(200);
      expect(prisma.whatsapp_webhook_messages.createMany).toHaveBeenCalledWith({
        data: expect.any(Array),
        skipDuplicates: true,
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

/* eslint-env jest, node */
const path = require("path");
process.env.STORAGE_DIR = path.join(__dirname, "..", "fixtures");

jest.mock("../../utils/prisma", () => ({
  whatsapp_webhook_messages: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}));
jest.mock("../../models/externalCommunicationConnector", () => ({
  ExternalCommunicationConnector: {
    getStrict: jest.fn(),
    validateConfig: jest.fn(),
  },
  WHATSAPP_SECRET_FIELDS: ["appSecret", "accessToken", "verifyToken"],
}));
jest.mock("../../models/workspace", () => ({
  Workspace: { get: jest.fn() },
}));
jest.mock("../../utils/chats/apiChatHandler", () => ({
  ApiChatHandler: { chatSync: jest.fn() },
}));
jest.mock("../../integrations/whatsapp/client", () => ({
  sendWhatsAppText: jest.fn(),
  sendWhatsAppList: jest.fn(),
  sendWhatsAppButtons: jest.fn(),
}));
jest.mock("../../utils/telegramBot/utils", () => ({
  decryptToken: jest.fn((value) => value),
}));

const prisma = require("../../utils/prisma");
const {
  ExternalCommunicationConnector,
} = require("../../models/externalCommunicationConnector");
const { Workspace } = require("../../models/workspace");
const { ApiChatHandler } = require("../../utils/chats/apiChatHandler");
const {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} = require("../../integrations/whatsapp/client");
const {
  runOnce,
  recoverStaleProcessing,
  createWatchdog,
  runPollLoop,
} = require("../../jobs/process-whatsapp-messages");
const { INTERACTIVE_MARKER } = require("../../integrations/whatsapp/interactive");

function queuedRow(overrides = {}) {
  return {
    id: 1,
    messageId: "message-1",
    phoneNumberId: "phone-1",
    waId: "wa-1",
    payload: JSON.stringify({
      phoneNumberId: "phone-1",
      waId: "wa-1",
      message: {
        id: "message-1",
        from: "wa-1",
        type: "text",
        text: { body: "Olá" },
      },
    }),
    status: "processing",
    attempts: 0,
    createdAt: new Date(),
    claimedAt: new Date(),
    availableAt: new Date(),
    failedAt: null,
    processedAt: null,
    ...overrides,
  };
}

function config() {
  return {
    appSecret: "app-secret",
    phoneNumberId: "phone-1",
    accessToken: "access-token",
    verifyToken: "verify-token",
    workspaceSlug: "workspace",
  };
}

function setupRun(row, transitionCount = 1) {
  prisma.whatsapp_webhook_messages.findMany
    .mockResolvedValueOnce([{ id: row.id }])
    .mockResolvedValueOnce([row]);
  for (let i = 0; i < 5; i += 1) {
    prisma.whatsapp_webhook_messages.updateMany.mockResolvedValueOnce({
      count: 0, // stale recovery branches
    });
  }
  prisma.whatsapp_webhook_messages.updateMany
    .mockResolvedValueOnce({ count: 1 }) // claim
    .mockResolvedValueOnce({ count: transitionCount }); // fence update
  prisma.whatsapp_webhook_messages.deleteMany.mockResolvedValue({ count: 0 });
}

describe("process whatsapp messages job", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ExternalCommunicationConnector.validateConfig.mockReturnValue({
      valid: true,
      error: null,
    });
    ExternalCommunicationConnector.getStrict.mockResolvedValue({
      active: true,
      config: config(),
    });
    prisma.whatsapp_webhook_messages.deleteMany.mockResolvedValue({ count: 0 });
  });

  test("marks a processed message with a claimedAt fence", async () => {
    const row = queuedRow();
    setupRun(row);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    ApiChatHandler.chatSync.mockResolvedValue({
      textResponse: "Resposta do assistente",
    });
    sendWhatsAppText.mockResolvedValue({ status: 200, body: "ok" });

    const result = await runOnce();

    expect(result).toEqual({ processed: 1, total: 1 });
    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, status: "processing", claimedAt: row.claimedAt },
      data: expect.objectContaining({
        status: "processed",
        processedAt: expect.any(Date),
      }),
    });
  });

  test("does not count a message when the fence update loses the race", async () => {
    const row = queuedRow();
    setupRun(row, 0);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    ApiChatHandler.chatSync.mockResolvedValue({
      textResponse: "Resposta do assistente",
    });
    sendWhatsAppText.mockResolvedValue({ status: 200, body: "ok" });

    const result = await runOnce();

    expect(result).toEqual({ processed: 0, total: 1 });
  });

  test("requeues transient failures with attempts incremented and backoff", async () => {
    const row = queuedRow();
    setupRun(row);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    ApiChatHandler.chatSync.mockRejectedValue(new Error("llm failed"));

    const result = await runOnce();

    expect(result).toEqual({ processed: 0, total: 1 });
    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, status: "processing", claimedAt: row.claimedAt },
      data: expect.objectContaining({
        status: "queued",
        attempts: { increment: 1 },
        availableAt: expect.any(Date),
        lastError: "llm failed",
      }),
    });
    const availableAt =
      prisma.whatsapp_webhook_messages.updateMany.mock.calls[2][0].data
        .availableAt;
    expect(availableAt.getTime()).toBeGreaterThan(Date.now() + 4_000);
    expect(availableAt.getTime()).toBeLessThan(Date.now() + 60_000);
  });

  test("dead-letters a transient failure after max attempts", async () => {
    const row = queuedRow({ attempts: 4 });
    setupRun(row);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    ApiChatHandler.chatSync.mockRejectedValue(new Error("llm failed"));

    await runOnce();

    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, status: "processing", claimedAt: row.claimedAt },
      data: expect.objectContaining({
        status: "failed",
        failedAt: expect.any(Date),
        attempts: { increment: 1 },
      }),
    });
  });

  test("dead-letters permanent workspace misconfiguration", async () => {
    const row = queuedRow();
    setupRun(row);
    Workspace.get.mockResolvedValue(null);

    await runOnce();

    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, status: "processing", claimedAt: row.claimedAt },
      data: expect.objectContaining({
        status: "failed",
        lastError: "Configured WhatsApp workspace was not found",
      }),
    });
  });

  test("dead-letters queued messages from a different phone_number_id", async () => {
    const row = queuedRow({ phoneNumberId: "phone-other" });
    setupRun(row);

    await runOnce();

    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenLastCalledWith({
      where: { id: 1, status: "processing", claimedAt: row.claimedAt },
      data: expect.objectContaining({
        status: "failed",
        lastError: "phone_number_id mismatch",
      }),
    });
    expect(Workspace.get).not.toHaveBeenCalled();
  });

  test("sends an interactive list returned by chatSync instead of the marker text", async () => {
    const row = queuedRow();
    row.payload = JSON.stringify({
      phoneNumberId: "phone-1",
      waId: "wa-1",
      message: {
        id: "message-interactive",
        from: "wa-1",
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "1", title: "Margherita" },
        },
        text: { body: "Margherita" },
      },
    });
    setupRun(row);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    const interactive = {
      type: "list",
      headerText: "Cardápio",
      bodyText: "Escolha uma opção",
      footerText: "Toque em uma opção",
      buttonLabel: "Ver cardápio",
      sections: [],
    };
    ApiChatHandler.chatSync.mockResolvedValue({
      textResponse: `${INTERACTIVE_MARKER}${JSON.stringify({
        text: "fallback",
        interactive,
      })}`,
    });
    sendWhatsAppList.mockResolvedValue({ status: 200, body: "ok" });

    const result = await runOnce();

    expect(result).toEqual({ processed: 1, total: 1 });
    expect(ApiChatHandler.chatSync).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Margherita" })
    );
    expect(sendWhatsAppList).toHaveBeenCalledWith({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      ...interactive,
    });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  test("sends an interactive button payload returned by chatSync", async () => {
    const row = queuedRow();
    setupRun(row);
    Workspace.get.mockResolvedValue({ id: 1, slug: "workspace" });
    const interactive = {
      type: "button",
      bodyText: "Confirme seu pedido",
      footerText: "Escolha uma ação",
      buttons: [],
    };
    ApiChatHandler.chatSync.mockResolvedValue({
      textResponse: `${INTERACTIVE_MARKER}${JSON.stringify({
        text: "fallback",
        interactive,
      })}`,
    });
    sendWhatsAppButtons.mockResolvedValue({ status: 200, body: "ok" });

    await runOnce();

    expect(sendWhatsAppButtons).toHaveBeenCalledWith({
      phoneNumberId: "phone-1",
      accessToken: "access-token",
      to: "wa-1",
      ...interactive,
    });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  test("recovers stale processing rows", async () => {
    prisma.whatsapp_webhook_messages.updateMany.mockResolvedValue({ count: 1 });

    await recoverStaleProcessing();

    const failedCall = prisma.whatsapp_webhook_messages.updateMany.mock.calls.find(
      ([args]) => args.data.status === "failed"
    );
    const queuedCall = prisma.whatsapp_webhook_messages.updateMany.mock.calls.find(
      ([args]) => args.data.status === "queued"
    );
    expect(failedCall[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "processing",
          attempts: { gte: 4 },
        }),
        data: expect.objectContaining({
          failedAt: expect.any(Date),
        }),
      })
    );
    expect(queuedCall[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "processing",
          attempts: 0,
        }),
        data: expect.objectContaining({
          availableAt: expect.any(Date),
        }),
      })
    );
  });

  test("recoverStaleProcessing dead-letters rows at max attempts", async () => {
    prisma.whatsapp_webhook_messages.updateMany.mockResolvedValue({ count: 1 });

    await recoverStaleProcessing();

    expect(prisma.whatsapp_webhook_messages.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "processing",
          attempts: { gte: 4 },
        }),
        data: expect.objectContaining({
          status: "failed",
          failedAt: expect.any(Date),
        }),
      })
    );
  });

  test("watchdog fires after its configured timeout", async () => {
    const onTimeout = jest.fn();
    const timer = createWatchdog(5, onTimeout);

    await new Promise((resolve) => setTimeout(resolve, 15));
    clearTimeout(timer);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  test("poll loop stops when its abort signal fires", async () => {
    const controller = new AbortController();
    let iterations = 0;

    await runPollLoop({
      signal: controller.signal,
      pollIntervalMs: 1,
      run: async ({ batchSize }) => {
        iterations += 1;
        if (iterations >= 2) controller.abort();
        return { processed: 0, total: batchSize };
      },
    });

    expect(iterations).toBe(2);
  });
});

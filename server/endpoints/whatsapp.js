const crypto = require("crypto");
const prisma = require("../utils/prisma");
const {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
} = require("../models/externalCommunicationConnector");
const { decryptToken } = require("../utils/telegramBot/utils");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { isSingleUserMode } = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");
const { EventLogs } = require("../models/eventLogs");
const { Workspace } = require("../models/workspace");

const MAX_MESSAGES_PER_WEBHOOK = 50;
const MAX_ABSOLUTE_PENDING_PER_WEBHOOK = 200;
const WEBHOOK_PATH = "/api/whatsapp/webhook";
const WHATSAPP_CONFIG_FIELDS = [
  "appSecret",
  "phoneNumberId",
  "accessToken",
  "verifyToken",
  "workspaceSlug",
];
const WHATSAPP_FIELD_LIMITS = {
  appSecret: 255,
  phoneNumberId: 64,
  accessToken: 512,
  verifyToken: 128,
  workspaceSlug: 255,
};

function rawBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body.toString("utf8");
  if (typeof request.body === "string") return request.body;
  return "";
}

function decryptWhatsAppConfig(config = {}) {
  const decrypted = { ...config };
  for (const field of WHATSAPP_SECRET_FIELDS) {
    if (typeof decrypted[field] === "string" && decrypted[field])
      decrypted[field] = decryptToken(decrypted[field]);
  }
  return decrypted;
}

function activeWhatsAppConfig(connector) {
  if (!connector?.active) return null;
  const config = decryptWhatsAppConfig(connector.config || {});
  const { valid } = ExternalCommunicationConnector.validateConfig(
    "whatsapp",
    config
  );
  return valid ? config : null;
}

function validateConnectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { error: "Invalid request body.", config: null };

  const keys = Object.keys(body);
  if (keys.some((key) => !WHATSAPP_CONFIG_FIELDS.includes(key)))
    return { error: "Invalid configuration field.", config: null };

  const config = {};
  for (const field of WHATSAPP_CONFIG_FIELDS) {
    const value = body[field];
    if (typeof value !== "string" || value.trim().length === 0)
      return { error: `${field} is required.`, config: null };
    if (value.length > WHATSAPP_FIELD_LIMITS[field])
      return { error: `${field} exceeds maximum length.`, config: null };
    config[field] = value.trim();
  }
  return { error: null, config };
}

function isValidSignature(header = "", rawBodyText = "", appSecret = "") {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(header).trim());
  if (!match || !appSecret) return false;
  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBodyText)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(match[1].toLowerCase(), "hex");
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function extractWhatsAppMessages(payload) {
  if (
    !payload ||
    payload.object !== "whatsapp_business_account" ||
    !Array.isArray(payload.entry)
  )
    return [];

  const messages = [];
  for (const entry of payload.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (
        !change ||
        change.field !== "messages" ||
        !change.value ||
        !Array.isArray(change.value.messages)
      )
        continue;
      const phoneNumberId = change.value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const message of change.value.messages) {
        if (message?.id && message?.from)
          messages.push({
            phoneNumberId,
            waId: message.from,
            message,
          });
      }
    }
  }
  return messages;
}

async function enqueueMessages(config, messages) {
  const pending = messages.filter(
    (item) => item.phoneNumberId === config.phoneNumberId
  );
  if (pending.length === 0) return;

  await prisma.whatsapp_webhook_messages.createMany({
    data: pending.map((item) => ({
      messageId: item.message.id,
      phoneNumberId: item.phoneNumberId,
      waId: item.waId,
      payload: JSON.stringify(item),
      status: "queued",
      attempts: 0,
      claimedAt: null,
      availableAt: new Date(),
      processedAt: null,
      failedAt: null,
    })),
    skipDuplicates: true,
  });
}

async function pendingMessages(config, messages) {
  const valid = messages.filter(
    (item) => item.phoneNumberId === config.phoneNumberId
  );
  if (valid.length === 0) return [];

  const ids = valid.map((item) => item.message.id);
  const existing = await prisma.whatsapp_webhook_messages.findMany({
    where: { messageId: { in: ids } },
    select: { messageId: true },
  });
  const existingIds = new Set(existing.map((row) => row.messageId));
  return valid.filter((item) => !existingIds.has(item.message.id));
}

function whatsappEndpoints(app) {
  if (!app) return;

  app.get(
    "/whatsapp/config",
    [validatedRequest, isSingleUserMode],
    async (_request, response) => {
      try {
        const connector =
          await ExternalCommunicationConnector.getStrict("whatsapp");
        if (!connector) return response.status(200).json({ config: null });
        return response.status(200).json({
          config: {
            active: connector.active,
            phoneNumberId: connector.config?.phoneNumberId || null,
            workspaceSlug: connector.config?.workspaceSlug || null,
            webhookPath: WEBHOOK_PATH,
          },
        });
      } catch (error) {
        console.error("WhatsApp config lookup failed", {
          service: "WhatsAppAdmin",
          method: "config",
          error: error.message,
          stack: error.stack,
        });
        return response.sendStatus(500);
      }
    }
  );

  app.post(
    "/whatsapp/connect",
    [validatedRequest, isSingleUserMode],
    async (request, response) => {
      try {
        const { error, config } = validateConnectBody(reqBody(request));
        if (error) return response.status(400).json({ success: false, error });

        const workspace = await Workspace.get({
          slug: config.workspaceSlug,
        });
        if (!workspace)
          return response.status(400).json({
            success: false,
            error: "Workspace not found.",
          });

        const { connector, error: saveError } =
          await ExternalCommunicationConnector.upsert("whatsapp", {
            ...config,
            active: true,
          });
        if (!connector) {
          console.error("WhatsApp connect failed", {
            service: "WhatsAppAdmin",
            method: "connect",
            error: saveError,
          });
          return response.sendStatus(500);
        }

        await EventLogs.logEvent("whatsapp_connected", {
          workspaceSlug: config.workspaceSlug,
        });
        return response.status(200).json({ success: true });
      } catch (error) {
        console.error("WhatsApp connect failed", {
          service: "WhatsAppAdmin",
          method: "connect",
          error: error.message,
          stack: error.stack,
        });
        return response.sendStatus(500);
      }
    }
  );

  app.post(
    "/whatsapp/disconnect",
    [validatedRequest, isSingleUserMode],
    async (_request, response) => {
      try {
        const connector =
          await ExternalCommunicationConnector.getStrict("whatsapp");
        if (connector) {
          const deleted =
            await ExternalCommunicationConnector.delete("whatsapp");
          if (!deleted) return response.sendStatus(500);
        }
        await EventLogs.logEvent("whatsapp_disconnected");
        return response.status(200).json({ success: true });
      } catch (error) {
        console.error("WhatsApp disconnect failed", {
          service: "WhatsAppAdmin",
          method: "disconnect",
          error: error.message,
          stack: error.stack,
        });
        return response.sendStatus(500);
      }
    }
  );

  app.get(
    "/whatsapp/status",
    [validatedRequest, isSingleUserMode],
    async (_request, response) => {
      try {
        const connector =
          await ExternalCommunicationConnector.getStrict("whatsapp");
        return response.status(200).json({
          active: Boolean(connector?.active),
          configPresent: Boolean(
            connector?.config && Object.keys(connector.config).length > 0
          ),
        });
      } catch (error) {
        console.error("WhatsApp status lookup failed", {
          service: "WhatsAppAdmin",
          method: "status",
          error: error.message,
          stack: error.stack,
        });
        return response.sendStatus(500);
      }
    }
  );

  app.get("/whatsapp/webhook", async (request, response) => {
    let connector;
    try {
      connector = await ExternalCommunicationConnector.getStrict("whatsapp");
    } catch (error) {
      console.error("WhatsApp webhook connector lookup failed", {
        service: "WhatsAppWebhook",
        method: "handshake",
        error: error.message,
        stack: error.stack,
      });
      return response.sendStatus(503);
    }

    try {
      const config = activeWhatsAppConfig(connector);
      const mode = request.query?.["hub.mode"];
      const token = request.query?.["hub.verify_token"];
      const challenge = request.query?.["hub.challenge"];
      if (
        !config ||
        mode !== "subscribe" ||
        token !== config.verifyToken ||
        !challenge
      )
        return response.status(403).send("Forbidden");
      return response.send(String(challenge));
    } catch (error) {
      console.error("WhatsApp webhook handshake failed", {
        service: "WhatsAppWebhook",
        method: "handshake",
        error: error.message,
        stack: error.stack,
      });
      return response.status(403).send("Forbidden");
    }
  });

  app.post("/whatsapp/webhook", async (request, response) => {
    let connector;
    try {
      connector = await ExternalCommunicationConnector.getStrict("whatsapp");
    } catch (error) {
      console.error("WhatsApp webhook connector lookup failed", {
        service: "WhatsAppWebhook",
        method: "webhook",
        error: error.message,
        stack: error.stack,
      });
      return response.sendStatus(503);
    }

    const config = activeWhatsAppConfig(connector);
    if (!config) return response.sendStatus(401);

    const body = rawBody(request);
    const signature =
      request.get?.("x-hub-signature-256") ||
      request.headers?.["x-hub-signature-256"];
    if (!isValidSignature(signature, body, config.appSecret))
      return response.sendStatus(401);

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return response.status(400).send("Invalid JSON");
    }

    const messages = extractWhatsAppMessages(payload);
    if (messages.length === 0) return response.sendStatus(200);

    try {
      const pending = await pendingMessages(config, messages);
      if (pending.length === 0) return response.sendStatus(200);

      await enqueueMessages(config, pending.slice(0, MAX_MESSAGES_PER_WEBHOOK));
      const overflow =
        pending.length > MAX_MESSAGES_PER_WEBHOOK ||
        pending.length > MAX_ABSOLUTE_PENDING_PER_WEBHOOK;
      return response.sendStatus(overflow ? 502 : 200);
    } catch (error) {
      console.error("WhatsApp webhook enqueue failed", {
        service: "WhatsAppWebhook",
        method: "enqueue",
        error: error.message,
        stack: error.stack,
      });
      return response.sendStatus(503);
    }
  });
}

module.exports = { whatsappEndpoints };

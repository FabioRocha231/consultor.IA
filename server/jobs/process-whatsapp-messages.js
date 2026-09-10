const prisma = require("../utils/prisma");
const {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
} = require("../models/externalCommunicationConnector");
const { Workspace } = require("../models/workspace");
const { ApiChatHandler } = require("../utils/chats/apiChatHandler");
const {
  sendWhatsAppText,
  sendWhatsAppList,
  sendWhatsAppButtons,
} = require("../integrations/whatsapp/client");
const { INTERACTIVE_MARKER } = require("../integrations/whatsapp/interactive");
const { decryptToken } = require("../utils/telegramBot/utils");
const { log, conclude } = require("./helpers/index.js");

const BATCH_SIZE = 10;
const WATCHDOG_TIMEOUT_MS = 2 * 60 * 1000;
const STALE_PROCESSING_MS = 3 * 60 * 1000;
const PROCESSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];
const TEXT_ONLY_MESSAGE =
  "Por favor, envie sua mensagem em texto para continuar.";
const MAX_TEXT_LENGTH = 4096;
const PERMANENT_ERROR_PATTERNS = [
  /Invalid queued payload/,
  /Configured WhatsApp workspace was not found/,
  /phone_number_id mismatch/,
  /WhatsApp Cloud API returned HTTP (400|401|403|404)/,
];

const POLL_INTERVAL_MS = Number(process.env.WHATSAPP_WORKER_POLL_MS) || 5_000;
const RUN_ON_STARTUP = process.env.WHATSAPP_WORKER_SKIP_STARTUP !== "1";
const MAX_CONSECUTIVE_ERRORS = 10;
const ERROR_BACKOFF_MS = 30_000;

let shouldStop = false;
const stopController = new AbortController();
process.on("SIGTERM", () => {
  shouldStop = true;
  stopController.abort();
});
process.on("SIGINT", () => {
  shouldStop = true;
  stopController.abort();
});

function sanitizeError(error) {
  return String(error?.message || error).slice(0, 200);
}

function parseInteractiveResponse(text) {
  if (typeof text !== "string" || !text.startsWith(INTERACTIVE_MARKER))
    return null;
  try {
    const parsed = JSON.parse(text.slice(INTERACTIVE_MARKER.length));
    return { interactive: parsed.interactive, fallbackText: parsed.text };
  } catch {
    return {
      interactive: null,
      fallbackText: text.slice(INTERACTIVE_MARKER.length),
    };
  }
}

function createWatchdog(
  timeoutMs = WATCHDOG_TIMEOUT_MS,
  onTimeout = () => process.exit(1)
) {
  const timer = setTimeout(onTimeout, timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();

    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    if (typeof timer.unref === "function") timer.unref();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function isPermanentFailure(error) {
  const message = String(error?.message || error);
  return PERMANENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function decryptWhatsAppConfig(config = {}) {
  const decrypted = { ...config };
  for (const field of WHATSAPP_SECRET_FIELDS) {
    if (typeof decrypted[field] === "string" && decrypted[field])
      decrypted[field] = decryptToken(decrypted[field]);
  }
  return decrypted;
}

async function activeWhatsAppConfig() {
  const connector = await ExternalCommunicationConnector.getStrict("whatsapp");
  if (!connector?.active) return null;
  const config = decryptWhatsAppConfig(connector.config || {});
  const { valid } = ExternalCommunicationConnector.validateConfig(
    "whatsapp",
    config
  );
  return valid ? config : null;
}

async function recoverStaleProcessing() {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const staleWhere = { status: "processing", claimedAt: { lt: staleBefore } };

  await prisma.whatsapp_webhook_messages.updateMany({
    where: { ...staleWhere, attempts: { gte: MAX_ATTEMPTS - 1 } },
    data: {
      status: "failed",
      failedAt: new Date(),
      claimedAt: null,
      availableAt: null,
      attempts: { increment: 1 },
      lastError: "stale processing recovery exceeded max attempts",
    },
  });

  for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt += 1) {
    await prisma.whatsapp_webhook_messages.updateMany({
      where: { ...staleWhere, attempts: attempt },
      data: {
        status: "queued",
        claimedAt: null,
        attempts: { increment: 1 },
        availableAt: new Date(Date.now() + RETRY_DELAYS_MS[attempt]),
        lastError: "stale processing recovery",
      },
    });
  }
}

async function claimBatch(batchSize = BATCH_SIZE) {
  const now = new Date();
  const candidates = await prisma.whatsapp_webhook_messages.findMany({
    where: {
      status: "queued",
      OR: [{ availableAt: null }, { availableAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  const ids = candidates.map((candidate) => candidate.id);
  const claimedAt = new Date();
  const { count } = await prisma.whatsapp_webhook_messages.updateMany({
    where: { id: { in: ids }, status: "queued" },
    data: { status: "processing", claimedAt },
  });
  if (count === 0) return [];

  return prisma.whatsapp_webhook_messages.findMany({
    where: { id: { in: ids }, status: "processing", claimedAt },
  });
}

async function markProcessed(row) {
  const { count } = await prisma.whatsapp_webhook_messages.updateMany({
    where: { id: row.id, status: "processing", claimedAt: row.claimedAt },
    data: {
      status: "processed",
      processedAt: new Date(),
      claimedAt: null,
      failedAt: null,
      lastError: null,
    },
  });
  return count;
}

async function markFailed(row, error) {
  const { count } = await prisma.whatsapp_webhook_messages.updateMany({
    where: { id: row.id, status: "processing", claimedAt: row.claimedAt },
    data: {
      status: "failed",
      failedAt: new Date(),
      claimedAt: null,
      processedAt: null,
      attempts: { increment: 1 },
      availableAt: null,
      lastError: sanitizeError(error),
    },
  });
  return count;
}

async function rescheduleFailed(row, error) {
  const delayMs =
    RETRY_DELAYS_MS[Math.min(row.attempts, RETRY_DELAYS_MS.length - 1)] ??
    RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const { count } = await prisma.whatsapp_webhook_messages.updateMany({
    where: { id: row.id, status: "processing", claimedAt: row.claimedAt },
    data: {
      status: "queued",
      claimedAt: null,
      processedAt: null,
      failedAt: null,
      attempts: { increment: 1 },
      availableAt: new Date(Date.now() + delayMs),
      lastError: sanitizeError(error),
    },
  });
  return count;
}

async function deleteOldMessages() {
  const cutoff = new Date(Date.now() - PROCESSED_RETENTION_MS);
  await prisma.whatsapp_webhook_messages.deleteMany({
    where: {
      OR: [
        { status: "processed", processedAt: { lt: cutoff } },
        { status: "failed", failedAt: { lt: cutoff } },
      ],
    },
  });
}

async function processRow(config, row) {
  if (row.phoneNumberId !== config.phoneNumberId)
    throw new Error("phone_number_id mismatch");

  let item;
  try {
    item = JSON.parse(row.payload);
  } catch {
    throw new Error("Invalid queued payload");
  }
  const { phoneNumberId, waId, message } = item || {};
  if (!message?.id || !waId) throw new Error("Invalid queued payload fields");

  const text =
    typeof message.text?.body === "string" ? message.text.body : null;
  if (!text?.trim()) {
    await sendWhatsAppText({
      phoneNumberId,
      accessToken: config.accessToken,
      to: waId,
      text: TEXT_ONLY_MESSAGE,
    });
    return;
  }

  const workspace = await Workspace.get({ slug: config.workspaceSlug });
  if (!workspace)
    throw new Error("Configured WhatsApp workspace was not found");

  const result = await ApiChatHandler.chatSync({
    workspace,
    message: text.slice(0, MAX_TEXT_LENGTH),
    sessionId: `whatsapp:${phoneNumberId}:${waId}`,
  });
  if (result?.textResponse) {
    const interactive = parseInteractiveResponse(result.textResponse);
    if (interactive?.interactive?.type === "list") {
      await sendWhatsAppList({
        phoneNumberId,
        accessToken: config.accessToken,
        to: waId,
        ...interactive.interactive,
      });
      return;
    }
    if (interactive?.interactive?.type === "button") {
      await sendWhatsAppButtons({
        phoneNumberId,
        accessToken: config.accessToken,
        to: waId,
        ...interactive.interactive,
      });
      return;
    }
    await sendWhatsAppText({
      phoneNumberId,
      accessToken: config.accessToken,
      to: waId,
      text: (interactive?.fallbackText || result.textResponse).slice(
        0,
        MAX_TEXT_LENGTH
      ),
    });
  }
}

async function runOnce({ batchSize = BATCH_SIZE } = {}) {
  await recoverStaleProcessing();
  await deleteOldMessages();

  const config = await activeWhatsAppConfig();
  if (!config) return { processed: 0, total: 0 };

  const rows = await claimBatch(batchSize);
  if (rows.length === 0) return { processed: 0, total: 0 };

  let processed = 0;
  for (const row of rows) {
    try {
      await processRow(config, row);
      const confirmed = await markProcessed(row);
      if (confirmed > 0) processed += 1;
    } catch (error) {
      const nextAttempts = row.attempts + 1;
      if (isPermanentFailure(error) || nextAttempts >= MAX_ATTEMPTS) {
        await markFailed(row, error);
      } else {
        await rescheduleFailed(row, error);
      }
    }
  }
  await deleteOldMessages();
  return { processed, total: rows.length };
}

async function runPollLoop({
  signal = stopController.signal,
  timeoutMs = WATCHDOG_TIMEOUT_MS,
  pollIntervalMs = POLL_INTERVAL_MS,
  errorBackoffMs = ERROR_BACKOFF_MS,
  run = runOnce,
} = {}) {
  let consecutiveErrors = 0;
  let hasRun = false;

  while (!shouldStop && !signal?.aborted) {
    let watchdog;
    try {
      watchdog = createWatchdog(timeoutMs);
      if (RUN_ON_STARTUP || hasRun) {
        const result = await run({ batchSize: BATCH_SIZE });
        if (result.processed > 0) {
          log(
            `Processed ${result.processed} of ${result.total} WhatsApp messages`
          );
          consecutiveErrors = 0;
        }
      }
      clearTimeout(watchdog);
    } catch (error) {
      clearTimeout(watchdog);
      log(`WhatsApp queue iteration failed: ${sanitizeError(error)}`);
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log(`Aborting: ${consecutiveErrors} consecutive errors`);
        return { abortedByErrors: true };
      }
      await sleep(errorBackoffMs, signal);
      continue;
    }

    hasRun = true;
    if (shouldStop || signal?.aborted) break;
    await sleep(pollIntervalMs, signal);
  }

  return { abortedByErrors: false };
}

async function main({ timeoutMs = WATCHDOG_TIMEOUT_MS } = {}) {
  log(`WhatsApp worker started (poll=${POLL_INTERVAL_MS}ms)`);
  await recoverStaleProcessing();

  if (!RUN_ON_STARTUP)
    log("Skipping initial run per WHATSAPP_WORKER_SKIP_STARTUP");

  const { abortedByErrors } = await runPollLoop({ timeoutMs });
  log("WhatsApp worker stopped");
  if (abortedByErrors) process.exit(1);
  conclude();
}

if (require.main === module) main();

module.exports = {
  runOnce,
  recoverStaleProcessing,
  claimBatch,
  processRow,
  sanitizeError,
  createWatchdog,
  parseInteractiveResponse,
  isPermanentFailure,
  runPollLoop,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
};

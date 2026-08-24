const { writeSensitiveDebugAudit } = require("./sensitiveDebugAudit");

const parsedTtl = Number(process.env.SENSITIVE_DEBUG_TTL_MS || 15 * 60 * 1000);
const parsedRetain = Number(
  process.env.SENSITIVE_DEBUG_RETAIN_MS || 60 * 60 * 1000
);
const SENSITIVE_DEBUG = process.env.SENSITIVE_DEBUG === "true";
const SENSITIVE_DEBUG_TTL_MS =
  Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 15 * 60 * 1000;
const SENSITIVE_DEBUG_RETAIN_MS =
  Number.isFinite(parsedRetain) && parsedRetain > 0
    ? parsedRetain
    : 60 * 60 * 1000;

let activeUntil = null;
let expiryTimer = null;

function clearExpiryTimer() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function expireIfNeeded() {
  if (activeUntil === null || Date.now() < activeUntil) return false;
  activeUntil = null;
  clearExpiryTimer();
  writeSensitiveDebugAudit({
    user_id: null,
    enabled: false,
    ttl_ms: 0,
    reason: "ttl_expired",
  });
  return true;
}

function isSensitiveDebugEnabled() {
  if (!SENSITIVE_DEBUG) return false;
  expireIfNeeded();
  return activeUntil !== null;
}

function getTtl() {
  return SENSITIVE_DEBUG_TTL_MS;
}

function getRetain() {
  return SENSITIVE_DEBUG_RETAIN_MS;
}

function getRemainingTtlMs() {
  if (!isSensitiveDebugEnabled()) return 0;
  return Math.max(0, activeUntil - Date.now());
}

function getStatus() {
  return {
    configured: SENSITIVE_DEBUG,
    enabled: isSensitiveDebugEnabled(),
    ttlMs: SENSITIVE_DEBUG_TTL_MS,
    remainingMs: getRemainingTtlMs(),
  };
}

function scheduleExpiry() {
  clearExpiryTimer();
  expiryTimer = setTimeout(() => expireIfNeeded(), SENSITIVE_DEBUG_TTL_MS);
  if (typeof expiryTimer.unref === "function") expiryTimer.unref();
}

async function enable({ userId = null } = {}) {
  if (!SENSITIVE_DEBUG) {
    return {
      ...getStatus(),
      error: "SENSITIVE_DEBUG is not enabled in this deployment.",
    };
  }

  activeUntil = Date.now() + SENSITIVE_DEBUG_TTL_MS;
  scheduleExpiry();
  await writeSensitiveDebugAudit({
    user_id: userId,
    enabled: true,
    ttl_ms: SENSITIVE_DEBUG_TTL_MS,
  });
  return getStatus();
}

async function disable({ userId = null } = {}) {
  const wasEnabled = activeUntil !== null;
  clearExpiryTimer();
  activeUntil = null;
  if (wasEnabled) {
    await writeSensitiveDebugAudit({
      user_id: userId,
      enabled: false,
      ttl_ms: 0,
    });
  }
  return getStatus();
}

module.exports = {
  SENSITIVE_DEBUG,
  SENSITIVE_DEBUG_RETAIN_MS,
  SENSITIVE_DEBUG_TTL_MS,
  disable,
  enable,
  getRemainingTtlMs,
  getRetain,
  getStatus,
  getTtl,
  isSensitiveDebugEnabled,
};

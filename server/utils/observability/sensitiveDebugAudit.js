const fs = require("fs");
const path = require("path");

function storageDirectory() {
  return process.env.STORAGE_DIR || path.resolve(__dirname, "../../../storage");
}

function auditLogPath() {
  return path.join(storageDirectory(), "sensitive-debug-audit.log");
}

async function rotateIfNeeded() {
  const logPath = auditLogPath();
  try {
    const stat = await fs.promises.stat(logPath);
    const modifiedDay = stat.mtime.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (modifiedDay === today) return;
    await fs.promises.rename(
      logPath,
      path.join(storageDirectory(), `sensitive-debug-audit-${modifiedDay}.log`)
    );
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function writeSensitiveDebugAudit({
  user_id = null,
  enabled = false,
  ttl_ms = 0,
  timestamp = new Date().toISOString(),
  reason = null,
} = {}) {
  try {
    await fs.promises.mkdir(storageDirectory(), { recursive: true });
    await rotateIfNeeded();
    const record = {
      event: "sensitive_debug.toggle",
      user_id,
      enabled: Boolean(enabled),
      ttl_ms: Number(ttl_ms) || 0,
      timestamp,
    };
    if (reason) record.reason = reason;
    await fs.promises.appendFile(
      auditLogPath(),
      `${JSON.stringify(record)}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("Failed to write sensitive debug audit log", error.message);
  }
}

module.exports = {
  auditLogPath,
  storageDirectory,
  writeSensitiveDebugAudit,
};

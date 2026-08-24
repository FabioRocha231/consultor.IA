const { redact } = require("../logger/redact");

const REDACTED = "[REDACTED]";
const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "set-cookie",
  "x-api-key",
  "api-key",
  "apikey",
  "api_key",
  "password",
  "passwd",
  "secret",
  "token",
  "jwt",
  "credential",
  "access_token",
  "refresh_token",
  "client_secret",
]);
const CONTENT_KEY_PATTERN =
  /(^|[._-])(prompt|message|response|content|payload|body|document|chunk|retrieved|text|source)([._-]|$)/i;
const SAFE_METADATA_KEY_PATTERN =
  /(^|[._-])(id|ids|count|length|size|score|status|total|hash|hashes|name|type)([._-]|$)/i;

function isSensitiveHeaderKey(key) {
  const normalized = String(key).toLowerCase();
  const lastSegment = normalized.split(/[._-]/).pop();
  return (
    SENSITIVE_HEADER_KEYS.has(normalized) ||
    SENSITIVE_HEADER_KEYS.has(lastSegment) ||
    /(^|[._-])x-api-key([._-]|$)/.test(normalized) ||
    /(^|[._-])api[-_]?key([._-]|$)/.test(normalized)
  );
}

function isSensitiveContentKey(key) {
  if (SAFE_METADATA_KEY_PATTERN.test(String(key))) return false;
  return CONTENT_KEY_PATTERN.test(String(key));
}

function redactSpanAttributes(attributes = {}) {
  return Object.fromEntries(
    Object.entries(attributes).map(([key, value]) => [
      key,
      isSensitiveHeaderKey(key) || isSensitiveContentKey(key)
        ? REDACTED
        : redact(value),
    ])
  );
}

module.exports = {
  REDACTED,
  redactSpanAttributes,
};

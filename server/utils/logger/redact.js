const DENYLIST = new Set([
  "authorization",
  "cookie",
  "cookies",
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "api-key",
  "x-api-key",
]);

function redact(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      DENYLIST.has(key.toLowerCase()) ? "[REDACTED]" : redact(item, seen),
    ])
  );
}

module.exports = {
  redact,
  DENYLIST,
};

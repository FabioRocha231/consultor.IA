const rateLimit = require("express-rate-limit");
const { getMeter } = require("../observability/metrics");

const SECURITY_SCOPE = "consultor-ia.security";
let blockedCounter = null;

function recordBlocked(route, keyType) {
  if (!blockedCounter) {
    blockedCounter = getMeter(SECURITY_SCOPE).createCounter(
      "rate_limit_blocked_total"
    );
  }
  blockedCounter.add(1, { route, key_type: keyType });
}

function positiveEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveWindowMs(name, fallback) {
  const perLimiter = positiveEnv(
    `RATE_LIMIT_${name.toUpperCase()}_WINDOW_MS`,
    null
  );
  if (perLimiter !== null) return perLimiter;
  const global = positiveEnv("RATE_LIMIT_WINDOW_MS", null);
  return global === null ? fallback : global;
}

function makeKeyGenerator() {
  return (request, response = {}) => {
    const userId = request.user?.id || response.locals?.user?.id;
    if (userId) {
      request.rateLimitKeyType = "user";
      return `user:${userId}`;
    }
    request.rateLimitKeyType = "ip";
    return request.ip;
  };
}

const defaultKeyGenerator = makeKeyGenerator();

function makeLimiter({ windowMs, max, name, keyGenerator }) {
  return rateLimit({
    windowMs: resolveWindowMs(name, windowMs),
    max: positiveEnv(`RATE_LIMIT_${name.toUpperCase()}_MAX`, max),
    keyGenerator: keyGenerator || defaultKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      trustProxy: false,
      xForwardedForHeader: false,
    },
    skip: () => process.env.RATE_LIMIT_ENABLED === "false",
    handler: (request, response) => {
      recordBlocked(name, request.rateLimitKeyType || "ip");
      response.status(429).json({ error: "rate_limited", route: name });
    },
  });
}

function createFakeResponse() {
  const headers = {};
  return {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    append(name, value) {
      const key = name.toLowerCase();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    send(body) {
      this.body = body;
      this.writableEnded = true;
      return this;
    },
    end() {
      this.writableEnded = true;
      return this;
    },
    on() {
      return this;
    },
  };
}

async function allowWebSocketRateLimit(limiter, socket, request) {
  const response = createFakeResponse();
  await limiter(request, response, () => {});
  if (response.statusCode !== 429) return true;
  socket.close(1008, "rate_limited");
  return false;
}

const loginLimiter = makeLimiter({
  windowMs: 15 * 60_000,
  max: 5,
  name: "login",
});
const chatLimiter = makeLimiter({
  windowMs: 60_000,
  max: 30,
  name: "chat",
});
const uploadLimiter = makeLimiter({
  windowMs: 60_000,
  max: 10,
  name: "upload",
});
const embedLimiter = makeLimiter({
  windowMs: 60_000,
  max: 120,
  name: "embed",
});
const agentLimiter = makeLimiter({
  windowMs: 60_000,
  max: 30,
  name: "agent",
});

module.exports = {
  agentLimiter,
  allowWebSocketRateLimit,
  chatLimiter,
  defaultKeyGenerator,
  embedLimiter,
  loginLimiter,
  makeKeyGenerator,
  makeLimiter,
  uploadLimiter,
};

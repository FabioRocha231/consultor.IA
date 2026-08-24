/* eslint-env jest, node */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REDACTED = "[REDACTED]";

function mockResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn((body) => {
    response.body = body;
    return response;
  });
  response.sendStatus = jest.fn(() => response);
  response.end = jest.fn(() => response);
  return response;
}

describe("sensitive debug mode", () => {
  let storageDir;

  beforeEach(() => {
    storageDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "consultor-sensitive-debug-")
    );
    process.env.STORAGE_DIR = storageDir;
    delete process.env.SENSITIVE_DEBUG;
    delete process.env.SENSITIVE_DEBUG_TTL_MS;
    delete process.env.SENSITIVE_DEBUG_RETAIN_MS;
    jest.resetModules();
  });

  afterEach(() => {
    delete process.env.SENSITIVE_DEBUG;
    delete process.env.SENSITIVE_DEBUG_TTL_MS;
    delete process.env.SENSITIVE_DEBUG_RETAIN_MS;
    delete process.env.STORAGE_DIR;
    fs.rmSync(storageDir, { recursive: true, force: true });
    jest.resetModules();
  });

  test("isSensitiveDebugEnabled reflects env and requires admin activation", async () => {
    const {
      enable,
      getStatus,
      isSensitiveDebugEnabled,
    } = require("../../utils/observability/sensitiveDebug");

    expect(isSensitiveDebugEnabled()).toBe(false);
    expect((await enable({ userId: 1 })).enabled).toBe(false);
    expect(getStatus().configured).toBe(false);
  });

  test("enable with env true returns status and writes audit toggles", async () => {
    process.env.SENSITIVE_DEBUG = "true";
    process.env.SENSITIVE_DEBUG_TTL_MS = "900000";
    const {
      disable,
      enable,
      isSensitiveDebugEnabled,
    } = require("../../utils/observability/sensitiveDebug");

    const status = await enable({ userId: 7 });
    expect(status.enabled).toBe(true);
    expect(status.ttlMs).toBe(900000);
    expect(isSensitiveDebugEnabled()).toBe(true);

    await disable({ userId: 7 });
    const auditPath = path.join(storageDir, "sensitive-debug-audit.log");
    const lines = fs.readFileSync(auditPath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "sensitive_debug.toggle",
      user_id: 7,
      enabled: true,
      ttl_ms: 900000,
    });
    expect(JSON.parse(lines[1])).toMatchObject({
      event: "sensitive_debug.toggle",
      user_id: 7,
      enabled: false,
    });
  });

  test("TTL expires and disables automatically", async () => {
    process.env.SENSITIVE_DEBUG = "true";
    process.env.SENSITIVE_DEBUG_TTL_MS = "10";
    const {
      enable,
      isSensitiveDebugEnabled,
    } = require("../../utils/observability/sensitiveDebug");

    await enable({ userId: 9 });
    expect(isSensitiveDebugEnabled()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(isSensitiveDebugEnabled()).toBe(false);
  });

  test("redactSpanAttributes masks headers, prompts and chunks but keeps metadata", () => {
    const {
      redactSpanAttributes,
    } = require("../../utils/observability/redaction");

    expect(
      redactSpanAttributes({
        "http.request.header.authorization": "Bearer secret",
        "http.request.header.cookie": "session=abc",
        "http.request.header.set-cookie": "session=abc",
        "http.request.header.x-api-key": "abc",
        "llm.prompt": "full prompt",
        "rag.chunk_text": "full chunk",
        "debug.document": "full document",
        "chat.message_id": "msg-1",
        "rag.chunks": 3,
        "llm.model": "gpt-4o",
      })
    ).toEqual({
      "http.request.header.authorization": REDACTED,
      "http.request.header.cookie": REDACTED,
      "http.request.header.set-cookie": REDACTED,
      "http.request.header.x-api-key": REDACTED,
      "llm.prompt": REDACTED,
      "rag.chunk_text": REDACTED,
      "debug.document": REDACTED,
      "chat.message_id": "msg-1",
      "rag.chunks": 3,
      "llm.model": "gpt-4o",
    });
  });

  test("span processor redacts while enabled and drops sensitive spans when disabled", async () => {
    process.env.SENSITIVE_DEBUG = "true";
    process.env.SENSITIVE_DEBUG_TTL_MS = "900000";
    const { InMemorySpanExporter } = require("@opentelemetry/sdk-trace-node");
    const {
      disable,
      enable,
    } = require("../../utils/observability/sensitiveDebug");
    const {
      SensitiveDebugBatchSpanProcessor,
    } = require("../../utils/observability/tracing");

    await enable({ userId: 1 });
    const exporter = new InMemorySpanExporter();
    const processor = new SensitiveDebugBatchSpanProcessor(exporter);
    const fakeSpan = (attributes) => ({
      name: "llm.generate",
      kind: 1,
      spanContext: () => ({ traceFlags: 1 }),
      attributes,
      events: [],
      links: [],
      resource: { asyncAttributesPending: false },
      instrumentationScope: {},
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    });

    processor.onEnd(
      fakeSpan({
        "llm.prompt": "hello",
        "http.request.header.authorization": "Bearer secret",
        "rag.chunks": 3,
      })
    );
    await processor.forceFlush();
    const [exported] = exporter.getFinishedSpans();
    expect(exported.attributes["llm.prompt"]).toBe(REDACTED);
    expect(exported.attributes["http.request.header.authorization"]).toBe(
      REDACTED
    );
    expect(exported.attributes["rag.chunks"]).toBe(3);

    await disable({ userId: 1 });
    processor.onEnd(fakeSpan({ "sensitive.debug": true }));
    await processor.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(1);
  });

  test("admin role guard returns 401 without auth and allows admin", async () => {
    const {
      sensitiveDebugRoleGuard,
    } = require("../../endpoints/api/admin/sensitiveDebug");
    const next = jest.fn();

    const missingUser = mockResponse();
    missingUser.locals = { multiUserMode: true };
    await sensitiveDebugRoleGuard(
      { header: jest.fn(() => null) },
      missingUser,
      next
    );
    expect(missingUser.sendStatus).toHaveBeenCalledWith(401);

    const denied = mockResponse();
    denied.locals = { multiUserMode: true, user: { role: "default" } };
    await sensitiveDebugRoleGuard({}, denied, next);
    expect(denied.sendStatus).toHaveBeenCalledWith(401);

    const allowed = mockResponse();
    allowed.locals = { multiUserMode: true, user: { role: "admin" } };
    await sensitiveDebugRoleGuard({}, allowed, next);
    expect(next).toHaveBeenCalled();
  });

  test("admin endpoints return status for enabled sensitive debug", async () => {
    process.env.SENSITIVE_DEBUG = "true";
    process.env.SENSITIVE_DEBUG_TTL_MS = "900000";
    const {
      sensitiveDebugAdminEndpoints,
    } = require("../../endpoints/api/admin/sensitiveDebug");
    const handlers = {};
    const app = {
      post: (route, _middleware, handler) => {
        handlers[`POST ${route}`] = handler;
      },
      get: (route, _middleware, handler) => {
        handlers[`GET ${route}`] = handler;
      },
    };
    sensitiveDebugAdminEndpoints(app);

    const enableResponse = mockResponse();
    enableResponse.locals = { multiUserMode: true, user: { id: 3 } };
    await handlers["POST /admin/sensitive-debug/enable"]({}, enableResponse);
    expect(enableResponse.status).toHaveBeenCalledWith(200);
    expect(enableResponse.body.enabled).toBe(true);

    const statusResponse = mockResponse();
    statusResponse.locals = { multiUserMode: true, user: { id: 3 } };
    await handlers["GET /admin/sensitive-debug/status"]({}, statusResponse);
    expect(statusResponse.status).toHaveBeenCalledWith(200);
    expect(statusResponse.body.enabled).toBe(true);
  });
});

const { randomBytes } = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { context, trace } = require("@opentelemetry/api");
const { traceIdFromTraceparent } = require("../../middleware/requestContext");
const {
  createPayloadEnvelope,
  createResponseEnvelope,
  createSignature,
  isValidToolName,
  validateResponseEnvelope,
} = require("./contract");
const {
  recordN8nCall,
  withSpan,
} = require("../../utils/observability/integrations");

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2;
const RETRYABLE_STATUS_CODES = new Set([503, 504]);

function resolveTimeoutMs() {
  const value = Number(process.env.N8N_HTTP_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

function isValidTraceparent(value) {
  if (typeof value !== "string") return false;
  const parts = value.split("-");
  return (
    parts.length >= 4 &&
    /^[0-9a-f]{32}$/.test(parts[1]) &&
    /^[0-9a-f]{16}$/.test(parts[2])
  );
}

function activeSpanContext() {
  return trace.getSpan(context.active())?.spanContext() || null;
}

function currentTraceparent() {
  const spanContext = activeSpanContext();
  if (!spanContext) return null;
  return `00-${spanContext.traceId}-${spanContext.spanId}-01`;
}

function resolveTraceContext(traceparent = null) {
  if (isValidTraceparent(traceparent))
    return { traceparent, traceId: traceIdFromTraceparent(traceparent) };
  const active = activeSpanContext();
  if (active?.traceId)
    return {
      traceparent: `00-${active.traceId}-${active.spanId}-01`,
      traceId: active.traceId,
    };
  const traceId = randomBytes(16).toString("hex");
  const spanId = randomBytes(8).toString("hex");
  return { traceparent: `00-${traceId}-${spanId}-01`, traceId };
}

function urlHost(value) {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return null;
  }
}

function retryDelayMs(response = null, attempt) {
  const retryAfter = response?.headers?.get?.("retry-after");
  if (typeof retryAfter === "string") {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.min(seconds * 1000, 30_000);
  }
  // ponytail: single retry uses fixed exponential base; revisit if retries grow
  return Math.min(1000 * 2 ** (attempt - 1), 5000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error) {
  return /timeout|timed ?out|aborted/.test(
    String(error?.message || error).toLowerCase()
  );
}

function errorKindForStatus(status) {
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500) return "5xx";
  return "network";
}

function errorResponse(tool, code, message) {
  return {
    ok: false,
    tool,
    output: null,
    error: { code, message },
    timestamp: new Date().toISOString(),
  };
}

async function parseResponseBody(response) {
  try {
    return { body: await response.json(), error: null };
  } catch (error) {
    return { body: null, error };
  }
}

async function fetchWithTimeout(url, payload, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("n8n request timed out")),
    timeoutMs
  );
  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call one named n8n tool. Never throws; failures are returned as an envelope
 * so the agent runtime decides how to react.
 * @param {string} toolName
 * @param {object} input
 * @param {{organization?: {id?: string, n8nWebhookUrl?: string, n8nApiKey?: string}, traceparent?: string|null}} context
 * @returns {Promise<import("./contract").N8nResponseEnvelope>}
 */
async function postN8nWebhook(
  toolName,
  input,
  { organization = null, traceparent = null } = {}
) {
  const tool = String(toolName || "");
  if (!isValidToolName(tool))
    return errorResponse(
      tool,
      "invalid_tool",
      `Unknown n8n tool "${toolName}"`
    );
  if (!organization?.n8nWebhookUrl || !organization?.id)
    return errorResponse(
      tool,
      "not_configured",
      "n8n webhook is not configured for this organization"
    );
  if (!organization?.n8nApiKey)
    return errorResponse(
      tool,
      "signature",
      "n8n API key is not configured for this organization"
    );

  const timeoutMs = resolveTimeoutMs();
  const startedAt = Date.now();
  const correlationId = uuidv4();
  const idempotencyKey = uuidv4();
  const traceContext = resolveTraceContext(traceparent);
  let attempts = 0;
  let finalStatus = null;
  let finalError = null;
  let finalResponse = null;

  try {
    await withSpan("n8n.webhook", async (span) => {
      span.setAttribute("n8n.tool", tool);
      span.setAttribute("n8n.url_host", urlHost(organization.n8nWebhookUrl));

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        attempts = attempt;
        const payload = createPayloadEnvelope({
          tool,
          input,
          organization,
          correlationId,
          idempotencyKey,
          traceId: traceContext.traceId,
        });
        const signature = createSignature(
          JSON.stringify(payload),
          organization.n8nApiKey
        );
        const headers = {
          "Content-Type": "application/json",
          "X-N8N-Signature": signature,
          "X-Correlation-Id": correlationId,
          "Idempotency-Key": idempotencyKey,
          traceparent: traceContext.traceparent,
        };

        try {
          const response = await fetchWithTimeout(
            organization.n8nWebhookUrl,
            payload,
            headers,
            timeoutMs
          );
          finalStatus = response.status;

          if (
            RETRYABLE_STATUS_CODES.has(response.status) &&
            attempt < MAX_ATTEMPTS
          ) {
            await sleep(retryDelayMs(response, attempt));
            continue;
          }

          if (response.status >= 400) {
            const kind = errorKindForStatus(response.status);
            finalError = errorResponse(
              tool,
              kind,
              `n8n returned HTTP ${response.status}`
            );
            break;
          }

          const parsed = await parseResponseBody(response);
          if (!parsed.body) {
            finalError = errorResponse(
              tool,
              "invalid_response",
              "n8n returned a non-JSON response"
            );
            break;
          }

          const validationErrors = validateResponseEnvelope(parsed.body);
          if (validationErrors.length > 0) {
            finalError = errorResponse(
              tool,
              "invalid_response",
              `Invalid n8n response: ${validationErrors.join(", ")}`
            );
            break;
          }

          if (parsed.body.ok === false) {
            finalError = errorResponse(
              tool,
              parsed.body.error?.code || "n8n_error",
              parsed.body.error?.message || "n8n reported a tool error"
            );
            break;
          }

          finalResponse = createResponseEnvelope({
            ok: true,
            tool,
            output: parsed.body.output,
            timestamp: parsed.body.timestamp,
          });
          break;
        } catch (error) {
          const kind = isTimeoutError(error) ? "timeout" : "network";
          if (kind === "timeout" && attempt < MAX_ATTEMPTS) {
            await sleep(retryDelayMs(null, attempt));
            continue;
          }
          finalError = errorResponse(
            tool,
            kind,
            error?.message || String(error)
          );
          break;
        }
      }

      recordN8nCall({
        tool,
        organization: organization.id,
        result: finalError ? "error" : "success",
        errorKind: finalError?.error?.code || null,
        latencyMs: Date.now() - startedAt,
        attempt: attempts,
        statusCode: finalStatus,
        span,
      });
    });
  } catch (error) {
    return errorResponse(tool, "network", error?.message || String(error));
  }

  return finalError || finalResponse;
}

module.exports = {
  currentTraceparent,
  postN8nWebhook,
};

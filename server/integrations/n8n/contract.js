const crypto = require("crypto");

const SCHEMA_VERSION = "1.0";

/**
 * Tools consultor.IA may call on the n8n integration layer. Arbitrary HTTP is
 * intentionally not part of this contract.
 * @typedef {"scheduleAppointment"|"getAvailableSlots"|"createLead"|"findCustomer"|"getOrderStatus"|"requestHumanSupport"} N8nToolName
 */
const N8N_TOOL_NAMES = Object.freeze([
  "scheduleAppointment",
  "getAvailableSlots",
  "createLead",
  "findCustomer",
  "getOrderStatus",
  "requestHumanSupport",
]);

const N8N_TOOLS = Object.freeze(
  Object.fromEntries(N8N_TOOL_NAMES.map((tool) => [tool, tool]))
);

/**
 * @typedef {Object} N8nToolInput
 * @property {string} [customer_id]
 * @property {string} [datetime_iso]
 * @property {number} [duration_min]
 * @property {string} [notes]
 * @property {string} [date_iso]
 * @property {string} [professional_id]
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} [source]
 * @property {string} [order_id]
 * @property {string} [conversation_id]
 * @property {string} [reason]
 * @property {string} [urgency]
 */

/**
 * @typedef {Object} N8nToolOutput
 * @property {string} [appointment_id]
 * @property {string} [status]
 * @property {Array<{start: string, end: string, professional_id: string}>} [slots]
 * @property {string} [lead_id]
 * @property {string} [customer_id]
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [phone]
 * @property {Array<Object>} [history]
 * @property {string} [order_id]
 * @property {string} [eta_iso]
 * @property {Array<Object>} [items]
 * @property {string} [ticket_id]
 */

/**
 * @typedef {Object} N8nToolError
 * @property {string} code
 * @property {string} message
 */

/**
 * @typedef {Object} N8nPayloadEnvelope
 * @property {"1.0"} schema_version
 * @property {string} correlation_id
 * @property {string} trace_id
 * @property {string} organization_id
 * @property {N8nToolName} tool
 * @property {string} idempotency_key
 * @property {N8nToolInput} input
 * @property {string} timestamp
 */

/**
 * @typedef {Object} N8nResponseEnvelope
 * @property {boolean} ok
 * @property {N8nToolName} tool
 * @property {N8nToolOutput|null} output
 * @property {N8nToolError|null} error
 * @property {string} timestamp
 */

function isValidToolName(value) {
  return N8N_TOOL_NAMES.includes(value);
}

/**
 * Validate a payload before it is signed and sent to n8n.
 * @param {N8nPayloadEnvelope} payload
 * @returns {string[]}
 */
function validatePayloadEnvelope(payload = {}) {
  const errors = [];
  if (payload.schema_version !== SCHEMA_VERSION)
    errors.push("schema_version must be '1.0'");
  if (typeof payload.correlation_id !== "string" || !payload.correlation_id)
    errors.push("correlation_id is required");
  if (typeof payload.trace_id !== "string" || !payload.trace_id)
    errors.push("trace_id is required");
  if (typeof payload.organization_id !== "string" || !payload.organization_id)
    errors.push("organization_id is required");
  if (!isValidToolName(payload.tool))
    errors.push(`tool must be one of: ${N8N_TOOL_NAMES.join(", ")}`);
  if (typeof payload.idempotency_key !== "string" || !payload.idempotency_key)
    errors.push("idempotency_key is required");
  if (
    payload.input === null ||
    payload.input === undefined ||
    typeof payload.input !== "object"
  )
    errors.push("input is required");
  if (
    typeof payload.timestamp !== "string" ||
    Number.isNaN(Date.parse(payload.timestamp))
  )
    errors.push("timestamp must be an ISO 8601 string");
  return errors;
}

/**
 * Build and validate the request body sent to n8n.
 * @param {{tool: N8nToolName, input: N8nToolInput, organization: {id: string}, correlationId: string, idempotencyKey: string, traceId: string, timestamp?: string}} params
 * @returns {N8nPayloadEnvelope}
 */
function createPayloadEnvelope({
  tool,
  input,
  organization,
  correlationId,
  idempotencyKey,
  traceId,
  timestamp = new Date().toISOString(),
}) {
  const payload = {
    schema_version: SCHEMA_VERSION,
    correlation_id: correlationId,
    trace_id: traceId,
    organization_id: organization?.id,
    tool,
    idempotency_key: idempotencyKey,
    input,
    timestamp,
  };
  const errors = validatePayloadEnvelope(payload);
  if (errors.length > 0)
    throw new Error(`Invalid n8n payload: ${errors.join(", ")}`);
  return payload;
}

/**
 * Validate the response shape n8n must return.
 * @param {N8nResponseEnvelope} response
 * @returns {string[]}
 */
function validateResponseEnvelope(response = {}) {
  const errors = [];
  if (typeof response.ok !== "boolean") errors.push("ok must be a boolean");
  if (!isValidToolName(response.tool)) errors.push("tool is invalid");
  if (
    response.ok &&
    (response.output === null || response.output === undefined)
  )
    errors.push("output is required when ok is true");
  if (!response.ok && (!response.error || typeof response.error !== "object"))
    errors.push("error is required when ok is false");
  if (
    response.error &&
    (typeof response.error.code !== "string" || !response.error.code)
  )
    errors.push("error.code is required");
  if (
    response.error &&
    (typeof response.error.message !== "string" || !response.error.message)
  )
    errors.push("error.message is required");
  if (
    typeof response.timestamp !== "string" ||
    Number.isNaN(Date.parse(response.timestamp))
  )
    errors.push("timestamp must be an ISO 8601 string");
  return errors;
}

/**
 * Build and validate the normalized response returned to tool handlers.
 * @param {{ok: boolean, tool: N8nToolName, output?: N8nToolOutput|null, error?: N8nToolError|null, timestamp?: string}} params
 * @returns {N8nResponseEnvelope}
 */
function createResponseEnvelope({
  ok,
  tool,
  output = null,
  error = null,
  timestamp = new Date().toISOString(),
}) {
  const response = { ok, tool, output, error, timestamp };
  const errors = validateResponseEnvelope(response);
  if (errors.length > 0)
    throw new Error(`Invalid n8n response: ${errors.join(", ")}`);
  return response;
}

/**
 * Sign a serialized request body with the organization API key.
 * @param {string} body
 * @param {string} secret
 * @returns {string} `sha256=<hex>`
 */
function createSignature(body, secret) {
  if (!body) throw new Error("n8n request body is required for signing");
  if (!secret) throw new Error("n8n API key is required for signing");
  const digest = crypto
    .createHmac("sha256", String(secret))
    .update(String(body))
    .digest("hex");
  return `sha256=${digest}`;
}

function verifySignature(body, secret, signatureHeader) {
  if (typeof signatureHeader !== "string") return false;
  return createSignature(body, secret) === signatureHeader;
}

module.exports = {
  SCHEMA_VERSION,
  N8N_TOOLS,
  N8N_TOOL_NAMES,
  createPayloadEnvelope,
  createResponseEnvelope,
  createSignature,
  isValidToolName,
  validatePayloadEnvelope,
  validateResponseEnvelope,
  verifySignature,
};

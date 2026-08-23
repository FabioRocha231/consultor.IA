const { postN8nWebhook } = require("../client");
const { resolveOrganizationContext } = require("./context");

/**
 * @typedef {Object} RequestHumanSupportInput
 * @property {string} conversation_id
 * @property {string} reason
 * @property {string} [urgency]
 */

/**
 * @typedef {Object} RequestHumanSupportOutput
 * @property {string} ticket_id
 * @property {string} [eta_iso]
 */

const requestHumanSupport = {
  name: "requestHumanSupport",
  description:
    "Request human support for the current conversation through the n8n integration layer.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      conversation_id: {
        type: "string",
        description: "Identifier of the conversation requesting support.",
      },
      reason: {
        type: "string",
        description: "Why human support is needed.",
      },
      urgency: {
        type: "string",
        description: "Optional urgency classification for the request.",
      },
    },
    required: ["conversation_id", "reason"],
    additionalProperties: false,
  },
  /**
   * @param {RequestHumanSupportInput} args
   * @returns {Promise<string>}
   */
  async handler({ conversation_id, reason, urgency = null } = {}) {
    if (!conversation_id || !reason)
      return JSON.stringify({
        ok: false,
        error: "Missing required fields: conversation_id, reason.",
      });
    try {
      const context = await resolveOrganizationContext(this?.super);
      if (!context)
        return JSON.stringify({
          ok: false,
          error: "n8n is not configured for this organization.",
        });
      const result = await postN8nWebhook(
        "requestHumanSupport",
        { conversation_id, reason, urgency },
        context
      );
      if (!result.ok)
        return JSON.stringify({
          ok: false,
          error: result.error?.message || "unknown n8n error",
        });
      return `Human support requested. ticket_id: ${
        result.output?.ticket_id ?? "unknown"
      }`;
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error?.message || String(error),
      });
    }
  },
};

module.exports = { requestHumanSupport };

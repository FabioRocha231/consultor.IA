const { postN8nWebhook } = require("../client");
const { resolveOrganizationContext } = require("./context");

/**
 * @typedef {Object} CreateLeadInput
 * @property {string} name
 * @property {string} email
 * @property {string} [phone]
 * @property {string} source
 * @property {string} [notes]
 */

/**
 * @typedef {Object} CreateLeadOutput
 * @property {string} lead_id
 * @property {string} status
 */

const createLead = {
  name: "createLead",
  description:
    "Create a new lead in the organization CRM through the n8n integration layer.",
  args: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      name: { type: "string", description: "Lead name." },
      email: { type: "string", description: "Lead email." },
      phone: { type: "string", description: "Optional lead phone." },
      source: {
        type: "string",
        description: "Lead source, for example website or WhatsApp.",
      },
      notes: { type: "string", description: "Optional lead notes." },
    },
    required: ["name", "email", "source"],
    additionalProperties: false,
  },
  /**
   * @param {CreateLeadInput} args
   * @returns {Promise<string>}
   */
  async handler({ name, email, phone = null, source, notes = null } = {}) {
    if (!name || !email || !source)
      return "[n8n.createLead] Missing required fields: name, email, source.";
    try {
      const context = await resolveOrganizationContext(this?.super);
      if (!context)
        return "[n8n.createLead] n8n is not configured for this organization.";
      const result = await postN8nWebhook(
        "createLead",
        { name, email, phone, source, notes },
        context
      );
      if (!result.ok)
        return `[n8n.createLead] Failed to create lead: ${
          result.error?.message || "unknown n8n error"
        }`;
      return `Lead created successfully. lead_id: ${
        result.output?.lead_id ?? "unknown"
      }`;
    } catch (error) {
      return `[n8n.createLead] Failed to create lead: ${
        error?.message || String(error)
      }`;
    }
  },
};

module.exports = { createLead };

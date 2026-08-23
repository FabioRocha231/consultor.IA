const { Organization } = require("../../../models/organization");
const { currentTraceparent } = require("../client");

/**
 * Resolve the organization context for an n8n tool call from the aibitat
 * instance. Keeps DB access and secret decryption out of the tool modules.
 * @param {object|null} aibitat
 * @returns {Promise<{organization: object, traceparent: string|null}|null>}
 */
async function resolveOrganizationContext(aibitat) {
  const workspace = aibitat?.handlerProps?.invocation?.workspace;
  if (!workspace?.organizationId) return null;
  const organization = await Organization.getWithN8nSecrets(
    workspace.organizationId
  );
  if (!organization?.n8nWebhookUrl || !organization?.n8nApiKey) return null;
  return { organization, traceparent: currentTraceparent() };
}

module.exports = { resolveOrganizationContext };

const { Organization } = require("../../../models/organization");
const { User } = require("../../../models/user");
const { currentTraceparent } = require("../client");

/**
 * Resolve the organization context for an n8n tool call from the aibitat
 * instance. Keeps DB access and secret decryption out of the tool modules.
 * @param {object|null} aibitat
 * @returns {Promise<{organization: object, user: object|null, traceparent: string|null}|null>}
 */
async function resolveOrganizationContext(aibitat) {
  const invocation = aibitat?.handlerProps?.invocation;
  const workspace = invocation?.workspace;
  if (!workspace?.organizationId) return null;
  const organization = await Organization.getWithN8nSecrets(
    workspace.organizationId
  );
  if (!organization?.n8nWebhookUrl || !organization?.n8nApiKey) return null;
  let user = null;
  if (invocation?.user_id) {
    user = (await User.get({ id: Number(invocation.user_id) })) || {
      id: Number(invocation.user_id),
      role: null,
    };
  }
  return { organization, user, traceparent: currentTraceparent() };
}

module.exports = { resolveOrganizationContext };

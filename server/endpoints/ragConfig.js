const { Organization } = require("../models/organization");
const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { RAG_CONFIG_FIELDS, validateRagConfig } = require("../utils/ragConfig");

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function ragConfigEndpoints(app) {
  if (!app) return;

  app.get(
    "/rag-config",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        response.status(200).json({
          ragConfig: organization?.ragConfig || null,
          error: null,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.patch(
    "/rag-config",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });

        const { ok, value, error } = validateRagConfig(reqBody(request));
        if (!ok) return response.status(400).json({ error });
        if (Object.keys(value).length !== RAG_CONFIG_FIELDS.length)
          return response.status(400).json({
            error: "ragConfig must include all 8 fields.",
          });

        const { organization: updated, error: updateError } =
          await Organization.update(organization.id, { ragConfig: value });
        if (!updated) return response.status(400).json({ error: updateError });
        response
          .status(200)
          .json({ ragConfig: updated.ragConfig, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { ragConfigEndpoints };

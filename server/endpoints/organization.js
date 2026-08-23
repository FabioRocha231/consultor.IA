const prisma = require("../utils/prisma");
const { Organization } = require("../models/organization");
const { reqBody } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function organizationEndpoints(app) {
  if (!app) return;

  app.get(
    "/organization",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });
        response.status(200).json(organization);
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.patch(
    "/organization",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });

        const { organization: updated, error } = await Organization.update(
          organization.id,
          reqBody(request)
        );
        if (!updated) return response.status(400).json({ error });
        response.status(200).json({ organization: updated, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/organization/stats",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response.status(404).json({ error: "No organization found." });

        const [workspaceCount, userCount] = await Promise.all([
          prisma.workspaces.count(),
          prisma.users.count(),
        ]);
        response.status(200).json({
          organizationId: organization.id,
          name: organization.name,
          slug: organization.slug,
          workspaceCount,
          userCount,
        });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { organizationEndpoints };

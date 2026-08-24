const { userFromSession } = require("../../../utils/http");
const {
  strictMultiUserRoleValid,
  ROLES,
} = require("../../../utils/middleware/multiUserProtected");
const {
  validatedRequest,
} = require("../../../utils/middleware/validatedRequest");
const sensitiveDebug = require("../../../utils/observability/sensitiveDebug");

const sensitiveDebugRoleGuard = strictMultiUserRoleValid([
  ROLES.admin,
  ROLES.manager,
]);

function sensitiveDebugAdminEndpoints(app) {
  if (!app) return;

  app.post(
    "/admin/sensitive-debug/enable",
    [validatedRequest, sensitiveDebugRoleGuard],
    async (request, response) => {
      /*
      #swagger.tags = ['Admin']
      #swagger.description = 'Enable sensitive debug mode for the configured TTL.'
      #swagger.responses[200] = {
        content: {
          "application/json": {
            schema: {
              type: 'object',
              example: { configured: true, enabled: true, ttlMs: 900000, remainingMs: 900000 }
            }
          }
        }
      }
      #swagger.responses[401] = {
        description: "Admin role required"
      }
      */
      try {
        const user = await userFromSession(request, response);
        const status = await sensitiveDebug.enable({ userId: user?.id });
        response.status(status.enabled ? 200 : 400).json(status);
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.post(
    "/admin/sensitive-debug/disable",
    [validatedRequest, sensitiveDebugRoleGuard],
    async (request, response) => {
      /*
      #swagger.tags = ['Admin']
      #swagger.description = 'Disable sensitive debug mode immediately.'
      #swagger.responses[200] = {
        content: {
          "application/json": {
            schema: {
              type: 'object',
              example: { configured: true, enabled: false, ttlMs: 900000, remainingMs: 0 }
            }
          }
        }
      }
      #swagger.responses[401] = {
        description: "Admin role required"
      }
      */
      try {
        const user = await userFromSession(request, response);
        const status = await sensitiveDebug.disable({ userId: user?.id });
        response.status(200).json(status);
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/admin/sensitive-debug/status",
    [validatedRequest, sensitiveDebugRoleGuard],
    async (_request, response) => {
      /*
      #swagger.tags = ['Admin']
      #swagger.description = 'Get current sensitive debug mode status and remaining TTL.'
      #swagger.responses[200] = {
        content: {
          "application/json": {
            schema: {
              type: 'object',
              example: { configured: true, enabled: false, ttlMs: 900000, remainingMs: 0 }
            }
          }
        }
      }
      #swagger.responses[401] = {
        description: "Admin role required"
      }
      */
      try {
        response.status(200).json(sensitiveDebug.getStatus());
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = {
  sensitiveDebugAdminEndpoints,
  sensitiveDebugRoleGuard,
};

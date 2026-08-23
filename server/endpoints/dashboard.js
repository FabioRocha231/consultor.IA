const prisma = require("../utils/prisma");
const { Organization } = require("../models/organization");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const { getMetricSnapshot } = require("../utils/observability/ai");
const {
  getIntegrationMetricSnapshot,
} = require("../utils/observability/integrations");
const {
  parsePeriod,
  periodSince,
  computeUsage,
  computeFeedback,
  computeCosts,
  modelPricingVersion,
} = require("../utils/dashboard");

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

async function dashboardRoleGuard(request, response, next) {
  const multiUserMode = response.locals?.multiUserMode;
  if (!multiUserMode) return next();
  const user = response.locals?.user;
  if (user && ["admin", "manager"].includes(user.role)) return next();
  return response.status(403).json({ error: "Forbidden" });
}

function dashboardEndpoints(app) {
  if (!app) return;

  app.get(
    "/dashboard/company",
    [validatedRequest, dashboardRoleGuard],
    async (request, response) => {
      try {
        const period = parsePeriod(request.query?.period ?? "7d");
        if (!period)
          return response
            .status(400)
            .json({ success: false, error: "Invalid period." });

        const organization = await currentOrganization();
        if (!organization)
          return response
            .status(404)
            .json({ success: false, error: "No organization found." });

        const workspaces = await prisma.workspaces.findMany({
          where: { organizationId: organization.id },
          select: { id: true, chatProvider: true, chatModel: true },
        });
        const workspaceIds = workspaces.map((workspace) => workspace.id);
        const where = { workspaceId: { in: workspaceIds } };
        const since = periodSince(period);
        if (since) where.createdAt = { gte: since };

        const chats = await prisma.workspace_chats.findMany({
          where,
          select: {
            id: true,
            workspaceId: true,
            createdAt: true,
            response: true,
            user_id: true,
            thread_id: true,
            api_session_id: true,
            feedbackScore: true,
            feedbackCategory: true,
          },
          orderBy: { createdAt: "asc" },
        });

        response.status(200).json({
          period,
          generatedAt: new Date().toISOString(),
          usage: computeUsage(chats),
          feedback: computeFeedback(chats),
          costs: computeCosts(chats, { workspaces }),
          performance: {
            llmLatencyP50Ms: null,
            llmLatencyP95Ms: null,
            ttftP50Ms: null,
            ragRetrievalP50Ms: null,
            ragRetrievalP95Ms: null,
            source: "not_collected",
          },
          topDocuments: [],
          topDocumentsNote:
            "Disponível quando PR 11 implementar retrieval tracking",
          tools: {
            n8nCalls: 0,
            byTool: {},
            note: "Disponível quando PR 08 implementar tool tracking",
          },
          errors: {
            llmErrors: 0,
            ragErrors: 0,
            n8nErrors: 0,
            byKind: {},
            note: "Disponível quando PR 11/14 persistirem erros",
          },
          config: {
            ragConfig: organization.ragConfig || null,
            modelPricingVersion: modelPricingVersion(),
          },
        });
      } catch (error) {
        console.error("Dashboard company endpoint failed", error);
        response.sendStatus(500).end();
      }
    }
  );

  app.get(
    "/dashboard/metrics/realtime",
    [validatedRequest, dashboardRoleGuard],
    async (_request, response) => {
      try {
        const snapshot = getMetricSnapshot();
        const integrationSnapshot = getIntegrationMetricSnapshot();
        response.status(200).json({
          ...snapshot,
          n8nRequests: integrationSnapshot.n8nRequests,
          n8nFailures: integrationSnapshot.n8nFailures,
          n8nLatencyP50Ms: integrationSnapshot.n8nLatencyP50Ms,
          n8nLatencyP95Ms: integrationSnapshot.n8nLatencyP95Ms,
          n8nErrorsByKind: integrationSnapshot.n8nErrorsByKind,
          note: "Métricas in-memory; resetam quando o server reinicia. Para métricas persistentes, ver PR 11/14.",
        });
      } catch (error) {
        console.error("Dashboard metrics endpoint failed", error);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { dashboardEndpoints, dashboardRoleGuard };

const prisma = require("../utils/prisma");
const { Organization } = require("../models/organization");
const { safeJsonParse } = require("../utils/http");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { VALID_FEEDBACK_CATEGORIES } = require("../models/workspaceChats");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function currentOrganization() {
  return (
    (await Organization.getBySlug("default")) ||
    (await Organization.all())[0] ||
    null
  );
}

function preview(value = "", max = 200) {
  return String(value ?? "").slice(0, max);
}

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function feedbackEndpoints(app) {
  if (!app) return;

  app.get(
    "/feedback",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const organization = await currentOrganization();
        if (!organization)
          return response
            .status(404)
            .json({ success: false, error: "No organization found." });

        const {
          score = null,
          category = null,
          limit,
          offset,
        } = request.query || {};
        if (score !== null && score !== "true" && score !== "false")
          return response
            .status(400)
            .json({ success: false, error: "Invalid score filter." });
        if (category !== null && !VALID_FEEDBACK_CATEGORIES.includes(category))
          return response
            .status(400)
            .json({ success: false, error: "Invalid category filter." });

        const workspaces = await prisma.workspaces.findMany({
          where: { organizationId: organization.id },
          select: { id: true, slug: true },
        });
        const workspaceIds = workspaces.map((workspace) => workspace.id);
        const where = {
          workspaceId: { in: workspaceIds },
          feedbackScore: score === null ? { not: null } : score === "true",
        };
        if (category !== null) where.feedbackCategory = category;

        const take = parseLimit(limit);
        const skip = parseOffset(offset);
        const [total, chats] = await Promise.all([
          prisma.workspace_chats.count({ where }),
          prisma.workspace_chats.findMany({
            where,
            orderBy: { id: "desc" },
            take,
            skip,
          }),
        ]);
        const workspaceBySlug = new Map(
          workspaces.map((workspace) => [workspace.id, workspace.slug])
        );
        const feedback = chats.map((chat) => {
          const parsedResponse = safeJsonParse(chat.response, {});
          return {
            id: chat.id,
            chatId: chat.id,
            workspaceSlug: workspaceBySlug.get(chat.workspaceId) || null,
            prompt: preview(chat.prompt),
            response: preview(
              typeof parsedResponse?.text === "string"
                ? parsedResponse.text
                : chat.response
            ),
            score: chat.feedbackScore,
            category: chat.feedbackCategory,
            comment: chat.feedbackComment,
            feedbackAt: chat.feedbackAt,
            ragConfig: organization.ragConfig || null,
          };
        });

        response.status(200).json({
          feedback,
          total,
          limit: take,
          offset: skip,
        });
      } catch (error) {
        console.error("Error listing feedback:", error);
        response.status(500).json({ success: false });
      }
    }
  );
}

module.exports = { feedbackEndpoints };

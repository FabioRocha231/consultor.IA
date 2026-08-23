/* eslint-env jest, node */
jest.mock("../../models/organization", () => ({
  Organization: {
    getBySlug: jest.fn(),
    all: jest.fn(),
  },
}));
jest.mock("../../utils/prisma", () => ({
  workspaces: {
    findMany: jest.fn(),
  },
  workspace_chats: {
    findMany: jest.fn(),
  },
}));
jest.mock("../../utils/helpers/modelPricing", () => ({
  MODEL_PRICING: {
    getCostBreakdown: jest.fn(),
  },
}));
jest.mock("../../utils/observability/ai", () => ({
  getMetricSnapshot: jest.fn(),
}));
jest.mock("../../utils/observability/integrations", () => ({
  getIntegrationMetricSnapshot: jest.fn(),
}));

const { Organization } = require("../../models/organization");
const prisma = require("../../utils/prisma");
const { MODEL_PRICING } = require("../../utils/helpers/modelPricing");
const { getMetricSnapshot } = require("../../utils/observability/ai");
const { getIntegrationMetricSnapshot } = require("../../utils/observability/integrations");
const {
  dashboardEndpoints,
  dashboardRoleGuard,
} = require("../../endpoints/dashboard");

function registerEndpoints() {
  const handlers = {};
  const app = {
    get: (path, _middleware, handler) => {
      handlers[`GET ${path}`] = handler;
    },
  };
  dashboardEndpoints(app);
  return handlers;
}

function mockResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn((body) => {
    response.body = body;
    return response;
  });
  response.sendStatus = jest.fn(() => response);
  return response;
}

const organization = {
  id: "org-1",
  slug: "default",
  name: "Acme Pilot",
  ragConfig: {
    topK: 4,
    similarityThreshold: 0.25,
    fallbackBehavior: "dont_know",
  },
};
const workspaces = [{ id: 7, chatProvider: "openai", chatModel: "gpt-4o" }];
const chats = [
  {
    id: 1,
    workspaceId: 7,
    createdAt: new Date("2026-08-22T12:00:00.000Z"),
    response: JSON.stringify({
      text: "ok",
      metrics: {
        provider: "OpenAiLLM",
        model: "gpt-4o",
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    }),
    user_id: 10,
    thread_id: 1,
    api_session_id: null,
    feedbackScore: true,
    feedbackCategory: null,
  },
  {
    id: 2,
    workspaceId: 7,
    createdAt: new Date("2026-08-22T13:00:00.000Z"),
    response: JSON.stringify({
      text: "not ok",
      metrics: {
        provider: "OpenAiLLM",
        model: "gpt-4o",
        prompt_tokens: 50,
        completion_tokens: 25,
      },
    }),
    user_id: 10,
    thread_id: 1,
    api_session_id: null,
    feedbackScore: false,
    feedbackCategory: "informacao_incorreta",
  },
];

describe("dashboard endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the company dashboard shape", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue(workspaces);
    prisma.workspace_chats.findMany.mockResolvedValue(chats);
    MODEL_PRICING.getCostBreakdown.mockReturnValue({
      inputCost: 0.001,
      outputCost: 0.002,
      totalCost: 0.003,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /dashboard/company"]({ query: { period: "7d" } }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.period).toBe("7d");
    expect(response.body.usage.messages).toBe(2);
    expect(response.body.usage.byDay).toEqual([
      { date: "2026-08-22", messages: 2 },
    ]);
    expect(response.body.feedback).toEqual({
      total: 2,
      positive: 1,
      negative: 1,
      positiveRate: 0.5,
      byCategory: {
        informacao_incorreta: 1,
        informacao_desatualizada: 0,
        nao_encontrou_resposta: 0,
        resposta_confusa: 0,
        outro: 0,
      },
    });
    expect(response.body.costs.byModel[0]).toMatchObject({
      model: "gpt-4o",
      calls: 2,
      inputTokens: 150,
      outputTokens: 75,
      costUsd: 0.006,
    });
    expect(response.body.performance.source).toBe("not_collected");
    expect(response.body.topDocuments).toEqual([]);
    expect(response.body.tools).toMatchObject({ n8nCalls: 0, byTool: {} });
    expect(response.body.config.ragConfig).toEqual(organization.ragConfig);
    expect(response.body.config.modelPricingVersion).toEqual(expect.any(String));
  });

  it("filters by period=30d", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue(workspaces);
    prisma.workspace_chats.findMany.mockResolvedValue([]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /dashboard/company"]({ query: { period: "30d" } }, response);

    expect(prisma.workspace_chats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: { in: [7] },
          createdAt: { gte: expect.any(Date) },
        }),
      })
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("does not add a time filter for period=all", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue(workspaces);
    prisma.workspace_chats.findMany.mockResolvedValue([]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /dashboard/company"]({ query: { period: "all" } }, response);

    const call = prisma.workspace_chats.findMany.mock.calls[0][0];
    expect(call.where.createdAt).toBeUndefined();
  });

  it("rejects an invalid period", async () => {
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /dashboard/company"](
      { query: { period: "invalid" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(prisma.workspace_chats.findMany).not.toHaveBeenCalled();
  });

  it("returns realtime in-memory metrics", async () => {
    getMetricSnapshot.mockReturnValue({
      llmLatencyP50Ms: 250,
      llmLatencyP95Ms: 500,
      llmRequests: 10,
      since: "2026-08-23T12:00:00.000Z",
      until: "2026-08-23T13:00:00.000Z",
    });
    getIntegrationMetricSnapshot.mockReturnValue({
      n8nRequests: 2,
      n8nFailures: 1,
      n8nLatencyP50Ms: 80,
      n8nLatencyP95Ms: 120,
      n8nErrorsByKind: { timeout: 1 },
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /dashboard/metrics/realtime"]({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.llmLatencyP95Ms).toBe(500);
    expect(response.body.llmRequests).toBe(10);
    expect(response.body.n8nRequests).toBe(2);
    expect(response.body.n8nErrorsByKind).toEqual({ timeout: 1 });
    expect(response.body.note).toContain("in-memory");
  });
});

describe("dashboard role guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects default users with 403", async () => {
    const response = mockResponse();
    response.locals = { multiUserMode: true, user: { role: "default" } };

    await dashboardRoleGuard({}, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(403);
  });

  it("allows admin and manager roles", async () => {
    for (const role of ["admin", "manager"]) {
      const response = mockResponse();
      response.locals = { multiUserMode: true, user: { role } };
      const next = jest.fn();
      await dashboardRoleGuard({}, response, next);
      expect(next).toHaveBeenCalled();
    }
  });

  it("bypasses role checks in single user mode", async () => {
    const response = mockResponse();
    response.locals = { multiUserMode: false };
    const next = jest.fn();

    await dashboardRoleGuard({}, response, next);

    expect(next).toHaveBeenCalled();
  });
});

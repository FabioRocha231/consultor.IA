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
    count: jest.fn(),
    findMany: jest.fn(),
  },
}));

const { Organization } = require("../../models/organization");
const prisma = require("../../utils/prisma");
const { feedbackEndpoints } = require("../../endpoints/feedback");

function registerEndpoints() {
  const handlers = {};
  const app = {
    get: (path, _middleware, handler) => {
      handlers[`GET ${path}`] = handler;
    },
  };
  feedbackEndpoints(app);
  return handlers;
}

function mockResponse() {
  const response = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn((body) => {
    response.body = body;
    return response;
  });
  return response;
}

const organization = {
  id: "org-1",
  slug: "default",
  ragConfig: { topK: 4, similarityThreshold: 0.25 },
};
const workspace = { id: 7, slug: "estrela-bakery" };
const chat = {
  id: 42,
  workspaceId: 7,
  prompt: "Qual o horario de atendimento?",
  response: JSON.stringify({ text: "Atendemos das 08h as 18h." }),
  feedbackScore: false,
  feedbackCategory: "informacao_incorreta",
  feedbackComment: "O horario mudou.",
  feedbackAt: new Date("2026-08-23T12:00:00.000Z"),
};

describe("feedback endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns all feedback from the current organization", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue([workspace]);
    prisma.workspace_chats.count.mockResolvedValue(1);
    prisma.workspace_chats.findMany.mockResolvedValue([chat]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /feedback"]({ query: {} }, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.total).toBe(1);
    expect(response.body.limit).toBe(50);
    expect(response.body.offset).toBe(0);
    expect(response.body.feedback[0]).toMatchObject({
      id: 42,
      chatId: 42,
      workspaceSlug: "estrela-bakery",
      prompt: "Qual o horario de atendimento?",
      response: "Atendemos das 08h as 18h.",
      score: false,
      category: "informacao_incorreta",
      comment: "O horario mudou.",
      ragConfig: { topK: 4, similarityThreshold: 0.25 },
    });
    expect(prisma.workspace_chats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: { in: [7] },
          feedbackScore: { not: null },
        }),
        take: 50,
        skip: 0,
      })
    );
  });

  it("filters negative feedback by score=false", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue([workspace]);
    prisma.workspace_chats.count.mockResolvedValue(1);
    prisma.workspace_chats.findMany.mockResolvedValue([chat]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /feedback"]({ query: { score: "false" } }, response);

    expect(prisma.workspace_chats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ feedbackScore: false }),
      })
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("filters by category", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue([workspace]);
    prisma.workspace_chats.count.mockResolvedValue(1);
    prisma.workspace_chats.findMany.mockResolvedValue([chat]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /feedback"](
      { query: { category: "informacao_incorreta" } },
      response
    );

    expect(prisma.workspace_chats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          feedbackCategory: "informacao_incorreta",
        }),
      })
    );
  });

  it("applies limit and offset pagination with max limit cap", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    prisma.workspaces.findMany.mockResolvedValue([workspace]);
    prisma.workspace_chats.count.mockResolvedValue(300);
    prisma.workspace_chats.findMany.mockResolvedValue([]);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /feedback"](
      { query: { limit: "999", offset: "10" } },
      response
    );

    expect(prisma.workspace_chats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, skip: 10 })
    );
    expect(response.body.limit).toBe(200);
    expect(response.body.offset).toBe(10);
  });

  it("rejects invalid score and category filters", async () => {
    Organization.getBySlug.mockResolvedValue(organization);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /feedback"]({ query: { score: "maybe" } }, response);
    expect(response.status).toHaveBeenCalledWith(400);

    await handlers["GET /feedback"](
      { query: { category: "invalid" } },
      response
    );
    expect(response.status).toHaveBeenCalledWith(400);
  });
});

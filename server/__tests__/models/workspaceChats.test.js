/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  workspace_chats: {
    update: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
}));
jest.mock("../../utils/observability/ai", () => ({
  getActiveTraceId: jest.fn(),
}));

const prisma = require("../../utils/prisma");
const { getActiveTraceId } = require("../../utils/observability/ai");
const {
  WorkspaceChats,
  VALID_FEEDBACK_CATEGORIES,
} = require("../../models/workspaceChats");

const TRACE_ID = "0123456789abcdef0123456789abcdef";

describe("WorkspaceChats.updateFeedbackScore", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stores score with category, comment, and feedbackAt", async () => {
    prisma.workspace_chats.update.mockResolvedValue({
      id: 1,
      feedbackScore: false,
      feedbackCategory: "informacao_incorreta",
      feedbackComment: "A resposta citou o preco errado.",
      feedbackAt: new Date(),
    });

    const result = await WorkspaceChats.updateFeedbackScore(1, {
      score: false,
      category: "informacao_incorreta",
      comment: "A resposta citou o preco errado.",
    });

    expect(result.ok).toBe(true);
    expect(prisma.workspace_chats.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        feedbackScore: false,
        feedbackCategory: "informacao_incorreta",
        feedbackComment: "A resposta citou o preco errado.",
        feedbackAt: expect.any(Date),
      },
    });
  });

  it("keeps backwards compatibility with a bare score argument", async () => {
    prisma.workspace_chats.update.mockResolvedValue({
      id: 2,
      feedbackScore: true,
      feedbackCategory: null,
      feedbackComment: null,
      feedbackAt: new Date(),
    });

    const result = await WorkspaceChats.updateFeedbackScore(2, true);

    expect(result.ok).toBe(true);
    expect(prisma.workspace_chats.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        feedbackScore: true,
        feedbackCategory: null,
        feedbackComment: null,
        feedbackAt: expect.any(Date),
      },
    });
  });

  it("clears all feedback fields when score is null", async () => {
    prisma.workspace_chats.update.mockResolvedValue({
      id: 3,
      feedbackScore: null,
      feedbackCategory: null,
      feedbackComment: null,
      feedbackAt: null,
    });

    const result = await WorkspaceChats.updateFeedbackScore(3, null);

    expect(result.ok).toBe(true);
    expect(prisma.workspace_chats.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        feedbackScore: null,
        feedbackCategory: null,
        feedbackComment: null,
        feedbackAt: null,
      },
    });
  });

  it("rejects an invalid category", async () => {
    const result = await WorkspaceChats.updateFeedbackScore(4, {
      score: false,
      category: "nao_gostei",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/invalid feedback category/i);
    expect(prisma.workspace_chats.update).not.toHaveBeenCalled();
  });

  it("exposes the five accepted negative feedback categories", () => {
    expect(VALID_FEEDBACK_CATEGORIES).toEqual([
      "informacao_incorreta",
      "informacao_desatualizada",
      "nao_encontrou_resposta",
      "resposta_confusa",
      "outro",
    ]);
  });

  it("stores an explicit traceId on create", async () => {
    prisma.workspace_chats.create.mockResolvedValue({
      id: 1,
      traceId: TRACE_ID,
    });

    const result = await WorkspaceChats.new({
      workspaceId: 1,
      prompt: "Olá",
      response: { text: "Oi" },
      traceId: TRACE_ID,
    });

    expect(result.message).toBeNull();
    expect(prisma.workspace_chats.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ traceId: TRACE_ID }),
    });
  });

  it("derives traceId from the active OTel span when not provided", async () => {
    getActiveTraceId.mockReturnValue(TRACE_ID);
    prisma.workspace_chats.create.mockResolvedValue({
      id: 2,
      traceId: TRACE_ID,
    });

    await WorkspaceChats.new({
      workspaceId: 1,
      prompt: "Olá",
      response: { text: "Oi" },
    });

    expect(getActiveTraceId).toHaveBeenCalled();
    expect(prisma.workspace_chats.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ traceId: TRACE_ID }),
    });
  });

  it("rejects an invalid traceId", async () => {
    const result = await WorkspaceChats.new({
      workspaceId: 1,
      prompt: "Olá",
      response: { text: "Oi" },
      traceId: "not-a-trace-id",
    });

    expect(result.chat).toBeNull();
    expect(result.message).toMatch(/32 hex/i);
    expect(prisma.workspace_chats.create).not.toHaveBeenCalled();
  });

  it("persists traceId on upsert", async () => {
    prisma.workspace_chats.upsert.mockResolvedValue({ chat: { id: 1 } });

    const result = await WorkspaceChats.upsert(1, {
      workspaceId: 1,
      prompt: "Olá",
      response: { text: "Oi" },
      traceId: TRACE_ID,
    });

    expect(result.message).toBeNull();
    expect(prisma.workspace_chats.upsert).toHaveBeenCalledWith({
      where: { id: 1, user_id: null },
      update: expect.objectContaining({ traceId: TRACE_ID }),
      create: expect.objectContaining({
        traceId: TRACE_ID,
        prompt: "Olá",
      }),
    });
  });
});

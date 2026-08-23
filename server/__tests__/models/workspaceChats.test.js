/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  workspace_chats: {
    update: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const {
  WorkspaceChats,
  VALID_FEEDBACK_CATEGORIES,
} = require("../../models/workspaceChats");

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
});

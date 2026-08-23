/* eslint-env jest, node */
jest.mock("../../../models/organization", () => ({
  Organization: {
    get: jest.fn(),
    getBySlug: jest.fn(),
    all: jest.fn(),
  },
}));

const { Organization } = require("../../../models/organization");
const {
  DEFAULT_RAG_CONFIG,
  buildNoContextResponse,
  resolveOrganizationForRag,
  resolveRagConfig,
  shouldHandleNoContext,
  validateRagConfig,
} = require("../../../utils/ragConfig");

describe("resolveRagConfig", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses organization ragConfig over workspace fields", () => {
    const config = resolveRagConfig({
      organization: {
        ragConfig: {
          ...DEFAULT_RAG_CONFIG,
          topK: 6,
          fallbackBehavior: "human_handoff",
        },
      },
      workspace: {
        topN: 2,
        chatMode: "query",
        queryRefusalResponse: "custom refusal",
      },
    });

    expect(config.topK).toBe(6);
    expect(config.fallbackBehavior).toBe("human_handoff");
    expect(config.configSource).toBe("organization");
  });

  it("falls back to workspace RAG settings", () => {
    const config = resolveRagConfig({
      organization: null,
      workspace: {
        topN: 5,
        similarityThreshold: 0.4,
        vectorSearchMode: "rerank",
        chatMode: "query",
        queryRefusalResponse: "custom refusal",
      },
    });

    expect(config.topK).toBe(5);
    expect(config.similarityThreshold).toBe(0.4);
    expect(config.rerankingEnabled).toBe(true);
    expect(config.answerOnlyFromKnowledgeBase).toBe(true);
    expect(config.fallbackBehavior).toBe("dont_know");
    expect(config.configSource).toBe("workspace");
  });

  it("falls back to defaults when no org or workspace settings exist", () => {
    expect(resolveRagConfig({ workspace: {} })).toEqual({
      ...DEFAULT_RAG_CONFIG,
      configSource: "default",
    });
  });

  it("maps a query workspace without a refusal response to general_llm", () => {
    const config = resolveRagConfig({
      workspace: { chatMode: "query" },
    });

    expect(config.fallbackBehavior).toBe("general_llm");
    expect(config.configSource).toBe("workspace");
  });
});

describe("fallback behaviors", () => {
  it("blocks no-context answers for dont_know and human_handoff only", () => {
    expect(
      shouldHandleNoContext({
        answerOnlyFromKnowledgeBase: true,
        fallbackBehavior: "dont_know",
      })
    ).toBe(true);
    expect(
      shouldHandleNoContext({
        answerOnlyFromKnowledgeBase: true,
        fallbackBehavior: "human_handoff",
      })
    ).toBe(true);
    expect(
      shouldHandleNoContext({
        answerOnlyFromKnowledgeBase: true,
        fallbackBehavior: "general_llm",
      })
    ).toBe(false);
  });

  it("returns the configured refusal or generic text for dont_know", () => {
    expect(
      buildNoContextResponse(
        { fallbackBehavior: "dont_know" },
        { queryRefusalResponse: "custom refusal" }
      )
    ).toEqual({
      textResponse: "custom refusal",
      handoff: false,
      fallbackBehavior: "dont_know",
    });
    expect(
      buildNoContextResponse(
        { fallbackBehavior: "dont_know" },
        { queryRefusalResponse: null }
      ).textResponse
    ).toContain("no relevant information");
  });

  it("returns a structured human handoff response", () => {
    expect(
      buildNoContextResponse({ fallbackBehavior: "human_handoff" })
    ).toEqual({
      textResponse: expect.stringContaining("human support agent"),
      handoff: true,
      fallbackBehavior: "human_handoff",
    });
  });
});

describe("validateRagConfig", () => {
  it("accepts all valid fields", () => {
    expect(validateRagConfig(DEFAULT_RAG_CONFIG).ok).toBe(true);
  });

  it("rejects unknown fields and wrong types", () => {
    expect(
      validateRagConfig({ ...DEFAULT_RAG_CONFIG, nope: true }).ok
    ).toBe(false);
    expect(validateRagConfig({ topK: "four" }).ok).toBe(false);
    expect(
      validateRagConfig({ fallbackBehavior: "unsupported" }).ok
    ).toBe(false);
  });
});

describe("resolveOrganizationForRag", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prefers the passed organization and falls back to the default org", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "default-org",
      ragConfig: null,
    });

    expect(
      await resolveOrganizationForRag({
        organization: { id: "explicit" },
        workspace: { organizationId: "linked" },
      })
    ).toEqual({ id: "explicit" });
    expect(
      await resolveOrganizationForRag({ workspace: {} })
    ).toEqual({ id: "default-org", ragConfig: null });
  });
});

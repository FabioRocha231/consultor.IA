/* eslint-env jest, node */
jest.mock("../../models/organization", () => ({
  Organization: {
    getBySlug: jest.fn(),
    all: jest.fn(),
    update: jest.fn(),
  },
}));

const { Organization } = require("../../models/organization");
const { ragConfigEndpoints } = require("../../endpoints/ragConfig");

function registerEndpoints() {
  const handlers = {};
  const app = {
    get: (path, _middleware, handler) => {
      handlers[`GET ${path}`] = handler;
    },
    patch: (path, _middleware, handler) => {
      handlers[`PATCH ${path}`] = handler;
    },
  };
  ragConfigEndpoints(app);
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

const fullRagConfig = {
  chunkSize: 1000,
  chunkOverlap: 200,
  topK: 4,
  similarityThreshold: 0.25,
  rerankingEnabled: false,
  citationsRequired: true,
  answerOnlyFromKnowledgeBase: false,
  fallbackBehavior: "dont_know",
};

describe("rag-config endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the saved rag config", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      ragConfig: fullRagConfig,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /rag-config"]({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ ragConfig: fullRagConfig, error: null });
  });

  it("updates rag config with a valid shape", async () => {
    Organization.getBySlug.mockResolvedValue({ id: "org-1" });
    Organization.update.mockResolvedValue({
      organization: { id: "org-1", ragConfig: fullRagConfig },
      error: null,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /rag-config"](
      { body: fullRagConfig },
      response
    );

    expect(Organization.update).toHaveBeenCalledWith("org-1", {
      ragConfig: fullRagConfig,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({
      ragConfig: fullRagConfig,
      error: null,
    });
  });

  it("rejects an invalid rag config shape", async () => {
    Organization.getBySlug.mockResolvedValue({ id: "org-1" });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /rag-config"](
      { body: { topK: "four" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(Organization.update).not.toHaveBeenCalled();
  });
});

/* eslint-env jest, node */
jest.mock("../../models/organization", () => ({
  Organization: {
    getBySlug: jest.fn(),
    all: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock("../../utils/prisma", () => ({
  organization: {
    update: jest.fn(),
  },
}));

const { Organization } = require("../../models/organization");
const prisma = require("../../utils/prisma");
const { onboardingEndpoints } = require("../../endpoints/onboarding");

function registerEndpoints() {
  const handlers = {};
  const app = {
    get: (path, _middleware, handler) => {
      handlers[`GET ${path}`] = handler;
    },
    patch: (path, _middleware, handler) => {
      handlers[`PATCH ${path}`] = handler;
    },
    post: (path, _middleware, handler) => {
      handlers[`POST ${path}`] = handler;
    },
  };
  onboardingEndpoints(app);
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

describe("onboarding endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty wizard state before setup starts", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      name: "Default Organization",
      wizardState: null,
      publishedAt: null,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /onboarding/state"]({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({
      currentStep: 1,
      completedSteps: [],
      formData: {},
      publishedAt: null,
      organization: {
        id: "org-1",
        name: "Default Organization",
        wizardState: null,
        publishedAt: null,
      },
    });
  });

  it("updates the wizard state", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      wizardState: {
        currentStep: 1,
        completedSteps: [],
        formData: { companyName: "Acme" },
      },
    });
    Organization.update.mockResolvedValue({
      organization: {
        id: "org-1",
        name: "Acme",
        wizardState: {
          currentStep: 2,
          completedSteps: [1],
          formData: { companyName: "Acme", segment: "vendas" },
        },
      },
      error: null,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /onboarding/state"](
      {
        body: {
          currentStep: 2,
          completedSteps: [1],
          formData: { segment: "vendas" },
        },
      },
      response
    );

    expect(Organization.update).toHaveBeenCalledWith("org-1", {
      wizardState: {
        currentStep: 2,
        completedSteps: [1],
        formData: { companyName: "Acme", segment: "vendas" },
      },
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.currentStep).toBe(2);
  });

  it("rejects publish when steps 1-4 are not complete", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      wizardState: {
        currentStep: 4,
        completedSteps: [1, 2, 3],
        formData: {},
      },
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /onboarding/publish"]({}, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  it("publishes the organization when steps 1-4 are complete", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      wizardState: {
        currentStep: 7,
        completedSteps: [1, 2, 3, 4, 5, 6],
        formData: {},
      },
    });
    prisma.organization.update.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      publishedAt: "2026-08-23T13:00:00.000Z",
    });
    Organization.get.mockResolvedValue({
      id: "org-1",
      name: "Acme",
      publishedAt: "2026-08-23T13:00:00.000Z",
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /onboarding/publish"]({}, response);

    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { publishedAt: expect.any(Date) },
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.publishedAt).toBe("2026-08-23T13:00:00.000Z");
    expect(response.body.organization.name).toBe("Acme");
  });

  it("returns a deterministic test response based on the configured tone", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      wizardState: {
        currentStep: 6,
        completedSteps: [1, 2, 3, 4, 5],
        formData: { tone: "amigavel" },
      },
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["POST /onboarding/test"](
      { body: { message: "Olá" } },
      response
    );

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body.response).toBe("Resposta amigável: Olá");
  });
});

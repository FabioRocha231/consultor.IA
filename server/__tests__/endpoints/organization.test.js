/* eslint-env jest, node */
jest.mock("../../models/organization", () => ({
  Organization: {
    getBySlug: jest.fn(),
    all: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock("../../utils/prisma", () => ({
  workspaces: { count: jest.fn() },
  users: { count: jest.fn() },
}));

const { Organization } = require("../../models/organization");
const prisma = require("../../utils/prisma");
const {
  organizationEndpoints,
} = require("../../endpoints/organization");

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
  organizationEndpoints(app);
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

describe("organization endpoints", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the default organization", async () => {
    const organization = {
      id: "org-1",
      name: "Default Organization",
      slug: "default",
    };
    Organization.getBySlug.mockResolvedValue(organization);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /organization"]({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual(organization);
    expect(Organization.all).not.toHaveBeenCalled();
  });

  it("updates the default organization name", async () => {
    const organization = {
      id: "org-1",
      name: "Acme Pilot",
      slug: "default",
    };
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      name: "Default Organization",
      slug: "default",
    });
    Organization.update.mockResolvedValue({
      organization,
      error: null,
    });
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["PATCH /organization"](
      { body: { name: "Acme Pilot" } },
      response
    );

    expect(Organization.update).toHaveBeenCalledWith("org-1", {
      name: "Acme Pilot",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({ organization, error: null });
  });

  it("returns workspace and user counts", async () => {
    Organization.getBySlug.mockResolvedValue({
      id: "org-1",
      name: "Default Organization",
      slug: "default",
    });
    prisma.workspaces.count.mockResolvedValue(4);
    prisma.users.count.mockResolvedValue(7);
    const handlers = registerEndpoints();
    const response = mockResponse();

    await handlers["GET /organization/stats"]({}, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.body).toEqual({
      organizationId: "org-1",
      name: "Default Organization",
      slug: "default",
      workspaceCount: 4,
      userCount: 7,
    });
  });
});

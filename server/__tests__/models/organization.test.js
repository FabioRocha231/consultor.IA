/* eslint-env jest, node */
jest.mock("../../utils/prisma", () => ({
  organization: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  workspaces: {
    count: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { Organization } = require("../../models/organization");

describe("Organization model", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates and gets an organization by id and slug", async () => {
    const organization = {
      id: "org-1",
      name: "Acme",
      slug: "acme",
      segment: "vendas",
      status: "active",
    };
    prisma.organization.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(organization)
      .mockResolvedValueOnce(organization);
    prisma.organization.create.mockResolvedValue(organization);

    const created = await Organization.create({
      name: "Acme",
      slug: "acme",
      segment: "vendas",
    });

    expect(created).toEqual({ organization, error: null });
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        name: "Acme",
        slug: "acme",
        segment: "vendas",
      }),
    });
    expect(await Organization.get("org-1")).toBe(organization);
    expect(await Organization.getBySlug("acme")).toBe(organization);
  });

  it("rejects a duplicate slug before create", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: "existing",
      slug: "acme",
    });

    const result = await Organization.create({ name: "Other", slug: "acme" });

    expect(result.organization).toBeNull();
    expect(result.error).toMatch(/already exists/);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  it("updates only writable fields", async () => {
    const updated = {
      id: "org-1",
      name: "Acme Pilot",
      slug: "acme",
      segment: "suporte",
      status: "active",
    };
    prisma.organization.update.mockResolvedValue(updated);

    const result = await Organization.update("org-1", {
      name: "Acme Pilot",
      segment: "suporte",
      slug: "not-writable",
      id: "other-id",
    });

    expect(result.organization).toEqual(updated);
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { name: "Acme Pilot", segment: "suporte" },
    });
  });

  it("does not delete an organization with linked workspaces", async () => {
    prisma.workspaces.count.mockResolvedValue(1);

    expect(await Organization.delete("org-1")).toBe(false);
    expect(prisma.organization.delete).not.toHaveBeenCalled();
  });

  it("deletes an organization without linked workspaces", async () => {
    prisma.workspaces.count.mockResolvedValue(0);
    prisma.organization.delete.mockResolvedValue({ id: "org-1" });

    expect(await Organization.delete("org-1")).toBe(true);
  });

  it("counts and lists organizations", async () => {
    const organizations = [{ id: "org-1" }, { id: "org-2" }];
    prisma.organization.count.mockResolvedValue(2);
    prisma.organization.findMany.mockResolvedValue(organizations);

    expect(await Organization.count()).toBe(2);
    expect(await Organization.all()).toEqual(organizations);
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
    });
  });
});

const { v4: uuidv4 } = require("uuid");
const prisma = require("../utils/prisma");

const Organization = {
  _table: "organization",
  VALID_SEGMENTS: [
    "atendimento",
    "vendas",
    "suporte",
    "conhecimento_interno",
    "operacoes",
  ],
  VALID_STATUSES: ["active", "suspended", "archived"],
  writable: ["name", "segment", "status"],

  validations: {
    name: (value) => {
      if (!value || typeof value !== "string")
        throw new Error("Organization name is required");
      return String(value).slice(0, 255);
    },
    segment: (value) => {
      if (value === null || value === undefined || value === "") return null;
      if (!Organization.VALID_SEGMENTS.includes(value))
        throw new Error(
          `Invalid segment. Allowed segments: ${Organization.VALID_SEGMENTS.join(
            ", "
          )}`
        );
      return String(value);
    },
    status: (value = "active") => {
      if (!Organization.VALID_STATUSES.includes(value))
        throw new Error(
          `Invalid status. Allowed statuses: ${Organization.VALID_STATUSES.join(
            ", "
          )}`
        );
      return String(value);
    },
  },

  create: async function ({ name, slug, segment = null } = {}) {
    try {
      const validatedName = this.validations.name(name);
      if (!slug || typeof slug !== "string")
        throw new Error("Organization slug is required");
      const normalizedSlug = slug.trim();

      const existing = await prisma.organization.findUnique({
        where: { slug: normalizedSlug },
      });
      if (existing)
        return {
          organization: null,
          error: `An organization with slug ${normalizedSlug} already exists`,
        };

      const organization = await prisma.organization.create({
        data: {
          id: uuidv4(),
          name: validatedName,
          slug: normalizedSlug,
          segment: this.validations.segment(segment),
        },
      });
      return { organization, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE ORGANIZATION.", error.message);
      return { organization: null, error: error.message };
    }
  },

  get: async function (id) {
    try {
      return await prisma.organization.findUnique({ where: { id } });
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATION.", error.message);
      return null;
    }
  },

  getBySlug: async function (slug) {
    try {
      return await prisma.organization.findUnique({ where: { slug } });
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATION.", error.message);
      return null;
    }
  },

  update: async function (id, patch = {}) {
    try {
      const updates = {};
      this.writable.forEach((key) => {
        if (!patch.hasOwnProperty(key)) return;
        updates[key] = this.validations[key]
          ? this.validations[key](patch[key])
          : patch[key];
      });

      if (Object.keys(updates).length === 0)
        return { organization: null, error: "No valid fields to update." };

      const organization = await prisma.organization.update({
        where: { id },
        data: updates,
      });
      return { organization, error: null };
    } catch (error) {
      console.error("FAILED TO UPDATE ORGANIZATION.", error.message);
      return { organization: null, error: error.message };
    }
  },

  delete: async function (id) {
    try {
      const workspaceCount = await prisma.workspaces.count({
        where: { organizationId: id },
      });
      if (workspaceCount > 0) return false;

      await prisma.organization.delete({ where: { id } });
      return true;
    } catch (error) {
      console.error("FAILED TO DELETE ORGANIZATION.", error.message);
      return false;
    }
  },

  count: async function () {
    try {
      return await prisma.organization.count();
    } catch (error) {
      console.error("FAILED TO COUNT ORGANIZATIONS.", error.message);
      return 0;
    }
  },

  all: async function () {
    try {
      return await prisma.organization.findMany({
        orderBy: { createdAt: "asc" },
      });
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATIONS.", error.message);
      return [];
    }
  },
};

module.exports = { Organization };

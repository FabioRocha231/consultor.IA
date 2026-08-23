const { v4: uuidv4 } = require("uuid");
const prisma = require("../utils/prisma");
const { EncryptionManager } = require("../utils/EncryptionManager");

const N8N_API_KEY_PREFIX = "enc:v1:";

function encryptN8nApiKey(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.startsWith(N8N_API_KEY_PREFIX)) return raw;
  const encrypted = new EncryptionManager().encrypt(raw);
  return encrypted ? `${N8N_API_KEY_PREFIX}${encrypted}` : null;
}

function decryptN8nApiKey(value) {
  if (!value) return null;
  const raw = String(value);
  if (!raw.startsWith(N8N_API_KEY_PREFIX)) return raw;
  return new EncryptionManager().decrypt(raw.slice(N8N_API_KEY_PREFIX.length));
}

function withoutSecret(organization) {
  if (!organization || !("n8nApiKey" in organization)) return organization;
  const { n8nApiKey: _n8nApiKey, ...publicOrganization } = organization;
  return publicOrganization;
}

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
  publicFields: [
    "id",
    "name",
    "slug",
    "segment",
    "status",
    "n8nWebhookUrl",
    "createdAt",
    "updatedAt",
    "publishedAt",
  ],
  writable: [
    "name",
    "segment",
    "status",
    "wizardState",
    "ragConfig",
    "n8nWebhookUrl",
    "n8nApiKey",
  ],

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
    wizardState: (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "object" || Array.isArray(value))
        throw new Error("wizardState must be an object");
      try {
        JSON.stringify(value);
      } catch {
        throw new Error("wizardState must be JSON serializable");
      }
      return value;
    },
    ragConfig: (value) => {
      if (value === null || value === undefined) return null;
      const {
        ok,
        value: parsed,
        error,
      } = require("../utils/ragConfig").validateRagConfig(value);
      if (!ok) throw new Error(error);
      return parsed;
    },
    n8nWebhookUrl: (value) => {
      if (value === null || value === undefined || value === "") return null;
      const raw = String(value).trim();
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new Error("n8nWebhookUrl must be a valid absolute URL");
      }
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("n8nWebhookUrl must use http or https");
      if (!parsed.hostname) throw new Error("n8nWebhookUrl must have a host");
      return raw;
    },
    n8nApiKey: (value) => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value !== "string") return null;
      return encryptN8nApiKey(value);
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
      return { organization: withoutSecret(organization), error: null };
    } catch (error) {
      console.error("FAILED TO CREATE ORGANIZATION.", error.message);
      return { organization: null, error: error.message };
    }
  },

  get: async function (id) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id },
      });
      return withoutSecret(organization);
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATION.", error.message);
      return null;
    }
  },

  getBySlug: async function (slug) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { slug },
      });
      return withoutSecret(organization);
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATION.", error.message);
      return null;
    }
  },

  getWithN8nSecrets: async function (id) {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id },
      });
      if (!organization) return null;
      return {
        ...organization,
        n8nApiKey: decryptN8nApiKey(organization.n8nApiKey),
      };
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
      return { organization: withoutSecret(organization), error: null };
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
      const organizations = await prisma.organization.findMany({
        orderBy: { createdAt: "asc" },
      });
      return organizations.map(withoutSecret);
    } catch (error) {
      console.error("FAILED TO GET ORGANIZATIONS.", error.message);
      return [];
    }
  },
};

module.exports = { Organization };

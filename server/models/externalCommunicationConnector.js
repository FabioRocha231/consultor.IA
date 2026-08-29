const prisma = require("../utils/prisma");
const { safeJsonParse } = require("../utils/http");
const { encryptToken } = require("../utils/telegramBot/utils");

const WHATSAPP_REQUIRED_FIELDS = [
  "appSecret",
  "phoneNumberId",
  "accessToken",
  "verifyToken",
  "workspaceSlug",
];
const WHATSAPP_SECRET_FIELDS = ["appSecret", "accessToken", "verifyToken"];

const ExternalCommunicationConnector = {
  supportedTypes: ["telegram", "whatsapp"],

  /**
   * Validate a connector config before persisting it.
   * @param {'telegram'|'whatsapp'} type
   * @param {object} config
   * @returns {{valid: boolean, error: string|null}}
   */
  validateConfig: function (type, config = {}) {
    if (!this.supportedTypes.includes(type))
      return {
        valid: false,
        error: `Unsupported connector type: ${type}`,
      };
    if (type !== "whatsapp") return { valid: true, error: null };

    const missing = WHATSAPP_REQUIRED_FIELDS.filter(
      (field) => typeof config[field] !== "string" || !config[field].trim()
    );
    if (missing.length > 0)
      return {
        valid: false,
        error: `Invalid whatsapp config. Missing: ${missing.join(", ")}`,
      };
    return { valid: true, error: null };
  },

  /**
   * Get a connector by type.
   * @param {'telegram'|'whatsapp'} type
   * @returns {Promise<{id: number, type: string, config: object, active: boolean}|null>}
   */
  get: async function (type) {
    try {
      const connector =
        await prisma.external_communication_connectors.findUnique({
          where: { type },
        });
      if (!connector) return null;
      return {
        ...connector,
        config: safeJsonParse(connector.config, {}),
      };
    } catch (error) {
      console.error("ExternalCommunicationConnector.get", error.message);
      return null;
    }
  },

  /**
   * Get a connector by type, throwing on database failures instead of
   * collapsing them into a missing connector.
   * @param {'telegram'|'whatsapp'} type
   * @returns {Promise<{id: number, type: string, config: object, active: boolean}|null>}
   */
  getStrict: async function (type) {
    const connector = await prisma.external_communication_connectors.findUnique(
      {
        where: { type },
      }
    );
    if (!connector) return null;
    return {
      ...connector,
      config: safeJsonParse(connector.config, {}),
    };
  },

  /**
   * Create or update a connector's config and active state.
   * @param {'telegram'|'whatsapp'} type
   * @param {object} config
   * @param {boolean} active
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  upsert: async function (type, inputConfig = {}) {
    if (!this.supportedTypes.includes(type))
      return { connector: null, error: `Unsupported connector type: ${type}` };

    const config = { ...inputConfig };
    if (type === "whatsapp") {
      const { valid, error } = this.validateConfig(type, config);
      if (!valid) return { connector: null, error };

      for (const field of WHATSAPP_SECRET_FIELDS) {
        if (!config[field] || String(config[field]).startsWith("enc:"))
          continue;
        const encrypted = encryptToken(String(config[field]));
        if (!encrypted)
          return {
            connector: null,
            error: `Failed to encrypt whatsapp config field: ${field}`,
          };
        config[field] = encrypted;
      }
    }

    try {
      let update = {},
        create = {};

      if (config.hasOwnProperty("active")) {
        update.active = Boolean(config.active);
        create.active = Boolean(config.active);
        delete config.active;
      }

      update = Object.assign(update, {
        config: JSON.stringify(config),
        lastUpdatedAt: new Date(),
      });
      create = Object.assign(create, {
        config: JSON.stringify(config),
        type: String(type),
      });

      const connector = await prisma.external_communication_connectors.upsert({
        where: { type: String(type) },
        update,
        create,
      });
      return {
        connector: {
          ...connector,
          config: safeJsonParse(connector.config, {}),
        },
        error: null,
      };
    } catch (error) {
      console.error("ExternalCommunicationConnector.upsert", error.message);
      return { connector: null, error: error.message };
    }
  },

  /**
   * Merge partial config updates into an existing connector.
   * @param {'telegram'|'whatsapp'} type
   * @param {object} configUpdates - Partial config to merge.
   * @returns {Promise<{connector: object|null, error: string|null}>}
   */
  updateConfig: async function (type, configUpdates = {}) {
    const existing = await this.get(type);
    if (!existing)
      return { connector: null, error: `No ${type} connector found` };

    const mergedConfig = { ...existing.config, ...configUpdates };
    return this.upsert(type, mergedConfig, existing.active);
  },

  /**
   * Delete a connector entirely.
   * @param {'telegram'|'whatsapp'} type
   * @returns {Promise<boolean>}
   */
  delete: async function (type) {
    try {
      await prisma.external_communication_connectors.delete({
        where: { type },
      });
      return true;
    } catch (error) {
      console.error("ExternalCommunicationConnector.delete", error.message);
      return false;
    }
  },
};

module.exports = {
  ExternalCommunicationConnector,
  WHATSAPP_SECRET_FIELDS,
};

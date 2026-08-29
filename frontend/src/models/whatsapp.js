import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const WhatsApp = {
  /**
   * Get the current WhatsApp Cloud API configuration.
   * @returns {Promise<{config: object|null, error: string|null}>}
   */
  getConfig: async function () {
    return await fetch(`${API_BASE}/whatsapp/config`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { config: null, error: e.message };
      });
  },

  /**
   * Connect the WhatsApp Cloud API with the given credentials.
   * @param {object} data
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  connect: async function ({
    appSecret,
    phoneNumberId,
    accessToken,
    verifyToken,
    workspaceSlug,
  }) {
    return await fetch(`${API_BASE}/whatsapp/connect`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({
        appSecret,
        phoneNumberId,
        accessToken,
        verifyToken,
        workspaceSlug,
      }),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * Disconnect and remove the WhatsApp Cloud API configuration.
   * @returns {Promise<{success: boolean, error: string|null}>}
   */
  disconnect: async function () {
    return await fetch(`${API_BASE}/whatsapp/disconnect`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  /**
   * Get the current WhatsApp connection status.
   * @returns {Promise<{active: boolean, configPresent: boolean}>}
   */
  getStatus: async function () {
    return await fetch(`${API_BASE}/whatsapp/status`, {
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { active: false, configPresent: false };
      });
  },
};

export default WhatsApp;

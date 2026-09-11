import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _nonJsonBody: text.slice(0, 200) };
  }
}

async function adminRequest(url, method = "GET", body = null) {
  try {
    const response = await fetch(url, {
      method,
      headers: baseHeaders(),
      ...(body === null ? {} : { body: JSON.stringify(body) }),
    });
    const json = await safeJson(response);
    if (!response.ok) {
      return {
        ok: false,
        error:
          json.error ||
          json.message ||
          json._nonJsonBody ||
          `Erro ${response.status}`,
      };
    }
    return { ok: true, json };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e.message || "Erro de rede" };
  }
}

const Admin = {
  // User Management
  users: async () => {
    const { ok, json } = await adminRequest(`${API_BASE}/admin/users`);
    return ok ? json?.users || [] : [];
  },
  newUser: async (data) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/users/new`,
      "POST",
      data
    );
    return ok ? json : { user: null, error };
  },
  updateUser: async (userId, data) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/user/${userId}`,
      "POST",
      data
    );
    return ok ? json : { success: false, error };
  },
  deleteUser: async (userId) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/user/${userId}`,
      "DELETE"
    );
    return ok ? json : { success: false, error };
  },

  // Invitations
  invites: async () => {
    const { ok, json } = await adminRequest(`${API_BASE}/admin/invites`);
    return ok ? json?.invites || [] : [];
  },
  newInvite: async ({ role = null, workspaceIds = null }) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/invite/new`,
      "POST",
      {
        role,
        workspaceIds,
      }
    );
    return ok ? json : { invite: null, error };
  },
  disableInvite: async (inviteId) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/invite/${inviteId}`,
      "DELETE"
    );
    return ok ? json : { success: false, error };
  },

  // Workspaces Mgmt
  workspaces: async () => {
    const { ok, json } = await adminRequest(`${API_BASE}/admin/workspaces`);
    return ok ? json?.workspaces || [] : [];
  },
  workspaceUsers: async (workspaceId) => {
    const { ok, json } = await adminRequest(
      `${API_BASE}/admin/workspaces/${workspaceId}/users`
    );
    return ok ? json?.users || [] : [];
  },
  newWorkspace: async (name) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/workspaces/new`,
      "POST",
      { name }
    );
    return ok ? json : { workspace: null, error };
  },
  updateUsersInWorkspace: async (workspaceId, userIds = []) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/workspaces/${workspaceId}/update-users`,
      "POST",
      { userIds }
    );
    return ok ? json : { success: false, error };
  },
  deleteWorkspace: async (workspaceId) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/workspaces/${workspaceId}`,
      "DELETE"
    );
    return ok ? json : { success: false, error };
  },

  // System Preferences
  /**
   * Fetches system preferences by fields
   * @param {string[]} labels - Array of labels for settings
   * @returns {Promise<{settings: Object, error: string}>} - System preferences object
   */
  systemPreferencesByFields: async (labels = []) => {
    const { ok, json } = await adminRequest(
      `${API_BASE}/admin/system-preferences-for?labels=${labels.join(",")}`
    );
    return ok ? json : null;
  },
  updateSystemPreferences: async (updates = {}) => {
    const { ok, json, error } = await adminRequest(
      `${API_BASE}/admin/system-preferences`,
      "POST",
      updates
    );
    return ok ? json : { success: false, error };
  },

  // API Keys
  getApiKeys: async function () {
    return fetch(`${API_BASE}/admin/api-keys`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error fetching api keys.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKeys: [], error: e.message };
      });
  },
  generateApiKey: async function (data = {}) {
    return fetch(`${API_BASE}/admin/generate-api-key`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.statusText || "Error generating api key.");
        }
        return res.json();
      })
      .catch((e) => {
        console.error(e);
        return { apiKey: null, error: e.message };
      });
  },
  deleteApiKey: async function (apiKeyId = "") {
    return fetch(`${API_BASE}/admin/delete-api-key/${apiKeyId}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.ok)
      .catch((e) => {
        console.error(e);
        return false;
      });
  },
};

export default Admin;

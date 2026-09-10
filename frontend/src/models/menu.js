import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

const Menu = {
  list: async function (filters = {}) {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.available !== undefined && filters.available !== "")
      params.set("available", String(filters.available));
    const query = params.toString();
    try {
      const { ok, data } = await parseResponse(
        await fetch(`${API_BASE}/menu/items${query ? `?${query}` : ""}`, {
          headers: baseHeaders(),
        })
      );
      return {
        items: ok ? data.items || [] : [],
        error: ok ? null : data.error || "Failed to list menu items.",
      };
    } catch (error) {
      return { items: [], error: error.message };
    }
  },

  get: async function (id) {
    try {
      const { ok, data } = await parseResponse(
        await fetch(`${API_BASE}/menu/items/${id}`, {
          headers: baseHeaders(),
        })
      );
      return {
        item: ok ? data.item || null : null,
        error: ok ? null : data.error || "Failed to get menu item.",
      };
    } catch (error) {
      return { item: null, error: error.message };
    }
  },

  create: async function (data) {
    try {
      const { ok, body } = await this.request("/menu/items", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return {
        item: ok ? body.item || null : null,
        error: ok ? null : body.error || "Failed to create menu item.",
      };
    } catch (error) {
      return { item: null, error: error.message };
    }
  },

  update: async function (id, data) {
    try {
      const { ok, body } = await this.request(`/menu/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      return {
        item: ok ? body.item || null : null,
        error: ok ? null : body.error || "Failed to update menu item.",
      };
    } catch (error) {
      return { item: null, error: error.message };
    }
  },

  delete: async function (id) {
    try {
      const { ok, body } = await this.request(`/menu/items/${id}`, {
        method: "DELETE",
      });
      return {
        success: ok,
        error: ok ? null : body.error || "Failed to delete menu item.",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  request: async function (path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: baseHeaders(),
    });
    return {
      response,
      ok: response.ok,
      body: await parseResponse(response).then(({ data }) => data),
    };
  },
};

export default Menu;

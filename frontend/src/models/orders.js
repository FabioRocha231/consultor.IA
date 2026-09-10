import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

const Orders = {
  list: async function (filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.set("status", filters.status);
    if (filters.customerPhone)
      params.set("customerPhone", filters.customerPhone);
    if (filters.limit !== undefined && filters.limit !== "")
      params.set("limit", String(filters.limit));
    if (filters.offset !== undefined && filters.offset !== "")
      params.set("offset", String(filters.offset));
    const query = params.toString();
    try {
      const { ok, data } = await parseResponse(
        await fetch(`${API_BASE}/orders${query ? `?${query}` : ""}`, {
          headers: baseHeaders(),
        })
      );
      return {
        orders: ok ? data.orders || [] : [],
        count: ok ? data.count || 0 : 0,
        error: ok ? null : data.error || "Failed to list orders.",
      };
    } catch (error) {
      return { orders: [], count: 0, error: error.message };
    }
  },

  get: async function (id) {
    try {
      const { ok, data } = await parseResponse(
        await fetch(`${API_BASE}/orders/${id}`, {
          headers: baseHeaders(),
        })
      );
      return {
        order: ok ? data.order || null : null,
        error: ok ? null : data.error || "Failed to get order.",
      };
    } catch (error) {
      return { order: null, error: error.message };
    }
  },

  updateStatus: async function (id, status) {
    try {
      const response = await fetch(`${API_BASE}/orders/${id}/status`, {
        method: "PATCH",
        headers: baseHeaders(),
        body: JSON.stringify({ status }),
      });
      const { ok, data } = await parseResponse(response);
      return {
        order: ok ? data.order || null : null,
        error: ok ? null : data.error || "Failed to update order status.",
      };
    } catch (error) {
      return { order: null, error: error.message };
    }
  },
};

export default Orders;

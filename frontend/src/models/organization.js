import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const Organization = {
  get: async function () {
    return await fetch(`${API_BASE}/organization`, {
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          return {
            organization: null,
            error: data.error || "Failed to load organization.",
          };
        return { organization: data, error: null };
      })
      .catch((e) => ({ organization: null, error: e.message }));
  },
  update: async function (data) {
    return await fetch(`${API_BASE}/organization`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.organization)
          return {
            organization: null,
            error: body.error || "Failed to update organization.",
          };
        return { organization: body.organization, error: null };
      })
      .catch((e) => ({ organization: null, error: e.message }));
  },
  getOnboardingState: async function () {
    return await fetch(`${API_BASE}/onboarding/state`, {
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data.error || "Failed to load onboarding state.");
        return data;
      })
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  updateOnboardingState: async function (data) {
    return await fetch(`${API_BASE}/onboarding/state`, {
      method: "PATCH",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(body.error || "Failed to update onboarding state.");
        return body;
      })
      .catch((e) => {
        console.error(e);
        return null;
      });
  },
  publishOnboarding: async function () {
    return await fetch(`${API_BASE}/onboarding/publish`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          return {
            publishedAt: null,
            error: body.error || "Failed to publish onboarding.",
          };
        return { publishedAt: body.publishedAt, error: null };
      })
      .catch((e) => ({ publishedAt: null, error: e.message }));
  },
  testOnboarding: async function (message) {
    return await fetch(`${API_BASE}/onboarding/test`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ message }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          return {
            response: null,
            error: body.error || "Failed to test onboarding.",
          };
        return { response: body.response, error: null };
      })
      .catch((e) => ({ response: null, error: e.message }));
  },
};

export default Organization;

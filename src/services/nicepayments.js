import { Capacitor } from "@capacitor/core";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DEFAULT_NICE_PAYMENTS_BASE_PATH = "/api/nicepayments";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/$/, "");

const resolveNicePaymentsBaseUrl = () => {
  const configuredBase = normalizeBaseUrl(
    import.meta.env.VITE_NICEPAYMENTS_API_BASE || DEFAULT_NICE_PAYMENTS_BASE_PATH
  );

  if (!configuredBase) return DEFAULT_NICE_PAYMENTS_BASE_PATH;
  if (/^https?:\/\//i.test(configuredBase)) return configuredBase;

  // Keep same-origin relative paths on web so preview/custom domains do not
  // accidentally turn into cross-origin API calls that fail with "Failed to fetch".
  if (configuredBase.startsWith("/") && !Capacitor.isNativePlatform()) {
    return configuredBase;
  }

  const publicOrigin = normalizeBaseUrl(resolvePublicAppOrigin());
  if (publicOrigin && configuredBase.startsWith("/")) {
    return `${publicOrigin}${configuredBase}`;
  }

  return configuredBase;
};

const buildNicePaymentsUrl = (path) => `${resolveNicePaymentsBaseUrl()}${path}`;

async function postJson(url, payload, options = {}) {
  const accessToken = String(options?.accessToken || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`Nice Payments request failed: ${err.message || err}`);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || data?.msg || text || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export function confirmNicePayment(payload, options = {}) {
  return postJson(buildNicePaymentsUrl("/confirm"), payload, options);
}

export function fetchNicePaymentsConfig() {
  return postJson(buildNicePaymentsUrl("/config"), {});
}

export function fetchProTrialStatus(options = {}) {
  return postJson(buildNicePaymentsUrl("/pro-trial"), { action: "status" }, options);
}

export function prepareNicePaymentsSubscription(payload, options = {}) {
  return postJson(buildNicePaymentsUrl("/subscription/prepare"), payload, options);
}

export function fetchNicePaymentsSubscriptionStatus(options = {}) {
  return postJson(buildNicePaymentsUrl("/subscription/status"), {}, options);
}

export function chargeNicePaymentsSubscription(payload = {}, options = {}) {
  return postJson(buildNicePaymentsUrl("/subscription/charge"), payload, options);
}

export function inactiveNicePaymentsSubscription(payload = {}, options = {}) {
  return postJson(buildNicePaymentsUrl("/subscription/inactive"), payload, options);
}

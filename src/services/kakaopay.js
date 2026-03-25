import { Capacitor } from "@capacitor/core";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DEFAULT_KAKAOPAY_BASE_PATH = "/api/kakaopay";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/$/, "");

const resolveKakaoPayBaseUrl = () => {
  const configuredBase = normalizeBaseUrl(import.meta.env.VITE_KAKAOPAY_API_BASE || DEFAULT_KAKAOPAY_BASE_PATH);

  if (!configuredBase) return DEFAULT_KAKAOPAY_BASE_PATH;
  if (/^https?:\/\//i.test(configuredBase)) return configuredBase;

  if (configuredBase.startsWith("/") && !Capacitor.isNativePlatform()) {
    return configuredBase;
  }

  const publicOrigin = normalizeBaseUrl(resolvePublicAppOrigin());
  if (publicOrigin && configuredBase.startsWith("/")) {
    return `${publicOrigin}${configuredBase}`;
  }

  return configuredBase;
};

const buildKakaoPayUrl = (path) => `${resolveKakaoPayBaseUrl()}${path}`;

async function requestJson(url, payload, options = {}) {
  const accessToken = String(options?.accessToken || "").trim();
  const method = String(options?.method || "POST").trim().toUpperCase() || "POST";
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    });
  } catch (err) {
    throw new Error(`KakaoPay request failed: ${err.message || err}`);
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

export function requestKakaoPayReady(payload, options = {}) {
  return requestJson(buildKakaoPayUrl("/ready"), payload, options);
}

export function approveKakaoPay(payload, options = {}) {
  return requestJson(buildKakaoPayUrl("/approve"), payload, options);
}

export function fetchKakaoPaySubscriptionStatus(options = {}) {
  return requestJson(buildKakaoPayUrl("/subscription/status"), {}, options);
}

export function chargeKakaoPaySubscription(payload = {}, options = {}) {
  return requestJson(buildKakaoPayUrl("/subscription/charge"), payload, options);
}

export function inactiveKakaoPaySubscription(payload = {}, options = {}) {
  return requestJson(buildKakaoPayUrl("/subscription/inactive"), payload, options);
}

import { Capacitor, CapacitorHttp } from "@capacitor/core";

const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

function normalizeJsonData(value) {
  if (value == null || value === "") return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  return value;
}

function resolveErrorMessage(data, fallback = "") {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return (
      String(data?.message || data?.error || data?.msg || data?.raw || "").trim() ||
      String(fallback || "").trim()
    );
  }
  return String(data || fallback || "").trim();
}

export async function requestJson(url, { method = "POST", headers = {}, payload } = {}) {
  const targetUrl = String(url || "").trim();
  const normalizedMethod = String(method || "POST").trim().toUpperCase() || "POST";
  const shouldUseNativeHttp =
    Capacitor.isNativePlatform() && ABSOLUTE_HTTP_URL_RE.test(targetUrl);

  if (shouldUseNativeHttp) {
    const response = await CapacitorHttp.request({
      url: targetUrl,
      method: normalizedMethod,
      headers,
      data: normalizedMethod === "GET" ? undefined : payload ?? {},
      responseType: "json",
      connectTimeout: 30000,
      readTimeout: 30000,
    });
    const data = normalizeJsonData(response?.data);
    const status = Number(response?.status) || 0;
    if (status < 200 || status >= 300) {
      throw new Error(resolveErrorMessage(data, `HTTP ${status || "request failed"}`));
    }
    return data;
  }

  const response = await fetch(targetUrl, {
    method: normalizedMethod,
    headers,
    body: normalizedMethod === "GET" ? undefined : JSON.stringify(payload ?? {}),
  });
  const text = await response.text();
  const data = normalizeJsonData(text);
  if (!response.ok) {
    throw new Error(resolveErrorMessage(data, text || `HTTP ${response.status}`));
  }
  return data;
}

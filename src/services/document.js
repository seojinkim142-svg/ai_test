import { Capacitor } from "@capacitor/core";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DEFAULT_DOCUMENT_API_BASE_PATH = "/api/document";

const normalizeBaseUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

const resolveDocumentApiBaseUrl = () => {
  const configuredBase = normalizeBaseUrl(
    import.meta.env.VITE_DOCUMENT_API_BASE || DEFAULT_DOCUMENT_API_BASE_PATH
  );

  if (!configuredBase) return DEFAULT_DOCUMENT_API_BASE_PATH;
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

const buildDocumentApiUrl = (path) => `${resolveDocumentApiBaseUrl()}${path}`;

const parseJsonResponse = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

async function postJson(url, payload, options = {}) {
  const accessToken = String(options?.accessToken || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload ?? {}),
    });
  } catch (error) {
    throw new Error(`Document API request failed: ${error.message || error}`);
  }

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body?.message || `Document API request failed with HTTP ${response.status}.`);
  }
  return body;
}

export async function ensureUploadPreviewPdf(payload = {}, options = {}) {
  return postJson(buildDocumentApiUrl("/convert"), payload, options);
}

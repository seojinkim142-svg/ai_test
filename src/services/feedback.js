import { Capacitor } from "@capacitor/core";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DEFAULT_FEEDBACK_API_BASE_PATH = "/api/feedback";
const trimTrailingSlash = (value) => String(value || "").trim().replace(/\/+$/, "");

const normalizeApiBase = (value) => {
  const raw = String(value || "").trim();
  if (/^https?:\/\//i.test(raw)) return trimTrailingSlash(raw);

  if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
    return trimTrailingSlash(raw) || DEFAULT_FEEDBACK_API_BASE_PATH;
  }

  const publicOrigin = resolvePublicAppOrigin();
  if (Capacitor.isNativePlatform() && publicOrigin) {
    const nativeBasePath = raw || DEFAULT_FEEDBACK_API_BASE_PATH;
    try {
      return new URL(nativeBasePath, `${trimTrailingSlash(publicOrigin)}/`).toString().replace(/\/$/, "");
    } catch {
      return `${trimTrailingSlash(publicOrigin)}${nativeBasePath.startsWith("/") ? nativeBasePath : `/${nativeBasePath}`}`;
    }
  }

  if (!publicOrigin) return trimTrailingSlash(raw) || DEFAULT_FEEDBACK_API_BASE_PATH;

  try {
    return new URL(raw, `${publicOrigin}/`).toString().replace(/\/$/, "");
  } catch {
    return trimTrailingSlash(raw) || DEFAULT_FEEDBACK_API_BASE_PATH;
  }
};

const FEEDBACK_API_BASE = normalizeApiBase(
  import.meta.env.VITE_FEEDBACK_API_BASE || DEFAULT_FEEDBACK_API_BASE_PATH
);

const buildFeedbackApiUrl = (path = "") => {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return FEEDBACK_API_BASE;
  return `${FEEDBACK_API_BASE}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
};

const parseJsonResponse = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const throwFeedbackError = (body, fallbackMessage, status) => {
  const error = new Error(body?.message || fallbackMessage);
  error.status = Number(status) || 500;
  error.body = body;
  throw error;
};

const requestFeedbackApi = async (path, { method = "GET", payload = null, accessToken = "" } = {}) => {
  let response;
  try {
    response = await fetch(buildFeedbackApiUrl(path), {
      method,
      headers: {
        ...(payload != null ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(payload != null ? { body: JSON.stringify(payload) } : {}),
    });
  } catch (error) {
    throw new Error(`Feedback request failed: ${error.message}`);
  }

  if (response.status === 204) {
    return { ok: false, skipped: true };
  }

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throwFeedbackError(body, "Feedback request failed.", response.status);
  }

  return body;
};

export async function notifyFeedbackEmail(payload = {}) {
  return requestFeedbackApi("/notify", {
    method: "POST",
    payload: payload || {},
  });
}

export async function fetchFeedbackInbox({ accessToken, limit = 20 } = {}) {
  const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Math.floor(Number(limit)))) : 20;
  return requestFeedbackApi(`/inbox?limit=${normalizedLimit}`, {
    method: "GET",
    accessToken,
  });
}

export async function fetchFeedbackReplies({ accessToken, limit = 20 } = {}) {
  const normalizedLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Math.floor(Number(limit)))) : 20;
  return requestFeedbackApi(`/replies?limit=${normalizedLimit}`, {
    method: "GET",
    accessToken,
  });
}

export async function sendFeedbackReply({ accessToken, feedbackId, content } = {}) {
  return requestFeedbackApi("/reply", {
    method: "POST",
    accessToken,
    payload: {
      feedbackId,
      content,
    },
  });
}

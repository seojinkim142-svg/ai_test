import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DEFAULT_FEEDBACK_API_BASE_PATH = "/api/feedback";

const normalizeApiBase = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return DEFAULT_FEEDBACK_API_BASE_PATH;
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");

  const publicOrigin = resolvePublicAppOrigin();
  if (!publicOrigin) return raw.replace(/\/$/, "") || DEFAULT_FEEDBACK_API_BASE_PATH;

  try {
    return new URL(raw, `${publicOrigin}/`).toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "") || DEFAULT_FEEDBACK_API_BASE_PATH;
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

export async function notifyFeedbackEmail(payload = {}) {
  let response;
  try {
    response = await fetch(buildFeedbackApiUrl("/notify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
  } catch (error) {
    throw new Error(`Feedback email request failed: ${error.message}`);
  }

  if (response.status === 204) {
    return { ok: false, skipped: true };
  }

  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(body?.message || "Feedback email request failed.");
  }

  return body;
}

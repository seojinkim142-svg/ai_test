import { buildCorsHeaders, resolveAllowOrigin, sendJson, text } from "../../lib/feedback/server.js";
import { syncNaverFeedbackReplies } from "../../lib/feedback/naver-replies.js";

const extractBearerToken = (authHeader) => {
  const raw = text(authHeader);
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? text(match[1]) : "";
};

const isAuthorizedCronRequest = (req) => {
  const cronSecret = text(process.env.FEEDBACK_REPLY_SYNC_CRON_SECRET || process.env.CRON_SECRET);
  if (!cronSecret) return false;

  const requestCronSecret = text(req.headers["x-feedback-cron-secret"] || req.headers["X-Feedback-Cron-Secret"]);
  const bearerToken = extractBearerToken(req.headers.authorization || req.headers.Authorization);
  return requestCronSecret === cronSecret || bearerToken === cronSecret;
};

const resolveLimitParam = (req, key) => {
  const direct = req?.query?.[key];
  if (direct != null) return direct;

  try {
    const requestUrl = new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
    return requestUrl.searchParams.get(key);
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  const allowOrigin = resolveAllowOrigin(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  if (!isAuthorizedCronRequest(req)) {
    sendJson(res, 401, { message: "Unauthorized reply sync request." }, allowOrigin);
    return;
  }

  try {
    const result = await syncNaverFeedbackReplies({
      fetchCount: resolveLimitParam(req, "fetchCount"),
      lookbackDays: resolveLimitParam(req, "lookbackDays"),
    });

    sendJson(res, 200, result, allowOrigin);
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error?.message || "Feedback reply sync failed." }, allowOrigin);
  }
}

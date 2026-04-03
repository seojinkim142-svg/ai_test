import { authenticateSupabaseUserFromRequest } from "../../lib/billing/tier-sync.js";
import {
  buildCorsHeaders,
  getFeedbackReplyTableName,
  getFeedbackTableName,
  isMissingTableError,
  resolveAllowOrigin,
  sendJson,
  text,
  truncateText,
} from "../../lib/feedback/server.js";
import { syncNaverFeedbackReplies } from "../../lib/feedback/naver-replies.js";

const FEEDBACK_SELECT = "id, category, content, doc_name, panel, created_at";
const REPLY_SELECT = "id, feedback_id, responder_email, content, created_at";

const normalizeLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return fallback;
  return Math.min(normalized, 100);
};

const resolveLimitParam = (req) => {
  const direct = req?.query?.limit;
  if (direct != null) return direct;

  try {
    const requestUrl = new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
    return requestUrl.searchParams.get("limit");
  } catch {
    return null;
  }
};

const REPLY_SYNC_TIMEOUT_MS = 12000;

const syncRepliesOnDemand = async () => {
  try {
    await Promise.race([
      syncNaverFeedbackReplies(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Feedback reply sync timed out.")), REPLY_SYNC_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Reply sync is best-effort. We still return any replies already saved in the database.
  }
};

export default async function handler(req, res) {
  const allowOrigin = resolveAllowOrigin(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult?.ok) {
    sendJson(res, authResult?.status || 401, { message: authResult?.message || "Unauthorized." }, allowOrigin);
    return;
  }

  try {
    const limit = normalizeLimit(resolveLimitParam(req), 20);
    const feedbackTable = getFeedbackTableName();
    const replyTable = getFeedbackReplyTableName();
    const feedbackResult = await authResult.client
      .from(feedbackTable)
      .select(FEEDBACK_SELECT)
      .eq("user_id", authResult.userId)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 3, limit));

    if (feedbackResult.error) {
      throw feedbackResult.error;
    }

    const feedbackRows = Array.isArray(feedbackResult.data) ? feedbackResult.data : [];
    const feedbackById = new Map(
      feedbackRows
        .map((row) => [Number(row?.id), row])
        .filter(([feedbackId]) => Number.isFinite(feedbackId))
    );

    if (!feedbackById.size) {
      sendJson(res, 200, { ok: true, replies: [] }, allowOrigin);
      return;
    }

    await syncRepliesOnDemand();

    const replyResult = await authResult.client
      .from(replyTable)
      .select(REPLY_SELECT)
      .in("feedback_id", [...feedbackById.keys()])
      .order("created_at", { ascending: false })
      .limit(limit);

    if (replyResult.error) {
      if (isMissingTableError(replyResult.error, replyTable)) {
        sendJson(res, 200, { ok: true, replies: [] }, allowOrigin);
        return;
      }
      throw replyResult.error;
    }

    const replies = (Array.isArray(replyResult.data) ? replyResult.data : []).map((row) => {
      const feedback = feedbackById.get(Number(row?.feedback_id)) || null;
      return {
        id: Number(row?.id),
        feedbackId: Number(row?.feedback_id),
        responderEmail: text(row?.responder_email),
        content: text(row?.content),
        createdAt: text(row?.created_at),
        feedback: feedback
          ? {
              id: Number(feedback?.id),
              category: text(feedback?.category) || "general",
              content: text(feedback?.content),
              excerpt: truncateText(feedback?.content, 160),
              docName: text(feedback?.doc_name),
              panel: text(feedback?.panel),
              createdAt: text(feedback?.created_at),
            }
          : null,
      };
    });

    sendJson(res, 200, { ok: true, replies }, allowOrigin);
  } catch (error) {
    sendJson(res, 500, { message: error?.message || "Feedback replies request failed." }, allowOrigin);
  }
}

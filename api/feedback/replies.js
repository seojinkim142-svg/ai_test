import { authenticateSupabaseUserFromRequest } from "../../lib/billing/tier-sync.js";
import {
  buildCorsHeaders,
  getFeedbackReplyTableName,
  getFeedbackTableName,
  isMissingColumnError,
  isMissingTableError,
  parseRequestBody,
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

const resolveSyncErrorMessage = (error) => {
  const rawMessage = text(error?.responseText || error?.response || error?.message);
  if (error?.authenticationFailed || text(error?.serverResponseCode).toUpperCase() === "AUTH") {
    return "네이버 IMAP 로그인에 실패했습니다. 네이버 메일의 IMAP/SMTP 사용함, 2단계 인증, 애플리케이션 비밀번호를 다시 확인해 주세요.";
  }
  return rawMessage || "Feedback reply sync failed.";
};

const syncRepliesOnDemand = async () => {
  try {
    await Promise.race([
      syncNaverFeedbackReplies(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Feedback reply sync timed out.")), REPLY_SYNC_TIMEOUT_MS);
      }),
    ]);
    return "";
  } catch (error) {
    return resolveSyncErrorMessage(error);
  }
};

const loadReplyRow = async ({ client, replyId }) => {
  const replyTable = getFeedbackReplyTableName();
  const result = await client
    .from(replyTable)
    .select("id, feedback_id, content")
    .eq("id", replyId)
    .maybeSingle();

  if (result.error) {
    if (isMissingTableError(result.error, replyTable)) {
      return null;
    }
    throw result.error;
  }

  return result.data || null;
};

const loadFeedbackRow = async ({ client, feedbackId }) => {
  const feedbackTable = getFeedbackTableName();
  const result = await client
    .from(feedbackTable)
    .select("id, user_id")
    .eq("id", feedbackId)
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
};

const loadLatestVisibleReply = async ({ client, feedbackId }) => {
  const replyTable = getFeedbackReplyTableName();
  const result = await client
    .from(replyTable)
    .select("content, created_at")
    .eq("feedback_id", feedbackId)
    .neq("content", "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    if (isMissingTableError(result.error, replyTable)) {
      return null;
    }
    throw result.error;
  }

  return result.data || null;
};

const updateFeedbackReplySummary = async ({ client, feedbackId }) => {
  const feedbackTable = getFeedbackTableName();
  const latestReply = await loadLatestVisibleReply({ client, feedbackId });
  const payload = latestReply
    ? {
        status: "replied",
        last_replied_at: text(latestReply?.created_at) || new Date().toISOString(),
        last_reply_excerpt: truncateText(latestReply?.content, 180),
      }
    : {
        status: "open",
        last_replied_at: null,
        last_reply_excerpt: "",
      };

  const result = await client.from(feedbackTable).update(payload).eq("id", feedbackId).select("id").maybeSingle();
  if (result.error) {
    if (
      isMissingColumnError(result.error, "status") ||
      isMissingColumnError(result.error, "last_replied_at") ||
      isMissingColumnError(result.error, "last_reply_excerpt")
    ) {
      return false;
    }
    throw result.error;
  }

  return true;
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

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult?.ok) {
    sendJson(res, authResult?.status || 401, { message: authResult?.message || "Unauthorized." }, allowOrigin);
    return;
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
      return;
    }

    const replyId = Number(body?.replyId);
    if (!Number.isFinite(replyId) || replyId <= 0) {
      sendJson(res, 400, { message: "replyId is required." }, allowOrigin);
      return;
    }

    try {
      const { client, userId } = authResult;
      const reply = await loadReplyRow({ client, replyId });
      if (!reply?.id || !Number.isFinite(Number(reply?.feedback_id)) || !text(reply?.content)) {
        sendJson(res, 404, { message: "Feedback reply not found." }, allowOrigin);
        return;
      }

      const feedbackId = Number(reply.feedback_id);
      const feedback = await loadFeedbackRow({ client, feedbackId });
      if (!feedback?.id) {
        sendJson(res, 404, { message: "Feedback entry not found." }, allowOrigin);
        return;
      }

      if (text(feedback.user_id) !== text(userId)) {
        sendJson(res, 403, { message: "You can delete only your own feedback replies." }, allowOrigin);
        return;
      }

      const replyTable = getFeedbackReplyTableName();
      const deleteResult = await client
        .from(replyTable)
        .update({ content: "" })
        .eq("id", replyId)
        .eq("feedback_id", feedbackId)
        .select("id")
        .maybeSingle();

      if (deleteResult.error) throw deleteResult.error;
      if (!deleteResult.data?.id) {
        sendJson(res, 404, { message: "Feedback reply not found." }, allowOrigin);
        return;
      }

      await updateFeedbackReplySummary({ client, feedbackId });

      sendJson(
        res,
        200,
        {
          ok: true,
          replyId,
          feedbackId,
        },
        allowOrigin
      );
      return;
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Feedback reply delete failed." }, allowOrigin);
      return;
    }
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

    const syncError = await syncRepliesOnDemand();

    const replyResult = await authResult.client
      .from(replyTable)
      .select(REPLY_SELECT)
      .in("feedback_id", [...feedbackById.keys()])
      .neq("content", "")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (replyResult.error) {
      if (isMissingTableError(replyResult.error, replyTable)) {
        sendJson(res, 200, { ok: true, replies: [], syncError }, allowOrigin);
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

    sendJson(res, 200, { ok: true, replies, syncError }, allowOrigin);
  } catch (error) {
    sendJson(res, 500, { message: error?.message || "Feedback replies request failed." }, allowOrigin);
  }
}

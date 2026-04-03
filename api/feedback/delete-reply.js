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

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult?.ok) {
    sendJson(res, authResult?.status || 401, { message: authResult?.message || "Unauthorized." }, allowOrigin);
    return;
  }

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
  } catch (error) {
    sendJson(res, 500, { message: error?.message || "Feedback reply delete failed." }, allowOrigin);
  }
}

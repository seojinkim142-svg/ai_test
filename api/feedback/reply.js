import {
  authenticateFeedbackAdmin,
  buildCorsHeaders,
  getFeedbackReplyTableName,
  getFeedbackTableName,
  isMissingColumnError,
  isMissingTableError,
  loadFeedbackUserIdentity,
  parseRequestBody,
  resolveAllowOrigin,
  sendJson,
  text,
  truncateText,
} from "../../lib/feedback/server.js";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const EXTENDED_FEEDBACK_SELECT =
  "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at, user_email, user_name";
const BASE_FEEDBACK_SELECT = "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at";

const parseResendResponse = async (response) => {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
};

const sendWithResend = async ({ apiKey, from, to, subject, textBody, htmlBody, replyTo }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const payload = await parseResendResponse(response);
  if (!response.ok) {
    throw new Error(text(payload?.message || payload?.error || "Resend email request failed."));
  }

  return payload;
};

const escapeHtml = (value) =>
  text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const loadFeedbackRow = async ({ client, feedbackId }) => {
  const table = getFeedbackTableName();
  const extended = await client.from(table).select(EXTENDED_FEEDBACK_SELECT).eq("id", feedbackId).maybeSingle();
  if (!extended.error) return extended.data || null;

  if (!isMissingColumnError(extended.error, "user_email") && !isMissingColumnError(extended.error, "user_name")) {
    throw extended.error;
  }

  const fallback = await client.from(table).select(BASE_FEEDBACK_SELECT).eq("id", feedbackId).maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data || null;
};

const buildReplySubject = (feedback) => {
  const docName = text(feedback?.doc_name);
  return docName ? `[Zeusian Reply] ${docName}` : "[Zeusian Reply] Feedback response";
};

const buildReplyText = ({ replyContent, adminName, senderName, originalContent }) =>
  [
    `안녕하세요${senderName ? `, ${senderName}님` : ""}.`,
    "",
    "Zeusian 팀에서 피드백에 답변드립니다.",
    adminName ? `담당자: ${adminName}` : "",
    "",
    "[답변]",
    text(replyContent),
    "",
    "[보내주신 피드백]",
    text(originalContent),
  ]
    .filter(Boolean)
    .join("\n");

const buildReplyHtml = ({ replyContent, adminName, senderName, originalContent }) => `
  <div style="font-family:Arial,sans-serif;line-height:1.7;color:#0f172a;">
    <p style="margin:0 0 12px;">안녕하세요${senderName ? `, ${escapeHtml(senderName)}님` : ""}.</p>
    <p style="margin:0 0 16px;">Zeusian 팀에서 피드백에 답변드립니다.${adminName ? ` 담당자: ${escapeHtml(adminName)}` : ""}</p>
    <h3 style="margin:0 0 8px;">답변</h3>
    <div style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;">${escapeHtml(
      replyContent
    )}</div>
    <h3 style="margin:20px 0 8px;">보내주신 피드백</h3>
    <div style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;">${escapeHtml(
      originalContent
    )}</div>
  </div>
`;

const persistReplyRecord = async ({ client, feedbackId, responderUserId, responderEmail, content }) => {
  const replyTable = getFeedbackReplyTableName();
  const payload = {
    feedback_id: feedbackId,
    responder_user_id: responderUserId,
    responder_email: responderEmail || "",
    content,
  };

  const result = await client.from(replyTable).insert(payload).select("id").maybeSingle();
  if (result.error) {
    if (isMissingTableError(result.error, replyTable)) {
      return { stored: false, recordId: null };
    }
    throw result.error;
  }

  return {
    stored: true,
    recordId: result.data?.id || null,
  };
};

const updateFeedbackReplySummary = async ({ client, feedbackId, content }) => {
  const table = getFeedbackTableName();
  const now = new Date().toISOString();
  const payload = {
    status: "replied",
    last_replied_at: now,
    last_reply_excerpt: truncateText(content, 180),
  };

  const result = await client.from(table).update(payload).eq("id", feedbackId).select("id").maybeSingle();
  if (result.error) {
    if (
      isMissingColumnError(result.error, "status") ||
      isMissingColumnError(result.error, "last_replied_at") ||
      isMissingColumnError(result.error, "last_reply_excerpt")
    ) {
      return { updated: false, updatedAt: now };
    }
    throw result.error;
  }

  return {
    updated: true,
    updatedAt: now,
  };
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

  const adminAuth = await authenticateFeedbackAdmin(req);
  if (!adminAuth?.ok) {
    sendJson(res, adminAuth?.status || 403, { message: adminAuth?.message || "Forbidden." }, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
    return;
  }

  const feedbackId = Number(body?.feedbackId);
  const replyContent = text(body?.content);
  if (!Number.isFinite(feedbackId) || feedbackId <= 0) {
    sendJson(res, 400, { message: "feedbackId is required." }, allowOrigin);
    return;
  }
  if (!replyContent) {
    sendJson(res, 400, { message: "Reply content is required." }, allowOrigin);
    return;
  }

  const resendApiKey = text(process.env.RESEND_API_KEY);
  if (!resendApiKey) {
    sendJson(res, 500, { message: "RESEND_API_KEY is not set." }, allowOrigin);
    return;
  }

  try {
    const { client, userId } = adminAuth.authResult;
    const feedback = await loadFeedbackRow({ client, feedbackId });
    if (!feedback) {
      sendJson(res, 404, { message: "Feedback entry not found." }, allowOrigin);
      return;
    }

    const submitterIdentity = await loadFeedbackUserIdentity({
      client,
      userId: text(feedback.user_id),
    });
    const targetEmail = text(feedback.user_email) || submitterIdentity.userEmail || "";
    const targetName = text(feedback.user_name) || submitterIdentity.userName || "";
    if (!targetEmail || !targetEmail.includes("@")) {
      sendJson(res, 400, { message: "Feedback submitter email is not available." }, allowOrigin);
      return;
    }

    const fromEmail = text(process.env.FEEDBACK_FROM_EMAIL) || DEFAULT_FROM_EMAIL;
    const replyToEmail =
      text(process.env.FEEDBACK_REPLY_TO_EMAIL) ||
      text(process.env.FEEDBACK_NOTIFY_EMAIL).split(/[,\s]+/).filter(Boolean)[0] ||
      fromEmail;

    const result = await sendWithResend({
      apiKey: resendApiKey,
      from: fromEmail,
      to: [targetEmail],
      subject: buildReplySubject(feedback),
      textBody: buildReplyText({
        replyContent,
        adminName: adminAuth.adminName,
        senderName: targetName,
        originalContent: feedback.content,
      }),
      htmlBody: buildReplyHtml({
        replyContent,
        adminName: adminAuth.adminName,
        senderName: targetName,
        originalContent: feedback.content,
      }),
      replyTo: replyToEmail,
    });

    const [storeResult, summaryResult] = await Promise.all([
      persistReplyRecord({
        client,
        feedbackId,
        responderUserId: userId,
        responderEmail: adminAuth.adminEmail,
        content: replyContent,
      }),
      updateFeedbackReplySummary({
        client,
        feedbackId,
        content: replyContent,
      }),
    ]);

    sendJson(
      res,
      200,
      {
        ok: true,
        id: result?.id || null,
        feedbackId,
        sentTo: targetEmail,
        storedReply: storeResult.stored,
        replyRecordId: storeResult.recordId,
        updatedFeedback: summaryResult.updated,
        lastRepliedAt: summaryResult.updatedAt,
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: error?.message || "Feedback reply request failed." }, allowOrigin);
  }
}

import { authenticateSupabaseUserFromRequest } from "../../lib/billing/tier-sync.js";
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
import { syncNaverFeedbackReplies } from "../../lib/feedback/naver-replies.js";

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const CATEGORY_LABELS = {
  general: "General",
  bug: "Bug report",
  feature: "Feature request",
  ux: "UX feedback",
};
const LOCAL_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);
const FEEDBACK_SELECT = "id, category, content, doc_name, panel, created_at";
const REPLY_SELECT = "id, feedback_id, responder_email, content, created_at";
const EXTENDED_FEEDBACK_SELECT =
  "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at, user_email, user_name";
const BASE_FEEDBACK_SELECT = "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at";
const REPLY_SYNC_TIMEOUT_MS = 12000;

const normalizeOrigin = (value) => {
  const raw = text(value);
  if (!raw) return "";
  if (raw === "*") return "*";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const parseAllowedOrigins = (...values) => {
  const origins = new Set();
  values.forEach((value) => {
    String(value || "")
      .split(/[,\s]+/)
      .map((entry) => normalizeOrigin(entry))
      .filter(Boolean)
      .forEach((origin) => origins.add(origin));
  });
  return origins;
};

const readRequestStream = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });

const parseNotifyBody = async (req) => {
  if (req.body != null) {
    if (typeof req.body === "object") return req.body;
    if (Buffer.isBuffer(req.body)) {
      const parsed = req.body.toString("utf8").trim();
      return parsed ? JSON.parse(parsed) : {};
    }
    if (typeof req.body === "string") {
      const parsed = req.body.trim();
      return parsed ? JSON.parse(parsed) : {};
    }
  }

  const raw = (await readRequestStream(req)).trim();
  return raw ? JSON.parse(raw) : {};
};

const resolveRequestOrigin = (req) => {
  const directOrigin = text(req.headers.origin).split(",")[0];
  if (directOrigin) return directOrigin;

  const forwardedProto = text(req.headers["x-forwarded-proto"]).split(",")[0];
  const forwardedHost = text(req.headers["x-forwarded-host"]).split(",")[0];
  const host = text(req.headers.host).split(",")[0];
  const resolvedHost = forwardedHost || host;
  if (!resolvedHost) return "";

  const protocol =
    forwardedProto || (resolvedHost.startsWith("localhost") || resolvedHost.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${resolvedHost}`;
};

const resolveNotifyAllowOrigin = (req) => {
  const requestOrigin = normalizeOrigin(resolveRequestOrigin(req));
  const allowedOrigins = parseAllowedOrigins(
    process.env.FEEDBACK_ALLOW_ORIGIN,
    process.env.VITE_PUBLIC_APP_ORIGIN,
    "http://localhost",
    "https://localhost",
    "capacitor://localhost"
  );

  if (requestOrigin && (allowedOrigins.has(requestOrigin) || LOCAL_ORIGINS.has(requestOrigin))) {
    return requestOrigin;
  }
  if (allowedOrigins.has("*")) return "*";

  const firstAllowed = [...allowedOrigins][0];
  return firstAllowed || requestOrigin || "*";
};

const buildNotifyCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

const sendNotifyJson = (res, statusCode, body, allowOrigin) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildNotifyCorsHeaders(allowOrigin),
  });
  res.end(JSON.stringify(body));
};

const sendNoContent = (res, allowOrigin) => {
  res.writeHead(204, {
    "Cache-Control": "no-store",
    ...buildNotifyCorsHeaders(allowOrigin),
  });
  res.end();
};

const escapeHtml = (value) =>
  text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMetadata = (metadata) => {
  if (!metadata || typeof metadata !== "object") return "";
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return text(metadata);
  }
};

const buildSubject = ({ category, docName, feedbackId }) => {
  const categoryLabel = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  const normalizedDocName = text(docName);
  const token = Number.isFinite(Number(feedbackId)) && Number(feedbackId) > 0 ? `[FB-${Number(feedbackId)}]` : "";
  return normalizedDocName
    ? `[Zeusian Feedback]${token}[${categoryLabel}] ${normalizedDocName}`
    : `[Zeusian Feedback]${token}[${categoryLabel}]`;
};

const buildEmailText = ({ category, content, docId, docName, panel, metadata, userId, userEmail, userName, submittedAt }) => {
  const categoryLabel = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  const metadataText = formatMetadata(metadata);
  return [
    "A new Zeusian feedback submission has arrived.",
    "",
    `Category: ${categoryLabel} (${text(category) || "general"})`,
    `Submitted at: ${submittedAt}`,
    `User ID: ${text(userId) || "-"}`,
    `User name: ${text(userName) || "-"}`,
    `User email: ${text(userEmail) || "-"}`,
    `Document ID: ${text(docId) || "-"}`,
    `Document name: ${text(docName) || "-"}`,
    `Panel: ${text(panel) || "-"}`,
    "",
    "[Content]",
    text(content),
    metadataText
      ? `
[Metadata]
${metadataText}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildEmailHtml = ({ category, content, docId, docName, panel, metadata, userId, userEmail, userName, submittedAt }) => {
  const categoryLabel = CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  const metadataText = formatMetadata(metadata);
  const rows = [
    ["Category", `${escapeHtml(categoryLabel)} (${escapeHtml(category || "general")})`],
    ["Submitted at", escapeHtml(submittedAt)],
    ["User ID", escapeHtml(userId)],
    ["User name", escapeHtml(userName)],
    ["User email", escapeHtml(userEmail)],
    ["Document ID", escapeHtml(docId)],
    ["Document name", escapeHtml(docName)],
    ["Panel", escapeHtml(panel)],
  ];

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="margin:0 0 16px;">New Zeusian feedback</h2>
      <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
                <tr>
                  <th style="text-align:left;padding:8px 10px;border:1px solid #cbd5e1;background:#f8fafc;width:140px;">${label}</th>
                  <td style="padding:8px 10px;border:1px solid #cbd5e1;">${value || "-"}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <h3 style="margin:0 0 8px;">Content</h3>
      <div style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;">${escapeHtml(content)}</div>
      ${
        metadataText
          ? `<h3 style="margin:20px 0 8px;">Metadata</h3>
      <pre style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;overflow:auto;">${escapeHtml(
        metadataText
      )}</pre>`
          : ""
      }
    </div>
  `;
};

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

const resolveSyncErrorMessage = (error) => {
  const rawMessage = text(error?.responseText || error?.response || error?.message);
  if (error?.authenticationFailed || text(error?.serverResponseCode).toUpperCase() === "AUTH") {
    return "?ㅼ씠踰?IMAP 濡쒓렇?몄뿉 ?ㅽ뙣?덉뒿?덈떎. ?ㅼ씠踰?硫붿씪??IMAP/SMTP ?ъ슜?? 2?④퀎 ?몄쬆, ?좏뵆由ъ??댁뀡 鍮꾨?踰덊샇瑜??ㅼ떆 ?뺤씤??二쇱꽭??";
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

const buildReplySubject = (feedback) => {
  const docName = text(feedback?.doc_name);
  return docName ? `[Zeusian Reply] ${docName}` : "[Zeusian Reply] Feedback response";
};

const buildReplyText = ({ replyContent, adminName, senderName, originalContent }) =>
  [
    `?덈뀞?섏꽭??{senderName ? `, ${senderName}?? : ""}.`,
    "",
    "Zeusian ?댁쁺?먯뿉???쇰뱶諛깆뿉 ?듬??쒕┰?덈떎.",
    adminName ? `?대떦?? ${adminName}` : "",
    "",
    "[?듬?]",
    text(replyContent),
    "",
    "[蹂대궡二쇱떊 ?쇰뱶諛?",
    text(originalContent),
  ]
    .filter(Boolean)
    .join("\n");

const buildReplyHtml = ({ replyContent, adminName, senderName, originalContent }) => `
  <div style="font-family:Arial,sans-serif;line-height:1.7;color:#0f172a;">
    <p style="margin:0 0 12px;">?덈뀞?섏꽭??{senderName ? `, ${escapeHtml(senderName)}?? : ""}.</p>
    <p style="margin:0 0 16px;">Zeusian ?댁쁺?먯뿉???쇰뱶諛깆뿉 ?듬??쒕┰?덈떎.${adminName ? ` ?대떦?? ${escapeHtml(adminName)}` : ""}</p>
    <h3 style="margin:0 0 8px;">?듬?</h3>
    <div style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;">${escapeHtml(
      replyContent
    )}</div>
    <h3 style="margin:20px 0 8px;">蹂대궡二쇱떊 ?쇰뱶諛?/h3>
    <div style="white-space:pre-wrap;padding:14px;border:1px solid #cbd5e1;background:#f8fafc;">${escapeHtml(
      originalContent
    )}</div>
  </div>
`;

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

const loadReplyTargetFeedbackRow = async ({ client, feedbackId }) => {
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

const resolveAction = (req) => {
  const queryAction = req?.query?.action;
  if (Array.isArray(queryAction) && queryAction.length) return text(queryAction[0]);
  if (queryAction != null) return text(queryAction);

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);
    return text(parts[parts.length - 1]);
  } catch {
    return "";
  }
};

const sendNotFound = (res) => {
  res.writeHead(404, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ message: "Not found." }));
};

const notifyHandler = async (req, res) => {
  const allowOrigin = resolveNotifyAllowOrigin(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildNotifyCorsHeaders(allowOrigin));
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendNotifyJson(res, 405, { message: "Method not allowed." }, allowOrigin);
    return;
  }

  const provider = text(process.env.FEEDBACK_EMAIL_PROVIDER || "resend").toLowerCase();
  const recipients = text(process.env.FEEDBACK_NOTIFY_EMAIL)
    .split(/[,\s]+/)
    .filter(Boolean);
  const resendApiKey = text(process.env.RESEND_API_KEY);
  if (!recipients.length || provider !== "resend" || !resendApiKey) {
    sendNoContent(res, allowOrigin);
    return;
  }

  let body;
  try {
    body = await parseNotifyBody(req);
  } catch {
    sendNotifyJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
    return;
  }

  const content = text(body?.content);
  if (!content) {
    sendNotifyJson(res, 400, { message: "Feedback content is required." }, allowOrigin);
    return;
  }

  const userEmail = text(body?.userEmail);
  const payload = {
    feedbackId: Number.isFinite(Number(body?.feedbackId)) ? Number(body.feedbackId) : null,
    category: text(body?.category) || "general",
    content,
    docId: text(body?.docId),
    docName: text(body?.docName),
    panel: text(body?.panel),
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : null,
    userId: text(body?.userId),
    userEmail,
    userName: text(body?.userName),
    submittedAt: new Date().toISOString(),
  };

  const fromEmail = text(process.env.FEEDBACK_FROM_EMAIL) || DEFAULT_FROM_EMAIL;
  const subject = buildSubject(payload);
  const textBody = buildEmailText(payload);
  const htmlBody = buildEmailHtml(payload);

  try {
    const result = await sendWithResend({
      apiKey: resendApiKey,
      from: fromEmail,
      to: recipients,
      subject,
      textBody,
      htmlBody,
      replyTo: userEmail && userEmail.includes("@") ? userEmail : "",
    });
    sendNotifyJson(res, 200, { ok: true, id: result?.id || null }, allowOrigin);
  } catch (error) {
    sendNotifyJson(res, 502, { message: `Feedback email request failed: ${error.message}` }, allowOrigin);
  }
};

const repliesHandler = async (req, res) => {
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

  if (req.method === "POST") {
    let body;
    try {
      body = await parseRequestBody(req);
    } catch {
      sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
      return;
    }

    const replyId = Number(body?.replyId);
    const feedbackId = Number(body?.feedbackId);
    const replyContent = text(body?.content);

    if (Number.isFinite(replyId) && replyId > 0) {
      const authResult = await authenticateSupabaseUserFromRequest(req);
      if (!authResult?.ok) {
        sendJson(res, authResult?.status || 401, { message: authResult?.message || "Unauthorized." }, allowOrigin);
        return;
      }

      try {
        const { client, userId } = authResult;
        const reply = await loadReplyRow({ client, replyId });
        if (!reply?.id || !Number.isFinite(Number(reply?.feedback_id)) || !text(reply?.content)) {
          sendJson(res, 404, { message: "Feedback reply not found." }, allowOrigin);
          return;
        }

        const deleteFeedbackId = Number(reply.feedback_id);
        const feedback = await loadFeedbackRow({ client, feedbackId: deleteFeedbackId });
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
          .eq("feedback_id", deleteFeedbackId)
          .select("id")
          .maybeSingle();

        if (deleteResult.error) throw deleteResult.error;
        if (!deleteResult.data?.id) {
          sendJson(res, 404, { message: "Feedback reply not found." }, allowOrigin);
          return;
        }

        await updateFeedbackReplySummary({ client, feedbackId: deleteFeedbackId });

        sendJson(
          res,
          200,
          {
            ok: true,
            replyId,
            feedbackId: deleteFeedbackId,
          },
          allowOrigin
        );
        return;
      } catch (error) {
        sendJson(res, 500, { message: error?.message || "Feedback reply delete failed." }, allowOrigin);
        return;
      }
    }

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

    const adminAuth = await authenticateFeedbackAdmin(req);
    if (!adminAuth?.ok) {
      sendJson(res, adminAuth?.status || 403, { message: adminAuth?.message || "Forbidden." }, allowOrigin);
      return;
    }

    try {
      const { client, userId } = adminAuth.authResult;
      const feedback = await loadReplyTargetFeedbackRow({ client, feedbackId });
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

      const storeResult = await persistReplyRecord({
        client,
        feedbackId,
        responderUserId: userId,
        responderEmail: adminAuth.adminEmail,
        content: replyContent,
      });
      await updateFeedbackReplySummary({
        client,
        feedbackId,
      });

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
        },
        allowOrigin
      );
      return;
    } catch (error) {
      sendJson(res, 500, { message: error?.message || "Feedback reply request failed." }, allowOrigin);
      return;
    }
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
        .filter(([mappedFeedbackId]) => Number.isFinite(mappedFeedbackId))
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
};

const ROUTE_HANDLERS = {
  notify: notifyHandler,
  replies: repliesHandler,
};

export default async function handler(req, res) {
  const routeHandler = ROUTE_HANDLERS[resolveAction(req)];
  if (!routeHandler) {
    sendNotFound(res);
    return;
  }

  await routeHandler(req, res);
}

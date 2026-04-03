import {
  authenticateFeedbackAdmin,
  buildCorsHeaders,
  getFeedbackReplyTableName,
  getFeedbackTableName,
  isMissingColumnError,
  isMissingTableError,
  loadFeedbackUserIdentity,
  resolveAllowOrigin,
  sendJson,
  text,
  truncateText,
} from "../../lib/feedback/server.js";

const EXTENDED_FEEDBACK_SELECT =
  "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at, user_email, user_name, status, last_replied_at, last_reply_excerpt";
const BASE_FEEDBACK_SELECT = "id, user_id, category, content, doc_id, doc_name, panel, metadata_json, created_at";
const REPLY_SELECT = "feedback_id, content, created_at, responder_email";

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

const loadFeedbackRows = async ({ client, limit }) => {
  const table = getFeedbackTableName();
  const extended = await client
    .from(table)
    .select(EXTENDED_FEEDBACK_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!extended.error) {
    return {
      rows: Array.isArray(extended.data) ? extended.data : [],
      hasExtendedColumns: true,
    };
  }

  if (
    !isMissingColumnError(extended.error, "user_email") &&
    !isMissingColumnError(extended.error, "user_name") &&
    !isMissingColumnError(extended.error, "status") &&
    !isMissingColumnError(extended.error, "last_replied_at") &&
    !isMissingColumnError(extended.error, "last_reply_excerpt")
  ) {
    throw extended.error;
  }

  const fallback = await client
    .from(table)
    .select(BASE_FEEDBACK_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (fallback.error) throw fallback.error;
  return {
    rows: Array.isArray(fallback.data) ? fallback.data : [],
    hasExtendedColumns: false,
  };
};

const loadReplyRows = async ({ client, feedbackIds }) => {
  if (!Array.isArray(feedbackIds) || !feedbackIds.length) {
    return {
      rows: [],
      available: true,
    };
  }

  const replyTable = getFeedbackReplyTableName();
  const result = await client
    .from(replyTable)
    .select(REPLY_SELECT)
    .in("feedback_id", feedbackIds)
    .neq("content", "")
    .order("created_at", { ascending: false });

  if (!result.error) {
    return {
      rows: Array.isArray(result.data) ? result.data : [],
      available: true,
    };
  }

  if (isMissingTableError(result.error, replyTable)) {
    return {
      rows: [],
      available: false,
    };
  }

  throw result.error;
};

const buildReplySummaryMap = (replyRows) => {
  const summary = new Map();
  (Array.isArray(replyRows) ? replyRows : []).forEach((row) => {
    const feedbackId = Number(row?.feedback_id);
    if (!Number.isFinite(feedbackId)) return;

    const existing = summary.get(feedbackId) || {
      count: 0,
      latestReplyAt: "",
      latestReplyExcerpt: "",
      latestResponderEmail: "",
    };

    existing.count += 1;
    if (!existing.latestReplyAt) {
      existing.latestReplyAt = text(row?.created_at);
      existing.latestReplyExcerpt = truncateText(row?.content, 180);
      existing.latestResponderEmail = text(row?.responder_email);
    }

    summary.set(feedbackId, existing);
  });
  return summary;
};

const loadFeedbackUserIdentities = async ({ client, rows }) => {
  const userIds = [...new Set((rows || []).map((row) => text(row?.user_id)).filter(Boolean))];
  const identityEntries = await Promise.all(
    userIds.map(async (userId) => {
      const identity = await loadFeedbackUserIdentity({ client, userId });
      return [userId, identity];
    })
  );
  return new Map(identityEntries);
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

  const adminAuth = await authenticateFeedbackAdmin(req);
  if (!adminAuth?.ok) {
    sendJson(res, adminAuth?.status || 403, { message: adminAuth?.message || "Forbidden." }, allowOrigin);
    return;
  }

  try {
    const limit = normalizeLimit(resolveLimitParam(req), 20);
    const { client } = adminAuth.authResult;
    const feedbackResult = await loadFeedbackRows({ client, limit });
    const feedbackIds = feedbackResult.rows.map((row) => Number(row?.id)).filter(Number.isFinite);
    const [replyResult, identityMap] = await Promise.all([
      loadReplyRows({ client, feedbackIds }),
      loadFeedbackUserIdentities({ client, rows: feedbackResult.rows }),
    ]);
    const replySummaryMap = buildReplySummaryMap(replyResult.rows);

    const feedback = feedbackResult.rows.map((row) => {
      const feedbackId = Number(row?.id);
      const identity = identityMap.get(text(row?.user_id)) || {
        userEmail: "",
        userName: "",
      };
      const replySummary = replySummaryMap.get(feedbackId) || {
        count: 0,
        latestReplyAt: "",
        latestReplyExcerpt: "",
        latestResponderEmail: "",
      };
      const userEmail = text(row?.user_email) || identity.userEmail || "";
      const userName = text(row?.user_name) || identity.userName || "";
      const lastReplyAt = text(row?.last_replied_at) || replySummary.latestReplyAt || "";
      const lastReplyExcerpt = text(row?.last_reply_excerpt) || replySummary.latestReplyExcerpt || "";

      return {
        id: feedbackId,
        userId: text(row?.user_id),
        userEmail,
        userName,
        category: text(row?.category) || "general",
        content: text(row?.content),
        docId: text(row?.doc_id),
        docName: text(row?.doc_name),
        panel: text(row?.panel),
        metadata: row?.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : null,
        createdAt: text(row?.created_at),
        status: text(row?.status) || (lastReplyAt ? "replied" : "open"),
        lastRepliedAt: lastReplyAt || null,
        lastReplyExcerpt: lastReplyExcerpt || "",
        replyCount: replySummary.count,
        lastResponderEmail: replySummary.latestResponderEmail || "",
      };
    });

    sendJson(
      res,
      200,
      {
        ok: true,
        feedback,
        admin: {
          email: adminAuth.adminEmail,
          name: adminAuth.adminName || "",
        },
      },
      allowOrigin
    );
  } catch (error) {
    sendJson(res, 500, { message: error?.message || "Feedback inbox request failed." }, allowOrigin);
  }
}

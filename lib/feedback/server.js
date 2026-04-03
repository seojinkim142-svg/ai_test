import { authenticateSupabaseUserFromRequest } from "../billing/tier-sync.js";

const LOCAL_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);
const FEEDBACK_TABLE = text(process.env.SUPABASE_FEEDBACK_TABLE || process.env.VITE_SUPABASE_FEEDBACK_TABLE || "user_feedback");
const FEEDBACK_REPLY_TABLE = text(
  process.env.SUPABASE_FEEDBACK_REPLY_TABLE || process.env.VITE_SUPABASE_FEEDBACK_REPLY_TABLE || "user_feedback_replies"
);

export function text(value) {
  return String(value ?? "").trim();
}

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

export const parseRequestBody = async (req) => {
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

export const resolveAllowOrigin = (req) => {
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

export const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  Vary: "Origin",
});

export const sendJson = (res, statusCode, body, allowOrigin) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  });
  res.end(JSON.stringify(body));
};

export const sendNoContent = (res, allowOrigin) => {
  res.writeHead(204, {
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  });
  res.end();
};

const normalizeEmail = (value) => text(value).toLowerCase();

export const resolveFeedbackAdminEmails = () => {
  const emails = new Set();
  [process.env.FEEDBACK_ADMIN_EMAILS, process.env.FEEDBACK_NOTIFY_EMAIL].forEach((value) => {
    String(value || "")
      .split(/[,\s]+/)
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
      .forEach((entry) => emails.add(entry));
  });
  return emails;
};

export const normalizeFeedbackUserName = (user) => {
  const userMetadata = user?.user_metadata && typeof user.user_metadata === "object" ? user.user_metadata : {};
  return (
    text(userMetadata?.name) ||
    text(userMetadata?.full_name) ||
    text(userMetadata?.nickname) ||
    text(userMetadata?.user_name) ||
    text(user?.email).split("@")[0] ||
    ""
  );
};

export const loadFeedbackUserIdentity = async ({ client, userId }) => {
  if (!client || !userId) return { user: null, userEmail: "", userName: "" };

  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    return { user: null, userEmail: "", userName: "" };
  }

  return {
    user: data.user,
    userEmail: text(data.user.email),
    userName: normalizeFeedbackUserName(data.user),
  };
};

export const authenticateFeedbackAdmin = async (req) => {
  const authResult = await authenticateSupabaseUserFromRequest(req);
  if (!authResult?.ok) return authResult;

  const identity = await loadFeedbackUserIdentity({
    client: authResult.client,
    userId: authResult.userId,
  });
  const adminEmail = normalizeEmail(identity.userEmail);
  const allowedEmails = resolveFeedbackAdminEmails();

  if (!adminEmail || !allowedEmails.has(adminEmail)) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Feedback admin access is not allowed for this account.",
    };
  }

  return {
    ok: true,
    status: 200,
    authResult,
    adminEmail,
    adminName: identity.userName,
    adminUser: identity.user,
  };
};

export const isMissingColumnError = (error, columnName) => {
  if (!error || !columnName) return false;
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes(String(columnName).toLowerCase());
};

export const isMissingTableError = (error, tableName) => {
  if (!error || !tableName) return false;
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes(String(tableName).toLowerCase());
};

export const getFeedbackTableName = () => FEEDBACK_TABLE;
export const getFeedbackReplyTableName = () => FEEDBACK_REPLY_TABLE;

export const truncateText = (value, maxLength = 140) => {
  const normalized = text(value);
  if (!normalized || normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

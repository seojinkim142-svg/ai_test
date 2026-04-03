const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const CATEGORY_LABELS = {
  general: "General",
  bug: "Bug report",
  feature: "Feature request",
  ux: "UX feedback",
};
const LOCAL_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

const text = (value) => String(value ?? "").trim();

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

const parseRequestBody = async (req) => {
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

const resolveAllowOrigin = (req) => {
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

const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

const sendJson = (res, statusCode, body, allowOrigin) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  });
  res.end(JSON.stringify(body));
};

const sendNoContent = (res, allowOrigin) => {
  res.writeHead(204, {
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
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
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
    return;
  }

  const content = text(body?.content);
  if (!content) {
    sendJson(res, 400, { message: "Feedback content is required." }, allowOrigin);
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
    sendJson(res, 200, { ok: true, id: result?.id || null }, allowOrigin);
  } catch (error) {
    sendJson(res, 502, { message: `Feedback email request failed: ${error.message}` }, allowOrigin);
  }
}

import crypto from "node:crypto";

const DEFAULT_API_BASE = "https://sandbox-api.nicepay.co.kr";
const DEFAULT_LOCAL_ORIGIN = "http://localhost:5173";
const TOKEN_TTL_MS = 15 * 60 * 1000;

const text = (value) => String(value ?? "").trim();

const resolveVercelOrigin = () => {
  const vercelUrl = text(process.env.VERCEL_URL).replace(/^https?:\/\//, "");
  if (!vercelUrl) return "";
  return `https://${vercelUrl}`;
};

const resolveRequestOrigin = (req) => {
  const forwardedProto = text(req.headers["x-forwarded-proto"]).split(",")[0];
  const forwardedHost = text(req.headers["x-forwarded-host"]).split(",")[0];
  const host = text(req.headers.host).split(",")[0];
  const resolvedHost = forwardedHost || host;
  if (!resolvedHost) return "";

  const protocol =
    forwardedProto || (resolvedHost.startsWith("localhost") || resolvedHost.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${resolvedHost}`;
};

const parseRawBody = (raw, contentType) => {
  if (!raw) return {};
  if (String(contentType || "").includes("application/json")) {
    return JSON.parse(raw);
  }

  const form = new URLSearchParams(raw);
  const parsed = {};
  for (const [key, value] of form.entries()) {
    parsed[key] = value;
  }
  return parsed;
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

export const getRuntimeConfig = (req) => {
  const clientId = text(process.env.NICEPAYMENTS_CLIENT_ID || process.env.NICEPAYMENTS_CLIENT_KEY);
  const secretKey = text(process.env.NICEPAYMENTS_SECRET_KEY);
  const apiBase = text(process.env.NICEPAYMENTS_API_BASE) || DEFAULT_API_BASE;
  const fallbackOrigin = resolveVercelOrigin() || resolveRequestOrigin(req) || DEFAULT_LOCAL_ORIGIN;
  const clientOrigin = text(process.env.NICEPAYMENTS_CLIENT_ORIGIN) || fallbackOrigin;
  const allowOrigin = text(process.env.NICEPAYMENTS_ALLOW_ORIGIN) || clientOrigin;

  return {
    clientId,
    secretKey,
    apiBase,
    clientOrigin,
    allowOrigin,
  };
};

export const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export const sendJson = (res, statusCode, body, allowOrigin) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (allowOrigin) {
    Object.assign(headers, buildCorsHeaders(allowOrigin));
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
};

export const parseRequestBody = async (req) => {
  if (req.body != null) {
    if (typeof req.body === "object") return req.body;
    if (Buffer.isBuffer(req.body)) {
      return parseRawBody(req.body.toString("utf8"), req.headers["content-type"]);
    }
    if (typeof req.body === "string") {
      return parseRawBody(req.body, req.headers["content-type"]);
    }
  }

  const raw = await readRequestStream(req);
  return parseRawBody(raw, req.headers["content-type"]);
};

export const buildNiceSignature = ({ authToken, clientId, amount, secretKey }) =>
  crypto.createHash("sha256").update(`${authToken}${clientId}${amount}${secretKey}`).digest("hex");

export const makeNiceApiUrl = (apiBase, path) => `${apiBase.replace(/\/$/, "")}${path}`;

export const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signPaymentToken = (payloadPart, secretKey) =>
  crypto.createHmac("sha256", secretKey).update(payloadPart).digest("base64url");

export const createPaymentToken = (payload, secretKey) => {
  const envelope = {
    ...payload,
    exp: Date.now() + TOKEN_TTL_MS,
  };

  const payloadPart = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signaturePart = signPaymentToken(payloadPart, secretKey);
  return `${payloadPart}.${signaturePart}`;
};

export const verifyPaymentToken = (token, secretKey) => {
  if (!token || !secretKey) return null;

  const parts = String(token).split(".");
  if (parts.length !== 2) return null;

  const [payloadPart, signaturePart] = parts;
  const expected = signPaymentToken(payloadPart, secretKey);
  if (!safeEqual(signaturePart, expected)) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const expiresAt = Number(parsed?.exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  return parsed;
};

export const redirectToClient = (res, clientOrigin, params) => {
  let location;
  try {
    const target = new URL(clientOrigin || DEFAULT_LOCAL_ORIGIN);
    if (params.state) target.searchParams.set("nicePay", params.state);
    if (params.token) target.searchParams.set("np_token", params.token);
    if (params.orderId) target.searchParams.set("orderId", params.orderId);
    if (params.amount != null) target.searchParams.set("amount", String(params.amount));
    if (params.message) target.searchParams.set("message", params.message);
    location = target.toString();
  } catch {
    location = DEFAULT_LOCAL_ORIGIN;
  }

  res.writeHead(302, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
};

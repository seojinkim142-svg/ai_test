/* global process, Buffer */
import crypto from "node:crypto";

const DEFAULT_API_BASE = "https://sandbox-api.nicepay.co.kr";
const DEFAULT_BILLING_API_BASE = "https://webapi.nicepay.co.kr";
const DEFAULT_BILLING_SCRIPT_URL = "https://pg-web.nicepay.co.kr/v3/common/js/nicepay-pgweb.js";
const DEFAULT_LOCAL_ORIGIN = "http://localhost:5173";
const TOKEN_TTL_MS = 15 * 60 * 1000;
const NATIVE_APP_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

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
  const billingMid = text(process.env.NICEPAYMENTS_BILLING_MID || clientId);
  const billingMerchantKey = text(process.env.NICEPAYMENTS_BILLING_MERCHANT_KEY || secretKey);
  const billingApiBase = text(process.env.NICEPAYMENTS_BILLING_API_BASE) || DEFAULT_BILLING_API_BASE;
  const billingScriptUrl = text(process.env.NICEPAYMENTS_BILLING_SCRIPT_URL) || DEFAULT_BILLING_SCRIPT_URL;
  const requestOrigin = normalizeOrigin(resolveRequestOrigin(req));
  const vercelOrigin = normalizeOrigin(resolveVercelOrigin());
  const fallbackOrigin = requestOrigin || vercelOrigin || DEFAULT_LOCAL_ORIGIN;
  const clientOrigin = normalizeOrigin(process.env.NICEPAYMENTS_CLIENT_ORIGIN) || fallbackOrigin;
  const allowedOrigins = parseAllowedOrigins(
    process.env.NICEPAYMENTS_ALLOW_ORIGIN,
    clientOrigin,
    requestOrigin,
    vercelOrigin,
    "http://localhost",
    "https://localhost",
    "capacitor://localhost"
  );
  const allowOrigin =
    requestOrigin && (allowedOrigins.has(requestOrigin) || NATIVE_APP_ORIGINS.has(requestOrigin))
      ? requestOrigin
      : allowedOrigins.has("*")
        ? "*"
        : [...allowedOrigins][0] || clientOrigin;

  return {
    clientId,
    secretKey,
    apiBase,
    billingMid,
    billingMerchantKey,
    billingApiBase,
    billingScriptUrl,
    clientOrigin,
    allowOrigin,
  };
};

export const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export const sha256Hex = (...values) =>
  crypto.createHash("sha256").update(values.map((value) => String(value ?? "")).join("")).digest("hex");

export const formatNiceEdiDate = (dateInput = new Date()) => {
  const date = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
};

export const makeNiceApiUrl = (apiBase, path) => `${apiBase.replace(/\/$/, "")}${path}`;

export const parseNiceJsonResponse = async (response) => {
  const textBody = await response.text();
  try {
    return textBody ? JSON.parse(textBody) : {};
  } catch {
    return { raw: textBody };
  }
};

export const requestNiceBillingApi = async ({ apiBase, path, payload }) => {
  const response = await fetch(makeNiceApiUrl(apiBase, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams(payload).toString(),
  });
  const data = await parseNiceJsonResponse(response);
  return { ok: response.ok, status: response.status, data };
};

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

export const validateNiceBillingConfig = ({ billingMid, billingMerchantKey, billingApiBase }) => {
  if (!text(billingMid)) {
    return "NICEPAYMENTS_BILLING_MID is not set.";
  }
  if (!text(billingMerchantKey)) {
    return "NICEPAYMENTS_BILLING_MERCHANT_KEY is not set.";
  }
  if (!text(billingApiBase)) {
    return "NICEPAYMENTS_BILLING_API_BASE is not set.";
  }
  return "";
};

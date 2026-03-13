/* global process, Buffer */
const DEFAULT_API_BASE = "https://open-api.kakaopay.com";
const DEFAULT_LOCAL_ORIGIN = "http://localhost:5173";
const DEFAULT_CID = "TC0ONETIME";
const DEFAULT_READY_PATH = "/online/v1/payment/ready";
const DEFAULT_APPROVE_PATH = "/online/v1/payment/approve";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const text = (value) => String(value ?? "").trim();
const OPEN_API_HOST = "open-api.kakaopay.com";

const normalizeAuthScheme = (value) => {
  const normalized = text(value).toUpperCase();
  if (!normalized) return "";
  if (normalized === "KAKAOAK") return "KakaoAK";
  if (normalized === "SECRET_KEY") return "SECRET_KEY";
  if (normalized === "DEV_SECRET_KEY") return "DEV_SECRET_KEY";
  return "";
};

const inferAuthScheme = ({ apiBase, secretKey }) => {
  if (String(apiBase || "").includes(OPEN_API_HOST)) {
    return String(secretKey || "").startsWith("DEV") ? "DEV_SECRET_KEY" : "SECRET_KEY";
  }
  return "KakaoAK";
};

const resolveAuthScheme = ({ apiBase, secretKey, explicitAuthScheme }) => {
  const inferred = inferAuthScheme({ apiBase, secretKey });
  const normalizedExplicit = normalizeAuthScheme(explicitAuthScheme);
  if (!normalizedExplicit) return inferred;

  const useOpenApi = String(apiBase || "").includes(OPEN_API_HOST);
  const explicitIsLegacy = normalizedExplicit === "KakaoAK";
  const explicitIsOpenApi =
    normalizedExplicit === "SECRET_KEY" || normalizedExplicit === "DEV_SECRET_KEY";

  // Guard against mismatched env combinations:
  // - open-api host + KakaoAK
  // - legacy host + SECRET_KEY/DEV_SECRET_KEY
  if ((useOpenApi && explicitIsLegacy) || (!useOpenApi && explicitIsOpenApi)) {
    return inferred;
  }
  if (useOpenApi && explicitIsOpenApi && normalizedExplicit !== inferred) {
    return inferred;
  }
  return normalizedExplicit;
};

export const validateKakaoRuntimeConfig = ({ secretKey, cid, apiBase }) => {
  const normalizedSecretKey = text(secretKey);
  const normalizedCid = text(cid);
  const useOpenApi = String(apiBase || "").includes(OPEN_API_HOST);
  if (!useOpenApi || !normalizedSecretKey) return "";

  const isDevSecret = normalizedSecretKey.startsWith("DEV");
  const isDefaultCid = normalizedCid === DEFAULT_CID;

  if (!isDevSecret && isDefaultCid) {
    return "KAKAOPAY_CID is still set to the test value TC0ONETIME. Set your production CID.";
  }

  if (isDevSecret && normalizedCid && normalizedCid !== DEFAULT_CID) {
    return "KAKAOPAY_SECRET_KEY looks like a dev key while KAKAOPAY_CID looks like a production CID.";
  }

  return "";
};

const isLocalHostOrigin = (value) => {
  const origin = normalizeOrigin(value);
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    return LOCAL_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
};

const hasNonHttpsOrigin = (value) => {
  const origin = normalizeOrigin(value);
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    return parsed.protocol !== "https:";
  } catch {
    return false;
  }
};

const normalizeOrigin = (value) => {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const normalizeAllowOrigin = (value) => {
  const raw = text(value);
  if (!raw) return "";
  if (raw === "*") return "*";
  return normalizeOrigin(raw);
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
  const secretKey = text(process.env.KAKAOPAY_SECRET_KEY || process.env.KAKAOPAY_ADMIN_KEY);
  const cid = text(process.env.KAKAOPAY_CID) || DEFAULT_CID;
  const apiBase = text(process.env.KAKAOPAY_API_BASE) || DEFAULT_API_BASE;
  const explicitAuthScheme = process.env.KAKAOPAY_AUTH_SCHEME;
  const inferredAuthScheme = resolveAuthScheme({
    apiBase,
    secretKey,
    explicitAuthScheme,
  });
  const readyPath =
    text(process.env.KAKAOPAY_READY_PATH) ||
    (inferredAuthScheme === "KakaoAK" ? "/v1/payment/ready" : DEFAULT_READY_PATH);
  const approvePath =
    text(process.env.KAKAOPAY_APPROVE_PATH) ||
    (inferredAuthScheme === "KakaoAK" ? "/v1/payment/approve" : DEFAULT_APPROVE_PATH);
  const fallbackOrigin = normalizeOrigin(resolveVercelOrigin()) || normalizeOrigin(resolveRequestOrigin(req)) || DEFAULT_LOCAL_ORIGIN;
  const clientOrigin = normalizeOrigin(process.env.KAKAOPAY_CLIENT_ORIGIN) || fallbackOrigin;
  const allowOrigin = normalizeAllowOrigin(process.env.KAKAOPAY_ALLOW_ORIGIN) || clientOrigin;

  return {
    secretKey,
    cid,
    apiBase,
    authScheme: inferredAuthScheme,
    readyPath,
    approvePath,
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

export const makeKakaoApiUrl = (apiBase, path) => `${apiBase.replace(/\/$/, "")}${path}`;

export const validateKakaoReadyUrls = ({ secretKey, apiBase, approvalUrl, cancelUrl, failUrl }) => {
  const normalizedSecretKey = text(secretKey);
  const useOpenApi = String(apiBase || "").includes(OPEN_API_HOST);
  if (!useOpenApi || !normalizedSecretKey || normalizedSecretKey.startsWith("DEV")) return "";

  const urls = [approvalUrl, cancelUrl, failUrl].map((value) => text(value)).filter(Boolean);
  if (urls.some(isLocalHostOrigin)) {
    return "Production KakaoPay cannot use localhost approval/cancel/fail URLs. Set VITE_PUBLIC_APP_ORIGIN and KAKAOPAY_CLIENT_ORIGIN to your public HTTPS domain and test there.";
  }

  if (urls.some(hasNonHttpsOrigin)) {
    return "Production KakaoPay approval/cancel/fail URLs must use HTTPS.";
  }

  return "";
};

export const parseApiResponse = async (response) => {
  const textBody = await response.text();
  let data;
  try {
    data = textBody ? JSON.parse(textBody) : {};
  } catch {
    data = { raw: textBody };
  }
  return data;
};

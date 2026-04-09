const text = (value) => String(value ?? "").trim();
const NATIVE_APP_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

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
  if (!raw) return {};
  return JSON.parse(raw);
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
    process.env.OPENAI_ALLOW_ORIGIN,
    process.env.VITE_PUBLIC_APP_ORIGIN,
    "http://localhost",
    "https://localhost",
    "capacitor://localhost"
  );

  if (requestOrigin && (allowedOrigins.has(requestOrigin) || NATIVE_APP_ORIGINS.has(requestOrigin))) {
    return requestOrigin;
  }

  if (allowedOrigins.has("*")) return "*";

  const firstAllowed = [...allowedOrigins][0];
  return firstAllowed || requestOrigin || "*";
};

const buildCorsHeaders = (allowOrigin) => ({
  "Access-Control-Allow-Origin": allowOrigin || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  Vary: "Origin",
});

const sendJson = (res, statusCode, body, allowOrigin) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  };
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(body));
};

const sendRaw = (res, statusCode, body, allowOrigin, contentType = "text/plain; charset=utf-8") => {
  const headers = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...buildCorsHeaders(allowOrigin),
  };
  res.writeHead(statusCode, headers);
  res.end(body);
};

const extractBearerToken = (authHeader) => {
  const raw = text(authHeader);
  if (!raw) return "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? text(match[1]) : "";
};

const normalizeRequestedProvider = (value) => {
  const normalized = text(value).toLowerCase();
  if (normalized === "openai") return "OpenAI";
  if (normalized === "deepseek") return "DeepSeek";
  return "";
};

const resolveUpstreamUrl = (requestedProvider = "") => {
  if (requestedProvider === "OpenAI") {
    return text(process.env.OPENAI_UPSTREAM_URL) || "https://api.openai.com/v1/chat/completions";
  }
  if (requestedProvider === "DeepSeek") {
    return text(process.env.DEEPSEEK_UPSTREAM_URL) || "https://api.deepseek.com/v1/chat/completions";
  }
  return (
    text(process.env.DEEPSEEK_UPSTREAM_URL || process.env.OPENAI_UPSTREAM_URL) ||
    "https://api.deepseek.com/v1/chat/completions"
  );
};

const detectProviderName = (url) => {
  const normalized = text(url).toLowerCase();
  if (normalized.includes("deepseek")) return "DeepSeek";
  if (normalized.includes("openai")) return "OpenAI";
  return "LLM";
};

const resolveServerApiKey = (providerName) => {
  if (providerName === "DeepSeek") {
    return text(process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY);
  }

  if (providerName === "OpenAI") {
    return text(process.env.OPENAI_API_KEY || process.env.OPENAI_PROXY_API_KEY || process.env.VITE_OPENAI_API_KEY);
  }

  return text(
    process.env.DEEPSEEK_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENAI_PROXY_API_KEY ||
      process.env.VITE_DEEPSEEK_API_KEY ||
      process.env.VITE_OPENAI_API_KEY
  );
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

  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    sendJson(res, 400, { message: "Request body is not valid JSON." }, allowOrigin);
    return;
  }

  const requestedProvider = normalizeRequestedProvider(
    body?.provider || body?._provider || req.headers["x-llm-provider"]
  );
  const upstreamUrl = resolveUpstreamUrl(requestedProvider);
  const providerName = detectProviderName(upstreamUrl);
  const incomingApiKey = extractBearerToken(req.headers.authorization);
  const serverApiKey = resolveServerApiKey(providerName);
  const apiKey = serverApiKey || incomingApiKey;
  if (!apiKey) {
    sendJson(
      res,
      500,
      {
        message:
          `${providerName} API key is missing on server. Set ${providerName === "DeepSeek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY"}${providerName === "OpenAI" ? " (or OPENAI_PROXY_API_KEY)" : ""}.`,
      },
      allowOrigin
    );
    return;
  }

  try {
    const upstreamPayload =
      body && typeof body === "object" && !Array.isArray(body)
        ? { ...body }
        : {};
    delete upstreamPayload.provider;
    delete upstreamPayload._provider;

    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(upstreamPayload),
    });

    const rawBody = await upstream.text();
    let parsed;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed === "object") {
      sendJson(res, upstream.status, parsed, allowOrigin);
      return;
    }

    sendRaw(res, upstream.status, rawBody || "", allowOrigin);
  } catch (error) {
    sendJson(res, 502, { message: `${providerName} proxy request failed: ${error.message}` }, allowOrigin);
  }
}

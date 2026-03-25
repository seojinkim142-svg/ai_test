/* global process */

const DEFAULT_LOCAL_ORIGIN = "http://localhost:5173";
const DEFAULT_NATIVE_APP_SCHEME = "com.tjwls.examstudyai";
const DEFAULT_NATIVE_HOST = "auth";
const DEFAULT_NATIVE_PATH = "/callback";

const text = (value) => String(value ?? "").trim();

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

const resolveNativeAppScheme = () =>
  text(process.env.NATIVE_APP_SCHEME || process.env.VITE_NATIVE_APP_SCHEME) ||
  DEFAULT_NATIVE_APP_SCHEME;

const resolveNativeCallbackHost = () =>
  text(process.env.NATIVE_APP_CALLBACK_HOST || process.env.VITE_NATIVE_APP_CALLBACK_HOST) ||
  DEFAULT_NATIVE_HOST;

const resolveNativeCallbackPath = () => {
  const raw =
    text(process.env.NATIVE_APP_CALLBACK_PATH || process.env.VITE_NATIVE_APP_CALLBACK_PATH) ||
    DEFAULT_NATIVE_PATH;
  return raw.startsWith("/") ? raw : `/${raw}`;
};

export const isNativeReturnMode = (req) => {
  try {
    const requestUrl = new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`);
    return text(requestUrl.searchParams.get("mode")).toLowerCase() === "native";
  } catch {
    return false;
  }
};

export const buildRedirectTargetUrl = ({
  clientOrigin = DEFAULT_LOCAL_ORIGIN,
  params = {},
  native = false,
} = {}) => {
  let target;
  try {
    if (native) {
      const nativeScheme = resolveNativeAppScheme();
      const nativeHost = resolveNativeCallbackHost();
      const nativePath = resolveNativeCallbackPath();
      target = new URL(`${nativeScheme}://${nativeHost}${nativePath}`);
    } else {
      target = new URL(normalizeOrigin(clientOrigin) || DEFAULT_LOCAL_ORIGIN);
    }
  } catch {
    target = new URL(DEFAULT_LOCAL_ORIGIN);
  }

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value
        .map((entry) => text(entry))
        .filter(Boolean)
        .forEach((entry) => target.searchParams.append(key, entry));
      return;
    }

    const normalized = text(value);
    if (!normalized) return;
    target.searchParams.set(key, normalized);
  });

  return target.toString();
};

export const redirectToPaymentClient = ({
  req,
  res,
  clientOrigin,
  params = {},
}) => {
  const location = buildRedirectTargetUrl({
    clientOrigin,
    params,
    native: isNativeReturnMode(req),
  });

  // 디버깅을 위한 로그 추가
  console.log('Payment redirect:', {
    location,
    clientOrigin,
    params,
    native: isNativeReturnMode(req),
    headers: req.headers
  });

  // 리디렉션 헤더 설정
  const headers = {
    Location: location,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };

  // 네이티브 앱 리디렉션인 경우 추가 헤더
  if (isNativeReturnMode(req)) {
    headers["X-Native-Redirect"] = "true";
  }

  res.writeHead(302, headers);
  res.end();
};

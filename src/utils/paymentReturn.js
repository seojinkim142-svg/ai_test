export const PAYMENT_RETURN_QUERY_KEYS = [
  "pg_token",
  "kakaoPay",
  "nicePay",
  "np_token",
  "orderId",
  "amount",
  "message",
  "niceBilling",
  "trial",
];
export const NATIVE_PAYMENT_RETURN_HOST = "auth";
export const NATIVE_PAYMENT_RETURN_PATH = "/callback";

const PAYMENT_RETURN_PENDING_KEY = "zeusian:payment-return-pending:v1";
const PAYMENT_RETURN_MAX_AGE_MS = 1000 * 60 * 30;

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markPaymentReturnPending(payload = {}) {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(
      PAYMENT_RETURN_PENDING_KEY,
      JSON.stringify({
        ...payload,
        createdAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage write failures.
  }
}

export function readPaymentReturnPending() {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PAYMENT_RETURN_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const createdAt = Number(parsed?.createdAt);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > PAYMENT_RETURN_MAX_AGE_MS) {
      storage.removeItem(PAYMENT_RETURN_PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(PAYMENT_RETURN_PENDING_KEY);
    return null;
  }
}

export function clearPaymentReturnPending() {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(PAYMENT_RETURN_PENDING_KEY);
  } catch {
    // Ignore storage delete failures.
  }
}

export function extractPaymentReturnParams(rawUrl, queryKeys = PAYMENT_RETURN_QUERY_KEYS) {
  const source = String(rawUrl || "").trim();
  if (!source) return null;

  try {
    const parsed = new URL(source);
    const nextParams = new URLSearchParams();

    queryKeys.forEach((key) => {
      const value = parsed.searchParams.get(key);
      if (value != null && value !== "") {
        nextParams.set(key, value);
      }
    });

    return nextParams.toString() ? nextParams : null;
  } catch {
    return null;
  }
}

export function isNativePaymentCallbackUrl(rawUrl, scheme, host = NATIVE_PAYMENT_RETURN_HOST, path = NATIVE_PAYMENT_RETURN_PATH) {
  const source = String(rawUrl || "").trim();
  if (!source || !scheme) return false;

  try {
    const parsed = new URL(source);
    return (
      parsed.protocol === `${scheme}:` &&
      parsed.hostname === host &&
      String(parsed.pathname || "").startsWith(path)
    );
  } catch {
    return false;
  }
}

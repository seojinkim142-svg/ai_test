const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
};

const isLocalHostOrigin = (origin) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return LOCAL_HOSTNAMES.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const resolvePublicAppOrigin = () => {
  const envOrigin =
    normalizeOrigin(import.meta.env.VITE_PUBLIC_APP_ORIGIN) ||
    normalizeOrigin(import.meta.env.VITE_APP_PUBLIC_ORIGIN) ||
    normalizeOrigin(import.meta.env.VITE_SITE_URL) ||
    normalizeOrigin(import.meta.env.VITE_DEPLOY_URL);

  if (envOrigin) return envOrigin;
  if (typeof window === "undefined") return "";

  const browserOrigin = normalizeOrigin(window.location.origin);
  if (!browserOrigin) return "";
  if (import.meta.env.DEV || !isLocalHostOrigin(browserOrigin)) return browserOrigin;

  return "";
};

export const resolveAppRedirectUrl = (path = "/") => {
  const origin = resolvePublicAppOrigin();
  if (!origin) return "";

  try {
    return new URL(path, `${origin}/`).toString();
  } catch {
    return "";
  }
};

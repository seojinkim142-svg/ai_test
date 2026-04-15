export const ZEUSIAN_WEBAPP_URL = "https://zeusian.ai.kr/?auth=1&source=extension";
export const ZEUSIAN_CHAT_COMPLETIONS_URL = "https://zeusian.ai.kr/api/openai/v1/chat/completions";
export const SUPABASE_URL = "https://abafcnpyewguywopbszu.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiYWZjbnB5ZXdndXl3b3Bic3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NDMwNTUsImV4cCI6MjA4MjIxOTA1NX0.Bmr7vq4Gr1ZHSP_aAYvclifj2uiaBxy_U0HagoIg_L4";
export const HISTORY_STORAGE_KEY = "zeusian_clip_history_v1";
export const LAST_CLIP_STORAGE_KEY = "zeusian_clip_last_v1";
export const AUTH_SESSION_STORAGE_KEY = "zeusian_extension_auth_session_v1";
export const SUMMARY_STORAGE_KEY = "zeusian_extension_summary_cache_v1";
export const MAX_HISTORY_ITEMS = 12;
export const MAX_SUMMARY_ITEMS = 8;

const MODEL = "deepseek-chat";
const SESSION_REFRESH_SKEW_SECONDS = 60;
const SUMMARY_SOURCE_MAX_CHARS = 14000;
const SUMMARY_CACHE_TEXT_HASH_CHARS = 2400;

const OUTPUT_LANGUAGE_SPECS = {
  en: { code: "en", label: "English" },
  zh: { code: "zh", label: "Chinese" },
  ja: { code: "ja", label: "Japanese" },
  hi: { code: "hi", label: "Hindi" },
  ko: { code: "ko", label: "Korean" },
};

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function trimUrl(value) {
  try {
    return new URL(String(value || "").trim()).toString();
  } catch {
    return String(value || "").trim();
  }
}

function hashString(value) {
  const source = String(value || "");
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) + hash + source.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function summarizeFetchError(payload, fallbackMessage) {
  if (payload && typeof payload === "object") {
    return (
      text(payload.message) ||
      text(payload.error_description) ||
      text(payload.error) ||
      text(payload.msg) ||
      fallbackMessage
    );
  }
  return fallbackMessage;
}

async function parseJsonResponse(response, fallbackMessage) {
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = raw ? { message: raw } : {};
  }

  if (!response.ok) {
    throw new Error(summarizeFetchError(payload, fallbackMessage));
  }

  return payload;
}

function normalizeSessionPayload(session) {
  if (!session || typeof session !== "object") return null;
  const accessToken = text(session.access_token);
  const refreshToken = text(session.refresh_token);
  if (!accessToken || !refreshToken) return null;

  const expiresIn = Number(session.expires_in);
  const expiresAt =
    Number(session.expires_at) ||
    (Number.isFinite(expiresIn) && expiresIn > 0
      ? Math.floor(Date.now() / 1000) + expiresIn
      : Math.floor(Date.now() / 1000) + 3600);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    expires_in: Number.isFinite(expiresIn) ? expiresIn : null,
    token_type: text(session.token_type) || "bearer",
    user: session.user && typeof session.user === "object" ? session.user : null,
  };
}

function isSessionExpiringSoon(session) {
  const expiresAt = Number(session?.expires_at || 0);
  if (!expiresAt) return true;
  return expiresAt <= Math.floor(Date.now() / 1000) + SESSION_REFRESH_SKEW_SECONDS;
}

async function supabaseAuthRequest(path, { method = "GET", body, accessToken = "" } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseJsonResponse(response, "Supabase auth request failed.");
}

export function normalizeClipText(value, maxLength = 4000) {
  return text(value).slice(0, maxLength);
}

export function getDomainLabel(url) {
  try {
    return new URL(String(url || "").trim()).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function makeClipId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildClip({ title, url, text: clipText, kind = "selection" } = {}) {
  const normalizedText = normalizeClipText(clipText);
  const normalizedUrl = trimUrl(url);
  const normalizedTitle = text(title) || getDomainLabel(normalizedUrl) || "Untitled page";

  return {
    id: makeClipId(),
    title: normalizedTitle,
    url: normalizedUrl,
    domain: getDomainLabel(normalizedUrl),
    text: normalizedText,
    kind,
    createdAt: new Date().toISOString(),
  };
}

export async function loadStoredClips() {
  const stored = await chrome.storage.local.get({
    [HISTORY_STORAGE_KEY]: [],
    [LAST_CLIP_STORAGE_KEY]: null,
  });

  const history = Array.isArray(stored?.[HISTORY_STORAGE_KEY]) ? stored[HISTORY_STORAGE_KEY] : [];
  const lastClip =
    stored?.[LAST_CLIP_STORAGE_KEY] && typeof stored[LAST_CLIP_STORAGE_KEY] === "object"
      ? stored[LAST_CLIP_STORAGE_KEY]
      : null;

  return { history, lastClip };
}

export async function persistClip(clip) {
  if (!clip || !clip.text) {
    throw new Error("Cannot save an empty clip.");
  }

  const { history } = await loadStoredClips();
  const deduped = history.filter((item) => !(item?.url === clip.url && item?.text === clip.text));
  const nextHistory = [clip, ...deduped].slice(0, MAX_HISTORY_ITEMS);

  await chrome.storage.local.set({
    [HISTORY_STORAGE_KEY]: nextHistory,
    [LAST_CLIP_STORAGE_KEY]: clip,
  });

  return nextHistory;
}

export async function clearStoredClips() {
  await chrome.storage.local.set({
    [HISTORY_STORAGE_KEY]: [],
    [LAST_CLIP_STORAGE_KEY]: null,
  });
}

export function buildClipboardPayload(clip) {
  if (!clip) return "";
  const parts = [
    `Title: ${clip.title || "Untitled page"}`,
    clip.url ? `Source: ${clip.url}` : "",
    "",
    clip.text || "",
  ];
  return parts.filter(Boolean).join("\n");
}

export function formatClipTimestamp(value) {
  try {
    const locale =
      text(
        typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function"
          ? chrome.i18n.getUILanguage()
          : typeof navigator !== "undefined"
            ? navigator.language
            : ""
      ) || undefined;
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

export function buildOpenUrl(hasClip = false) {
  const target = new URL(ZEUSIAN_WEBAPP_URL);
  if (hasClip) {
    target.searchParams.set("clip", "1");
  }
  return target.toString();
}

export function normalizeOutputLanguage(value) {
  const normalized = text(value).toLowerCase();
  return OUTPUT_LANGUAGE_SPECS[normalized]?.code || OUTPUT_LANGUAGE_SPECS.ko.code;
}

export function getOutputLanguageLabel(value) {
  return OUTPUT_LANGUAGE_SPECS[normalizeOutputLanguage(value)]?.label || OUTPUT_LANGUAGE_SPECS.ko.label;
}

export function resolveBrowserOutputLanguage() {
  const locale =
    text(
      typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function"
        ? chrome.i18n.getUILanguage()
        : typeof navigator !== "undefined"
          ? navigator.language
          : ""
    ).toLowerCase() || "ko";

  if (locale.startsWith("zh")) return "zh";
  if (locale.startsWith("ja")) return "ja";
  if (locale.startsWith("hi")) return "hi";
  if (locale.startsWith("en")) return "en";
  return "ko";
}

export async function loadAuthSession() {
  const stored = await chrome.storage.local.get({ [AUTH_SESSION_STORAGE_KEY]: null });
  return normalizeSessionPayload(stored?.[AUTH_SESSION_STORAGE_KEY]);
}

export async function persistAuthSession(session) {
  const normalized = normalizeSessionPayload(session);
  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: normalized });
  return normalized;
}

export async function clearAuthSession() {
  await chrome.storage.local.set({ [AUTH_SESSION_STORAGE_KEY]: null });
}

export async function signInWithExtensionEmail(email, password) {
  const normalizedEmail = text(email).toLowerCase();
  const normalizedPassword = String(password || "");
  if (!normalizedEmail || !normalizedPassword) {
    throw new Error("Email and password are required.");
  }

  const session = await supabaseAuthRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: {
      email: normalizedEmail,
      password: normalizedPassword,
    },
  });

  return persistAuthSession(session);
}

export async function refreshAuthSession(session = null) {
  const currentSession = normalizeSessionPayload(session) || (await loadAuthSession());
  const refreshToken = text(currentSession?.refresh_token);
  if (!refreshToken) {
    await clearAuthSession();
    return null;
  }

  try {
    const refreshed = await supabaseAuthRequest("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: {
        refresh_token: refreshToken,
      },
    });
    return persistAuthSession(refreshed);
  } catch (error) {
    await clearAuthSession();
    throw error;
  }
}

export async function getValidAuthSession() {
  const session = await loadAuthSession();
  if (!session?.access_token) return null;
  if (!isSessionExpiringSoon(session)) return session;

  try {
    return await refreshAuthSession(session);
  } catch {
    return null;
  }
}

export async function signOutExtensionSession() {
  const session = await loadAuthSession();
  if (session?.access_token) {
    try {
      await supabaseAuthRequest("/auth/v1/logout", {
        method: "POST",
        accessToken: session.access_token,
      });
    } catch {
      // Keep logout best-effort and always clear the local session.
    }
  }

  await clearAuthSession();
}

function normalizeSummaryEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const cacheKey = text(entry.cacheKey);
  const summary = String(entry.summary || "").trim();
  if (!cacheKey || !summary) return null;

  return {
    cacheKey,
    url: trimUrl(entry.url),
    title: text(entry.title),
    domain: text(entry.domain),
    outputLanguage: normalizeOutputLanguage(entry.outputLanguage),
    model: text(entry.model) || MODEL,
    summary,
    textHash: text(entry.textHash),
    createdAt: text(entry.createdAt) || new Date().toISOString(),
  };
}

export function buildSummaryCacheKey(snapshot, outputLanguage = resolveBrowserOutputLanguage()) {
  const sourceText = normalizeClipText(
    snapshot?.selection || snapshot?.fallbackText || snapshot?.articleText || "",
    SUMMARY_CACHE_TEXT_HASH_CHARS
  );
  const normalizedLanguage = normalizeOutputLanguage(outputLanguage);
  const normalizedUrl = trimUrl(snapshot?.url);
  const signature = hashString(`${normalizedUrl}|${sourceText}`);
  return `${normalizedLanguage}:${signature}`;
}

export async function loadStoredSummaries() {
  const stored = await chrome.storage.local.get({ [SUMMARY_STORAGE_KEY]: [] });
  const entries = Array.isArray(stored?.[SUMMARY_STORAGE_KEY]) ? stored[SUMMARY_STORAGE_KEY] : [];
  return entries.map(normalizeSummaryEntry).filter(Boolean);
}

export async function persistSummaryEntry(entry) {
  const normalized = normalizeSummaryEntry(entry);
  if (!normalized) {
    throw new Error("Cannot save an empty summary.");
  }

  const entries = await loadStoredSummaries();
  const deduped = entries.filter((item) => item.cacheKey !== normalized.cacheKey);
  const nextEntries = [normalized, ...deduped].slice(0, MAX_SUMMARY_ITEMS);
  await chrome.storage.local.set({ [SUMMARY_STORAGE_KEY]: nextEntries });
  return normalized;
}

export async function getStoredSummaryForSnapshot(snapshot, outputLanguage = resolveBrowserOutputLanguage()) {
  const cacheKey = buildSummaryCacheKey(snapshot, outputLanguage);
  const entries = await loadStoredSummaries();
  return entries.find((entry) => entry.cacheKey === cacheKey) || null;
}

function sanitizeMarkdown(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function buildSummaryPrompt(snapshot, outputLanguage) {
  const title = text(snapshot?.title) || "Untitled page";
  const url = trimUrl(snapshot?.url);
  const domain = text(snapshot?.domain) || getDomainLabel(url) || "";
  const headings = Array.isArray(snapshot?.headings) ? snapshot.headings.map((item) => text(item)).filter(Boolean) : [];
  const selection = normalizeClipText(snapshot?.selection || "", 4000);
  const metaDescription = normalizeClipText(snapshot?.metaDescription || "", 1200);
  const pageText = normalizeClipText(
    snapshot?.fallbackText || snapshot?.articleText || snapshot?.bodyText || "",
    SUMMARY_SOURCE_MAX_CHARS
  );
  const languageLabel = getOutputLanguageLabel(outputLanguage);

  return `
Create a study-ready markdown summary in ${languageLabel}.
Base the answer only on the reliable content below.
Ignore navigation, cookie banners, repeated menus, and decorative text.

Required structure:
1. A one-line takeaway.
2. 4-6 key bullet points.
3. Up to 4 useful details or examples.
4. Important terms, names, or numbers only if present on the page.

If the page content is weak, incomplete, or noisy, say so briefly and summarize only what is trustworthy.
All headings and bullets must be written in ${languageLabel}.

Page title: ${title}
URL: ${url}
Domain: ${domain}
Headings: ${headings.join(" | ")}
Meta description: ${metaDescription}
Selected text: ${selection}

Page text:
${pageText}
  `.trim();
}

export async function summarizeCurrentPage(snapshot, { session = null, outputLanguage = resolveBrowserOutputLanguage() } = {}) {
  const pageText = normalizeClipText(
    snapshot?.selection || snapshot?.fallbackText || snapshot?.articleText || "",
    SUMMARY_SOURCE_MAX_CHARS
  );
  if (pageText.length < 120) {
    throw new Error("The current page does not have enough readable text to summarize.");
  }

  const normalizedLanguage = normalizeOutputLanguage(outputLanguage);
  const response = await fetch(ZEUSIAN_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            `You are Zeusian's Chrome extension. Read webpage snapshots and create accurate study summaries. Reply only in ${getOutputLanguageLabel(normalizedLanguage)} markdown.`,
        },
        {
          role: "user",
          content: buildSummaryPrompt(snapshot, normalizedLanguage),
        },
      ],
    }),
  });

  const payload = await parseJsonResponse(response, "Failed to request an AI summary.");
  const summary = sanitizeMarkdown(payload?.choices?.[0]?.message?.content || "");
  if (!summary) {
    throw new Error("The AI returned an empty summary.");
  }

  const entry = {
    cacheKey: buildSummaryCacheKey(snapshot, normalizedLanguage),
    url: trimUrl(snapshot?.url),
    title: text(snapshot?.title) || "Untitled page",
    domain: text(snapshot?.domain) || getDomainLabel(snapshot?.url),
    outputLanguage: normalizedLanguage,
    model: MODEL,
    summary,
    textHash: hashString(pageText),
    createdAt: new Date().toISOString(),
  };

  return persistSummaryEntry(entry);
}

export function captureTabState() {
  const normalize = (value, maxLength = 12000) =>
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);

  const readText = (node, maxLength = 12000) => normalize(node?.innerText || node?.textContent || "", maxLength);

  const pickBestContainer = () => {
    const selectors = [
      "article",
      "main",
      "[role='main']",
      ".article",
      ".post",
      ".entry-content",
      ".article-body",
      ".post-content",
      ".content",
    ];

    const candidates = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((node) => ({
        node,
        text: readText(node, 16000),
      }))
      .filter((item) => item.text.length >= 160)
      .sort((a, b) => b.text.length - a.text.length);

    return candidates[0]?.text || "";
  };

  const bodyText = readText(document.body, 18000);
  const articleText = pickBestContainer();
  const selection = normalize(window.getSelection ? window.getSelection().toString() : "", 4000);
  const metaDescription = normalize(
    document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    1200
  );
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((node) => normalize(node.textContent || "", 180))
    .filter(Boolean)
    .slice(0, 8);
  const fallbackText = selection || articleText || bodyText || metaDescription;

  return {
    title: normalize(document.title || "", 300),
    url: String(window.location.href || "").trim(),
    domain: String(window.location.hostname || "").trim(),
    selection,
    metaDescription,
    headings,
    articleText,
    bodyText: bodyText.slice(0, 6000),
    fallbackText,
    excerpt: normalize(selection || metaDescription || articleText || bodyText, 600),
  };
}

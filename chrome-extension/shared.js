export const ZEUSIAN_WEBAPP_URL = "https://zeusian.ai.kr/?auth=1&source=extension";
export const HISTORY_STORAGE_KEY = "zeusian_clip_history_v1";
export const LAST_CLIP_STORAGE_KEY = "zeusian_clip_last_v1";
export const MAX_HISTORY_ITEMS = 12;

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const normalizedUrl = String(url || "").trim();
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
  const lastClip = stored?.[LAST_CLIP_STORAGE_KEY] && typeof stored[LAST_CLIP_STORAGE_KEY] === "object"
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
    return new Intl.DateTimeFormat("ko-KR", {
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

export function captureTabState() {
  const normalize = (value, maxLength = 5000) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);

  const selection = normalize(window.getSelection ? window.getSelection().toString() : "", 4000);
  const metaDescription = normalize(
    document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
    1200
  );
  const bodyText = normalize(document.body?.innerText || "", 4000);
  const fallbackText = selection || metaDescription || bodyText;

  return {
    title: normalize(document.title || "", 300),
    url: String(window.location.href || "").trim(),
    selection,
    fallbackText,
  };
}

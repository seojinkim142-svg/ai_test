import { createPremiumProfileId } from "./appStateHelpers";

const PARTIAL_SUMMARY_ARTIFACT_KEY = "__partial_summary_state_v1";
const PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY = "__partial_summary_library_v1";
const LEGACY_HIGHLIGHTS_WRAP_KEY = "__legacy_highlights_payload_v1";
const MOJIBAKE_COMPAT_CHAR_RE = /[\uF900-\uFAFF]/;

function hasMojibakeText(value) {
  const text = String(value || "");
  if (!text) return false;
  if (text.includes("\uFFFD")) return true;
  if (MOJIBAKE_COMPAT_CHAR_RE.test(text)) return true;
  if (/[?]{2,}/.test(text) && /[\u3131-\uD79D]/.test(text)) return true;
  return false;
}

export function sanitizeUiText(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!hasMojibakeText(text)) return text;
  const recovered = text
    .split(/\s+/)
    .filter((token) => token && !hasMojibakeText(token))
    .join(" ")
    .trim()
    .replace(/[:\-–,]+$/, "")
    .trim();
  if (recovered.length >= 4) return recovered;
  return String(fallback || "").trim();
}

export function formatPartialSummaryDefaultName(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16).replace("T", " ");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function normalizeSavedPartialSummaryEntries(input) {
  const list = Array.isArray(input) ? input : [];
  const normalized = [];
  for (const entry of list) {
    const summaryText = String(entry?.summary || "").trim();
    if (!summaryText) continue;

    const createdAtSource = String(entry?.createdAt || "").trim();
    const updatedAtSource = String(entry?.updatedAt || "").trim();
    const createdAtDate = new Date(createdAtSource || Date.now());
    const updatedAtDate = new Date(updatedAtSource || createdAtDate.getTime());
    const createdAt = Number.isNaN(createdAtDate.getTime())
      ? new Date().toISOString()
      : createdAtDate.toISOString();
    const updatedAt = Number.isNaN(updatedAtDate.getTime())
      ? createdAt
      : updatedAtDate.toISOString();
    const id =
      typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : createPremiumProfileId();
    const nameRaw = String(entry?.name || "");
    const name = nameRaw.trim() || formatPartialSummaryDefaultName(createdAt);
    const range = String(entry?.range || "").trim();

    normalized.push({
      id,
      name,
      summary: summaryText,
      range,
      createdAt,
      updatedAt,
    });
  }

  normalized.sort((left, right) => {
    const l = new Date(left.updatedAt).getTime() || 0;
    const r = new Date(right.updatedAt).getTime() || 0;
    return r - l;
  });
  return normalized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readPartialSummaryBundleFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  const rawState = isPlainObject(base?.[PARTIAL_SUMMARY_ARTIFACT_KEY])
    ? base[PARTIAL_SUMMARY_ARTIFACT_KEY]
    : null;
  const summary = String(rawState?.summary || "").trim();
  const range = String(rawState?.range || "").trim();
  const libraryRaw = base?.[PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY];
  const library = normalizeSavedPartialSummaryEntries(libraryRaw);
  return {
    summary,
    range,
    library,
  };
}

export function writePartialSummaryBundleToHighlights(
  highlightsValue,
  {
    summary,
    range,
    library,
  } = {}
) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const existingSummaryState = isPlainObject(base?.[PARTIAL_SUMMARY_ARTIFACT_KEY])
    ? base[PARTIAL_SUMMARY_ARTIFACT_KEY]
    : null;
  const normalizedSummary =
    summary === undefined
      ? String(existingSummaryState?.summary || "").trim()
      : String(summary || "").trim();
  const normalizedRange =
    range === undefined ? String(existingSummaryState?.range || "").trim() : String(range || "").trim();
  const normalizedLibrary = normalizeSavedPartialSummaryEntries(
    library === undefined ? base?.[PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY] : library
  );

  if (normalizedSummary) {
    base[PARTIAL_SUMMARY_ARTIFACT_KEY] = {
      summary: normalizedSummary,
      range: normalizedRange,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete base[PARTIAL_SUMMARY_ARTIFACT_KEY];
  }

  if (normalizedLibrary.length > 0) {
    base[PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY] = normalizedLibrary;
  } else {
    delete base[PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY];
  }

  delete base.__instructor_emphasis_library_v1;
  delete base.__instructor_emphasis_active_id_v1;
  delete base.__instructor_emphasis_v1;

  return Object.keys(base).length > 0 ? base : null;
}

import { createPremiumProfileId } from "./appStateHelpers";

const PARTIAL_SUMMARY_ARTIFACT_KEY = "__partial_summary_state_v1";
const PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY = "__partial_summary_library_v1";
const INSTRUCTOR_EMPHASIS_ARTIFACT_KEY = "__instructor_emphasis_v1";
const INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY = "__instructor_emphasis_library_v1";
const INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY = "__instructor_emphasis_active_id_v1";
const LEGACY_HIGHLIGHTS_WRAP_KEY = "__legacy_highlights_payload_v1";
const INSTRUCTOR_EMPHASIS_MAX_LENGTH = 2000;
const MOJIBAKE_COMPAT_CHAR_RE = /[\uF900-\uFAFF]/;

export function normalizeInstructorEmphasisInput(value) {
  const normalized = String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\0")
    .join("")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= INSTRUCTOR_EMPHASIS_MAX_LENGTH) return normalized;
  return normalized.slice(0, INSTRUCTOR_EMPHASIS_MAX_LENGTH).trim();
}

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

export function normalizeSavedInstructorEmphasisEntries(input) {
  const list = Array.isArray(input) ? input : [];
  const normalized = [];
  for (const entry of list) {
    const text = normalizeInstructorEmphasisInput(entry?.text);
    if (!text) continue;

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
    normalized.push({
      id,
      text,
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
  const instructorLibraryRaw = base?.[INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY];
  const instructorEmphasisLibrary = normalizeSavedInstructorEmphasisEntries(instructorLibraryRaw);
  const rawInstructorEmphasis = base?.[INSTRUCTOR_EMPHASIS_ARTIFACT_KEY];
  const legacyInstructorText = normalizeInstructorEmphasisInput(
    typeof rawInstructorEmphasis === "string" ? rawInstructorEmphasis : rawInstructorEmphasis?.text
  );
  let mergedInstructorLibrary = instructorEmphasisLibrary;
  if (!mergedInstructorLibrary.length && legacyInstructorText) {
    const nowIso = new Date().toISOString();
    mergedInstructorLibrary = [
      {
        id: createPremiumProfileId(),
        text: legacyInstructorText,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];
  }
  const requestedActiveId = String(base?.[INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY] || "").trim();
  const activeInstructorEmphasisId =
    mergedInstructorLibrary.find((item) => item.id === requestedActiveId)?.id ||
    mergedInstructorLibrary[0]?.id ||
    "";
  const instructorEmphasis =
    mergedInstructorLibrary.find((item) => item.id === activeInstructorEmphasisId)?.text || "";
  return {
    summary,
    range,
    library,
    instructorEmphasisLibrary: mergedInstructorLibrary,
    activeInstructorEmphasisId,
    instructorEmphasis,
  };
}

export function writePartialSummaryBundleToHighlights(
  highlightsValue,
  {
    summary,
    range,
    library,
    instructorEmphasis,
    instructorEmphasisLibrary,
    activeInstructorEmphasisId,
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
  const currentInstructorLibrary = normalizeSavedInstructorEmphasisEntries(
    base?.[INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY]
  );
  const explicitInstructorLibrary = normalizeSavedInstructorEmphasisEntries(instructorEmphasisLibrary);
  let normalizedInstructorLibrary =
    instructorEmphasisLibrary === undefined ? currentInstructorLibrary : explicitInstructorLibrary;
  const normalizedInstructorEmphasis = normalizeInstructorEmphasisInput(instructorEmphasis);
  if (instructorEmphasis !== undefined) {
    if (normalizedInstructorEmphasis) {
      const nowIso = new Date().toISOString();
      const newItem = {
        id: createPremiumProfileId(),
        text: normalizedInstructorEmphasis,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      normalizedInstructorLibrary = normalizeSavedInstructorEmphasisEntries([
        newItem,
        ...normalizedInstructorLibrary,
      ]);
    } else {
      normalizedInstructorLibrary = [];
    }
  }
  const requestedActiveId = String(activeInstructorEmphasisId || "").trim();
  const normalizedActiveInstructorEmphasisId =
    normalizedInstructorLibrary.find((item) => item.id === requestedActiveId)?.id ||
    normalizedInstructorLibrary[0]?.id ||
    "";
  const activeInstructorText =
    normalizedInstructorLibrary.find((item) => item.id === normalizedActiveInstructorEmphasisId)?.text || "";

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

  if (normalizedInstructorLibrary.length > 0) {
    base[INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY] = normalizedInstructorLibrary;
  } else {
    delete base[INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY];
  }

  if (normalizedActiveInstructorEmphasisId) {
    base[INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY] = normalizedActiveInstructorEmphasisId;
  } else {
    delete base[INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY];
  }

  if (activeInstructorText) {
    base[INSTRUCTOR_EMPHASIS_ARTIFACT_KEY] = {
      text: activeInstructorText,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete base[INSTRUCTOR_EMPHASIS_ARTIFACT_KEY];
  }

  return Object.keys(base).length > 0 ? base : null;
}

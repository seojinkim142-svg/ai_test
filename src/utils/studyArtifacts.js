import { createPremiumProfileId } from "./appStateHelpers";

const PARTIAL_SUMMARY_ARTIFACT_KEY = "__partial_summary_state_v1";
const PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY = "__partial_summary_library_v1";
const REVIEW_NOTES_ARTIFACT_KEY = "__review_notes_v1";
const LEGACY_HIGHLIGHTS_WRAP_KEY = "__legacy_highlights_payload_v1";
const MOJIBAKE_COMPAT_CHAR_RE = /[\uF900-\uFAFF]/;
const REVIEW_NOTE_SOURCE_TYPES = new Set(["quiz_multiple_choice", "quiz_short_answer", "ox"]);

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

function toIsoDateString(value, fallback = null) {
  if (!value && fallback == null) return null;
  const candidate = value || fallback;
  const date = candidate instanceof Date ? candidate : new Date(candidate);
  if (Number.isNaN(date.getTime())) return fallback ? toIsoDateString(fallback, null) : null;
  return date.toISOString();
}

function normalizeReviewNoteId(value, fallback) {
  const normalized = String(value || "").trim();
  return normalized || fallback || createPremiumProfileId();
}

function normalizeReviewNoteSourceType(value) {
  const normalized = String(value || "").trim();
  if (REVIEW_NOTE_SOURCE_TYPES.has(normalized)) return normalized;
  return "quiz_multiple_choice";
}

function normalizeReviewNoteQuestionKey(value, prompt) {
  const normalized = String(value || "").trim();
  if (normalized) return normalized;
  return String(prompt || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function normalizeReviewNotePages(value) {
  const numbers = Array.isArray(value) ? value : [];
  const unique = new Set();
  numbers.forEach((page) => {
    const parsed = Number.parseInt(page, 10);
    if (Number.isFinite(parsed) && parsed > 0) unique.add(parsed);
  });
  return Array.from(unique).sort((left, right) => left - right);
}

export function normalizeReviewNoteEntries(input) {
  const list = Array.isArray(input) ? input : [];
  const normalized = [];

  for (const entry of list) {
    const prompt = String(entry?.prompt || "").trim();
    if (!prompt) continue;

    const sourceType = normalizeReviewNoteSourceType(entry?.sourceType);
    const questionKey = normalizeReviewNoteQuestionKey(entry?.questionKey, prompt);
    if (!questionKey) continue;

    const createdAt = toIsoDateString(entry?.createdAt, new Date());
    const updatedAt = toIsoDateString(entry?.updatedAt, createdAt);
    const lastWrongAt = toIsoDateString(entry?.lastWrongAt, updatedAt);
    const lastCorrectAt = toIsoDateString(entry?.lastCorrectAt, null);
    const hiddenAt = toIsoDateString(entry?.hiddenAt, null);
    const wrongCount = Math.max(1, Number.parseInt(entry?.wrongCount, 10) || 1);
    const reviewCount = Math.max(0, Number.parseInt(entry?.reviewCount, 10) || 0);
    const answerIndex = Number.isFinite(entry?.answerIndex)
      ? entry.answerIndex
      : Number.isFinite(Number(entry?.answerIndex))
        ? Number(entry.answerIndex)
        : null;
    const resolved = Boolean(entry?.resolved);
    const sourceLabel =
      String(entry?.sourceLabel || "").trim() ||
      (sourceType === "ox"
        ? "O/X"
        : sourceType === "quiz_short_answer"
          ? "주관식"
          : "객관식");

    normalized.push({
      id: normalizeReviewNoteId(entry?.id, `${sourceType}:${questionKey}`),
      sourceType,
      sourceLabel,
      questionKey,
      prompt,
      choices: Array.isArray(entry?.choices)
        ? entry.choices.map((choice) => String(choice || "").trim()).filter(Boolean)
        : [],
      answerIndex,
      correctAnswerText: String(entry?.correctAnswerText || "").trim(),
      correctAnswerValue:
        typeof entry?.correctAnswerValue === "boolean" || typeof entry?.correctAnswerValue === "number"
          ? entry.correctAnswerValue
          : String(entry?.correctAnswerValue || "").trim(),
      userAnswerText: String(entry?.userAnswerText || "").trim(),
      userAnswerValue:
        typeof entry?.userAnswerValue === "boolean" || typeof entry?.userAnswerValue === "number"
          ? entry.userAnswerValue
          : String(entry?.userAnswerValue || "").trim(),
      explanation: String(entry?.explanation || "").trim(),
      evidencePages: normalizeReviewNotePages(entry?.evidencePages),
      evidenceSnippet: String(entry?.evidenceSnippet || "").trim(),
      evidenceLabel: String(entry?.evidenceLabel || "").trim(),
      wrongCount,
      reviewCount,
      resolved,
      createdAt,
      updatedAt,
      lastWrongAt,
      lastCorrectAt,
      hiddenAt,
    });
  }

  normalized.sort((left, right) => {
    if (Boolean(left.hiddenAt) !== Boolean(right.hiddenAt)) return left.hiddenAt ? 1 : -1;
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
    const leftTime = new Date(left.updatedAt).getTime() || 0;
    const rightTime = new Date(right.updatedAt).getTime() || 0;
    return rightTime - leftTime;
  });

  return normalized;
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

export function readReviewNotesFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  return normalizeReviewNoteEntries(base?.[REVIEW_NOTES_ARTIFACT_KEY]);
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

export function writeReviewNotesToHighlights(highlightsValue, reviewNotes) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedNotes = normalizeReviewNoteEntries(reviewNotes);
  if (normalizedNotes.length > 0) {
    base[REVIEW_NOTES_ARTIFACT_KEY] = normalizedNotes;
  } else {
    delete base[REVIEW_NOTES_ARTIFACT_KEY];
  }

  delete base.__instructor_emphasis_library_v1;
  delete base.__instructor_emphasis_active_id_v1;
  delete base.__instructor_emphasis_v1;

  return Object.keys(base).length > 0 ? base : null;
}

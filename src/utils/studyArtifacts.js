import { createPremiumProfileId, formatPartialSummaryDefaultName, normalizeFreeUsageCounts } from "./appStateHelpers";

const PARTIAL_SUMMARY_ARTIFACT_KEY = "__partial_summary_state_v1";
const PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY = "__partial_summary_library_v1";
const REVIEW_NOTES_ARTIFACT_KEY = "__review_notes_v1";
const EXAM_CRAM_ARTIFACT_KEY = "__exam_cram_v1";
const CHAPTER_RANGE_ARTIFACT_KEY = "__chapter_ranges_v1";
const QUESTION_STYLE_PROFILE_ARTIFACT_KEY = "__question_style_profile_v1";
const LEGACY_HIGHLIGHTS_WRAP_KEY = "__legacy_highlights_payload_v1";
const INSTRUCTOR_EMPHASIS_ARTIFACT_KEY = "__instructor_emphasis_v1";
const INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY = "__instructor_emphasis_library_v1";
const INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY = "__instructor_emphasis_active_id_v1";
export const FREE_USAGE_ARTIFACT_KEY = "__free_usage_v1";
export const INSTRUCTOR_EMPHASIS_MAX_LENGTH = 2000;
const MOJIBAKE_COMPAT_CHAR_RE = /[\uF900-\uFAFF]/;
const REVIEW_NOTE_SOURCE_TYPES = new Set(["quiz_multiple_choice", "quiz_short_answer", "ox"]);

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

export function readReviewNotesFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  return normalizeReviewNoteEntries(base?.[REVIEW_NOTES_ARTIFACT_KEY]);
}

export function readExamCramFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  const rawState = isPlainObject(base?.[EXAM_CRAM_ARTIFACT_KEY]) ? base[EXAM_CRAM_ARTIFACT_KEY] : null;
  return {
    content: String(rawState?.content || "").trim(),
    scopeLabel: String(rawState?.scopeLabel || "").trim(),
    updatedAt: toIsoDateString(rawState?.updatedAt, null),
  };
}

export function readChapterRangeInputFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  const rawState = base?.[CHAPTER_RANGE_ARTIFACT_KEY];
  if (typeof rawState === "string") {
    return String(rawState || "").trim();
  }
  if (!isPlainObject(rawState)) {
    return "";
  }
  return String(rawState?.input || rawState?.value || "").trim();
}

export function readQuestionStyleProfileFromHighlights(highlightsValue) {
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  const rawState = isPlainObject(base?.[QUESTION_STYLE_PROFILE_ARTIFACT_KEY])
    ? base[QUESTION_STYLE_PROFILE_ARTIFACT_KEY]
    : null;
  return {
    content: String(rawState?.content || "").trim(),
    scopeLabel: String(rawState?.scopeLabel || "").trim(),
    updatedAt: toIsoDateString(rawState?.updatedAt, null),
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

export function writeReviewNotesBundleToHighlights(highlightsValue, reviewNotes) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedNotes = normalizeReviewNoteEntries(reviewNotes);
  if (normalizedNotes.length > 0) {
    base.__review_notes_v1 = normalizedNotes;
  } else {
    delete base.__review_notes_v1;
  }

  return Object.keys(base).length > 0 ? base : null;
}

export function writeExamCramBundleToHighlights(
  highlightsValue,
  { content = "", scopeLabel = "", updatedAt = new Date().toISOString() } = {}
) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedContent = String(content || "").trim();
  if (normalizedContent) {
    base.__exam_cram_v1 = {
      content: normalizedContent,
      scopeLabel: String(scopeLabel || "").trim(),
      updatedAt,
    };
  } else {
    delete base.__exam_cram_v1;
  }

  return Object.keys(base).length > 0 ? base : null;
}

export function readFreeUsageCountsFromHighlights(highlightsValue, fallback = null) {
  const fallbackCounts = normalizeFreeUsageCounts(null, fallback);
  const base = isPlainObject(highlightsValue) ? highlightsValue : null;
  const raw = isPlainObject(base?.[FREE_USAGE_ARTIFACT_KEY]) ? base[FREE_USAGE_ARTIFACT_KEY] : null;
  const counts = normalizeFreeUsageCounts(raw, fallbackCounts);
  return {
    summary: Math.max(counts.summary, fallbackCounts.summary),
    quiz: Math.max(counts.quiz, fallbackCounts.quiz),
    ox: Math.max(counts.ox, fallbackCounts.ox),
    flashcards: Math.max(counts.flashcards, fallbackCounts.flashcards),
  };
}

export function writeFreeUsageCountsToHighlights(highlightsValue, counts) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedCounts = normalizeFreeUsageCounts(counts);
  if (Object.values(normalizedCounts).some((count) => count > 0)) {
    base[FREE_USAGE_ARTIFACT_KEY] = normalizedCounts;
  } else {
    delete base[FREE_USAGE_ARTIFACT_KEY];
  }

  return Object.keys(base).length > 0 ? base : null;
}

export function bumpFreeUsageCount(counts, feature) {
  const normalizedCounts = normalizeFreeUsageCounts(counts);
  if (!Object.prototype.hasOwnProperty.call(normalizedCounts, feature)) {
    return normalizedCounts;
  }
  return {
    ...normalizedCounts,
    [feature]: normalizedCounts[feature] + 1,
  };
}

export function writeExamCramToHighlights(highlightsValue, { content, scopeLabel, updatedAt } = {}) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedContent = String(content || "").trim();
  if (normalizedContent) {
    base[EXAM_CRAM_ARTIFACT_KEY] = {
      content: normalizedContent,
      scopeLabel: String(scopeLabel || "").trim(),
      updatedAt: toIsoDateString(updatedAt, new Date()) || new Date().toISOString(),
    };
  } else {
    delete base[EXAM_CRAM_ARTIFACT_KEY];
  }

  delete base.__instructor_emphasis_library_v1;
  delete base.__instructor_emphasis_active_id_v1;
  delete base.__instructor_emphasis_v1;

  return Object.keys(base).length > 0 ? base : null;
}

export function writeChapterRangeInputToHighlights(highlightsValue, input = "") {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedInput = String(input || "").trim();
  if (normalizedInput) {
    base[CHAPTER_RANGE_ARTIFACT_KEY] = {
      input: normalizedInput,
      updatedAt: new Date().toISOString(),
    };
  } else {
    delete base[CHAPTER_RANGE_ARTIFACT_KEY];
  }

  delete base.__instructor_emphasis_library_v1;
  delete base.__instructor_emphasis_active_id_v1;
  delete base.__instructor_emphasis_v1;

  return Object.keys(base).length > 0 ? base : null;
}

export function writeQuestionStyleProfileToHighlights(
  highlightsValue,
  { content, scopeLabel, updatedAt } = {}
) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }

  const normalizedContent = String(content || "").trim();
  if (normalizedContent) {
    base[QUESTION_STYLE_PROFILE_ARTIFACT_KEY] = {
      content: normalizedContent,
      scopeLabel: String(scopeLabel || "").trim(),
      updatedAt: toIsoDateString(updatedAt, new Date()) || new Date().toISOString(),
    };
  } else {
    delete base[QUESTION_STYLE_PROFILE_ARTIFACT_KEY];
  }

  delete base.__instructor_emphasis_library_v1;
  delete base.__instructor_emphasis_active_id_v1;
  delete base.__instructor_emphasis_v1;

  return Object.keys(base).length > 0 ? base : null;
}

const CONCEPT_TAGS_ARTIFACT_KEY = "__concept_tags_v1";

export function writeConceptTagsToHighlights(highlightsValue, tags) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }
  const normalized = Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (normalized.length > 0) {
    base[CONCEPT_TAGS_ARTIFACT_KEY] = normalized;
  } else {
    delete base[CONCEPT_TAGS_ARTIFACT_KEY];
  }
  return Object.keys(base).length > 0 ? base : null;
}

export function readConceptTagsFromHighlights(highlightsValue) {
  if (!isPlainObject(highlightsValue)) return [];
  const tags = highlightsValue[CONCEPT_TAGS_ARTIFACT_KEY];
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => String(t).trim()).filter(Boolean);
}

const TOPIC_STRUCTURE_ARTIFACT_KEY = "__topic_structure_v1";

export function writeTopicStructureToHighlights(highlightsValue, topicStructure) {
  const base = isPlainObject(highlightsValue) ? { ...highlightsValue } : {};
  if (!isPlainObject(highlightsValue) && highlightsValue != null) {
    base[LEGACY_HIGHLIGHTS_WRAP_KEY] = highlightsValue;
  }
  if (topicStructure && Array.isArray(topicStructure.topics) && topicStructure.topics.length > 0) {
    base[TOPIC_STRUCTURE_ARTIFACT_KEY] = topicStructure;
  } else {
    delete base[TOPIC_STRUCTURE_ARTIFACT_KEY];
  }
  return Object.keys(base).length > 0 ? base : null;
}

export function readTopicStructureFromHighlights(highlightsValue) {
  if (!isPlainObject(highlightsValue)) return null;
  const stored = highlightsValue[TOPIC_STRUCTURE_ARTIFACT_KEY];
  if (!stored || !Array.isArray(stored?.topics) || stored.topics.length === 0) return null;
  if (stored.version !== 1) return null;
  return stored;
}

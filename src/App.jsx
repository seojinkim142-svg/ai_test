import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import StartPage from "./pages/StartPage";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useAdMobBanner } from "./hooks/useAdMobBanner";
import { useUserTier } from "./hooks/useUserTier";
import { usePageProgressCache } from "./hooks/usePageProgressCache";
import { AUTH_ENABLED } from "./config/auth";
import {
  supabase,
  uploadPdfToStorage,
  getAccessToken,
  saveMockExam,
  fetchMockExams,
  deleteMockExam,
  addFlashcard,
  addFlashcards,
  listFlashcards,
  deleteFlashcard,
  createFolder,
  listFolders,
  deleteFolder,
  deleteUpload,
  saveUploadMetadata,
  listUploads,
  getSignedStorageUrl,
  updateUploadThumbnail,
  fetchDocArtifacts,
  saveDocArtifacts,
  updateUploadFolder,
  saveUserFeedback,
  getPremiumProfileStateFromUser,
  savePremiumProfileState,
} from "./services/supabase";
import { ensureUploadPreviewPdf as ensureUploadPreviewPdfRequest } from "./services/document";
import {
  extractPdfText,
  extractPdfTextByRanges,
  extractChapterRangesFromToc,
  extractPdfTextFromPages,
  extractPdfPageTexts,
  generatePdfThumbnail,
} from "./utils/pdf";
import {
  detectSupportedDocumentKind,
  extractDocumentText,
  generateDocumentThumbnail,
  isPdfDocumentKind,
  isSupportedUploadFile,
  normalizeSupportedDocumentFile,
} from "./utils/document";
import { exportMockAnswerSheetToPdf, exportPagedElementToPdf } from "./utils/pdfExport";
import {
  PDF_MAX_SIZE_BY_TIER,
  DEFAULT_PREMIUM_PROFILE_PIN,
  PREMIUM_PROFILE_PRESETS,
  PREMIUM_PROFILE_LIMIT,
  PREMIUM_SHARED_SCOPE_ID,
  PREMIUM_SPACE_MODE_PROFILE,
  PREMIUM_SPACE_MODE_SHARED,
  createPremiumProfileId,
  decodePremiumScopeValue,
  encodePremiumScopeValue,
  formatSizeMB,
  getPremiumActiveProfileStorageKey,
  getPremiumProfilesStorageKey,
  getPremiumSpaceModeStorageKey,
  getTierLabel,
  normalizePremiumProfilePinInput,
  normalizePremiumProfiles,
  normalizeQuizPayload,
  parseChapterRangeSelectionInput,
  parsePageSelectionInput,
  sanitizePremiumProfileName,
  sanitizePremiumProfilePin,
  formatMockExamTitle,
  chunkMockExamPages,
} from "./utils/appStateHelpers";
import {
  resolveAnswerIndex,
  resolveShortAnswerText,
  buildMockExamAnswerSheet,
} from "./utils/mockExamUtils";
import { notifyFeedbackEmail } from "./services/feedback";
import {
  dedupeQuestionTexts,
  mergeQuestionHistory,
  getQuizPromptText,
  getOxPromptText,
  getMockExamPromptText,
  collectQuestionTextsFromQuizSets,
  collectQuestionTextsFromOxItems,
  collectQuestionTextsFromMockExams,
  createQuestionKeySet,
  isLowValueStudyPrompt,
  pushUniqueByQuestionKey,
  pickRandomUniqueByQuestionKey,
} from "./utils/questionDedupe";
import {
  EXAM_CRAM_PREVIEW_LIMIT,
  REVIEW_NOTE_MOCK_EXAM_LIMIT,
  collectExamCramQuizItems,
  createQuizSetState,
  isMissingFeedbackTableError,
  sortReviewNotesByRecentWrong,
} from "./utils/appFeatureHelpers";
import {
  normalizeReviewNoteEntries,
  readExamCramFromHighlights,
  readQuestionStyleProfileFromHighlights,
  readReviewNotesFromHighlights,
  writeQuestionStyleProfileToHighlights,
} from "./utils/studyArtifacts";
import { clearPaymentReturnPending, readPaymentReturnPending } from "./utils/paymentReturn";

const AuthPanel = lazy(() => import("./components/AuthPanel"));
const Header = lazy(() => import("./components/Header"));
const LoginBackground = lazy(() => import("./components/LoginBackground"));
const PaymentPage = lazy(() => import("./components/PaymentPage"));
const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const DetailPage = lazy(() => import("./pages/DetailPage"));
const PremiumProfilePicker = lazy(() => import("./components/PremiumProfilePicker"));

const NativeAppPlugin =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("App")
    ? Capacitor.registerPlugin("App")
    : null;

const PAYMENT_RETURN_QUERY_KEYS = [
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
const NATIVE_PAYMENT_RETURN_FALLBACK_MS = 1200;
const trimSchemeSeparators = (value) => String(value || "").trim().replace(/:\/*$/, "");
const revokeObjectUrlIfNeeded = (value) => {
  const normalized = String(value || "").trim();
  if (normalized.startsWith("blob:")) {
    URL.revokeObjectURL(normalized);
  }
};
const isConvertibleOfficeDocumentKind = (kind) => kind === "docx" || kind === "pptx";
const hasOfficePlaceholderThumbnail = (thumbnail) =>
  String(thumbnail || "").trim().startsWith("data:image/svg+xml");
const toPreviewPdfFileName = (fileName) => {
  const normalized = String(fileName || "document").trim();
  return normalized.replace(/\.[^.]+$/, "") + ".pdf";
};
const NATIVE_PAYMENT_RETURN_SCHEME = trimSchemeSeparators(
  import.meta.env.VITE_NATIVE_APP_SCHEME || "com.tjwls.examstudyai"
);
const NATIVE_PAYMENT_RETURN_HOST = "auth";
const NATIVE_PAYMENT_RETURN_PATH = "/callback";
const OUTPUT_LANGUAGE_STORAGE_KEY = "zeusian-output-language";
const DEFAULT_OUTPUT_LANGUAGE = "ko";
const AVAILABLE_OUTPUT_LANGUAGES = ["en", "zh", "ja", "hi", "ko"];

function extractPaymentReturnParams(rawUrl) {
  const source = String(rawUrl || "").trim();
  if (!source) return null;

  try {
    const parsed = new URL(source);
    const nextParams = new URLSearchParams();

    PAYMENT_RETURN_QUERY_KEYS.forEach((key) => {
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

function isNativePaymentCallbackUrl(rawUrl) {
  const source = String(rawUrl || "").trim();
  if (!source || !NATIVE_PAYMENT_RETURN_SCHEME) return false;

  try {
    const parsed = new URL(source);
    return (
      parsed.protocol === `${NATIVE_PAYMENT_RETURN_SCHEME}:` &&
      parsed.hostname === NATIVE_PAYMENT_RETURN_HOST &&
      String(parsed.pathname || "").startsWith(NATIVE_PAYMENT_RETURN_PATH)
    );
  } catch {
    return false;
  }
}

function buildStoragePathCandidates(rawPath) {
  const source = String(rawPath || "").trim();
  if (!source) return [];

  const seen = new Set();
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(source);

  if (/%[0-9A-Fa-f]{2}/.test(source)) {
    try {
      addCandidate(decodeURIComponent(source));
    } catch {
      // Ignore malformed escape sequences.
    }
  }

  try {
    const decoded = decodeURI(source);
    addCandidate(decoded);
    addCandidate(encodeURI(decoded));
  } catch {
    // Ignore malformed URI sequences.
  }

  addCandidate(encodeURI(source));
  return candidates;
}

function isSafeStoragePathForReuse(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return false;
  if (value.includes("%")) return false;
  return /^[\x20-\x7E]+$/.test(value);
}

const CHAPTER_RANGE_STORAGE_PREFIX = "zeusian:chapter-ranges:v1";
const PARTIAL_SUMMARY_ARTIFACT_KEY = "__partial_summary_state_v1";
const PARTIAL_SUMMARY_LIBRARY_ARTIFACT_KEY = "__partial_summary_library_v1";
const INSTRUCTOR_EMPHASIS_ARTIFACT_KEY = "__instructor_emphasis_v1";
const INSTRUCTOR_EMPHASIS_LIBRARY_ARTIFACT_KEY = "__instructor_emphasis_library_v1";
const INSTRUCTOR_EMPHASIS_ACTIVE_ID_ARTIFACT_KEY = "__instructor_emphasis_active_id_v1";
const LEGACY_HIGHLIGHTS_WRAP_KEY = "__legacy_highlights_payload_v1";
const INSTRUCTOR_EMPHASIS_MAX_LENGTH = 2000;
const MOJIBAKE_COMPAT_CHAR_RE = /[\uF900-\uFAFF]/;

function normalizeInstructorEmphasisInput(value) {
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

function sanitizeUiText(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!hasMojibakeText(text)) return text;
  return String(fallback || "").trim();
}

function createLocalEntityId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildChapterRangeStorageKey({ userId, scopeId, docId }) {
  const normalizedDocId = String(docId || "").trim();
  if (!normalizedDocId) return "";
  const normalizedUserId = String(userId || "guest").trim() || "guest";
  const normalizedScopeId = String(scopeId || "default").trim() || "default";
  return `${CHAPTER_RANGE_STORAGE_PREFIX}:${normalizedUserId}:${normalizedScopeId}:${normalizedDocId}`;
}

function formatPartialSummaryDefaultName(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 16).replace("T", " ");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function normalizeSavedPartialSummaryEntries(input) {
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

function normalizeSavedInstructorEmphasisEntries(input) {
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

function buildTutorPageCandidates(prompt, totalPages) {
  const text = String(prompt || "");
  const maxPages = Number.parseInt(totalPages, 10);
  if (!text || !Number.isFinite(maxPages) || maxPages <= 0) return [];

  const pages = new Set();
  const addPage = (page) => {
    const parsed = Number.parseInt(page, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed < 1 || parsed > maxPages) return;
    pages.add(parsed);
  };
  const addRange = (start, end, cap = 18) => {
    const parsedStart = Number.parseInt(start, 10);
    const parsedEnd = Number.parseInt(end, 10);
    if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) return;
    const lo = Math.max(1, Math.min(parsedStart, parsedEnd));
    const hi = Math.min(maxPages, Math.max(parsedStart, parsedEnd));
    let count = 0;
    for (let page = lo; page <= hi; page += 1) {
      addPage(page);
      count += 1;
      if (count >= cap) break;
    }
  };
  const addWindow = (center, before = 1, after = 2) => {
    const parsed = Number.parseInt(center, 10);
    if (!Number.isFinite(parsed)) return;
    for (let page = parsed - before; page <= parsed + after; page += 1) {
      addPage(page);
    }
  };

  const pageRangeRe = /(\d{1,4})\s*(?:-|~|to|부터)\s*(\d{1,4})\s*(?:p|page|페이지|쪽)?/gi;
  for (const match of text.matchAll(pageRangeRe)) {
    addRange(match[1], match[2]);
  }

  const pageFromRe = /(\d{1,4})\s*(?:p|page|페이지|쪽)\s*(?:부터|이후)?/gi;
  for (const match of text.matchAll(pageFromRe)) {
    const base = Number.parseInt(match[1], 10);
    if (!Number.isFinite(base)) continue;
    addRange(base, Math.min(maxPages, base + 10), 12);
  }

  const pageSuffixRe = /(\d{1,4})\s*(?:p|page|페이지|쪽)/gi;
  for (const match of text.matchAll(pageSuffixRe)) {
    addWindow(match[1], 1, 2);
  }

  const pagePrefixRe = /(?:p|page|페이지|쪽)\s*(\d{1,4})/gi;
  for (const match of text.matchAll(pagePrefixRe)) {
    addWindow(match[1], 1, 2);
  }

  return [...pages].sort((a, b) => a - b).slice(0, 24);
}

function escapeRegex(source) {
  return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTutorSectionCandidates(prompt) {
  const text = String(prompt || "");
  if (!text) return [];
  const found = text.match(/\b\d+(?:\.\d+){1,3}\b/g) || [];
  const unique = [];
  const seen = new Set();
  for (const token of found) {
    const normalized = String(token || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length >= 4) break;
  }
  return unique;
}

function extractTutorProblemTokenCandidates(prompt) {
  const text = String(prompt || "");
  if (!text) return [];

  const found = [];
  const add = (value) => {
    const token = String(value || "").trim();
    if (!token) return;
    if (!found.includes(token)) found.push(token);
  };

  const patterns = [
    /(?:문제|question|q\.?)\s*(\d{1,3}(?:\.\d{1,3})?)/gi,
    /(\d{1,3}(?:\.\d{1,3})?)\s*번\s*(?:문제|question)?/gi,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      add(match?.[1]);
      if (found.length >= 4) return found;
    }
  }
  return found;
}

function incrementSectionToken(sectionToken) {
  const parts = String(sectionToken || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  if (!parts.length || parts.some((value) => !Number.isFinite(value) || value < 0)) return "";
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

function buildTutorSectionBoundaryPatterns(sectionToken) {
  const token = String(sectionToken || "").trim();
  if (!token) return [];
  const patterns = [];

  const nextSibling = incrementSectionToken(token);
  if (nextSibling) {
    patterns.push(new RegExp(`(?:^|[^0-9])${escapeRegex(nextSibling)}(?:[^0-9]|$)`, "i"));
  }

  const parts = token.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length >= 2 && Number.isFinite(parts[0])) {
    const nextMajor = parts[0] + 1;
    patterns.push(
      new RegExp(
        [
          `\\b${nextMajor}\\.\\d+\\b`,
          `\\bchapter\\s*${nextMajor}\\b`,
          `\\bchap\\.?\\s*${nextMajor}\\b`,
          `\\bch\\.?\\s*${nextMajor}\\b`,
          `\\bsection\\s*${nextMajor}\\b`,
          `\\bsec\\.?\\s*${nextMajor}\\b`,
          `제\\s*${nextMajor}\\s*장`,
          `${nextMajor}\\s*장`,
        ].join("|"),
        "i"
      )
    );
  }

  return patterns;
}

function detectTutorSectionPageRange(pageEntries, sectionToken) {
  const pages = Array.isArray(pageEntries) ? pageEntries : [];
  const token = String(sectionToken || "").trim();
  if (!pages.length || !token) return null;

  const targetRe = new RegExp(`(?:^|[^0-9])${escapeRegex(token)}(?:[^0-9]|$)`, "i");
  const startIndex = pages.findIndex((entry) => targetRe.test(String(entry?.text || "")));
  if (startIndex < 0) return null;

  const boundaryPatterns = buildTutorSectionBoundaryPatterns(token);
  let endIndex = pages.length - 1;
  for (let idx = startIndex + 1; idx < pages.length; idx += 1) {
    const text = String(pages[idx]?.text || "");
    if (!text) continue;
    if (boundaryPatterns.some((pattern) => pattern.test(text))) {
      endIndex = Math.max(startIndex, idx - 1);
      break;
    }
  }

  const startPage = Number.parseInt(pages[startIndex]?.pageNumber, 10);
  const endPage = Number.parseInt(pages[endIndex]?.pageNumber, 10);
  if (!Number.isFinite(startPage) || !Number.isFinite(endPage)) return null;
  return {
    section: token,
    startPage,
    endPage: Math.max(startPage, endPage),
  };
}

function extractTutorEvidenceEntries(rawEvidenceText) {
  const source = String(rawEvidenceText || "");
  if (!source) return [];
  const entries = [];
  const re = /\[(p\.\d+|img(?:\.\d+)?)\]\s*\n([\s\S]*?)(?=\n\s*\[(?:p\.\d+|img(?:\.\d+)?)\]\s*\n|$)/gi;
  for (const match of source.matchAll(re)) {
    const rawLabel = String(match?.[1] || "").trim().toLowerCase();
    const pageNumber = Number.parseInt(rawLabel.match(/^p\.(\d+)$/i)?.[1] || "", 10);
    const text = String(match?.[2] || "").replace(/\s+/g, " ").trim();
    if (!rawLabel || !text) continue;
    entries.push({ label: rawLabel, pageNumber, text });
  }
  return entries;
}

function formatTutorEvidenceLabel(entry) {
  if (Number.isFinite(entry?.pageNumber)) {
    return `p.${entry.pageNumber}`;
  }
  if (/^img(?:\.\d+)?$/i.test(String(entry?.label || ""))) {
    return "screenshot";
  }
  return "evidence";
}

function buildTutorForcedFallbackAnswer(question, rawEvidenceText) {
  const entries = extractTutorEvidenceEntries(rawEvidenceText);
  if (!entries.length) {
    return "\uB2F5\uBCC0 \uC0DD\uC131\uC774 \uBD88\uC548\uC815\uD574 \uBB38\uC11C \uBCF8\uBB38 \uADFC\uAC70\uB97C \uBC14\uB85C \uB9CC\uB4E4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uAC19\uC740 \uC9C8\uBB38\uC744 \uB2E4\uC2DC \uBCF4\uB0B4\uC8FC\uC2DC\uBA74 \uC989\uC2DC \uC7AC\uC2DC\uB3C4\uD558\uACA0\uC2B5\uB2C8\uB2E4.";
  }

  const terms = String(question || "")
    .toLowerCase()
    .match(/[0-9a-z\uAC00-\uD7A3.]+/g);
  const keywords = (terms || []).filter((token) => token.length >= 2).slice(0, 12);

  const scored = entries
    .map((entry, index) => {
      const lower = entry.text.toLowerCase();
      let score = 0;
      for (const token of keywords) {
        if (lower.includes(token)) score += token.includes(".") ? 3 : 1;
      }
      return { ...entry, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored.slice(0, Math.min(3, scored.length));
  const lines = [
    "\uBAA8\uB378 \uC751\uB2F5\uC774 \uBE44\uC5B4 \uBB38\uC11C \uBCF8\uBB38 \uADFC\uAC70 \uAE30\uC900\uC73C\uB85C \uD575\uC2EC \uB0B4\uC6A9\uC744 \uBA3C\uC800 \uC815\uB9AC\uD569\uB2C8\uB2E4.",
  ];
  for (const item of selected) {
    const snippet = item.text.length > 280 ? `${item.text.slice(0, 280)}...` : item.text;
    lines.push(`- ${formatTutorEvidenceLabel(item)}: ${snippet}`);
  }
  lines.push(
    "\uC6D0\uD558\uC2DC\uBA74 \uC704 \uADFC\uAC70 \uD398\uC774\uC9C0\uB97C \uAE30\uC900\uC73C\uB85C \uC9C8\uBB38\uD558\uC2E0 \uD56D\uBAA9\uC744 \uB2E8\uACC4\uBCC4\uB85C \uC774\uC5B4\uC11C \uC790\uC138\uD788 \uC124\uBA85\uD558\uACA0\uC2B5\uB2C8\uB2E4."
  );
  return lines.join("\n");
}

function resolveTutorReplyText(rawReply, { question, rawEvidenceText }) {
  const reply = String(rawReply || "").trim();
  const invalidPatterns = [
    /\uBAA8\uB378(?:\uC774)?\s*\uBE48\s*\uC751\uB2F5/iu,
    /\uAC19\uC740\s*\uC9C8\uBB38\uC744\s*\uD55C\s*\uBC88\s*\uB354/iu,
    /\uC9C8\uBB38\uC744\s*\uC870\uAE08\s*\uB354\s*\uAD6C\uCCB4/iu,
    /\uC9C0\uAE08\uC740\s*\uB2F5\uBCC0\uC744\s*\uC0DD\uC131\uD558\uC9C0\s*\uBABB/iu,
    /\uC694\uCCAD\s*\uAD6C\uAC04.*\uB2E4\uC2DC\s*\uC77D/iu,
  ];
  if (!reply || invalidPatterns.some((pattern) => pattern.test(reply))) {
    return buildTutorForcedFallbackAnswer(question, rawEvidenceText);
  }
  return reply;
}

function normalizeTutorRequestPayload(rawInput) {
  if (typeof rawInput === "string") {
    const prompt = String(rawInput || "").trim();
    return {
      prompt,
      displayPrompt: prompt,
      attachmentFile: null,
    };
  }

  const prompt = String(rawInput?.prompt || rawInput?.text || "").trim();
  const displayPrompt = String(rawInput?.displayPrompt || prompt).trim();
  const attachmentFile =
    rawInput?.attachmentFile instanceof File
      ? rawInput.attachmentFile
      : rawInput?.attachment?.file instanceof File
        ? rawInput.attachment.file
        : null;

  return {
    prompt,
    displayPrompt: displayPrompt || prompt,
    attachmentFile,
  };
}

function buildTutorHistoryMessageContent(message) {
  const baseContent = String(message?.content || "").trim();
  const attachmentName = String(message?.attachmentName || "").trim();
  const attachmentText = String(message?.attachmentText || "").trim();
  const parts = [];

  if (baseContent) parts.push(baseContent);
  if (attachmentName) parts.push(`[Attached image: ${attachmentName}]`);
  if (attachmentText) parts.push(`[Screenshot OCR]\n${attachmentText}`);

  return parts.join("\n\n").trim();
}

function buildTutorImageEvidenceBlock({ attachmentName, attachmentType, dimensions, ocrText }) {
  const safeText = String(ocrText || "").trim();
  if (!safeText) return "";

  const width = Number.parseInt(dimensions?.width, 10);
  const height = Number.parseInt(dimensions?.height, 10);
  const sizeLabel =
    Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? `${width}x${height}`
      : "";

  return [
    "[img.1]",
    `Attached screenshot: ${String(attachmentName || "image").trim() || "image"}`,
    attachmentType ? `Type: ${attachmentType}` : "",
    sizeLabel ? `Rendered size: ${sizeLabel}` : "",
    "",
    safeText,
  ]
    .filter(Boolean)
    .join("\n");
}

function parseChapterNumberSelectionInput(rawInput, chapters) {
  const available = Array.isArray(chapters) ? chapters : [];
  const chapterNumbers = available
    .map((chapter) => Number.parseInt(chapter?.chapterNumber, 10))
    .filter((num) => Number.isFinite(num) && num > 0);
  const chapterNumberSet = new Set(chapterNumbers);
  if (!chapterNumbers.length) {
    return { chapterNumbers: [], error: "?ㅼ젙??踰붿쐞?먯꽌 ?ъ슜?????덈뒗 梨뺥꽣媛 ?놁뒿?덈떎." };
  }

  const cleaned = String(rawInput || "").replace(/\s+/g, "");
  if (!cleaned) {
    return { chapterNumbers, error: "" };
  }

  const selected = new Set();
  const tokens = cleaned.split(",").filter(Boolean);
  for (const token of tokens) {
    if (token.includes("-")) {
      const [startRaw, endRaw] = token.split("-");
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
        return { chapterNumbers: [], error: `?섎せ??梨뺥꽣 踰붿쐞?낅땲?? "${token}"` };
      }
      for (let chapterNumber = start; chapterNumber <= end; chapterNumber += 1) {
        selected.add(chapterNumber);
      }
    } else {
      const chapterNumber = Number.parseInt(token, 10);
      if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
        return { chapterNumbers: [], error: `?섎せ??梨뺥꽣 踰덊샇?낅땲?? "${token}"` };
      }
      selected.add(chapterNumber);
    }
  }

  const filtered = [...selected]
    .filter((num) => chapterNumberSet.has(num))
    .sort((left, right) => left - right);

  if (!filtered.length) {
    return {
      chapterNumbers: [],
      error: `No matching chapters found in configured range. Available: ${chapterNumbers.join(", ")}`,
    };
  }
  return { chapterNumbers: filtered, error: "" };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPartialSummaryBundleFromHighlights(highlightsValue) {
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

function writePartialSummaryBundleToHighlights(
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

function writeReviewNotesBundleToHighlights(highlightsValue, reviewNotes) {
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

function writeExamCramBundleToHighlights(
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

function normalizeQuestionKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

const DEFAULT_QUIZ_MIX = Object.freeze({
  multipleChoice: 4,
  shortAnswer: 1,
  ox: 0,
});

const DEFAULT_QUIZ_MIX_INPUT = `${DEFAULT_QUIZ_MIX.multipleChoice}-${DEFAULT_QUIZ_MIX.shortAnswer}`;

function parseQuizMixInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      mix: null,
      total: 0,
      error: "문항 비율을 입력해주세요. 형식: 객관식-주관식 (예: 4-1)",
    };
  }

  const parts = raw
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));

  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    return {
      mix: null,
      total: 0,
      error: "문항 비율은 객관식-주관식 형식으로 입력해주세요. 예: 4-1",
    };
  }

  const [multipleChoice, shortAnswer] = parts;
  const total = multipleChoice + shortAnswer;
  if (total <= 0) {
    return {
      mix: null,
      total: 0,
      error: "최소 1문항 이상 입력해주세요.",
    };
  }

  return {
    mix: {
      multipleChoice,
      shortAnswer,
      ox: 0,
    },
    total,
    error: "",
  };
}

function App() {
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [pageInfo, setPageInfo] = useState({ used: 0, total: 0 });
  const [pdfUrl, setPdfUrl] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isExportingSummary, setIsExportingSummary] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [outputLanguage, setOutputLanguage] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_OUTPUT_LANGUAGE;
    const stored = String(window.localStorage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY) || "")
      .trim()
      .toLowerCase();
    return AVAILABLE_OUTPUT_LANGUAGES.includes(stored) ? stored : DEFAULT_OUTPUT_LANGUAGE;
  });
  const [summary, setSummary] = useState("");
  const [questionStyleProfileContent, setQuestionStyleProfileContent] = useState("");
  const [questionStyleProfileScopeLabel, setQuestionStyleProfileScopeLabel] = useState("");
  const [quizSets, setQuizSets] = useState([]);
  const [quizMixInput, setQuizMixInput] = useState(DEFAULT_QUIZ_MIX_INPUT);
  const [oxItems, setOxItems] = useState(null);
  const [oxSelections, setOxSelections] = useState({});
  const [oxExplanationOpen, setOxExplanationOpen] = useState({});
  const [isLoadingOx, setIsLoadingOx] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [pendingDocumentOpen, setPendingDocumentOpen] = useState(null);
  const [panelTab, setPanelTab] = useState("summary");
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentReturnSignal, setPaymentReturnSignal] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showGuestIntro, setShowGuestIntro] = useState(() => !AUTH_ENABLED);
  const [currentPage, setCurrentPage] = useState(1);
  const [visitedPages, setVisitedPages] = useState(() => new Set());
  const [mockExams, setMockExams] = useState([]);
  const [isLoadingMockExams, setIsLoadingMockExams] = useState(false);
  const [isGeneratingMockExam, setIsGeneratingMockExam] = useState(false);
  const [mockExamStatus, setMockExamStatus] = useState("");
  const [mockExamError, setMockExamError] = useState("");
  const paymentAbortFallbackTimerRef = useRef(null);
  const [activeMockExamId, setActiveMockExamId] = useState(null);
  const [showMockExamAnswers, setShowMockExamAnswers] = useState(false);
  const [isMockExamMenuOpen, setIsMockExamMenuOpen] = useState(false);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [flashcardStatus, setFlashcardStatus] = useState("");
  const [flashcardError, setFlashcardError] = useState("");
  const [tutorMessages, setTutorMessages] = useState([]);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState("");
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isPageSummaryOpen, setIsPageSummaryOpen] = useState(false);
  const [pageSummaryInput, setPageSummaryInput] = useState("");
  const [pageSummaryError, setPageSummaryError] = useState("");
  const [isPageSummaryLoading, setIsPageSummaryLoading] = useState(false);
  const [partialSummary, setPartialSummary] = useState("");
  const [partialSummaryRange, setPartialSummaryRange] = useState("");
  const [savedPartialSummaries, setSavedPartialSummaries] = useState([]);
  const [reviewNotes, setReviewNotes] = useState([]);
  const [instructorEmphasisInput, setInstructorEmphasisInput] = useState("");
  const [savedInstructorEmphases, setSavedInstructorEmphases] = useState([]);
  const [activeInstructorEmphasisId, setActiveInstructorEmphasisId] = useState("");
  const [isSavedPartialSummaryOpen, setIsSavedPartialSummaryOpen] = useState(false);
  const [reviewNotesChapterSelectionInput, setReviewNotesChapterSelectionInput] = useState("");
  const [examCramContent, setExamCramContent] = useState("");
  const [examCramUpdatedAt, setExamCramUpdatedAt] = useState("");
  const [examCramScopeLabel, setExamCramScopeLabel] = useState("");
  const [isGeneratingExamCram, setIsGeneratingExamCram] = useState(false);
  const [examCramStatus, setExamCramStatus] = useState("");
  const [examCramError, setExamCramError] = useState("");
  const [quizChapterSelectionInput, setQuizChapterSelectionInput] = useState("");
  const [oxChapterSelectionInput, setOxChapterSelectionInput] = useState("");
  const [flashcardChapterSelectionInput, setFlashcardChapterSelectionInput] = useState("");
  const [mockExamChapterSelectionInput, setMockExamChapterSelectionInput] = useState("");
  const [isChapterRangeOpen, setIsChapterRangeOpen] = useState(false);
  const [chapterRangeInput, setChapterRangeInput] = useState("");
  const [autoChapterRangeInput, setAutoChapterRangeInput] = useState("");
  const [chapterRangeError, setChapterRangeError] = useState("");
  const [isDetectingChapterRanges, setIsDetectingChapterRanges] = useState(false);
  const [artifacts, setArtifacts] = useState(null);
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const summaryContextCacheRef = useRef(new Map()); // fileId -> extended summary text
  const tutorPageTextCacheRef = useRef(new Map()); // docId:page -> { text, ocrUsed }
  const tutorSectionRangeCacheRef = useRef(new Map()); // docId:section:anchor -> range
  const chapterScopeTextCacheRef = useRef(new Map()); // scoped key -> text
  const extractTextForChapterSelectionRef = useRef(null);
  const chapterOneStartPageCacheRef = useRef(new Map()); // docId -> chapter 1 start page
  const questionSourceTextCacheRef = useRef(new Map()); // docId:chapter1 -> source text
  const quizAutoRequestedRef = useRef(false);
  const oxAutoRequestedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activeDragPointerIdRef = useRef(null);
  const dragHandleElementRef = useRef(null);
  const loadUploadsRef = useRef(null);
  const loadUploadsRequestSeqRef = useRef(0);
  const loadFoldersRequestSeqRef = useRef(0);
  const fileOpenRequestSeqRef = useRef(0);
  const detailContainerRef = useRef(null);
  const summaryRef = useRef(null);
  const reviewNotesRef = useRef([]);
  const mockExamPrintRef = useRef(null);
  const mockExamMenuRef = useRef(null);
  const mockExamMenuButtonRef = useRef(null);
  const openAiModulePromiseRef = useRef(null);
  const { user, authReady, refreshSession, handleSignOut: authSignOut } = useSupabaseAuth();
  const { tier, tierExpiresAt, tierRemainingDays, loadingTier, refreshTier } = useUserTier(user);
  const isFreeTier = tier === "free";
  const isPremiumTier = tier === "premium";
  const isFolderFeatureEnabled = !isFreeTier;
  const [usageCounts, setUsageCounts] = useState({ summary: 0, quiz: 0, ox: 0 });
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [selectedUploadIds, setSelectedUploadIds] = useState([]);
  const [premiumProfiles, setPremiumProfiles] = useState([]);
  const [activePremiumProfileId, setActivePremiumProfileId] = useState(null);
  const [showPremiumProfilePicker, setShowPremiumProfilePicker] = useState(false);
  const [showProfilePinDialog, setShowProfilePinDialog] = useState(false);
  const [profilePinInputs, setProfilePinInputs] = useState({
    currentPin: "",
    nextPin: "",
    confirmPin: "",
  });
  const [profilePinError, setProfilePinError] = useState("");
  const [premiumSpaceMode, setPremiumSpaceMode] = useState(PREMIUM_SPACE_MODE_PROFILE);
  const premiumProfileHydratedRef = useRef(false);
  const premiumProfileSyncSignatureRef = useRef("");
  const safeStatus = useMemo(() => sanitizeUiText(status, ""), [status]);
  const safeError = useMemo(() => sanitizeUiText(error, "오류가 발생했습니다."), [error]);
  const safePageSummaryError = useMemo(
    () => sanitizeUiText(pageSummaryError, "페이지 요약 처리 중 오류가 발생했습니다."),
    [pageSummaryError]
  );
  const safeChapterRangeError = useMemo(
    () => sanitizeUiText(chapterRangeError, "챕터 범위를 다시 확인해주세요."),
    [chapterRangeError]
  );
  const safeMockExamStatus = useMemo(
    () => sanitizeUiText(mockExamStatus, "모의고사 작업이 완료되었습니다."),
    [mockExamStatus]
  );
  const safeMockExamError = useMemo(
    () => sanitizeUiText(mockExamError, "모의고사 처리 중 오류가 발생했습니다."),
    [mockExamError]
  );
  const safeFlashcardStatus = useMemo(
    () => sanitizeUiText(flashcardStatus, "플래시카드 작업이 완료되었습니다."),
    [flashcardStatus]
  );
  const safeFlashcardError = useMemo(
    () => sanitizeUiText(flashcardError, "플래시카드 처리 중 오류가 발생했습니다."),
    [flashcardError]
  );
  const safeExamCramStatus = useMemo(
    () => sanitizeUiText(examCramStatus, "시험 직전 정리가 준비되었습니다."),
    [examCramStatus]
  );
  const safeExamCramError = useMemo(
    () => sanitizeUiText(examCramError, "시험 직전 정리 처리 중 오류가 발생했습니다."),
    [examCramError]
  );
  const safeTutorError = useMemo(
    () => sanitizeUiText(tutorError, "튜터 응답 처리 중 오류가 발생했습니다."),
    [tutorError]
  );
  const safeProfilePinError = useMemo(
    () => sanitizeUiText(profilePinError, "PIN 입력을 다시 확인해주세요."),
    [profilePinError]
  );
  const isNativePlatform = Capacitor.isNativePlatform();
  const shouldForceNativeAuthEntry = AUTH_ENABLED && isNativePlatform && authReady && !user;
  const shouldRenderAuthScreen = AUTH_ENABLED && !user && (showAuth || shouldForceNativeAuthEntry);
  const shouldShowAdBanner = !loadingTier && tier === "free" && !shouldRenderAuthScreen;
  const { bannerHeight } = useAdMobBanner({ enabled: shouldShowAdBanner });
  const appShellStyle = useMemo(
    () => ({
      "--app-banner-offset": `${Math.max(0, Number(bannerHeight) || 0)}px`,
    }),
    [bannerHeight]
  );
  const buildHistoryState = useCallback(
    (override = null) => {
      if (override && typeof override === "object") {
        return { appNav: true, ...override };
      }
      if (selectedFileId) {
        return { appNav: true, view: "detail", fileId: selectedFileId };
      }
      return { appNav: true, view: "list" };
    },
    [selectedFileId]
  );
  const updateHistoryState = useCallback(
    (mode = "replace", override = null) => {
      if (typeof window === "undefined" || !window.history) return;
      const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextState = buildHistoryState(override);
      if (mode === "push") {
        window.history.pushState(nextState, "", url);
        return;
      }
      window.history.replaceState(nextState, "", url);
    },
    [buildHistoryState]
  );

  const computeFileHash = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);
  const normalizeSupportedFile = useCallback((inputFile) => normalizeSupportedDocumentFile(inputFile), []);
  const getOpenAiService = useCallback(async () => {
    if (!openAiModulePromiseRef.current) {
      openAiModulePromiseRef.current = import("./services/openai");
    }
    return openAiModulePromiseRef.current;
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, outputLanguage);
  }, [outputLanguage]);
  const requestPreviewPdfConversion = useCallback(
    async (item, { force = false } = {}) => {
      const uploadId = item?.id;
      const storagePath = item?.remotePath || item?.path;
      const fileName = item?.name || item?.file?.name || "";
      const documentKind = detectSupportedDocumentKind(item?.file || fileName);

      if (!user || !supabase || !AUTH_ENABLED) return item;
      if (!uploadId || !storagePath || !isConvertibleOfficeDocumentKind(documentKind)) return item;

      const accessToken = await getAccessToken();
      if (!accessToken) return item;

      const result = await ensureUploadPreviewPdfRequest(
        {
          uploadId,
          bucket: item?.bucket,
          storagePath,
          fileName,
          force,
        },
        { accessToken }
      );

      const nextItem = {
        ...item,
        previewPdfPath: result?.previewPdfPath || item?.previewPdfPath || null,
        previewPdfBucket: result?.previewPdfBucket || item?.previewPdfBucket || item?.bucket || null,
        previewPdfUrl: result?.signedUrl || item?.previewPdfUrl || "",
      };

      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id?.toString() === uploadId?.toString()
            ? { ...entry, ...nextItem }
            : entry
        )
      );
      return nextItem;
    },
    [user, supabase]
  );
  const resolvePreviewPdfUrlForItem = useCallback(async (item) => {
    const previewPdfPath = String(item?.previewPdfPath || "").trim();
    if (!previewPdfPath) return "";

    const cachedUrl = String(item?.previewPdfUrl || "").trim();
    if (cachedUrl) return cachedUrl;

    const previewPdfBucket = item?.previewPdfBucket || item?.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
    const signedUrl = await getSignedStorageUrl({
      bucket: previewPdfBucket,
      path: previewPdfPath,
      expiresIn: 60 * 60 * 24,
    });

    setUploadedFiles((prev) =>
      prev.map((entry) =>
        entry.id?.toString() === item?.id?.toString()
          ? {
              ...entry,
              previewPdfPath,
              previewPdfBucket,
              previewPdfUrl: signedUrl,
            }
          : entry
      )
    );
    return signedUrl;
  }, []);
  const refreshUploadThumbnailFromPreviewPdf = useCallback(
    async (item) => {
      const documentKind = detectSupportedDocumentKind(item?.file || item?.name || "");
      if (!isConvertibleOfficeDocumentKind(documentKind)) return item;
      if (!item?.id || !String(item?.previewPdfPath || "").trim()) return item;
      if (item?.thumbnail && !hasOfficePlaceholderThumbnail(item.thumbnail)) return item;

      const previewPdfUrl = await resolvePreviewPdfUrlForItem(item);
      if (!previewPdfUrl) return item;

      const response = await fetch(previewPdfUrl);
      if (!response.ok) {
        throw new Error(`Preview PDF thumbnail fetch failed. (status: ${response.status})`);
      }

      const blob = await response.blob();
      const previewPdfFile = new File([blob], toPreviewPdfFileName(item?.name), {
        type: "application/pdf",
      });
      const thumbnail = await generatePdfThumbnail(previewPdfFile);
      if (!thumbnail) return item;

      await updateUploadThumbnail({ id: item.id, thumbnail });
      const updatedItem = { ...item, thumbnail, previewPdfUrl };
      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id?.toString() === item.id?.toString()
            ? { ...entry, thumbnail, previewPdfUrl }
            : entry
        )
      );
      return updatedItem;
    },
    [resolvePreviewPdfUrlForItem]
  );

  const limits = useMemo(() => {
    if (tier === "free") {
      return {
        maxUploads: 4,
        maxSummary: 1,
        maxQuiz: 1,
        maxOx: 1,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.free,
      };
    }
    if (tier === "pro") {
      return {
        maxUploads: Infinity,
        maxSummary: Infinity,
        maxQuiz: Infinity,
        maxOx: Infinity,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.pro,
      };
    }
    return {
      maxUploads: Infinity,
      maxSummary: Infinity,
      maxQuiz: Infinity,
      maxOx: Infinity,
      maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.premium,
    };
  }, [tier]);

  const hasReached = useCallback(
    (type) => {
      if (!limits) return false;
      if (limits[type] === Infinity) return false;
      return usageCounts[type] >= limits[type];
    },
    [limits, usageCounts]
  );

  const openAuth = useCallback(() => {
    if (!AUTH_ENABLED) return;
    setShowAuth(true);
  }, []);

  const closeAuth = useCallback(() => {
    setShowAuth(false);
  }, []);

  const clearPaymentAbortFallback = useCallback(() => {
    if (paymentAbortFallbackTimerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(paymentAbortFallbackTimerRef.current);
      paymentAbortFallbackTimerRef.current = null;
    }
  }, []);

  const closePayment = useCallback(() => {
    clearPaymentAbortFallback();
    clearPaymentReturnPending();
    setShowPayment(false);
  }, [clearPaymentAbortFallback]);

  const openBilling = useCallback(() => {
    setShowPayment(true);
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  const handleOpenFeedbackDialog = useCallback(() => {
    if (!user) {
      setStatus("\uD53C\uB4DC\uBC31\uC744 \uBCF4\uB0B4\uB824\uBA74 \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.");
      openAuth();
      return;
    }
    setFeedbackError("");
    setIsFeedbackDialogOpen(true);
  }, [openAuth, user]);

  const handleCloseFeedbackDialog = useCallback(() => {
    if (isSubmittingFeedback) return;
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
  }, [isSubmittingFeedback]);

  const activePremiumProfile = useMemo(
    () => premiumProfiles.find((profile) => profile.id === activePremiumProfileId) || null,
    [premiumProfiles, activePremiumProfileId]
  );
  const premiumOwnerProfileId = useMemo(() => premiumProfiles[0]?.id || null, [premiumProfiles]);
  const premiumScopeProfileId = useMemo(() => {
    if (!isPremiumTier) return null;
    if (premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED) {
      return PREMIUM_SHARED_SCOPE_ID;
    }
    return activePremiumProfileId || null;
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode]);
  const { savePageProgressSnapshot, loadPageProgressSnapshot } = usePageProgressCache({
    isPremiumTier,
    activePremiumProfileId,
  });
  const getChapterRangeStorageKey = useCallback(
    (docId) =>
      buildChapterRangeStorageKey({
        userId: user?.id,
        scopeId: isPremiumTier ? premiumScopeProfileId : "default",
        docId,
      }),
    [isPremiumTier, premiumScopeProfileId, user?.id]
  );
  const loadSavedChapterRangeInput = useCallback(
    (docId) => {
      if (typeof window === "undefined") return "";
      const key = getChapterRangeStorageKey(docId);
      if (!key) return "";
      try {
        return String(window.localStorage.getItem(key) || "");
      } catch {
        return "";
      }
    },
    [getChapterRangeStorageKey]
  );
  const persistChapterRangeInput = useCallback(
    (docId, value) => {
      if (typeof window === "undefined") return;
      const key = getChapterRangeStorageKey(docId);
      if (!key) return;
      const normalized = String(value || "").trim();
      try {
        if (normalized) {
          window.localStorage.setItem(key, normalized);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch {
        // Ignore storage write errors.
      }
    },
    [getChapterRangeStorageKey]
  );

  const resetActiveDocumentState = useCallback(() => {
    fileOpenRequestSeqRef.current += 1;
    if (pdfUrl) {
      revokeObjectUrlIfNeeded(pdfUrl);
    }
    setSelectedFileId(null);
    setPendingDocumentOpen(null);
    setFile(null);
    setPdfUrl(null);
    setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setReviewNotes([]);
    reviewNotesRef.current = [];
    setInstructorEmphasisInput("");
    setSavedInstructorEmphases([]);
    setActiveInstructorEmphasisId("");
    setIsSavedPartialSummaryOpen(false);
    setReviewNotesChapterSelectionInput("");
    setExamCramContent("");
    setExamCramUpdatedAt("");
    setExamCramScopeLabel("");
    setExamCramStatus("");
    setExamCramError("");
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    setAutoChapterRangeInput("");
    tutorPageTextCacheRef.current.clear();
    tutorSectionRangeCacheRef.current.clear();
    chapterScopeTextCacheRef.current.clear();
    summaryContextCacheRef.current.clear();
    setQuizSets([]);
    setOxItems(null);
    setOxSelections({});
    setOxExplanationOpen({});
    setThumbnailUrl(null);
    setIsLoadingText(false);
    setPanelTab("summary");
    setMockExams([]);
    setActiveMockExamId(null);
    setShowMockExamAnswers(false);
    setMockExamStatus("");
    setMockExamError("");
    setFlashcards([]);
    setArtifacts(null);
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
  }, [pdfUrl]);

  const handleOpenProfilePicker = useCallback(() => {
    if (!user || !isPremiumTier) return;
    setShowPremiumProfilePicker(true);
  }, [isPremiumTier, user]);

  const handleOpenProfilePinDialog = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
    setShowProfilePinDialog(true);
  }, [activePremiumProfileId, isPremiumTier, user]);

  const handleCloseProfilePinDialog = useCallback(() => {
    setShowProfilePinDialog(false);
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
  }, []);

  const handleChangeProfilePinInput = useCallback((field, value) => {
    const sanitized = String(value || "").replace(/\D/g, "").slice(0, 4);
    setProfilePinInputs((prev) => ({ ...prev, [field]: sanitized }));
    setProfilePinError("");
  }, []);

  const handleCloseProfilePicker = useCallback(() => {
    if (!activePremiumProfileId) return;
    setShowPremiumProfilePicker(false);
  }, [activePremiumProfileId]);

  const handleTogglePremiumSpaceMode = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    const nextMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_PROFILE
        : PREMIUM_SPACE_MODE_SHARED;
    resetActiveDocumentState();
    setSelectedFolderId("all");
    setSelectedUploadIds([]);
    setPremiumSpaceMode(nextMode);
      setStatus(
        nextMode === PREMIUM_SPACE_MODE_SHARED
          ? "怨듭쑀 ?숈뒿 紐⑤뱶媛 耳쒖죱?듬땲?? ?숈뒿 ?곗씠?곌? ?꾨━誘몄뾼 硫ㅻ쾭? 怨듭쑀?⑸땲??"
          : "媛쒖씤 ?숈뒿 紐⑤뱶媛 耳쒖죱?듬땲?? ?숈뒿 ?곗씠?곌? ?꾩옱 ?꾨줈?꾩뿉留???λ맗?덈떎."
      );
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode, resetActiveDocumentState, user]);

  const handleSelectPremiumProfile = useCallback(
    (profileId, pinInput) => {
      const selected = premiumProfiles.find((profile) => profile.id === profileId);
      if (!selected) {
        return { ok: false, message: "?좏깮???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎." };
      }
      const inputPin = normalizePremiumProfilePinInput(pinInput);
      if (!inputPin) {
        return { ok: false, message: "4?먮━ PIN???낅젰?댁＜?몄슂." };
      }
      const expectedPin = sanitizePremiumProfilePin(selected.pin);
      if (inputPin !== expectedPin) {
        return { ok: false, message: "PIN???щ컮瑜댁? ?딆뒿?덈떎." };
      }
      resetActiveDocumentState();
      setSelectedFolderId("all");
      setSelectedUploadIds([]);
      setActivePremiumProfileId(selected.id);
      setShowPremiumProfilePicker(false);
      setStatus(`${selected.name} ?꾨줈?꾩씠 ?좏깮?섏뿀?듬땲??`);
      return { ok: true };
    },
    [premiumProfiles, resetActiveDocumentState]
  );

  const handleSubmitProfilePinChange = useCallback(
    (event) => {
      event.preventDefault();
      if (!activePremiumProfileId) {
        setProfilePinError("?좏깮???꾨줈?꾩씠 ?놁뒿?덈떎.");
        return;
      }
      const currentProfile = premiumProfiles.find((profile) => profile.id === activePremiumProfileId);
      if (!currentProfile) {
        setProfilePinError("?좏깮???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎.");
        return;
      }
      const currentPin = normalizePremiumProfilePinInput(profilePinInputs.currentPin);
      const nextPin = normalizePremiumProfilePinInput(profilePinInputs.nextPin);
      const confirmPin = normalizePremiumProfilePinInput(profilePinInputs.confirmPin);

      if (!currentPin || !nextPin || !confirmPin) {
        setProfilePinError("紐⑤뱺 PIN? 4?먮━ ?レ옄?ъ빞 ?⑸땲??");
        return;
      }
      if (currentPin !== sanitizePremiumProfilePin(currentProfile.pin)) {
        setProfilePinError("?꾩옱 PIN???쇱튂?섏? ?딆뒿?덈떎.");
        return;
      }
      if (nextPin !== confirmPin) {
        setProfilePinError("??PIN怨??뺤씤 PIN???쇱튂?섏? ?딆뒿?덈떎.");
        return;
      }
      if (nextPin === currentPin) {
        setProfilePinError("??PIN? ?꾩옱 PIN怨??щ씪???⑸땲??");
        return;
      }

      setPremiumProfiles((prev) =>
        prev.map((profile) =>
          profile.id === activePremiumProfileId ? { ...profile, pin: nextPin } : profile
        )
      );
      setShowProfilePinDialog(false);
      setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
      setProfilePinError("");
      setStatus("?꾨줈??PIN??蹂寃쎈릺?덉뒿?덈떎.");
    },
    [activePremiumProfileId, premiumProfiles, profilePinInputs]
  );

  const handleCreatePremiumProfile = useCallback(
    (requestedName) => {
      if (!isPremiumTier) return;
      setPremiumProfiles((prev) => {
        if (prev.length >= PREMIUM_PROFILE_LIMIT) return prev;
        const index = prev.length;
        const preset = PREMIUM_PROFILE_PRESETS[index % PREMIUM_PROFILE_PRESETS.length];
        const created = {
          id: createPremiumProfileId(),
          name: sanitizePremiumProfileName(requestedName, `Member ${index + 1}`),
          color: preset.color,
          avatar: preset.avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        };
        return [...prev, created];
      });
    },
    [isPremiumTier]
  );

  useEffect(() => {
    premiumProfileHydratedRef.current = false;
    if (!user?.id || !isPremiumTier) {
      setPremiumProfiles([]);
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(false);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      premiumProfileSyncSignatureRef.current = "";
      return;
    }
    const remoteState = getPremiumProfileStateFromUser(user);
    const remoteProfiles = normalizePremiumProfiles(remoteState?.profiles);
    const hasRemoteProfiles = remoteProfiles.length > 0;
    const remoteActiveProfileId = String(remoteState?.activeProfileId || "").trim();
    const remoteSpaceModeRaw = String(remoteState?.spaceMode || "").trim();
    const remoteSpaceMode =
      remoteSpaceModeRaw === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : remoteSpaceModeRaw === PREMIUM_SPACE_MODE_PROFILE
          ? PREMIUM_SPACE_MODE_PROFILE
          : "";

    let loadedProfiles = hasRemoteProfiles ? remoteProfiles : [];
    let storedActiveProfileId = "";
    let normalizedSpaceMode = remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE;

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);

      let localProfiles = [];
      try {
        const raw = window.localStorage.getItem(profilesKey);
        localProfiles = normalizePremiumProfiles(raw ? JSON.parse(raw) : []);
      } catch {
        localProfiles = [];
      }
      const shouldPreferLocalProfiles =
        localProfiles.length > loadedProfiles.length &&
        localProfiles.some((localProfile) => !loadedProfiles.some((remote) => remote.id === localProfile.id));

      if ((!loadedProfiles.length && localProfiles.length) || shouldPreferLocalProfiles) {
        loadedProfiles = localProfiles;
      }

      storedActiveProfileId = String(window.localStorage.getItem(activeProfileKey) || "").trim();

      const storedSpaceMode = String(window.localStorage.getItem(spaceModeKey) || "").trim();
      const localSpaceMode =
        storedSpaceMode === PREMIUM_SPACE_MODE_SHARED
          ? PREMIUM_SPACE_MODE_SHARED
          : PREMIUM_SPACE_MODE_PROFILE;
      if (!remoteSpaceMode) {
        normalizedSpaceMode = localSpaceMode;
      }
      if (storedSpaceMode && storedSpaceMode !== localSpaceMode) {
        window.localStorage.removeItem(spaceModeKey);
      }
    }

    if (loadedProfiles.length === 0) {
      const ownerName = sanitizePremiumProfileName(
        user?.user_metadata?.name || user?.email?.split("@")?.[0] || "공유 공간",
        "공유 공간"
      );
      loadedProfiles = [
        {
          id: createPremiumProfileId(),
          name: ownerName,
          color: PREMIUM_PROFILE_PRESETS[0].color,
          avatar: PREMIUM_PROFILE_PRESETS[0].avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        },
      ];
    }

    const preferredActiveProfileId = remoteActiveProfileId || storedActiveProfileId;
    const hasPreferredActiveProfile = loadedProfiles.some(
      (profile) => profile.id === preferredActiveProfileId
    );
    const resolvedActiveProfileId = hasPreferredActiveProfile ? preferredActiveProfileId : "";

    setPremiumProfiles(loadedProfiles);
    setPremiumSpaceMode(normalizedSpaceMode);
    if (resolvedActiveProfileId) {
      setActivePremiumProfileId(resolvedActiveProfileId);
      setShowPremiumProfilePicker(false);
    } else {
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(true);
    }

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);
      try {
        window.localStorage.setItem(profilesKey, JSON.stringify(loadedProfiles));
        if (resolvedActiveProfileId) {
          window.localStorage.setItem(activeProfileKey, resolvedActiveProfileId);
        } else {
          window.localStorage.removeItem(activeProfileKey);
        }
        window.localStorage.setItem(spaceModeKey, normalizedSpaceMode);
      } catch {
        // Ignore local cache write errors.
      }
    }

    const syncSignature = JSON.stringify({
      profiles: loadedProfiles,
      activeProfileId: resolvedActiveProfileId || null,
      spaceMode: normalizedSpaceMode,
    });
    const remoteResolvedActiveProfileId = remoteProfiles.some(
      (profile) => profile.id === remoteActiveProfileId
    )
      ? remoteActiveProfileId
      : null;
    const remoteSignature = JSON.stringify({
      profiles: remoteProfiles,
      activeProfileId: remoteResolvedActiveProfileId,
      spaceMode: remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE,
    });
    premiumProfileSyncSignatureRef.current = syncSignature === remoteSignature ? syncSignature : "";
    premiumProfileHydratedRef.current = true;
  }, [isPremiumTier, user]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const normalized = normalizePremiumProfiles(premiumProfiles);
    if (!normalized.length) return;
    window.localStorage.setItem(getPremiumProfilesStorageKey(user.id), JSON.stringify(normalized));
  }, [isPremiumTier, premiumProfiles, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumActiveProfileStorageKey(user.id);
    if (activePremiumProfileId) {
      window.localStorage.setItem(key, activePremiumProfileId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [activePremiumProfileId, isPremiumTier, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumSpaceModeStorageKey(user.id);
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    window.localStorage.setItem(key, normalizedMode);
  }, [isPremiumTier, premiumSpaceMode, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || !premiumProfileHydratedRef.current) return;
    const normalizedProfiles = normalizePremiumProfiles(premiumProfiles);
    if (!normalizedProfiles.length) return;
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    const resolvedActiveProfileId = normalizedProfiles.some(
      (profile) => profile.id === activePremiumProfileId
    )
      ? activePremiumProfileId
      : null;
    const syncSignature = JSON.stringify({
      profiles: normalizedProfiles,
      activeProfileId: resolvedActiveProfileId,
      spaceMode: normalizedMode,
    });
    if (syncSignature === premiumProfileSyncSignatureRef.current) return;

    premiumProfileSyncSignatureRef.current = syncSignature;
    let cancelled = false;
    (async () => {
      try {
        await savePremiumProfileState({
          profiles: normalizedProfiles,
          activeProfileId: resolvedActiveProfileId,
          spaceMode: normalizedMode,
        });
      } catch (err) {
        if (!cancelled) {
          premiumProfileSyncSignatureRef.current = "";
          // eslint-disable-next-line no-console
          console.warn("Failed to sync premium profile state", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activePremiumProfileId,
    isPremiumTier,
    premiumProfiles,
    premiumSpaceMode,
    user?.id,
  ]);

  useEffect(() => {
    if (user) {
      setShowAuth(false);
    }
  }, [user]);

  useEffect(() => {
    if (!showProfilePinDialog) return undefined;
    const prevOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleCloseProfilePinDialog();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseProfilePinDialog, showProfilePinDialog]);

  const loadFolders = useCallback(
    async () => {
      const requestSeq = loadFoldersRequestSeqRef.current + 1;
      loadFoldersRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadFoldersRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      try {
        const list = await listFolders({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((folder) => {
          const decoded = decodePremiumScopeValue(folder?.name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            ...folder,
            name: decoded.value || folder?.name || "",
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((folder) => folder.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setFolders(scoped);
        setSelectedFolderId((prev) => {
          if (prev === "all") return "all";
          const hasFolder = scoped.some((folder) => folder.id?.toString() === prev?.toString());
          return hasFolder ? prev : "all";
        });
      } catch (err) {
        if (!isLatestRequest()) return;
        setError(`?대뜑瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );

  const handleCreateFolder = useCallback(
    async (name) => {
      if (!isFolderFeatureEnabled) {
        setError("?대뜑 湲곕뒫? Pro ?먮뒗 Premium ?붽툑?쒖뿉?쒕쭔 ?ъ슜?????덉뒿?덈떎.");
        return;
      }
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (isPremiumTier && !premiumScopeProfileId) {
        setError("?대뜑瑜?留뚮뱾湲??꾩뿉 ?꾨━誘몄뾼 ?꾨줈?꾩쓣 ?좏깮?댁＜?몄슂.");
        return;
      }
      if (folders.some((f) => f.name === trimmed)) {
        setStatus("媛숈? ?대쫫???대뜑媛 ?대? ?덉뒿?덈떎.");
        return;
      }
      try {
        const storedName =
          isPremiumTier && premiumScopeProfileId
            ? encodePremiumScopeValue(trimmed, premiumScopeProfileId)
            : trimmed;
        const created = await createFolder({ userId: user.id, name: storedName });
        if (created) {
          const decoded = decodePremiumScopeValue(created?.name || trimmed);
          const ownerProfileId = isPremiumTier
            ? decoded.ownerProfileId || premiumOwnerProfileId || premiumScopeProfileId
            : null;
          setFolders((prev) => [
            ...prev,
            {
              ...created,
              name: decoded.value || trimmed,
              ownerProfileId,
            },
          ]);
        }
        setSelectedFolderId("all");
        setSelectedUploadIds([]);
        setStatus("?대뜑瑜??앹꽦?덉뒿?덈떎.");
      } catch (err) {
        setError(`?대뜑 ?앹꽦???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, folders, isPremiumTier, premiumScopeProfileId, premiumOwnerProfileId]
  );

  const handleDeleteFolder = useCallback(
    async (folderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const hasFiles = uploadedFiles.some((u) => u.folderId === folderId);
      if (hasFiles) {
        setError("???대뜑瑜???젣?섍린 ?꾩뿉 ?뚯씪???대룞?섍굅????젣?댁＜?몄슂.");
        return;
      }
      try {
        await deleteFolder({ userId: user.id, folderId });
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }
      } catch (err) {
        setError(`?대뜑 ??젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, uploadedFiles, selectedFolderId, user]
  );

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setSelectedUploadIds([]);
  }, []);

  const handleToggleUploadSelect = useCallback(
    (uploadId) => {
      if (!isFolderFeatureEnabled) return;
      setSelectedUploadIds((prev) =>
        prev.includes(uploadId) ? prev.filter((id) => id !== uploadId) : [...prev, uploadId]
      );
    },
    [isFolderFeatureEnabled]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedUploadIds([]);
  }, []);

  const handleDeleteUpload = useCallback(
    async (upload) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          const uploadId = upload?.id || null;
          if (!uploadId) return;
          setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
          setSelectedUploadIds((prev) => prev.filter((id) => id !== uploadId));
          persistChapterRangeInput(uploadId, "");
          setStatus("Local upload removed.");
          return;
        }
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const uploadId = upload?.id || null;
      const storagePath = upload?.path || upload?.remotePath || null;
      if (!uploadId && !storagePath) {
        setError("?낅줈???앸퀎?먭? ?놁뒿?덈떎.");
        return;
      }
      const before = uploadedFiles;
      setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
      try {
        await deleteUpload({
          userId: user.id,
          uploadId,
          bucket: upload.bucket,
          path: storagePath,
          previewPdfBucket: upload.previewPdfBucket,
          previewPdfPath: upload.previewPdfPath,
        });
        if (uploadId) {
          persistChapterRangeInput(uploadId, "");
        }
        setStatus("?낅줈?쒕? ??젣?덉뒿?덈떎.");
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`?낅줈????젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [persistChapterRangeInput, uploadedFiles, user]
  );

  const handleMoveUploadsToFolder = useCallback(
    async (uploadIds, targetFolderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!uploadIds || uploadIds.length === 0) return;
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const normalizedIds = uploadIds.map((id) => id?.toString()).filter(Boolean);
      const target = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      if (isPremiumTier && target && !folders.some((folder) => folder.id?.toString() === target)) {
        setError("?꾩옱 ?꾨━誘몄뾼 ?꾨줈??踰붿쐞??????대뜑媛 ?놁뒿?덈떎.");
        return;
      }
      const before = uploadedFiles;
      const targetEntries = before.filter((item) => normalizedIds.includes(item.id?.toString()));
      const remoteIds = targetEntries.map((item) => item.id).filter(Boolean);
      const remotePaths = targetEntries.map((item) => item.path || item.remotePath).filter(Boolean);
      try {
        if (remoteIds.length > 0 || remotePaths.length > 0) {
          const updated = await updateUploadFolder({
            userId: user.id,
            uploadIds: remoteIds,
            storagePaths: remotePaths,
            folderId: target,
          });
          const updatedMap = new Map();
          (updated || []).forEach((u) => {
            const folderVal = u.folder_id || null;
            const infolderVal = Number(u.infolder ?? (folderVal ? 1 : 0));
            if (u.id) updatedMap.set(u.id.toString(), { folderId: folderVal, infolder: infolderVal });
            if (u.storage_path) updatedMap.set(u.storage_path, { folderId: folderVal, infolder: infolderVal });
          });
          setUploadedFiles((prev) =>
            prev.map((item) => {
              const key = item.id?.toString();
              if (!normalizedIds.includes(key)) return item;
              const mapped = updatedMap.get(key) || updatedMap.get(item.path || item.remotePath);
              const nextFolder = mapped?.folderId ?? target;
              const nextInFolder = Number(mapped?.infolder ?? (nextFolder ? 1 : 0));
              return { ...item, folderId: nextFolder, infolder: nextInFolder };
            })
          );
        } else {
          // Local-only items without remote IDs: update folder fields in memory.
          setUploadedFiles((prev) =>
            prev.map((item) =>
              normalizedIds.includes(item.id?.toString())
                ? { ...item, folderId: target, infolder: target ? 1 : 0 }
                : item
            )
          );
        }
        setSelectedUploadIds([]);
        setStatus("?좏깮???낅줈?쒕? ?대룞?덉뒿?덈떎.");
        // Sync with server to keep list and folder counts in sync with DB.
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`?낅줈???대룞???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, uploadedFiles, isPremiumTier, folders]
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );
  const parsedQuizMix = useMemo(() => parseQuizMixInput(quizMixInput), [quizMixInput]);
  const quizMix = parsedQuizMix.mix;
  const quizMixError = parsedQuizMix.error;

  const tutorNotice = useMemo(() => {
    const selectedKind = detectSupportedDocumentKind(file);
    if (!file || !selectedFileId) {
      return "Open a PDF, or attach a screenshot to ask the tutor.";
    }
    if (!isPdfDocumentKind(selectedKind)) {
      return "Page-grounded tutor mode needs a PDF. You can still attach a screenshot and ask from that image.";
    }
    if (isLoadingText) {
      return "PDF text extraction is still running. Screenshot questions can still be sent right away.";
    }
    const trimmed = (extractedText || "").trim();
    if (!trimmed) {
      return "No readable PDF text was found yet. Attach a screenshot if you want the tutor to explain that instead.";
    }
    return "";
  }, [extractedText, file, isLoadingText, selectedFileId]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.remove("theme-light");
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pg_token") || params.get("kakaoPay") || params.get("nicePay") || params.get("np_token")) {
      setShowPayment(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isNativePlatform || !NativeAppPlugin) return undefined;

    const applyPaymentReturnUrl = (rawUrl) => {
      clearPaymentAbortFallback();
      const nextPaymentParams = extractPaymentReturnParams(rawUrl);
      if (!nextPaymentParams) {
        if (isNativePaymentCallbackUrl(rawUrl) && readPaymentReturnPending()) {
          paymentAbortFallbackTimerRef.current = window.setTimeout(() => {
            paymentAbortFallbackTimerRef.current = null;
            if (!readPaymentReturnPending()) return;
            const currentParams = new URLSearchParams(window.location.search);
            const hasPaymentReturnParams = PAYMENT_RETURN_QUERY_KEYS.some((key) => {
              const value = currentParams.get(key);
              return value != null && value !== "";
            });
            if (hasPaymentReturnParams) return;
            clearPaymentReturnPending();
            setShowPayment(false);
          }, NATIVE_PAYMENT_RETURN_FALLBACK_MS);
          return true;
        }
        return false;
      }

      const currentUrl = new URL(window.location.href);
      PAYMENT_RETURN_QUERY_KEYS.forEach((key) => currentUrl.searchParams.delete(key));
      nextPaymentParams.forEach((value, key) => currentUrl.searchParams.set(key, value));

      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      const nextState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : buildHistoryState();

      window.history.replaceState(nextState, "", nextUrl);
      setShowPayment(true);
      setPaymentReturnSignal((prev) => prev + 1);
      return true;
    };

    let cancelled = false;
    let listenerHandle = null;

    (async () => {
      try {
        if (typeof NativeAppPlugin.getLaunchUrl === "function") {
          const launchData = await NativeAppPlugin.getLaunchUrl();
          if (!cancelled) {
            applyPaymentReturnUrl(launchData?.url);
          }
        }

        listenerHandle = await NativeAppPlugin.addListener("appUrlOpen", ({ url }) => {
          if (cancelled) return;
          applyPaymentReturnUrl(url);
        });
      } catch (err) {
        console.warn("Native payment appUrlOpen listener setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      clearPaymentAbortFallback();
      listenerHandle?.remove?.();
    };
  }, [buildHistoryState, clearPaymentAbortFallback, isNativePlatform]);

  useEffect(() => {
    if (!AUTH_ENABLED || !authReady || user || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const authParam = String(url.searchParams.get("auth") || url.searchParams.get("login") || "")
      .trim()
      .toLowerCase();

    if (!["1", "true", "yes", "on"].includes(authParam)) return;

    setShowAuth(true);
    url.searchParams.delete("auth");
    url.searchParams.delete("login");

    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, [authReady, user]);

  useEffect(() => {
    if (!isMockExamMenuOpen) return;
    const handleClickOutside = (event) => {
      if (event.button === 2) return;
      const menu = mockExamMenuRef.current;
      const button = mockExamMenuButtonRef.current;
      if (menu && menu.contains(event.target)) return;
      if (button && button.contains(event.target)) return;
      setIsMockExamMenuOpen(false);
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsMockExamMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isMockExamMenuOpen]);

  const loadMockExams = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setMockExams([]);
        return;
      }
      setIsLoadingMockExams(true);
      try {
        const list = await fetchMockExams({ userId: user.id, docId });
        const normalized = (Array.isArray(list) ? list : []).map((exam) => {
          const payload = exam?.payload || {};
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const answerSheet = buildMockExamAnswerSheet(items, payload?.answerSheet);
          return {
            ...exam,
            payload: {
              ...payload,
              items,
              answerSheet,
            },
          };
        });
        setMockExams(normalized);
      } catch (err) {
        setMockExamError(`모의고사 목록을 불러오지 못했습니다: ${err.message}`);
      } finally {
        setIsLoadingMockExams(false);
      }
    },
    [user]
  );
  const loadFlashcards = useCallback(
    async (deckId) => {
      if (!supabase || !user) {
        setFlashcards([]);
        return;
      }
      setIsLoadingFlashcards(true);
      try {
        const list = await listFlashcards({ userId: user.id, deckId });
        setFlashcards(list);
      } catch (err) {
        setError(`?뚮옒?쒖뭅?쒕? 遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
      } finally {
        setIsLoadingFlashcards(false);
      }
    },
    [user]
  );
  const loadUploads = useCallback(
    async () => {
      const requestSeq = loadUploadsRequestSeqRef.current + 1;
      loadUploadsRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadUploadsRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setSelectedUploadIds([]);
        return;
      }
      try {
        const list = await listUploads({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((u) => {
          const decoded = decodePremiumScopeValue(u.file_name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            id: u.id || `${u.storage_path}`,
            file: null,
            name: decoded.value || u.file_name,
            size: u.file_size,
            path: u.storage_path,
            bucket: u.bucket,
            previewPdfPath: u.preview_pdf_path || null,
            previewPdfBucket: u.preview_pdf_bucket || null,
            previewPdfUrl: "",
            thumbnail: u.thumbnail || null,
            remote: true,
            hash: u.file_hash || null,
            folderId: u.folder_id || null,
            infolder: Number(u.infolder ?? (u.folder_id ? 1 : 0)) || 0,
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((item) => item.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setUploadedFiles(scoped);
        setSelectedUploadIds((prev) =>
          prev.filter((id) => scoped.some((item) => item.id?.toString() === id?.toString()))
        );
      } catch (err) {
        if (!isLatestRequest()) return;
        setError(`?낅줈??紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );
  useEffect(() => {
    loadUploadsRef.current = loadUploads;
  }, [loadUploads]);

  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    if (!user) {
      setStatus("濡쒓렇?????덈줈怨좎묠???ъ슜?????덉뒿?덈떎.");
      openAuth();
      return;
    }
    if (loadingTier) {
      setStatus("怨꾩젙 ?뺣낫瑜?遺덈윭?ㅻ뒗 以묒엯?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
      return;
    }

    setIsManualSyncing(true);
    setError("");
    setStatus("?쒕쾭? ?숆린??以?..");
    try {
      await Promise.all([loadFolders(), loadUploads()]);
      if (selectedFileId) {
        await Promise.all([loadMockExams(selectedFileId), loadFlashcards(selectedFileId)]);
      }
      setStatus("?덈줈怨좎묠 ?꾨즺. 理쒖떊 ?곹깭濡??숆린?뷀뻽?듬땲??");
    } catch (err) {
      setError(`?덈줈怨좎묠???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      setStatus("");
    } finally {
      setIsManualSyncing(false);
    }
  }, [
    isManualSyncing,
    loadFlashcards,
    loadFolders,
    loadMockExams,
    loadUploads,
    loadingTier,
    openAuth,
    selectedFileId,
    user,
  ]);

  const loadArtifacts = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setArtifacts(null);
        setReviewNotes([]);
        reviewNotesRef.current = [];
        setReviewNotesChapterSelectionInput("");
        setExamCramContent("");
        setExamCramUpdatedAt("");
        setExamCramScopeLabel("");
        setExamCramStatus("");
        setExamCramError("");
        setQuestionStyleProfileContent("");
        setQuestionStyleProfileScopeLabel("");
        return null;
      }
      try {
        const data = await fetchDocArtifacts({ userId: user.id, docId });
        const mapped = {
          summary: data?.summary || null,
          quiz: data?.quiz_json || null,
          ox: data?.ox_json || null,
          highlights: data?.highlights_json || null,
        };
        const partialBundle = readPartialSummaryBundleFromHighlights(mapped.highlights);
        const reviewNoteEntries = readReviewNotesFromHighlights(mapped.highlights);
        const examCramBundle = readExamCramFromHighlights(mapped.highlights);
        const questionStyleBundle = readQuestionStyleProfileFromHighlights(mapped.highlights);
        const activeInstructorText = normalizeInstructorEmphasisInput(
          partialBundle.instructorEmphasisLibrary.find(
            (item) => item.id === partialBundle.activeInstructorEmphasisId
          )?.text
        );
        setArtifacts(mapped);
        setPartialSummary(partialBundle.summary);
        setPartialSummaryRange(partialBundle.range);
        setSavedPartialSummaries(partialBundle.library);
        setReviewNotes(reviewNoteEntries);
        setInstructorEmphasisInput(activeInstructorText);
        setSavedInstructorEmphases(partialBundle.instructorEmphasisLibrary);
        setActiveInstructorEmphasisId(partialBundle.activeInstructorEmphasisId);
        setIsSavedPartialSummaryOpen(false);
        setReviewNotesChapterSelectionInput("");
        setExamCramContent(examCramBundle.content);
        setExamCramUpdatedAt(examCramBundle.updatedAt || "");
        setExamCramScopeLabel(examCramBundle.scopeLabel);
        setExamCramStatus("");
        setExamCramError("");
        setQuestionStyleProfileContent(questionStyleBundle.content);
        setQuestionStyleProfileScopeLabel(questionStyleBundle.scopeLabel);
        reviewNotesRef.current = reviewNoteEntries;
        if (mapped.summary) {
          setSummary(mapped.summary);
          summaryRequestedRef.current = true;
        }
        if (mapped.quiz) {
          const normalizedQuiz = normalizeQuizPayload(mapped.quiz);
          const cachedSet = createQuizSetState(
            {
              multipleChoice: normalizedQuiz.multipleChoice,
              shortAnswer: normalizedQuiz.shortAnswer,
              ox: [],
            },
            `quiz-cached-${docId}`,
            {
              questionStyleProfile: questionStyleBundle.content,
              questionStyleScopeLabel: questionStyleBundle.scopeLabel,
            }
          );
          setQuizSets([cachedSet]);
          quizAutoRequestedRef.current = true;
        }
        if (mapped.ox) {
          setOxItems(mapped.ox?.items || []);
          oxAutoRequestedRef.current = true;
        }
        return mapped;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to load artifacts", err);
        return null;
      }
    },
    [user, supabase]
  );
  const backfillThumbnails = useCallback(
    async (items) => {
      if (backfillInProgressRef.current) return;
      const needs = items.filter((i) => !i.thumbnail);
      if (!needs.length) return;
      backfillInProgressRef.current = true;
      try {
        for (const item of needs) {
          try {
            const ensured = await ensureFileForItemRef.current(item);
            const thumb = ensured.thumbnail || (await generateDocumentThumbnail(ensured.file));
            if (!thumb) continue;
            await updateUploadThumbnail({ id: item.id, thumbnail: thumb });
            setUploadedFiles((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, thumbnail: thumb } : p))
            );
          } catch (err) {
            // skip failure
            console.warn("thumbnail backfill failed", err);
          }
        }
      } finally {
        backfillInProgressRef.current = false;
      }
    },
    []
  );
  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    setIsSigningOut(true);
    setError("");
    setStatus("濡쒓렇?꾩썐 以?..");
    try {
      setShowPremiumProfilePicker(false);
      setShowProfilePinDialog(false);
      setIsFeedbackDialogOpen(false);
      setFeedbackInput("");
      setFeedbackError("");
      setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
      setProfilePinError("");
      setActivePremiumProfileId(null);
      setPremiumProfiles([]);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      await authSignOut();
      await refreshSession();
      setStatus("濡쒓렇?꾩썐?섏뿀?듬땲??");
    } catch (err) {
      setError(`濡쒓렇?꾩썐???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      setStatus("");
    } finally {
      setIsSigningOut(false);
    }
  }, [authSignOut, refreshSession]);

  useEffect(() => {
    if (user) {
      loadFolders();
    } else {
      setFolders([]);
      setSelectedFolderId("all");
    }
  }, [user, loadFolders]);

  useEffect(() => {
    let cancelled = false;
    let idleHandle = null;

    if (user) {
      loadUploads().then(() => {
        if (cancelled) return;
        const current = uploadedFilesRef.current || [];
        const runBackfill = () => {
          if (cancelled) return;
          backfillThumbnails(current);
        };

        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
          idleHandle = window.requestIdleCallback(runBackfill, { timeout: 1500 });
        } else {
          idleHandle = window.setTimeout(runBackfill, 250);
        }
      });
    } else if (AUTH_ENABLED) {
      setUploadedFiles([]);
    }

    return () => {
      cancelled = true;
      if (idleHandle == null || typeof window === "undefined") return;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    };
  }, [user, loadUploads, backfillThumbnails]);

  const ensureFileForItem = useCallback(
    async (item) => {
      if (item.file) return item;
      if (!item.path && !item.remotePath) throw new Error("파일 스토리지 경로가 없습니다.");
      const storagePath = item.path || item.remotePath;

      // Reuse downloaded file/blob from memory cache when possible
      const cached = downloadCacheRef.current.get(storagePath);
      if (cached) {
        const enriched = { ...item, ...cached };
        setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
        return enriched;
      }

      const bucket = item.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
      const pathCandidates = buildStoragePathCandidates(storagePath);
      let signed = "";
      let resolvedStoragePath = storagePath;
      let lastFetchStatus = null;
      let lastErr = null;
      let blob = null;
      let headerType = "";

      for (const candidatePath of pathCandidates) {
        try {
          const signedUrl = await getSignedStorageUrl({
            bucket,
            path: candidatePath,
            expiresIn: 60 * 60 * 24,
          });
          const response = await fetch(signedUrl);
          if (!response.ok) {
            lastFetchStatus = response.status;
            continue;
          }
          signed = signedUrl;
          blob = await response.blob();
          headerType = String(response.headers.get("content-type") || "").toLowerCase();
          resolvedStoragePath = candidatePath;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      // Fallback to authenticated storage download when signed URL fetch fails.
      if (!blob && supabase) {
        for (const candidatePath of pathCandidates) {
          try {
            const { data, error } = await supabase.storage.from(bucket).download(candidatePath);
            if (error || !data) {
              if (error) lastErr = error;
              continue;
            }
            blob = data;
            headerType = String(data.type || "").toLowerCase();
            signed = "";
            resolvedStoragePath = candidatePath;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
      }

      if (!blob) {
        if (lastFetchStatus) {
          throw new Error(`스토리지에서 파일을 내려받지 못했습니다. (status: ${lastFetchStatus})`);
        }
        throw new Error(lastErr?.message || "스토리지에서 파일을 내려받지 못했습니다.");
      }

      if (headerType.includes("text/html")) {
        throw new Error("파일 대신 HTML 응답이 내려왔습니다. 서명 URL 또는 경로를 확인해주세요.");
      }
      const name = item.name || item.file?.name || "document.pdf";
      const fileObj = normalizeSupportedFile(new File([blob], name, { type: blob.type || "" }));
      const thumb = await generateDocumentThumbnail(fileObj);
      const enriched = {
        ...item,
        file: fileObj,
        thumbnail: item.thumbnail || thumb,
        remoteUrl: signed || null,
        path: resolvedStoragePath,
        bucket,
      };
      const cachePayload = {
        file: fileObj,
        thumbnail: item.thumbnail || thumb,
        remoteUrl: signed || null,
        path: resolvedStoragePath,
        bucket,
      };
      downloadCacheRef.current.set(storagePath, cachePayload);
      downloadCacheRef.current.set(resolvedStoragePath, cachePayload);
      setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
      return enriched;
    },
    [normalizeSupportedFile, setUploadedFiles]
  );

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        revokeObjectUrlIfNeeded(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const resetQuizState = () => {
    setQuizSets([]);
  };

  const processSelectedFile = useCallback(
    async (item, { pushState = true } = {}) => {
      if (!item) return;
      const requestSeq = fileOpenRequestSeqRef.current + 1;
      fileOpenRequestSeqRef.current = requestSeq;
      let resolvedItem = item;
      const nextDocId = resolvedItem.id;
      setPendingDocumentOpen({
        id: nextDocId,
        name: String(resolvedItem?.name || resolvedItem?.file?.name || "문서").trim() || "문서",
      });
      if (!resolvedItem.file) {
        try {
          resolvedItem = await ensureFileForItem(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
        } catch (err) {
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
          setPendingDocumentOpen(null);
          setError(`파일을 불러오지 못했습니다. ${err.message}`);
          return;
        }
      }
      if (!resolvedItem?.file) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        return;
      }

      const targetFile = normalizeSupportedFile(resolvedItem.file);
      if (!(targetFile instanceof File)) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        return;
      }
      const targetFileKind = detectSupportedDocumentKind(targetFile);
      if (!targetFileKind) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        setError("지원하지 않는 파일 형식입니다. PDF, DOCX, PPTX만 지원합니다.");
        return;
      }
      let previewPdfSourceUrl = "";
      if (isConvertibleOfficeDocumentKind(targetFileKind)) {
        try {
          if (!resolvedItem?.previewPdfPath) {
            resolvedItem = await requestPreviewPdfConversion(resolvedItem);
            if (fileOpenRequestSeqRef.current !== requestSeq) return;
          }
          resolvedItem = await refreshUploadThumbnailFromPreviewPdf(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
          previewPdfSourceUrl = await resolvePreviewPdfUrlForItem(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
        } catch (previewError) {
          console.warn("Office preview PDF preparation failed", previewError);
        }
      }
      const savedChapterRangeInput = isPdfDocumentKind(targetFileKind)
        ? loadSavedChapterRangeInput(nextDocId)
        : "";

      if (targetFile !== resolvedItem.file && nextDocId) {
        setUploadedFiles((prev) =>
          prev.map((entry) => (entry.id === nextDocId ? { ...entry, file: targetFile } : entry))
        );
      }

      if (selectedFileId && selectedFileId !== nextDocId) {
        savePageProgressSnapshot({
          docId: selectedFileId,
          visited: Array.from(visitedPages),
          page: currentPage,
        });
      }
      const restoredPageProgress = isPdfDocumentKind(targetFileKind)
        ? loadPageProgressSnapshot({ docId: nextDocId })
        : { currentPage: 1, visitedPages: [] };

      if (pushState && selectedFileId !== nextDocId) {
        window.history.pushState({ view: "detail", fileId: nextDocId }, "", window.location.pathname);
      }

      if (pdfUrl) {
        revokeObjectUrlIfNeeded(pdfUrl);
      }
      setPdfUrl(
        isPdfDocumentKind(targetFileKind)
          ? URL.createObjectURL(targetFile)
          : previewPdfSourceUrl || null
      );
      setFile(targetFile);
      setSelectedFileId(nextDocId);
      setPanelTab("summary");
      resetQuizState();
      summaryRequestedRef.current = false;
      quizAutoRequestedRef.current = false;
      setError("");
      setSummary("");
      setPartialSummary("");
      setPartialSummaryRange("");
      setSavedPartialSummaries([]);
      setReviewNotes([]);
      reviewNotesRef.current = [];
      setInstructorEmphasisInput("");
      setSavedInstructorEmphases([]);
      setActiveInstructorEmphasisId("");
      setIsSavedPartialSummaryOpen(false);
      setReviewNotesChapterSelectionInput("");
      setExamCramContent("");
      setExamCramUpdatedAt("");
      setExamCramScopeLabel("");
      setExamCramStatus("");
      setExamCramError("");
      setQuizChapterSelectionInput("");
      setOxChapterSelectionInput("");
      setFlashcardChapterSelectionInput("");
      setMockExamChapterSelectionInput("");
      tutorPageTextCacheRef.current.clear();
      tutorSectionRangeCacheRef.current.clear();
      chapterScopeTextCacheRef.current.clear();
      setArtifacts(null);
      const extractStart =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      setStatus("문서 텍스트 추출 중...");
      setIsLoadingText(true);
      setThumbnailUrl(null);
        setMockExams([]);
        setMockExamStatus("");
        setMockExamError("");
        setActiveMockExamId(null);
        setShowMockExamAnswers(false);
      setFlashcards([]);
      setCurrentPage(restoredPageProgress.currentPage);
      setVisitedPages(new Set(restoredPageProgress.visitedPages));
      setFlashcardStatus("");
      setFlashcardError("");
      setIsGeneratingFlashcards(false);
      setTutorMessages([]);
      setTutorError("");
      setIsTutorLoading(false);
      setIsPageSummaryOpen(false);
      setPageSummaryInput("");
      setPageSummaryError("");
      setIsPageSummaryLoading(false);
      setIsChapterRangeOpen(false);
      setChapterRangeInput(savedChapterRangeInput);
      setAutoChapterRangeInput("");
      setChapterRangeError("");
      oxAutoRequestedRef.current = false;
      const artifactsPromise = loadArtifacts(nextDocId);

      try {
        const [textResult, thumb, loaded] = await Promise.all([
          extractDocumentText(targetFile, {
            pageLimit: 30,
            maxLength: 12000,
            useOcr: false, // PDF 미리보기 로딩 시에는 OCR 사용 안함
            ocrLang: "kor+eng",
          }),
          generateDocumentThumbnail(targetFile),
          artifactsPromise,
        ]);
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        const { text, pagesUsed, totalPages } = textResult;
        const normalizedInitialText = String(text || "").trim();
        setExtractedText(text);
        setPreviewText(text);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        const extractEnd =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const elapsedSeconds = Math.max(0, (extractEnd - extractStart) / 1000);
        const extractionStatusSuffix = normalizedInitialText
          ? ""
          : isPdfDocumentKind(detectSupportedDocumentKind(targetFile))
            ? ", 텍스트 없음 - 요약 시 OCR 자동 시도"
            : ", 텍스트 없음";
        setStatus(`텍스트 추출 완료 (${elapsedSeconds.toFixed(1)}s${extractionStatusSuffix})`);
        setError("");
        await Promise.all([loadMockExams(nextDocId), loadFlashcards(nextDocId)]);
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        if (loaded?.summary) {
          setStatus("Loaded saved summary.");
        }
      } catch (err) {
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        setError(`문서 처리에 실패했습니다: ${err.message}`);
        setExtractedText("");
        setPreviewText("");
        setPageInfo({ used: 0, total: 0 });
      } finally {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
          setIsLoadingText(false);
        }
      }
    },
    [
      currentPage,
      ensureFileForItem,
      loadSavedChapterRangeInput,
      loadArtifacts,
      loadFlashcards,
      loadMockExams,
      loadPageProgressSnapshot,
      normalizeSupportedFile,
      pdfUrl,
      refreshUploadThumbnailFromPreviewPdf,
      requestPreviewPdfConversion,
      resolvePreviewPdfUrlForItem,
      savePageProgressSnapshot,
      selectedFileId,
      visitedPages,
    ]
  );

  const handleFileChange = useCallback(
    async (event, targetFolderId = null) => {
      if (AUTH_ENABLED && !user) {
        openAuth();
        return;
      }
      const fileInput = event.target;
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      const activeFolderId = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      const activeProfileScopeId = isPremiumTier ? premiumScopeProfileId : null;
      if (isPremiumTier && !activeProfileScopeId) {
        setError("?뚯씪 ?낅줈???꾩뿉 ?꾨━誘몄뾼 ?꾨줈?꾩쓣 ?좏깮?댁＜?몄슂.");
        fileInput.value = "";
        return;
      }

      const invalidTypeFile = files.find((f) => !isSupportedUploadFile(f));
      if (invalidTypeFile) {
        setError(`지원 형식은 PDF/DOCX/PPTX 입니다. (${invalidTypeFile.name})`);
        fileInput.value = "";
        return;
      }

      const oversizedFile = files.find((f) => f.size > limits.maxPdfSizeBytes);
      if (oversizedFile) {
        setError(
          `${getTierLabel(tier)} tier allows up to ${formatSizeMB(limits.maxPdfSizeBytes)} per file. (${oversizedFile.name}: ${formatSizeMB(oversizedFile.size)})`
        );
        fileInput.value = "";
        return;
      }
      const nextCount = uploadedFiles.length + files.length;
      if (limits.maxUploads !== Infinity && nextCount > limits.maxUploads) {
        setError(`?낅줈???쒕룄瑜?珥덇낵?덉뒿?덈떎. ?낅줈??媛??理쒕? 媛쒖닔: ${limits.maxUploads}.`);
        fileInput.value = "";
        return;
      }

      const existingByHash = new Map();
      uploadedFiles.forEach((item) => {
        if (!item?.hash) return;
        const storagePath = item.remotePath || item.path;
        if (!storagePath) return;
        // Avoid reusing legacy encoded/non-ASCII paths that can fail signed URL fetch.
        if (!isSafeStoragePathForReuse(storagePath)) return;
        existingByHash.set(item.hash, item);
      });

      const withThumbs = await Promise.all(
        files.map(async (rawFile) => {
          const f = normalizeSupportedFile(rawFile);
          const [thumb, hash] = await Promise.all([generateDocumentThumbnail(f), computeFileHash(f)]);
          return {
            id: `${f.name}-${f.lastModified}-${Math.random().toString(16).slice(2)}`,
            file: f,
            name: f.name,
            size: f.size,
            hash,
            thumbnail: thumb,
            folderId: activeFolderId,
            infolder: activeFolderId ? 1 : 0,
            ownerProfileId: activeProfileScopeId,
          };
        })
      );

      const withUploads = await Promise.all(
        withThumbs.map(async (item) => {
          if (!user) {
            if (!AUTH_ENABLED) {
              return { ...item, remote: false };
            }
            return { ...item, uploadError: "?대씪?곕뱶 ?낅줈?쒕? ?ъ슜?????놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??" };
          }
          if (!supabase) {
            return { ...item, uploadError: "Supabase client is not available." };
          }

          // Reuse existing remote upload by hash to avoid duplicate storage writes.
          const existing = item.hash ? existingByHash.get(item.hash) : null;
          let uploaded = null;
          try {
            if (existing) {
              return {
                ...item,
                id: existing.id || item.id,
                remotePath: existing.remotePath || existing.path,
                remoteUrl: existing.remoteUrl,
                bucket: existing.bucket,
                previewPdfPath: existing.previewPdfPath || existing.preview_pdf_path || null,
                previewPdfBucket: existing.previewPdfBucket || existing.preview_pdf_bucket || null,
                previewPdfUrl: existing.previewPdfUrl || "",
                thumbnail: existing.thumbnail || item.thumbnail,
                hash: existing.hash || item.hash,
                folderId: existing.folderId || existing.folder_id || item.folderId || null,
                infolder: Number(
                  existing.infolder ??
                    (existing.folderId || existing.folder_id || item.folderId ? 1 : 0)
                ),
                ownerProfileId: existing.ownerProfileId || activeProfileScopeId || null,
              };
            }

            uploaded = await uploadPdfToStorage(user.id, item.file);
            const storedFileName =
              isPremiumTier && activeProfileScopeId
                ? encodePremiumScopeValue(item.name, activeProfileScopeId)
                : item.name;
            const record = await saveUploadMetadata({
              userId: user.id,
              fileName: storedFileName,
              fileSize: item.size,
              storagePath: uploaded.path,
              bucket: uploaded.bucket,
              thumbnail: item.thumbnail,
              fileHash: item.hash,
              folderId: activeFolderId,
            });
            const decodedRecordName = decodePremiumScopeValue(record.file_name || storedFileName);
            const ownerProfileId = isPremiumTier
              ? decodedRecordName.ownerProfileId || activeProfileScopeId || premiumOwnerProfileId || null
              : null;
            const uploadedItem = {
              ...item,
              id: record.id || item.id,
              remotePath: uploaded.path,
              remoteUrl: uploaded.signedUrl,
              bucket: uploaded.bucket,
              name: decodedRecordName.value || item.name,
              thumbnail: record.thumbnail || item.thumbnail,
              hash: record.file_hash || item.hash,
              folderId: record.folder_id || activeFolderId || null,
              infolder: Number(record.infolder ?? (record.folder_id || activeFolderId ? 1 : 0)),
              ownerProfileId,
            };
            if (!isConvertibleOfficeDocumentKind(detectSupportedDocumentKind(item.file))) {
              return uploadedItem;
            }
            try {
              const convertedItem = await requestPreviewPdfConversion(uploadedItem);
              return await refreshUploadThumbnailFromPreviewPdf(convertedItem);
            } catch (previewError) {
              console.warn("Upload preview PDF conversion failed", previewError);
              return uploadedItem;
            }
          } catch (err) {
            // Roll back orphaned storage files when metadata insert fails.
            if (uploaded?.bucket && uploaded?.path) {
              try {
                await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
              } catch {
                // Ignore rollback failures.
              }
            }
            return { ...item, uploadError: err?.message || "?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎." };
          }
        })
      );

      const successfulUploads = withUploads.filter((item) => !item?.uploadError);
      const failedUploads = withUploads.filter((item) => item?.uploadError);

      if (failedUploads.length > 0) {
        const failedNames = failedUploads
          .slice(0, 2)
          .map((item) => item?.name)
          .filter(Boolean)
          .join(", ");
        const suffix = failedUploads.length > 2 ? "..." : "";
        setError(
          `업로드에 실패했습니다: ${failedUploads.length}개 파일${failedNames ? ` (${failedNames}${suffix})` : ""}.`
        );
      }

      if (successfulUploads.length > 0) {
        setUploadedFiles((prev) => {
          const nextById = new Map(prev.map((entry) => [entry.id?.toString(), entry]));
          successfulUploads.forEach((entry) => {
            const key = entry.id?.toString();
            if (!key) return;
            nextById.set(key, { ...(nextById.get(key) || {}), ...entry });
          });
          return Array.from(nextById.values());
        });
      }

      fileInput.value = "";
      const firstReadyUpload = successfulUploads.find((item) => item?.file);
      if (firstReadyUpload) {
        await processSelectedFile(firstReadyUpload);
        if (AUTH_ENABLED && user) {
          await loadUploadsRef.current?.();
        }
      } else {
        setStatus("??λ맂 ?뚯씪???놁뒿?덈떎. ?낅줈???ㅻ쪟 硫붿떆吏瑜??뺤씤?댁＜?몄슂.");
      }
    },
    [
      user,
      openAuth,
      uploadedFiles,
      limits,
      supabase,
      computeFileHash,
      normalizeSupportedFile,
      isPremiumTier,
      premiumScopeProfileId,
      premiumOwnerProfileId,
      refreshUploadThumbnailFromPreviewPdf,
      requestPreviewPdfConversion,
      tier,
      processSelectedFile,
    ]
  );

  const showDetail = Boolean(selectedFileId || pendingDocumentOpen?.id);
  const shouldShowPremiumProfilePicker = Boolean(
    user && isPremiumTier && !loadingTier && showPremiumProfilePicker
  );
  const activeUploadItem = useMemo(() => {
    if (!selectedFileId) return null;
    return uploadedFiles.find((item) => String(item?.id || "") === String(selectedFileId)) || null;
  }, [selectedFileId, uploadedFiles]);
  const activeDocumentUrl = useMemo(
    () => String(activeUploadItem?.remoteUrl || "").trim(),
    [activeUploadItem]
  );

  const goBackToList = useCallback(() => {
    fileOpenRequestSeqRef.current += 1;
    if (selectedFileId) {
      savePageProgressSnapshot({
        docId: selectedFileId,
        visited: Array.from(visitedPages),
        page: currentPage,
      });
    }
    if (pdfUrl) {
      revokeObjectUrlIfNeeded(pdfUrl);
    }
    setSelectedFileId(null);
    setPendingDocumentOpen(null);
    setFile(null);
      setPdfUrl(null);
      setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setReviewNotes([]);
    reviewNotesRef.current = [];
    setInstructorEmphasisInput("");
    setSavedInstructorEmphases([]);
    setActiveInstructorEmphasisId("");
    setIsSavedPartialSummaryOpen(false);
    setReviewNotesChapterSelectionInput("");
    setExamCramContent("");
    setExamCramUpdatedAt("");
    setExamCramScopeLabel("");
    setExamCramStatus("");
    setExamCramError("");
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    setAutoChapterRangeInput("");
    tutorPageTextCacheRef.current.clear();
    tutorSectionRangeCacheRef.current.clear();
    chapterScopeTextCacheRef.current.clear();
      setMockExams([]);
      setMockExamStatus("");
      setMockExamError("");
      setActiveMockExamId(null);
      setShowMockExamAnswers(false);
    setFlashcards([]);
    setCurrentPage(1);
    setVisitedPages(new Set());
    setFlashcardStatus("");
    setFlashcardError("");
    setIsGeneratingFlashcards(false);
    setTutorMessages([]);
    setTutorError("");
    setIsTutorLoading(false);
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
    setIsPageSummaryOpen(false);
    setPageSummaryInput("");
    setPageSummaryError("");
    setIsPageSummaryLoading(false);
    setIsChapterRangeOpen(false);
    setChapterRangeInput("");
    setAutoChapterRangeInput("");
    setChapterRangeError("");
    setOxItems(null);
    setOxSelections({});
    setPanelTab("summary");
    summaryRequestedRef.current = false;
    quizAutoRequestedRef.current = false;
    oxAutoRequestedRef.current = false;
    setArtifacts(null);
    setIsLoadingText(false);
    resetQuizState();
    setStatus("?낅줈??紐⑸줉?쇰줈 ?뚯븘?붿뒿?덈떎.");
    setSelectedUploadIds([]);
    updateHistoryState("replace", { view: "list" });
  }, [currentPage, pdfUrl, savePageProgressSnapshot, selectedFileId, updateHistoryState, visitedPages]);

  const consumeOverlayBack = useCallback(() => {
    if (showPayment) {
      closePayment();
      return true;
    }
    if (showProfilePinDialog) {
      handleCloseProfilePinDialog();
      return true;
    }
    if (isFeedbackDialogOpen) {
      handleCloseFeedbackDialog();
      return true;
    }
    if (shouldShowPremiumProfilePicker) {
      handleCloseProfilePicker();
      return true;
    }
    if (isMockExamMenuOpen) {
      setIsMockExamMenuOpen(false);
      return true;
    }
    if (showMockExamAnswers) {
      setShowMockExamAnswers(false);
      return true;
    }
    if (isSavedPartialSummaryOpen) {
      setIsSavedPartialSummaryOpen(false);
      return true;
    }
    if (isPageSummaryOpen) {
      setIsPageSummaryOpen(false);
      return true;
    }
    if (isChapterRangeOpen) {
      setIsChapterRangeOpen(false);
      return true;
    }
    if (showAuth) {
      closeAuth();
      return true;
    }
    return false;
  }, [
    closeAuth,
    handleCloseFeedbackDialog,
    handleCloseProfilePicker,
    handleCloseProfilePinDialog,
    isChapterRangeOpen,
    isFeedbackDialogOpen,
    isMockExamMenuOpen,
    isPageSummaryOpen,
    isSavedPartialSummaryOpen,
    shouldShowPremiumProfilePicker,
    showAuth,
    showMockExamAnswers,
    showPayment,
    showProfilePinDialog,
    closePayment,
  ]);

  const uploadedFilesRef = useRef(uploadedFiles);
  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);
  const ensureFileForItemRef = useRef(ensureFileForItem);

  const handleSelectFile = useCallback(
    async (item) => {
      try {
        await processSelectedFileRef.current(item);
      } catch (err) {
        setError(`?좏깮???뚯씪???щ뒗 ???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [processSelectedFileRef]
  );


  const persistArtifacts = useCallback(
    async (partial) => {
      if (!user || !selectedFileId) return;
      const merged = {
        ...(artifacts || {}),
        ...partial,
      };
      setArtifacts(merged);
      try {
        await saveDocArtifacts({
          userId: user.id,
          docId: selectedFileId,
          summary: merged.summary,
          quiz: merged.quiz,
          ox: merged.ox,
          highlights: merged.highlights,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("??μ뿉 ?ㅽ뙣?덉뒿?덈떎: artifacts", err);
      }
    },
    [artifacts, selectedFileId, user]
  );

  const persistPartialSummaryBundle = useCallback(
    ({ summary = "", range = "", library = savedPartialSummaries } = {}) => {
      const nextHighlights = writePartialSummaryBundleToHighlights(artifacts?.highlights, {
        summary,
        range,
        library,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [artifacts?.highlights, persistArtifacts, savedPartialSummaries]
  );

  const persistInstructorEmphasisState = useCallback(
    ({ library = savedInstructorEmphases, activeId = activeInstructorEmphasisId } = {}) => {
      const nextHighlights = writePartialSummaryBundleToHighlights(artifacts?.highlights, {
        instructorEmphasisLibrary: library,
        activeInstructorEmphasisId: activeId,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [activeInstructorEmphasisId, artifacts?.highlights, persistArtifacts, savedInstructorEmphases]
  );

  const persistReviewNotes = useCallback(
    (updater) => {
      const base = Array.isArray(reviewNotesRef.current) ? reviewNotesRef.current : [];
      const nextRaw = typeof updater === "function" ? updater(base) : updater;
      const next = normalizeReviewNoteEntries(nextRaw);
      reviewNotesRef.current = next;
      setReviewNotes(next);
      const nextHighlights = writeReviewNotesBundleToHighlights(artifacts?.highlights, next);
      persistArtifacts({ highlights: nextHighlights });
      return next;
    },
    [artifacts?.highlights, persistArtifacts]
  );

  const persistExamCramBundle = useCallback(
    ({ content = "", scopeLabel = "", updatedAt = new Date().toISOString() } = {}) => {
      const nextHighlights = writeExamCramBundleToHighlights(artifacts?.highlights, {
        content,
        scopeLabel,
        updatedAt,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [artifacts?.highlights, persistArtifacts]
  );

  const handleSaveInstructorEmphasis = useCallback(
    ({ value } = {}) => {
      const nextValue =
        value === undefined
          ? normalizeInstructorEmphasisInput(instructorEmphasisInput)
          : normalizeInstructorEmphasisInput(value);
      if (!nextValue) {
        setStatus("\uC800\uC7A5\uD560 \uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
        return;
      }

      const existing = savedInstructorEmphases.find((item) => item.text === nextValue);
      if (existing) {
        setActiveInstructorEmphasisId(existing.id);
        setInstructorEmphasisInput("");
        persistInstructorEmphasisState({
          library: savedInstructorEmphases,
          activeId: existing.id,
        });
        setStatus("\uC774\uBBF8 \uC800\uC7A5\uB41C \uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }

      const nowIso = new Date().toISOString();
      const newItem = {
        id: createPremiumProfileId(),
        text: nextValue,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextLibrary = normalizeSavedInstructorEmphasisEntries([
        newItem,
        ...(Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []),
      ]);
      setSavedInstructorEmphases(nextLibrary);
      setActiveInstructorEmphasisId(newItem.id);
      setInstructorEmphasisInput("");
      persistInstructorEmphasisState({ library: nextLibrary, activeId: newItem.id });
      setStatus("\uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uBCC4\uB3C4 \uD56D\uBAA9\uC73C\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
    },
    [instructorEmphasisInput, persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const handleSelectInstructorEmphasis = useCallback(
    (itemId) => {
      const targetId = String(itemId || "").trim();
      if (!targetId) return;
      const found = savedInstructorEmphases.find((item) => item.id === targetId);
      if (!found) return;
      setActiveInstructorEmphasisId(targetId);
      setInstructorEmphasisInput(found.text);
      persistInstructorEmphasisState({ library: savedInstructorEmphases, activeId: targetId });
    },
    [persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const handleDeleteInstructorEmphasis = useCallback(
    (itemId) => {
      const targetId = String(itemId || "").trim();
      if (!targetId) return;
      const nextLibrary = (Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []).filter(
        (item) => item.id !== targetId
      );
      const nextActiveId =
        targetId === activeInstructorEmphasisId ? nextLibrary[0]?.id || "" : activeInstructorEmphasisId;
      const nextActiveItem = nextLibrary.find((item) => item.id === nextActiveId) || null;
      setSavedInstructorEmphases(nextLibrary);
      setActiveInstructorEmphasisId(nextActiveId);
      setInstructorEmphasisInput(nextActiveItem?.text || "");
      persistInstructorEmphasisState({ library: nextLibrary, activeId: nextActiveId });
      setStatus("\uAC15\uC870 \uD3EC\uC778\uD2B8 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
    },
    [activeInstructorEmphasisId, persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const cycleActiveInstructorEmphasis = useCallback(
    (direction = 1) => {
      const list = Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : [];
      if (list.length <= 1) return;
      const currentIndex = list.findIndex((item) => item.id === activeInstructorEmphasisId);
      const start = currentIndex >= 0 ? currentIndex : 0;
      const step = Number(direction) >= 0 ? 1 : -1;
      const nextIndex = (start + step + list.length) % list.length;
      const nextId = list[nextIndex]?.id || "";
      if (!nextId) return;
      handleSelectInstructorEmphasis(nextId);
    },
    [activeInstructorEmphasisId, handleSelectInstructorEmphasis, savedInstructorEmphases]
  );

  const getEffectiveInstructorEmphasisText = useCallback(() => {
    return "";
  }, []);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    goBackToListRef.current = goBackToList;
  }, [goBackToList]);

  useEffect(() => {
    processSelectedFileRef.current = processSelectedFile;
  }, [processSelectedFile]);
  useEffect(() => {
    ensureFileForItemRef.current = ensureFileForItem;
  }, [ensureFileForItem]);

  const stopSplitDragging = useCallback(() => {
    if (!isDraggingRef.current && !isResizingSplit) return;
    const pointerId = activeDragPointerIdRef.current;
    const dragHandle = dragHandleElementRef.current;
    if (
      dragHandle &&
      typeof dragHandle.releasePointerCapture === "function" &&
      typeof pointerId === "number"
    ) {
      try {
        if (typeof dragHandle.hasPointerCapture !== "function" || dragHandle.hasPointerCapture(pointerId)) {
          dragHandle.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore capture release failures.
      }
    }
    activeDragPointerIdRef.current = null;
    dragHandleElementRef.current = null;
    isDraggingRef.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setIsResizingSplit(false);
  }, [isResizingSplit]);

  useEffect(() => {
    const applySplitPercent = (clientX) => {
      const container = detailContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width) return;
      const percent = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(25, percent));
      setSplitPercent(clamped);
    };

    const handlePointerMove = (event) => {
      if (!isDraggingRef.current) return;
      if (typeof event.buttons === "number" && event.buttons === 0) {
        stopSplitDragging();
        return;
      }
      applySplitPercent(event.clientX);
    };

    const handleMouseMove = (event) => {
      if (!isDraggingRef.current) return;
      if (typeof event.buttons === "number" && event.buttons === 0) {
        stopSplitDragging();
        return;
      }
      applySplitPercent(event.clientX);
    };

    const handleDragEnd = () => {
      if (!isDraggingRef.current && !isResizingSplit) return;
      stopSplitDragging();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleDragEnd();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handleDragEnd);
    window.addEventListener("pointercancel", handleDragEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("blur", handleDragEnd);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handleDragEnd);
      window.removeEventListener("pointercancel", handleDragEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("blur", handleDragEnd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isResizingSplit, stopSplitDragging]);

  useEffect(() => {
    if (!isNativePlatform || typeof window === "undefined" || !window.history) return;
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ appNav: true, view: "root" }, "", url);
    window.history.pushState({ appNav: true, view: "list" }, "", url);
  }, [isNativePlatform]);

  useEffect(() => {
    const handlePopState = (event) => {
      const state = event.state;

      if (isNativePlatform && consumeOverlayBack()) {
        updateHistoryState("push");
        return;
      }

      if (state?.view === "detail" && state.fileId) {
        const target = uploadedFilesRef.current.find((f) => f.id === state.fileId);
        if (target) {
          processSelectedFileRef.current(target, { pushState: false });
          return;
        }
      }

      if (showDetail) {
        goBackToListRef.current();
        return;
      }

      if (isNativePlatform && state?.view === "root") {
        updateHistoryState("push", { view: "list" });
        return;
      }

      if (!isNativePlatform) {
        goBackToListRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [consumeOverlayBack, isNativePlatform, showDetail, updateHistoryState]);

  const handleDragStart = useCallback((event) => {
    if (typeof event?.button === "number" && event.button !== 0) return;
    event?.preventDefault?.();
    isDraggingRef.current = true;
    if (typeof event?.pointerId === "number") {
      activeDragPointerIdRef.current = event.pointerId;
      dragHandleElementRef.current = event.currentTarget || null;
      const handleElement = dragHandleElementRef.current;
      if (handleElement && typeof handleElement.setPointerCapture === "function") {
        try {
          handleElement.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture setup failures.
        }
      }
    } else {
      activeDragPointerIdRef.current = null;
      dragHandleElementRef.current = null;
    }
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    setIsResizingSplit(true);
  }, []);

  const handlePageChange = useCallback(
    (nextPage) => {
      const parsed = Number.parseInt(nextPage, 10);
      if (!Number.isFinite(parsed)) return;
      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      const bounded = totalPages > 0 ? Math.min(Math.max(parsed, 1), totalPages) : Math.max(parsed, 1);
      setCurrentPage((prev) => (prev === bounded ? prev : bounded));
    },
    [pageInfo?.total, pageInfo?.used]
  );

  useEffect(() => {
    if (!selectedFileId) return;
    const normalizedPage = Number.parseInt(currentPage, 10);
    if (!Number.isFinite(normalizedPage) || normalizedPage <= 0) return;
    setVisitedPages((prev) => {
      if (prev.has(normalizedPage)) return prev;
      const next = new Set(prev);
      next.add(normalizedPage);
      return next;
    });
  }, [currentPage, selectedFileId]);

  useEffect(() => {
    if (!selectedFileId) return;
    savePageProgressSnapshot({
      docId: selectedFileId,
      visited: Array.from(visitedPages),
      page: currentPage,
    });
  }, [currentPage, savePageProgressSnapshot, selectedFileId, visitedPages]);

  const splitStyle = {
    "--split-basis": `${splitPercent}%`,
  };

  const buildChapterRangeInputFromChapters = useCallback((chapters = []) => {
    return (Array.isArray(chapters) ? chapters : [])
      .map((chapter, index) => {
        const start = Number.parseInt(chapter?.pageStart, 10);
        const end = Number.parseInt(chapter?.pageEnd, 10);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return "";
        return `${index + 1}:${start}-${end}`;
      })
      .filter(Boolean)
      .join("\n");
  }, []);

  const buildAutomaticChapterRangeInput = useCallback((totalPages, startPage = 1) => {
    const normalizedTotalPages = Number.parseInt(totalPages, 10);
    if (!Number.isFinite(normalizedTotalPages) || normalizedTotalPages <= 0) return "";

    const normalizedStartPage = Math.min(
      normalizedTotalPages,
      Math.max(1, Number.parseInt(startPage, 10) || 1)
    );
    const remainingPages = normalizedTotalPages - normalizedStartPage + 1;
    if (remainingPages <= 0) return "";

    const targetSectionCount = Math.max(1, Math.min(8, Math.ceil(remainingPages / 18)));
    const pagesPerSection = Math.max(1, Math.ceil(remainingPages / targetSectionCount));
    const sections = [];
    let index = 1;

    for (let currentPage = normalizedStartPage; currentPage <= normalizedTotalPages; currentPage += pagesPerSection) {
      const endPage = Math.min(normalizedTotalPages, currentPage + pagesPerSection - 1);
      sections.push(`${index}:${currentPage}-${endPage}`);
      index += 1;
    }

    return sections.join("\n");
  }, []);

  const resolveChapterOneStartPage = useCallback(async () => {
    if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) return 1;
    const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return 1;

    const manualRangeRaw = String(chapterRangeInput || autoChapterRangeInput || "").trim();
    if (manualRangeRaw) {
      const parsed = parseChapterRangeSelectionInput(manualRangeRaw, totalPages);
      if (!parsed.error && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
        const sorted = [...parsed.chapters].sort(
          (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
        );
        const chapterOne =
          sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
        const start = Number.parseInt(chapterOne?.pageStart, 10);
        if (Number.isFinite(start) && start > 0) {
          return Math.min(totalPages, Math.max(1, start));
        }
      }
    }

    const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    const cachedStart = Number(chapterOneStartPageCacheRef.current.get(docKey));
    if (Number.isFinite(cachedStart) && cachedStart > 0) {
      return Math.min(totalPages, Math.max(1, cachedStart));
    }

    try {
      const detected = await extractChapterRangesFromToc(file, {
        maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
      });
      const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
      if (chapters.length > 0) {
        const sorted = [...chapters].sort(
          (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
        );
        const chapterOne =
          sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
        const start = Number.parseInt(chapterOne?.pageStart, 10);
        if (Number.isFinite(start) && start > 0) {
          const normalizedStart = Math.min(totalPages, Math.max(1, start));
          chapterOneStartPageCacheRef.current.set(docKey, normalizedStart);
          return normalizedStart;
        }
      }
    } catch {
      // Ignore chapter detection failures and fallback to page 1.
    }

    chapterOneStartPageCacheRef.current.set(docKey, 1);
    return 1;
  }, [autoChapterRangeInput, chapterRangeInput, file, pageInfo?.total, pageInfo?.used, selectedFileId]);

  useEffect(() => {
    if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setAutoChapterRangeInput("");
      return;
    }
    if (String(chapterRangeInput || "").trim()) {
      setAutoChapterRangeInput("");
      return;
    }
    if (String(autoChapterRangeInput || "").trim()) return;

    const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return;

    const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    let cancelled = false;

    (async () => {
      let resolvedInput = "";
      try {
        const detected = await extractChapterRangesFromToc(file, {
          maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
        });
        const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
        const detectedInput = buildChapterRangeInputFromChapters(chapters);
        const parsed = detectedInput
          ? parseChapterRangeSelectionInput(detectedInput, totalPages || Number(detected?.totalPages) || 0)
          : { error: "empty", chapters: [] };

        if (!parsed.error && parsed.chapters.length > 0) {
          resolvedInput = detectedInput;
          const sorted = [...parsed.chapters].sort(
            (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
          );
          const chapterOne =
            sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
          const start = Number.parseInt(chapterOne?.pageStart, 10);
          if (Number.isFinite(start) && start > 0) {
            chapterOneStartPageCacheRef.current.set(docKey, Math.min(totalPages, Math.max(1, start)));
          }
        }
      } catch {
        resolvedInput = "";
      }

      if (!resolvedInput) {
        const cachedStartPage = Number(chapterOneStartPageCacheRef.current.get(docKey));
        resolvedInput = buildAutomaticChapterRangeInput(totalPages, cachedStartPage);
      }

      if (!cancelled) {
        setAutoChapterRangeInput(resolvedInput);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    autoChapterRangeInput,
    buildAutomaticChapterRangeInput,
    buildChapterRangeInputFromChapters,
    chapterRangeInput,
    file,
    pageInfo?.total,
    pageInfo?.used,
    selectedFileId,
  ]);

  const resolveQuestionSourceText = useCallback(
    async ({ featureLabel, chapterSelectionInput, baseText }) => {
      const chapterSelectionRaw = String(chapterSelectionInput || "").trim();
      if (chapterSelectionRaw) {
        const extractor = extractTextForChapterSelectionRef.current;
        if (typeof extractor !== "function") {
          throw new Error("챕터 범위 추출기가 아직 준비되지 않았습니다. 다시 시도해주세요.");
        }
        const scoped = await extractor({
          featureLabel,
          chapterSelectionInput: chapterSelectionRaw,
        });
        return {
          text: String(scoped?.text || "").trim(),
          scopeLabel: String(scoped?.scopeLabel || "").trim(),
        };
      }

      let sourceText = String(baseText || "").trim();
      if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        return { text: sourceText, scopeLabel: "" };
      }

      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      if (!Number.isFinite(totalPages) || totalPages <= 0) {
        return { text: sourceText, scopeLabel: "" };
      }

      const chapterOneStartPage = await resolveChapterOneStartPage();
      if (!Number.isFinite(chapterOneStartPage) || chapterOneStartPage <= 1) {
        return { text: sourceText, scopeLabel: "" };
      }

      const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
      const cacheKey = `${docKey}:chapter1:${chapterOneStartPage}`;
      const cachedText = questionSourceTextCacheRef.current.get(cacheKey);
      if (typeof cachedText === "string" && cachedText.trim().length > 80) {
        return {
          text: cachedText,
          scopeLabel: `chapter 1+ (p.${chapterOneStartPage}~)`,
        };
      }

      const pageEnd = Math.min(totalPages, chapterOneStartPage + 119);
      const pages = [];
      for (let page = chapterOneStartPage; page <= pageEnd; page += 1) {
        pages.push(page);
      }
      setStatus(`${featureLabel}: 챕터 1 이전 머릿말을 제외하고 텍스트를 준비 중...`);

      let extracted = await extractPdfTextFromPages(file, pages, 52000, {
        useOcr: false,
      });
      let filteredText = String(extracted?.text || "").trim();
      let filteredApplied = false;
      if (!filteredText) {
        extracted = await extractPdfTextFromPages(file, pages, 52000, {
          useOcr: true,
          ocrLang: "kor+eng",
          onOcrProgress: (message) => setStatus(message),
        });
        filteredText = String(extracted?.text || "").trim();
      }
      if (filteredText) {
        questionSourceTextCacheRef.current.set(cacheKey, filteredText);
        sourceText = filteredText;
        filteredApplied = true;
      }

      return {
        text: sourceText,
        scopeLabel: filteredApplied ? `chapter 1+ (p.${chapterOneStartPage}~)` : "",
      };
    },
    [file, pageInfo?.total, pageInfo?.used, resolveChapterOneStartPage, selectedFileId]
  );

  const requestQuestions = async ({ force = false } = {}) => {
    if (isLoadingQuiz && !force) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!quizMix) {
      setError(quizMixError || "문항 비율을 다시 확인해주세요.");
      return;
    }
    if (isFreeTier && quizSets.length > 0) {
      setError("무료 플랜에서는 퀴즈 세트를 1개만 생성할 수 있습니다.");
      return;
    }
    if (!force && hasReached("maxQuiz")) {
      setError("현재 요금제의 퀴즈 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));

    if (!extractedText && !chapterSelectionRaw && !isPdfSource) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }

    setIsLoadingQuiz(true);
    setError("");
    setStatus("퀴즈 세트 생성 중...");

    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "퀴즈",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      const quizSourceText = String(scopedSource?.text || "").trim();
      const scopeLabel = String(scopedSource?.scopeLabel || "").trim();
      if (!quizSourceText) {
        throw new Error("문서에서 퀴즈에 사용할 본문 텍스트를 찾지 못했습니다.");
      }
      if (scopeLabel) {
        setStatus(`퀴즈 세트 생성 중... (${scopeLabel})`);
      }

      const historicalQuizTexts = collectQuestionTextsFromQuizSets(quizSets);
      const canReuseHistoricalQuizPrompts = historicalQuizTexts.length > 0;
      const avoidQuestionTexts = dedupeQuestionTexts(historicalQuizTexts).slice(0, 80);
      const seenQuestionKeys = createQuestionKeySet(avoidQuestionTexts);

      const targetMcCount = Math.max(0, Number(quizMix.multipleChoice) || 0);
      const targetSaCount = Math.max(0, Number(quizMix.shortAnswer) || 0);
      const targetTotalCount = targetMcCount + targetSaCount;
      if (targetTotalCount <= 0) {
        throw new Error("최소 1문항 이상 입력해주세요.");
      }
      const nextMultipleChoice = [];
      const nextShortAnswer = [];
      let questionStyleProfile = "";
      let reusedPreviousQuizPrompts = false;

      const { generateQuiz } = await getOpenAiService();
      const maxAttempts = Math.max(
        3,
        Math.ceil(targetMcCount / 5) + 1,
        Math.ceil(targetSaCount / 5) + 1
      );
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (nextMultipleChoice.length >= targetMcCount && nextShortAnswer.length >= targetSaCount) {
          break;
        }

        const requestMcCount =
          targetMcCount > nextMultipleChoice.length
            ? Math.min(5, targetMcCount - nextMultipleChoice.length + 1)
            : 0;
        const requestSaCount =
          targetSaCount > nextShortAnswer.length
            ? Math.min(5, targetSaCount - nextShortAnswer.length + 1)
            : 0;
        const rawQuizResult = await generateQuiz(quizSourceText, {
          multipleChoiceCount: requestMcCount,
          shortAnswerCount: requestSaCount,
          avoidQuestions: avoidQuestionTexts,
          scopeLabel,
          questionStyleProfile: questionStyleProfileContent,
          outputLanguage,
        });
        if (!questionStyleProfile) {
          questionStyleProfile = String(rawQuizResult?.questionStyleProfile || "").trim();
        }
        const quiz = normalizeQuizPayload(rawQuizResult);

        pushUniqueByQuestionKey(
          nextMultipleChoice,
          Array.isArray(quiz.multipleChoice) ? quiz.multipleChoice : [],
          getQuizPromptText,
          seenQuestionKeys,
          targetMcCount
        );
        pushUniqueByQuestionKey(
          nextShortAnswer,
          Array.isArray(quiz.shortAnswer) ? quiz.shortAnswer : [],
          getQuizPromptText,
          seenQuestionKeys,
          targetSaCount
        );

        const mergedAvoidQuestions = mergeQuestionHistory(
          avoidQuestionTexts,
          [...nextMultipleChoice.map(getQuizPromptText), ...nextShortAnswer.map(getQuizPromptText)],
          120
        );
        avoidQuestionTexts.splice(0, avoidQuestionTexts.length, ...mergedAvoidQuestions);
      }

      if (nextMultipleChoice.length < targetMcCount || nextShortAnswer.length < targetSaCount) {
        const relaxedSeenQuestionKeys = createQuestionKeySet([
          ...nextMultipleChoice.map(getQuizPromptText),
          ...nextShortAnswer.map(getQuizPromptText),
        ]);
        const relaxedAvoidQuestions = dedupeQuestionTexts([
          ...nextMultipleChoice.map(getQuizPromptText),
          ...nextShortAnswer.map(getQuizPromptText),
        ]).slice(0, 40);
        const relaxedAttempts = 2;

        for (let attempt = 0; attempt < relaxedAttempts; attempt += 1) {
          if (nextMultipleChoice.length >= targetMcCount && nextShortAnswer.length >= targetSaCount) {
            break;
          }

          const remainingMcCount = Math.max(0, targetMcCount - nextMultipleChoice.length);
          const remainingSaCount = Math.max(0, targetSaCount - nextShortAnswer.length);
          const requestMcCount = remainingMcCount > 0 ? Math.min(8, remainingMcCount + 2 + attempt) : 0;
          const requestSaCount = remainingSaCount > 0 ? Math.min(6, remainingSaCount + 1 + attempt) : 0;
          const rawQuizResult = await generateQuiz(quizSourceText, {
            multipleChoiceCount: requestMcCount,
            shortAnswerCount: requestSaCount,
            avoidQuestions: relaxedAvoidQuestions,
            scopeLabel,
            questionStyleProfile: questionStyleProfile || questionStyleProfileContent,
            outputLanguage,
          });
          if (!questionStyleProfile) {
            questionStyleProfile = String(rawQuizResult?.questionStyleProfile || "").trim();
          }
          const quiz = normalizeQuizPayload(rawQuizResult);
          const prevMcLength = nextMultipleChoice.length;
          const prevSaLength = nextShortAnswer.length;

          pushUniqueByQuestionKey(
            nextMultipleChoice,
            Array.isArray(quiz.multipleChoice) ? quiz.multipleChoice : [],
            getQuizPromptText,
            relaxedSeenQuestionKeys,
            targetMcCount
          );
          pushUniqueByQuestionKey(
            nextShortAnswer,
            Array.isArray(quiz.shortAnswer) ? quiz.shortAnswer : [],
            getQuizPromptText,
            relaxedSeenQuestionKeys,
            targetSaCount
          );

          if (
            canReuseHistoricalQuizPrompts &&
            (nextMultipleChoice.length > prevMcLength || nextShortAnswer.length > prevSaLength)
          ) {
            reusedPreviousQuizPrompts = true;
          }

          const mergedRelaxedAvoidQuestions = mergeQuestionHistory(
            relaxedAvoidQuestions,
            [...nextMultipleChoice.map(getQuizPromptText), ...nextShortAnswer.map(getQuizPromptText)],
            60
          );
          relaxedAvoidQuestions.splice(0, relaxedAvoidQuestions.length, ...mergedRelaxedAvoidQuestions);
        }
      }

      if (nextMultipleChoice.length < targetMcCount || nextShortAnswer.length < targetSaCount) {
        throw new Error("충분한 퀴즈 문항을 만들지 못했습니다. 챕터 범위나 페이지 범위를 바꿔 다시 시도해 주세요.");
      }

      const trimmedQuiz = {
        multipleChoice: nextMultipleChoice.slice(0, targetMcCount),
        shortAnswer: nextShortAnswer.slice(0, targetSaCount),
      };
      const newSet = createQuizSetState(trimmedQuiz, undefined, {
        questionStyleProfile,
        questionStyleScopeLabel: scopeLabel || questionStyleProfileScopeLabel,
      });
      setQuizSets((prev) => [...prev, newSet]);
      const quizStatusLabel = reusedPreviousQuizPrompts
        ? scopeLabel
          ? `퀴즈 세트가 생성되었습니다. 일부 문항은 기존 세트와 겹칠 수 있습니다. (${scopeLabel})`
          : "퀴즈 세트가 생성되었습니다. 일부 문항은 기존 세트와 겹칠 수 있습니다."
        : scopeLabel
          ? `퀴즈 세트가 생성되었습니다. (${scopeLabel})`
          : "퀴즈 세트가 생성되었습니다.";
      setStatus(quizStatusLabel);
      setUsageCounts((prev) => ({ ...prev, quiz: prev.quiz + 1 }));
      persistArtifacts({ quiz: trimmedQuiz });
    } catch (err) {
      setError(`퀴즈 세트 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!quizSets.length) {
      setError("삭제할 퀴즈가 없습니다.");
      return;
    }
    quizAutoRequestedRef.current = false;
    resetQuizState();
    setStatus("퀴즈를 삭제했습니다.");
    setError("");
    await persistArtifacts({ quiz: null });
  };

  const handleDeleteQuizItem = useCallback(
    async (setId, section, questionIndex) => {
      const normalizedSection = String(section || "").trim();
      const normalizedIndex = Number.parseInt(questionIndex, 10);
      if (!setId || !["multipleChoice", "shortAnswer"].includes(normalizedSection)) return;
      if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0) return;

      let nextPersistedQuiz = null;
      let deleted = false;

      setQuizSets((prev) => {
        const nextSets = (Array.isArray(prev) ? prev : [])
          .map((set) => {
            if (set.id !== setId) return set;

            const questions = normalizeQuizPayload(set?.questions || {});
            const sourceItems = Array.isArray(questions?.[normalizedSection])
              ? questions[normalizedSection]
              : [];
            if (normalizedIndex >= sourceItems.length) return set;

            deleted = true;
            return {
              ...set,
              questions: {
                ...questions,
                [normalizedSection]: sourceItems.filter((_, idx) => idx !== normalizedIndex),
              },
            };
          })
          .filter((set) => {
            const questions = normalizeQuizPayload(set?.questions || {});
            return (
              questions.multipleChoice.length > 0 ||
              questions.shortAnswer.length > 0 ||
              questions.ox.length > 0
            );
          });

        nextPersistedQuiz = nextSets.length > 0 ? normalizeQuizPayload(nextSets[0]?.questions || {}) : null;
        return nextSets;
      });

      if (!deleted) return;

      setStatus("퀴즈 문항을 삭제했습니다.");
      setError("");
      await persistArtifacts({ quiz: nextPersistedQuiz });
    },
    [persistArtifacts]
  );

  const regenerateQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (isFreeTier) {
      setError("무료 플랜에서는 퀴즈 세트를 다시 생성할 수 없습니다.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("현재 요금제의 퀴즈 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    quizAutoRequestedRef.current = true;
    resetQuizState();
    setStatus("퀴즈 세트를 초기화하고 다시 생성하는 중...");
    setError("");
    await persistArtifacts({ quiz: null });
    await requestQuestions({ force: true });
  };

  const createBaseReviewNote = useCallback(
    ({
      sourceType,
      sourceLabel,
      prompt,
      explanation = "",
      evidencePages = [],
      evidenceSnippet = "",
      evidenceLabel = "",
    }) => {
      const promptText = String(prompt || "").trim();
      const questionKey = normalizeQuestionKey(promptText);
      const now = new Date().toISOString();
      return {
        id: `${sourceType}:${questionKey}`,
        sourceType,
        sourceLabel,
        questionKey,
        prompt: promptText,
        explanation: String(explanation || "").trim(),
        evidencePages: Array.isArray(evidencePages) ? evidencePages : [],
        evidenceSnippet: String(evidenceSnippet || "").trim(),
        evidenceLabel: String(evidenceLabel || "").trim(),
        wrongCount: 1,
        reviewCount: 0,
        resolved: false,
        createdAt: now,
        updatedAt: now,
        lastWrongAt: now,
        lastCorrectAt: null,
        hiddenAt: null,
      };
    },
    []
  );

  const upsertWrongReviewNote = useCallback(
    (note) => {
      if (!note?.questionKey || !note?.sourceType) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existingIndex = list.findIndex(
          (item) => item?.sourceType === note.sourceType && item?.questionKey === note.questionKey
        );
        if (existingIndex < 0) {
          return [
            {
              ...note,
              createdAt: note.createdAt || now,
              updatedAt: now,
              lastWrongAt: now,
              lastCorrectAt: note.lastCorrectAt || null,
            },
            ...list,
          ];
        }

        const existing = list[existingIndex];
        const next = [...list];
        next[existingIndex] = {
          ...existing,
          ...note,
          id: existing.id || note.id,
          createdAt: existing.createdAt || note.createdAt || now,
          updatedAt: now,
          lastWrongAt: now,
          wrongCount: Math.max(1, Number(existing?.wrongCount || 0) + 1),
          reviewCount: Number(existing?.reviewCount || 0),
          resolved: false,
          hiddenAt: null,
        };
        return next;
      });
    },
    [persistReviewNotes]
  );

  const markReviewNoteCorrectByPrompt = useCallback(
    (sourceType, prompt, userAnswerText = "", userAnswerValue = "") => {
      const questionKey = normalizeQuestionKey(prompt);
      if (!questionKey) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item?.sourceType === sourceType && item?.questionKey === questionKey
            ? {
                ...item,
                userAnswerText: String(userAnswerText || "").trim() || item.userAnswerText,
                userAnswerValue:
                  userAnswerValue !== undefined && userAnswerValue !== null && userAnswerValue !== ""
                    ? userAnswerValue
                    : item.userAnswerValue,
                resolved: true,
                updatedAt: now,
                lastCorrectAt: now,
              }
            : item
        )
      );
    },
    [persistReviewNotes]
  );

  const handleReviewNoteAttempt = useCallback(
    (item, attempt) => {
      if (!item?.id || !attempt) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((note) => {
          if (note?.id !== item.id) return note;
          if (attempt.isCorrect) {
            return {
              ...note,
              userAnswerText: String(attempt.userAnswerText || "").trim() || note.userAnswerText,
              userAnswerValue:
                attempt.userAnswerValue !== undefined ? attempt.userAnswerValue : note.userAnswerValue,
              resolved: true,
              reviewCount: Number(note?.reviewCount || 0) + 1,
              updatedAt: now,
              lastCorrectAt: now,
            };
          }
          return {
            ...note,
            userAnswerText: String(attempt.userAnswerText || "").trim() || note.userAnswerText,
            userAnswerValue:
              attempt.userAnswerValue !== undefined ? attempt.userAnswerValue : note.userAnswerValue,
            resolved: false,
            wrongCount: Math.max(1, Number(note?.wrongCount || 0) + 1),
            reviewCount: Number(note?.reviewCount || 0) + 1,
            updatedAt: now,
            lastWrongAt: now,
          };
        })
      );
    },
    [persistReviewNotes]
  );

  const handleDeleteReviewNote = useCallback(
    (noteId) => {
      if (!noteId) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item?.id === noteId
            ? {
                ...item,
                hiddenAt: now,
                updatedAt: now,
              }
            : item
        )
      );
    },
    [persistReviewNotes]
  );

  const handleQuizOxSelect = useCallback(
    (setId, qIdx, choice) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const currentSelection = targetSet?.oxSelections?.[qIdx];
      if (currentSelection === "o" || currentSelection === "x") return;

      setQuizSets((prev) =>
        prev.map((set) =>
          set.id === setId
            ? {
                ...set,
                oxSelections: { ...set.oxSelections, [qIdx]: choice },
              }
            : set
        )
      );

      const items = Array.isArray(targetSet?.questions?.ox) ? targetSet.questions.ox : [];
      const item = items[qIdx];
      if (!item || (choice !== "o" && choice !== "x")) return;

      const expected = item.answer === true ? "o" : "x";
      const userAnswerText = choice === "o" ? "O" : "X";
      const prompt = String(item?.statement || item?.prompt || item?.question || "").trim();
      if (choice === expected) {
        markReviewNoteCorrectByPrompt("ox", prompt, userAnswerText, choice === "o");
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "ox",
          sourceLabel: "O/X",
          prompt,
          explanation: item?.explanation,
          evidencePages: item?.evidencePages,
          evidenceSnippet: item?.evidenceSnippet || item?.evidence,
          evidenceLabel: item?.evidenceLabel || "",
        }),
        correctAnswerText: item.answer ? "O" : "X",
        correctAnswerValue: Boolean(item.answer),
        userAnswerText,
        userAnswerValue: choice === "o",
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const handleToggleQuizOxExplanation = useCallback((setId, qIdx) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? {
              ...set,
              oxExplanationOpen: {
                ...set.oxExplanationOpen,
                [qIdx]: !set?.oxExplanationOpen?.[qIdx],
              },
            }
          : set
      )
    );
  }, []);

  const handleChoiceSelect = useCallback(
    (setId, qIdx, choiceIdx) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const multipleChoice = Array.isArray(targetSet?.questions?.multipleChoice)
        ? targetSet.questions.multipleChoice
        : [];
      const question = multipleChoice[qIdx];
      if (targetSet?.revealedChoices?.[qIdx]) return;

      setQuizSets((prev) =>
        prev.map((set) =>
          set.id === setId
            ? {
                ...set,
                selectedChoices: { ...set.selectedChoices, [qIdx]: choiceIdx },
                revealedChoices: { ...set.revealedChoices, [qIdx]: true },
              }
            : set
        )
      );

      if (!question) return;

      const choices = Array.isArray(question?.choices) ? question.choices : [];
      const prompt = String(question?.question || question?.prompt || "").trim();
      const selectedChoiceText = String(choices?.[choiceIdx] || "").trim();
      const answerIndex = Number.isFinite(question?.answerIndex) ? question.answerIndex : -1;
      const correctChoiceText = String(choices?.[answerIndex] || "").trim();
      if (choiceIdx === answerIndex) {
        markReviewNoteCorrectByPrompt("quiz_multiple_choice", prompt, selectedChoiceText, choiceIdx);
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "quiz_multiple_choice",
          sourceLabel: "객관식",
          prompt,
          explanation: question?.explanation,
          evidencePages: question?.evidencePages,
          evidenceSnippet: question?.evidenceSnippet,
          evidenceLabel: question?.evidenceLabel,
        }),
        choices,
        answerIndex,
        correctAnswerText: correctChoiceText,
        correctAnswerValue: answerIndex,
        userAnswerText: selectedChoiceText,
        userAnswerValue: choiceIdx,
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const handleShortAnswerChange = useCallback((setId, idx, value) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? { ...set, shortAnswerInput: { ...set.shortAnswerInput, [idx]: value } }
          : set
      )
    );
  }, []);

  const handleShortAnswerCheck = useCallback(
    (setId, idx) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const shortAnswers = Array.isArray(targetSet?.questions?.shortAnswer)
        ? targetSet.questions.shortAnswer
        : [];
      const target = shortAnswers[idx];
      if (!target?.answer) return;

      const user = String(targetSet?.shortAnswerInput?.[idx] || "").trim().toLowerCase();
      const answer = String(target.answer).trim().toLowerCase();
      const normalizedUser = user.replace(/\s+/g, "");
      const normalizedAnswer = answer.replace(/\s+/g, "");
      const existingResult = targetSet?.shortAnswerResult?.[idx];
      if (existingResult?.submittedValue === normalizedUser) return;
      const isCorrect = normalizedUser === normalizedAnswer;

      setQuizSets((prev) =>
        prev.map((set) => {
          const shortAnswerList = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
          const shortTarget = shortAnswerList[idx];
          if (set.id !== setId || !shortTarget?.answer) return set;
          return {
            ...set,
            shortAnswerResult: {
              ...set.shortAnswerResult,
              [idx]: { isCorrect, answer: shortTarget.answer, submittedValue: normalizedUser },
            },
          };
        })
      );

      const prompt = String(target?.question || target?.prompt || "").trim();
      const userAnswerText = String(targetSet?.shortAnswerInput?.[idx] || "").trim();
      if (isCorrect) {
        markReviewNoteCorrectByPrompt("quiz_short_answer", prompt, userAnswerText, userAnswerText);
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "quiz_short_answer",
          sourceLabel: "주관식",
          prompt,
          explanation: target?.explanation,
          evidencePages: target?.evidencePages,
          evidenceSnippet: target?.evidenceSnippet,
          evidenceLabel: target?.evidenceLabel,
        }),
        correctAnswerText: String(target?.answer || "").trim(),
        correctAnswerValue: String(target?.answer || "").trim(),
        userAnswerText,
        userAnswerValue: userAnswerText,
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const resolveChapterRangeLimit = useCallback(
    (rawInput) => {
      const pageLimit = Number(pageInfo.total || pageInfo.used || 0);
      if (isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        return pageLimit;
      }
      let inferredLimit = 0;

      String(rawInput || "")
        .split(/[\n,;]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => {
          const compact = token.replace(/\s+/g, "");
          let matched =
            compact.match(/^(\d+)[:=](\d+)-(\d+)$/i) ||
            compact.match(/^ch(?:apter)?(\d+)[:=](\d+)-(\d+)$/i);
          if (matched) {
            inferredLimit = Math.max(inferredLimit, Number.parseInt(matched[3], 10) || 0);
            return;
          }

          matched = compact.match(/^(\d+)-(\d+)$/);
          if (matched) {
            inferredLimit = Math.max(inferredLimit, Number.parseInt(matched[2], 10) || 0);
          }
        });

      return Math.max(pageLimit, inferredLimit);
    },
    [file, pageInfo.total, pageInfo.used]
  );

  const effectiveChapterRangeInput = useMemo(() => {
    const manualInput = String(chapterRangeInput || "").trim();
    if (manualInput) return manualInput;

    const autoInput = String(autoChapterRangeInput || "").trim();
    if (autoInput) return autoInput;

    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) return "";
    const totalPages = Number(pageInfo.total || pageInfo.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return "";

    const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    const cachedStartPage = Number(chapterOneStartPageCacheRef.current.get(docKey));
    return buildAutomaticChapterRangeInput(totalPages, cachedStartPage);
  }, [
    autoChapterRangeInput,
    buildAutomaticChapterRangeInput,
    chapterRangeInput,
    file,
    pageInfo.total,
    pageInfo.used,
    selectedFileId,
  ]);

  const configuredReviewSections = useMemo(() => {
    const raw = String(effectiveChapterRangeInput || "").trim();
    if (!raw) return [];
    const limit = resolveChapterRangeLimit(raw);
    if (!limit) return [];
    const parsed = parseChapterRangeSelectionInput(raw, limit);
    if (parsed.error) return [];
    const isAutoGenerated = !String(chapterRangeInput || "").trim();
    return (Array.isArray(parsed.chapters) ? parsed.chapters : [])
      .map((chapter, index) => {
        const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
        const pageStart = Number.parseInt(chapter?.pageStart, 10);
        const pageEnd = Number.parseInt(chapter?.pageEnd, 10);
        if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageStart <= 0 || pageEnd < pageStart) {
          return null;
        }
        const normalizedChapterNumber =
          Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : index + 1;
        return {
          id: String(chapter?.id || `review-section-${normalizedChapterNumber}`),
          chapterNumber: normalizedChapterNumber,
          pageStart,
          pageEnd,
          label: `${isAutoGenerated ? "자동 섹션" : "섹션"} ${normalizedChapterNumber}`,
          detailLabel: `${isAutoGenerated ? "자동 섹션" : "섹션"} ${normalizedChapterNumber} · ${pageStart}-${pageEnd}p`,
        };
      })
      .filter(Boolean);
  }, [chapterRangeInput, effectiveChapterRangeInput, resolveChapterRangeLimit]);

  const reviewNotesWithSections = useMemo(() => {
    const notes = Array.isArray(reviewNotes) ? reviewNotes : [];
    return notes.map((item) => {
      const evidencePages = Array.isArray(item?.evidencePages) ? item.evidencePages : [];
      const matchedSections = configuredReviewSections.filter((section) =>
        evidencePages.some((pageNumber) => pageNumber >= section.pageStart && pageNumber <= section.pageEnd)
      );
      return {
        ...item,
        sectionNumbers: matchedSections.map((section) => section.chapterNumber),
        sectionLabels: matchedSections.map((section) => section.detailLabel),
      };
    });
  }, [configuredReviewSections, reviewNotes]);

  const selectReviewNotesBySection = useCallback(
    (items, chapterSelectionInput = "") => {
      const list = (Array.isArray(items) ? items : []).filter((item) => !item?.hiddenAt);
      const cleaned = String(chapterSelectionInput || "").trim();
      if (!cleaned) {
        return {
          items: list,
          error: "",
          selectedSectionNumbers: [],
        };
      }
      if (!configuredReviewSections.length) {
        return {
          items: list,
          error: "문서 범위를 아직 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
          selectedSectionNumbers: [],
        };
      }

      const selected = parseChapterNumberSelectionInput(cleaned, configuredReviewSections);
      if (selected.error) {
        return {
          items: list,
          error: "섹션 범위를 다시 확인해주세요. (예: 1-3,5)",
          selectedSectionNumbers: [],
        };
      }

      const selectedNumberSet = new Set(selected.chapterNumbers);
      return {
        items: list.filter(
          (item) =>
            Array.isArray(item?.sectionNumbers) &&
            item.sectionNumbers.some((chapterNumber) => selectedNumberSet.has(chapterNumber))
        ),
        error: "",
        selectedSectionNumbers: selected.chapterNumbers,
      };
    },
    [configuredReviewSections]
  );

  const reviewNotesPanelState = useMemo(() => {
    const filtered = selectReviewNotesBySection(reviewNotesWithSections, reviewNotesChapterSelectionInput);
    return {
      ...filtered,
      items: sortReviewNotesByRecentWrong(filtered.items),
    };
  }, [reviewNotesChapterSelectionInput, reviewNotesWithSections, selectReviewNotesBySection]);

  const examCramQuizItems = useMemo(() => collectExamCramQuizItems(quizSets), [quizSets]);

  const examCramState = useMemo(() => {
    const filtered = selectReviewNotesBySection(reviewNotesWithSections, reviewNotesChapterSelectionInput);
    const pendingNotes = sortReviewNotesByRecentWrong(filtered.items.filter((item) => !item?.resolved));
    return {
      ...filtered,
      items: pendingNotes.slice(0, EXAM_CRAM_PREVIEW_LIMIT),
      pendingCount: pendingNotes.length,
      referenceCounts: {
        summary: String(summary || partialSummary || "").trim() ? 1 : 0,
        quiz: examCramQuizItems.length,
        ox: Array.isArray(oxItems) ? oxItems.length : 0,
        reviewNotes: pendingNotes.length,
      },
      hasAnySource:
        Boolean(String(summary || partialSummary || "").trim()) ||
        examCramQuizItems.length > 0 ||
        (Array.isArray(oxItems) ? oxItems.length : 0) > 0 ||
        pendingNotes.length > 0,
    };
  }, [
    examCramQuizItems,
    oxItems,
    partialSummary,
    reviewNotesChapterSelectionInput,
    reviewNotesWithSections,
    selectReviewNotesBySection,
    summary,
  ]);

  const buildAdaptiveChapterSummaryRanges = (chapters) => {
    const list = Array.isArray(chapters) ? chapters : [];
    const expanded = [];

    for (const chapter of list) {
      const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
      const normalizedChapterNumber =
        Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : expanded.length + 1;
      const start = Number.parseInt(chapter?.pageStart, 10);
      const end = Number.parseInt(chapter?.pageEnd, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
        continue;
      }

      // Interpret the user formula as chunk-count first, then derive pages-per-chunk.
      // This keeps short ranges like 5-9 as a single chunk instead of 1-page chunks.
      const totalPages = end - start + 1;
      const chunkCount = Math.max(1, Math.round(Math.abs(end - start) / 10));
      const pagesPerChunk = Math.max(1, Math.ceil(totalPages / chunkCount));
      const rangeIdBase = String(chapter?.id || `chapter-${normalizedChapterNumber}`);
      let sectionIndex = 1;

      for (let pageStart = start; pageStart <= end; pageStart += pagesPerChunk) {
        const pageEnd = Math.min(end, pageStart + pagesPerChunk - 1);
        expanded.push({
          id: `${rangeIdBase}-part-${sectionIndex}`,
          chapterNumber: normalizedChapterNumber,
          chapterTitle: `챕터 ${normalizedChapterNumber} (${pageStart}-${pageEnd}p)`,
          pagesPerChunk,
          pageStart,
          pageEnd,
        });
        sectionIndex += 1;
      }
    }

    return expanded;
  };

  const extractTextForChapterSelection = useCallback(
    async ({ featureLabel, chapterSelectionInput }) => {
      if (!file) {
        throw new Error("먼저 PDF를 열어주세요.");
      }
      if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        throw new Error("챕터/페이지 범위 기능은 PDF에서만 지원됩니다.");
      }

      let chapterConfigRaw = String(effectiveChapterRangeInput || "").trim();
      if (!chapterConfigRaw) {
        const totalPages = pageInfo.total || pageInfo.used || 0;
        let autoChapterInput = "";
        try {
          setStatus(`${featureLabel}: 챕터 범위를 자동 탐색 중...`);
          const detected = await extractChapterRangesFromToc(file, {
            maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
          });
          const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
          autoChapterInput = buildChapterRangeInputFromChapters(chapters);

          if (autoChapterInput) {
            const limit = totalPages || Number(detected?.totalPages) || 0;
            const parsedAuto = parseChapterRangeSelectionInput(autoChapterInput, limit);
            if (!parsedAuto.error && parsedAuto.chapters.length > 0) {
              setAutoChapterRangeInput(autoChapterInput);
              setChapterRangeError("");
              const sorted = [...parsedAuto.chapters].sort(
                (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
              );
              const chapterOne =
                sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
              const start = Number.parseInt(chapterOne?.pageStart, 10);
              if (Number.isFinite(start) && start > 0) {
                const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
                chapterOneStartPageCacheRef.current.set(docKey, Math.min(limit, Math.max(1, start)));
              }
            } else {
              autoChapterInput = "";
            }
          }
        } catch {
          autoChapterInput = "";
        }

        if (!autoChapterInput) {
          const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
          const cachedStartPage = Number(chapterOneStartPageCacheRef.current.get(docKey));
          autoChapterInput = buildAutomaticChapterRangeInput(totalPages, cachedStartPage);
          if (autoChapterInput) {
            setAutoChapterRangeInput(autoChapterInput);
            setChapterRangeError("");
          }
        }
        chapterConfigRaw = autoChapterInput;
      }

      if (!chapterConfigRaw) {
        throw new Error("문서 범위를 자동으로 준비하지 못했습니다.");
      }

      const totalPages = pageInfo.total || pageInfo.used || 0;
      const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
      if (parsedChapters.error) {
        setChapterRangeError(parsedChapters.error);
        throw new Error(parsedChapters.error);
      }
      if (!parsedChapters.chapters.length) {
        throw new Error("설정된 챕터 범위를 찾지 못했습니다.");
      }

      const selected = parseChapterNumberSelectionInput(chapterSelectionInput, parsedChapters.chapters);
      if (selected.error) {
        throw new Error(selected.error);
      }
      const selectedNumbers = selected.chapterNumbers;
      const selectedNumberSet = new Set(selectedNumbers);
      const targetChapters = parsedChapters.chapters.filter((chapter) =>
        selectedNumberSet.has(Number.parseInt(chapter?.chapterNumber, 10))
      );
      if (!targetChapters.length) {
        throw new Error("선택한 챕터에 해당하는 범위가 없습니다.");
      }

      const normalizedSelection = selectedNumbers.join(",");
      const scopeLabel = `chapter ${normalizedSelection}`;
      const cacheKey = `${selectedFileId || file?.name || "doc"}::${chapterConfigRaw}::${normalizedSelection}`;
      const cached = chapterScopeTextCacheRef.current.get(cacheKey);
      if (cached) {
        return { text: cached, scopeLabel };
      }

      setStatus(`${featureLabel}: 챕터 범위 텍스트 추출 중...`);
      const chapterExtraction = await extractPdfTextByRanges(file, targetChapters, {
        maxLengthPerRange: 14000,
        useOcr: true,
        ocrLang: "kor+eng",
        onOcrProgress: (message) => setStatus(message),
      });
      const scopedText = (chapterExtraction?.chapters || [])
        .map((chapter) => {
          const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
          const title = chapterNumber > 0 ? `챕터 ${chapterNumber}` : "챕터";
          const text = String(chapter?.text || "").trim();
          if (!text) return "";
          return `## ${title}\n${text}`;
        })
        .filter(Boolean)
        .join("\n\n");
      if (!scopedText.trim()) {
        throw new Error("선택한 챕터 범위에서 텍스트를 추출하지 못했습니다.");
      }

      chapterScopeTextCacheRef.current.set(cacheKey, scopedText);
      return { text: scopedText, scopeLabel };
    },
    [
      buildAutomaticChapterRangeInput,
      buildChapterRangeInputFromChapters,
      effectiveChapterRangeInput,
      file,
      pageInfo.total,
      pageInfo.used,
      selectedFileId,
    ]
  );
  useEffect(() => {
    extractTextForChapterSelectionRef.current = extractTextForChapterSelection;
  }, [extractTextForChapterSelection]);

  const requestSummary = async ({ force = false, replaceExisting = true } = {}) => {
    const hasExistingSummary = Boolean(String(summary || "").trim());
    const shouldReplaceExisting = replaceExisting && hasExistingSummary;
    if (isLoadingSummary || (!force && summaryRequestedRef.current && !shouldReplaceExisting)) return;
    const instructorEmphasisText = getEffectiveInstructorEmphasisText();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!force && hasReached("maxSummary") && !shouldReplaceExisting) {
      setError("현재 요금제의 요약 생성 한도에 도달했습니다.");
      return;
    }

    if (shouldReplaceExisting) {
      summaryRequestedRef.current = false;
      setSummary("");
      setStatus("기존 요약을 지우는 중...");
      await persistArtifacts({ summary: null });
    }

    summaryRequestedRef.current = true;
    setIsLoadingSummary(true);
    setError("");
    setChapterRangeError("");
    setStatus("요약 생성 중...");
    try {
      const chapterConfigRaw = String(chapterRangeInput || "").trim();
      let customChapterSections = null;
      if (chapterConfigRaw) {
        if (!isPdfSource) {
          throw new Error("챕터 범위 요약은 PDF에서만 지원됩니다. 챕터 범위를 비우고 다시 시도해주세요.");
        }
        const totalPages = pageInfo.total || pageInfo.used || 0;
        const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
        if (parsedChapters.error) {
          setChapterRangeError(parsedChapters.error);
          throw new Error(parsedChapters.error);
        }
        const adaptiveChapterRanges = buildAdaptiveChapterSummaryRanges(parsedChapters.chapters);
        if (!adaptiveChapterRanges.length) {
          throw new Error("적응형 분할에 사용할 수 있는 챕터 범위가 없습니다.");
        }
        const pagesPerChunkById = new Map(
          adaptiveChapterRanges.map((range) => [String(range.id), Number(range.pagesPerChunk) || 1])
        );
        setStatus("설정한 챕터 범위의 텍스트를 추출하는 중...");
        const chapterExtraction = await extractPdfTextByRanges(file, adaptiveChapterRanges, {
          maxLengthPerRange: 14000,
          useOcr: true,
          ocrLang: "kor+eng",
          ocrScale: 1.35,
          ocrMaxPixels: 1000000,
          ocrPageOrder: "spread",
          maxOcrPagesPerRange: 4,
          onOcrProgress: (message) => setStatus(message),
        });
        customChapterSections = (chapterExtraction?.chapters || [])
          .map((chapter) => ({
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.chapterTitle,
            pageStart: chapter.pageStart,
            pageEnd: chapter.pageEnd,
            pagePerChunk:
              pagesPerChunkById.get(String(chapter.id)) ||
              Math.max(1, (Number(chapter.pageEnd) || 0) - (Number(chapter.pageStart) || 0) + 1),
            text: chapter.text || "",
          }))
          .filter((chapter) => String(chapter.text || "").trim().length > 0);
        if (!customChapterSections.length) {
          throw new Error("설정한 챕터 범위에서 텍스트를 추출하지 못했습니다.");
        }
      }

      let summarySourceText = String(extractedText || previewText || "").trim();
      const summaryCacheKey = selectedFileId || file?.name || null;
      if (!customChapterSections) {
        const cachedSummaryText = summaryCacheKey
          ? summaryContextCacheRef.current.get(summaryCacheKey)
          : null;

        if (
          typeof cachedSummaryText === "string" &&
          String(cachedSummaryText).trim().length > summarySourceText.length
        ) {
          summarySourceText = cachedSummaryText;
        }

        if (file && isPdfSource) {
          try {
            setStatus("요약 정확도 향상을 위해 추출 범위를 확장하는 중...");
            const extended = await extractPdfText(file, 80, 50000, { useOcr: false });
            const extendedText = String(extended?.text || "").trim();
            if (extendedText.length > summarySourceText.length) {
              summarySourceText = extendedText;
              if (summaryCacheKey) {
                summaryContextCacheRef.current.set(summaryCacheKey, extendedText);
              }
            }
          } catch {
            // fallback to already extracted text
          }
        }

        if (!summarySourceText && file && isPdfSource) {
          try {
            setStatus("텍스트가 보이지 않아 OCR로 다시 추출하는 중...");
            const ocrExtracted = await extractPdfText(file, 80, 28000, {
              useOcr: true,
              ocrLang: "kor+eng",
              ocrScale: 1.35,
              ocrMaxPixels: 1000000,
              ocrPageOrder: "spread",
              maxOcrPages: 16,
              onOcrProgress: (message) => setStatus(message),
            });
            const ocrText = String(ocrExtracted?.text || "").trim();
            if (ocrText) {
              summarySourceText = ocrText;
              setExtractedText((prev) => (String(prev || "").trim() ? prev : ocrText));
              setPreviewText((prev) => (String(prev || "").trim() ? prev : ocrText));
              if (summaryCacheKey) {
                summaryContextCacheRef.current.set(summaryCacheKey, ocrText);
              }
            }
          } catch {
            // fallback to already extracted text
          }
        }
      }

      if (!customChapterSections && !summarySourceText) {
        if (isPdfSource) {
          throw new Error("문서에서 요약할 텍스트를 찾지 못했습니다. OCR까지 시도했지만 추출 가능한 텍스트가 없습니다.");
        }
        throw new Error("문서에서 요약할 텍스트를 찾지 못했습니다.");
      }

      setStatus("AI로 요약을 생성하는 중...");
      const { generateSummary, generateQuestionStyleProfile } = await getOpenAiService();
      const questionStyleScopeLabel = customChapterSections ? "사용자 지정 챕터 범위" : "문서 전체";
      const questionStyleSourceText = customChapterSections
        ? customChapterSections
            .map((chapter) => {
              const title = String(chapter?.chapterTitle || chapter?.id || "").trim();
              const text = String(chapter?.text || "").trim();
              return [title ? `[${title}]` : "", text].filter(Boolean).join("\n");
            })
            .filter(Boolean)
            .join("\n\n")
        : summarySourceText;
      const [summarized, generatedQuestionStyleProfile] = await Promise.all([
        customChapterSections
          ? generateSummary(questionStyleSourceText, {
              scope: "사용자 지정 챕터 범위",
              chapterized: true,
              chapterSections: customChapterSections,
              instructorEmphasis: instructorEmphasisText,
              outputLanguage,
            })
          : generateSummary(summarySourceText, {
              instructorEmphasis: instructorEmphasisText,
              outputLanguage,
            }),
        generateQuestionStyleProfile(questionStyleSourceText, {
          scopeLabel: questionStyleScopeLabel,
        }),
      ]);
      const nextQuestionStyleProfile = String(generatedQuestionStyleProfile || "").trim();
      const nextHighlights = writeQuestionStyleProfileToHighlights(artifacts?.highlights, {
        content: nextQuestionStyleProfile,
        scopeLabel: questionStyleScopeLabel,
        updatedAt: new Date().toISOString(),
      });
      setSummary(summarized);
      setQuestionStyleProfileContent(nextQuestionStyleProfile);
      setQuestionStyleProfileScopeLabel(nextQuestionStyleProfile ? questionStyleScopeLabel : "");
      setUsageCounts((prev) => ({ ...prev, summary: prev.summary + 1 }));
      setStatus("요약이 생성되었습니다.");
      persistArtifacts({ summary: summarized, highlights: nextHighlights });
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
      setStatus("");
      summaryRequestedRef.current = false;
      setStatus("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleAutoDetectChapterRanges = useCallback(async () => {
    if (isDetectingChapterRanges || isLoadingSummary || isLoadingText) return;
    if (!file) {
      setChapterRangeError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setChapterRangeError("목차 자동 감지는 PDF에서만 지원됩니다.");
      return;
    }

    setIsDetectingChapterRanges(true);
    setChapterRangeError("");
    setError("");
    setStatus("목차에서 챕터 범위를 자동 추출 중...");
    try {
      const totalPages = Number(pageInfo.total || pageInfo.used || 0);
      const detected = await extractChapterRangesFromToc(file, {
        maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
      });
      const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
      if (chapters.length < 2) {
        throw new Error(
          detected?.error ||
            "목차에서 챕터 범위를 찾지 못했습니다. 수동 입력(예: 1:1-12)으로 설정해주세요."
        );
      }

      const chapterInput = chapters
        .map((chapter, index) => {
          const start = Number.parseInt(chapter?.pageStart, 10);
          const end = Number.parseInt(chapter?.pageEnd, 10);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return "";
          return `${index + 1}:${start}-${end}`;
        })
        .filter(Boolean)
        .join("\n");

      if (!chapterInput) {
        throw new Error("목차 추출 결과가 비어 있습니다.");
      }

      const limit = totalPages || Number(detected?.totalPages) || 0;
      const parsed = parseChapterRangeSelectionInput(chapterInput, limit);
      if (parsed.error) throw new Error(parsed.error);

      setChapterRangeInput(chapterInput);
      setChapterRangeError("");
      const sourceLabel =
        detected?.source === "outline" ? "PDF 개요(북마크)" : "앞쪽 목차 페이지";
      setStatus(`${sourceLabel}에서 챕터 범위 ${parsed.chapters.length}개를 자동 설정했습니다.`);
      setIsChapterRangeOpen(true);
    } catch (err) {
      setChapterRangeError(err?.message || "목차 자동 추출에 실패했습니다.");
      setStatus("");
    } finally {
      setIsDetectingChapterRanges(false);
    }
  }, [
    file,
    isDetectingChapterRanges,
    isLoadingSummary,
    isLoadingText,
    pageInfo.total,
    pageInfo.used,
  ]);

  const handleConfirmChapterRanges = useCallback(() => {
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setChapterRangeError("챕터 범위 설정은 PDF에서만 지원됩니다.");
      return;
    }
    const raw = String(chapterRangeInput || autoChapterRangeInput || "").trim();
    if (!raw) {
      setChapterRangeError("먼저 챕터 범위를 입력해주세요.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    const parsed = parseChapterRangeSelectionInput(raw, totalPages);
    if (parsed.error) {
      setChapterRangeError(parsed.error);
      return;
    }
    const targetDocId = selectedFileId || file?.name || "";
    if (!targetDocId) {
      setChapterRangeError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!String(chapterRangeInput || "").trim()) {
      setChapterRangeInput(raw);
    }
    persistChapterRangeInput(targetDocId, raw);
    setChapterRangeError("");
    setStatus(`챕터 범위를 저장했습니다. (${parsed.chapters.length} sections)`);
    setIsChapterRangeOpen(false);
  }, [
    autoChapterRangeInput,
    chapterRangeInput,
    file,
    pageInfo.total,
    pageInfo.used,
    persistChapterRangeInput,
    selectedFileId,
  ]);

  const handleSummaryByPages = useCallback(async () => {
    if (isPageSummaryLoading || isLoadingSummary) return;
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setPageSummaryError("페이지 범위 요약은 PDF에서만 지원됩니다.");
      return;
    }
    if (!file || !selectedFileId) {
      setPageSummaryError("PDF를 먼저 열어주세요.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    if (!totalPages) {
      setPageSummaryError("총 페이지 수를 확인할 수 없습니다. PDF를 다시 열어주세요.");
      return;
    }
    const parsed = parsePageSelectionInput(pageSummaryInput, totalPages);
    if (parsed.error) {
      setPageSummaryError(parsed.error);
      return;
    }

    const selectionLabel = String(pageSummaryInput || "").replace(/\s+/g, "");
    setIsPageSummaryOpen(false);
    setPageSummaryError("");
    setError("");
    setStatus("부분 요약을 생성하고 있습니다...");
    setIsPageSummaryLoading(true);
    try {
      const extracted = await extractPdfTextFromPages(file, parsed.pages, 18000, {
        useOcr: true,
        ocrLang: "kor+eng",
        onOcrProgress: (message) => setStatus(message),
      });
      if (!extracted?.text) {
        const suffix = extracted?.ocrUsed
          ? " OCR까지 시도했지만 추출할 수 있는 텍스트가 없습니다."
          : "";
        throw new Error(`선택한 페이지에서 텍스트를 추출하지 못했습니다.${suffix}`);
      }
      if (extracted?.ocrUsed) {
        setStatus("OCR이 완료되었습니다. 부분 요약을 생성하고 있습니다...");
      }
      setStatus("선택 범위 부분 요약 생성 중...");
      const { generateSummary } = await getOpenAiService();
      const summarized = await generateSummary(extracted.text, {
        scope: "선택 범위에서 추출한 텍스트",
        chapterized: false,
        instructorEmphasis: getEffectiveInstructorEmphasisText(),
        outputLanguage,
      });
      setPartialSummary(summarized);
      setPartialSummaryRange(selectionLabel);
      const nowIso = new Date().toISOString();
      const currentSaved = Array.isArray(savedPartialSummaries) ? savedPartialSummaries : [];
      const duplicate = currentSaved.find(
        (item) =>
          String(item.summary || "").trim() === String(summarized || "").trim() &&
          String(item.range || "").trim() === selectionLabel
      );
      const nextSavedPartialSummaries = duplicate
        ? normalizeSavedPartialSummaryEntries(
            currentSaved.map((item) =>
              item.id === duplicate.id
                ? {
                    ...item,
                    updatedAt: nowIso,
                  }
                : item
            )
          )
        : normalizeSavedPartialSummaryEntries([
            {
              id: createPremiumProfileId(),
              name: formatPartialSummaryDefaultName(nowIso),
              summary: summarized,
              range: selectionLabel,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ...currentSaved,
          ]);
      setSavedPartialSummaries(nextSavedPartialSummaries);
      persistPartialSummaryBundle({
        summary: summarized,
        range: selectionLabel,
        library: nextSavedPartialSummaries,
      });
      setStatus("부분 요약이 생성되고 저장되었습니다.");
    } catch (err) {
      setPageSummaryError(`부분 요약 생성에 실패했습니다: ${err.message}`);
      setError(`부분 요약 생성에 실패했습니다: ${err.message}`);
      setStatus("");
    } finally {
      setIsPageSummaryLoading(false);
    }
  }, [
    file,
    getOpenAiService,
    isLoadingSummary,
    isPageSummaryLoading,
    pageInfo.total,
    pageInfo.used,
    pageSummaryInput,
    getEffectiveInstructorEmphasisText,
    outputLanguage,
    persistPartialSummaryBundle,
    savedPartialSummaries,
    selectedFileId,
  ]);

  const handleSaveCurrentPartialSummary = useCallback(() => {
    const docId = selectedFileId;
    const summaryText = String(partialSummary || "").trim();
    if (!docId) {
      setError("癒쇱? PDF瑜??댁뼱二쇱꽭??");
      return;
    }
    if (!summaryText) {
      setError("??ν븷 遺遺꾩슂?쎌씠 ?놁뒿?덈떎.");
      return;
    }

    const nowIso = new Date().toISOString();
    const newItem = {
      id: createPremiumProfileId(),
      name: formatPartialSummaryDefaultName(nowIso),
      summary: summaryText,
      range: String(partialSummaryRange || "").trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const next = normalizeSavedPartialSummaryEntries([
      newItem,
      ...(Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []),
    ]);
    setSavedPartialSummaries(next);
    persistPartialSummaryBundle({
      summary: summaryText,
      range: String(partialSummaryRange || "").trim(),
      library: next,
    });
    setStatus("遺遺꾩슂?쎌씠 ??λ릺?덉뒿?덈떎.");
  }, [
    partialSummary,
    partialSummaryRange,
    persistPartialSummaryBundle,
    savedPartialSummaries,
    selectedFileId,
  ]);

  const handleLoadSavedPartialSummary = useCallback(
    (itemId) => {
      const found = (savedPartialSummaries || []).find((item) => item.id === itemId);
      if (!found) {
        setError("??λ맂 遺遺꾩슂?쎌쓣 李얠쓣 ???놁뒿?덈떎.");
        return;
      }
      setPartialSummary(String(found.summary || "").trim());
      setPartialSummaryRange(String(found.range || "").trim());
      persistPartialSummaryBundle({
        summary: String(found.summary || "").trim(),
        range: String(found.range || "").trim(),
        library: savedPartialSummaries,
      });
      setIsSavedPartialSummaryOpen(false);
      setStatus(`??λ맂 遺遺꾩슂?쎌쓣 遺덈윭?붿뒿?덈떎. (${found.name})`);
    },
    [persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleRenameSavedPartialSummary = useCallback(
    (itemId, nextName) => {
      const nowIso = new Date().toISOString();
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: String(nextName || ""),
              updatedAt: nowIso,
            }
          : item
      );
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleNormalizeSavedPartialSummaryName = useCallback(
    (itemId) => {
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).map((item) => {
        if (item.id !== itemId) return item;
        const fallback = formatPartialSummaryDefaultName(item.createdAt || new Date().toISOString());
        const normalizedName = String(item.name || "").trim() || fallback;
        return {
          ...item,
          name: normalizedName,
        };
      });
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleDeleteSavedPartialSummary = useCallback(
    (itemId) => {
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).filter(
        (item) => item.id !== itemId
      );
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
      setStatus("??λ맂 遺遺꾩슂?쎌쓣 ??젣?덉뒿?덈떎.");
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleExportSummaryPdf = useCallback(async () => {
    if (isExportingSummary) return;
    if (!summary) {
      setError("?대낫???붿빟???놁뒿?덈떎. 癒쇱? ?붿빟???앹꽦?댁＜?몄슂.");
      return;
    }
    if (!summaryRef.current) {
      setError("?붿빟 ?곸뿭??李얠쓣 ???놁뼱 PDF濡??대낫?????놁뒿?덈떎.");
      return;
    }
    setIsExportingSummary(true);
    setError("");
    const baseName = (file?.name || "summary").replace(/\.[^/.]+$/, "");
    try {
      const target = summaryRef.current;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      await exportPagedElementToPdf(target, {
        filename: `${baseName}-summary.pdf`,
        margin: 0,
        pageSelector: ".summary-export-page",
        background: "#ffffff",
      });
      setStatus("요약 PDF 내보내기가 완료되었습니다.");
    } catch (err) {
      setError(`요약 PDF 내보내기에 실패했습니다: ${err.message}`);
      setStatus("");
    } finally {
      setIsExportingSummary(false);
    }
  }, [summary, file, isExportingSummary]);

  const handleOxSelect = useCallback(
    (qIdx, choice) => {
      const currentSelection = oxSelections?.[qIdx];
      if (currentSelection === "o" || currentSelection === "x") return;

      setOxSelections((prev) => ({
        ...prev,
        [qIdx]: choice,
      }));

      const item = Array.isArray(oxItems) ? oxItems[qIdx] : null;
      if (!item || (choice !== "o" && choice !== "x")) return;

      const expected = item.answer === true ? "o" : "x";
      const userAnswerText = choice === "o" ? "O" : "X";
      const prompt = String(item?.statement || item?.prompt || item?.question || "").trim();
      if (choice === expected) {
        markReviewNoteCorrectByPrompt("ox", prompt, userAnswerText, choice === "o");
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "ox",
          sourceLabel: "O/X",
          prompt,
          explanation: item?.explanation,
          evidencePages: item?.evidencePages,
          evidenceSnippet: item?.evidenceSnippet || item?.evidence,
          evidenceLabel: item?.evidenceLabel || "",
        }),
        correctAnswerText: item.answer ? "O" : "X",
        correctAnswerValue: Boolean(item.answer),
        userAnswerText,
        userAnswerValue: choice === "o",
      });
    },
    [
      createBaseReviewNote,
      markReviewNoteCorrectByPrompt,
      oxItems,
      oxSelections,
      upsertWrongReviewNote,
    ]
  );

  const requestOxQuiz = async ({ auto = false, force = false } = {}) => {
    if (isLoadingOx && !force) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!force && hasReached("maxOx")) {
      setError("현재 요금제의 O/X 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || quizChapterSelectionInput || "").trim();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    if (!extractedText && !chapterSelectionRaw && !isPdfSource) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    if (auto) oxAutoRequestedRef.current = true;
    setIsLoadingOx(true);
    setError("");
    setStatus("O/X 문제 생성 중...");
    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "O/X",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      const oxSourceText = String(scopedSource?.text || "").trim();
      const scopeLabel = String(scopedSource?.scopeLabel || "").trim();
      if (!oxSourceText) {
        throw new Error("문서에서 O/X 문제에 사용할 본문 텍스트를 찾지 못했습니다.");
      }
      if (scopeLabel) {
        setStatus(`O/X 문제 생성 중... (${scopeLabel})`);
      }

      const historicalOxTexts = collectQuestionTextsFromOxItems(oxItems);
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidStatementTexts = dedupeQuestionTexts([...historicalOxTexts, ...historicalMockTexts]).slice(0, 80);
      const seenQuestionKeys = createQuestionKeySet(avoidStatementTexts);

      const { generateOxQuiz } = await getOpenAiService();
      const ox = await generateOxQuiz(oxSourceText, {
        avoidStatements: avoidStatementTexts,
        scopeLabel,
        outputLanguage,
      });
      const rawItems = Array.isArray(ox?.items) ? ox.items : [];
      const qualityRawItems = rawItems.filter(
        (item) => !isLowValueStudyPrompt(getOxPromptText(item))
      );
      const items = [];
      pushUniqueByQuestionKey(items, qualityRawItems, getOxPromptText, seenQuestionKeys, 10);

      if (ox?.debug || items.length === 0) {
        setOxItems([]);
        setStatus("");
        setError("유효한 O/X 문제가 생성되지 않았습니다.");
        if (ox?.fallback && import.meta.env.DEV) {
          // Keep fallback payload visible in dev tools for debugging.
          // eslint-disable-next-line no-console
          console.debug("O/X fallback", ox.fallback);
        }
        return;
      }

      setOxItems(items);
      setOxSelections({});
      setOxExplanationOpen({});
      setStatus(scopeLabel ? `O/X 문제가 생성되었습니다. (${scopeLabel})` : "O/X 문제가 생성되었습니다.");
      setUsageCounts((prev) => ({ ...prev, ox: prev.ox + 1 }));
      persistArtifacts({ ox });
    } catch (err) {
      setError(`O/X 문제 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingOx(false);
    }
  };

  const regenerateOxQuiz = async () => {
    if (isLoadingOx) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (hasReached("maxOx")) {
      setError("현재 요금제의 O/X 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || quizChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    oxAutoRequestedRef.current = true;
    setOxItems(null);
      setOxSelections({});
    setStatus("O/X를 초기화하고 다시 생성하는 중...");
    setError("");
    await persistArtifacts({ ox: null });
    await requestOxQuiz({ auto: false, force: true });
  };

  const handleAddFlashcard = useCallback(
    async (front, back, hint) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          const deckId = selectedFileId || "default";
          const localCard = {
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front,
            back,
            hint: hint || "",
            created_at: new Date().toISOString(),
          };
          setFlashcardError("");
          setFlashcards((prev) => [localCard, ...prev]);
          setFlashcardStatus("Flashcard added (local mode).");
          return;
        }
        setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const deckId = selectedFileId || "default";
      setFlashcardError("");
      setFlashcardStatus("?뚮옒?쒖뭅?????以?..");
      try {
        const saved = await addFlashcard({
          userId: user.id,
          deckId,
          front,
          back,
          hint,
        });
        setFlashcards((prev) => [saved, ...prev]);
        setFlashcardStatus("?뚮옒?쒖뭅?쒓? ??λ릺?덉뒿?덈떎.");
      } catch (err) {
        setFlashcardError(`?뚮옒?쒖뭅????μ뿉 ?ㅽ뙣?덉뒿?덈떎: ${err.message}`);
        setFlashcardStatus("");
      }
    },
    [user, selectedFileId]
  );

  const handleDeleteFlashcard = useCallback(
    async (cardId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setFlashcardError("");
          setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
          setFlashcardStatus("Flashcard removed (local mode).");
          return;
        }
        setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      setFlashcardError("");
      try {
        await deleteFlashcard({ userId: user.id, cardId });
        setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        setFlashcardStatus("?뚮옒?쒖뭅?쒕? ??젣?덉뒿?덈떎.");
      } catch (err) {
        setFlashcardError(`?뚮옒?쒖뭅????젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [user]
  );

  const handleGenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    if (AUTH_ENABLED && !user) {
      setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
      return;
    }
    if (!file || !selectedFileId) {
      setFlashcardError("癒쇱? PDF瑜??댁뼱二쇱꽭??");
      return;
    }
    if (isLoadingText) {
      setFlashcardError("PDF ?띿뒪??異붿텧???꾩쭅 吏꾪뻾 以묒엯?덈떎. ?좎떆留?湲곕떎?ㅼ＜?몄슂.");
      return;
    }
    const chapterSelectionRaw = String(flashcardChapterSelectionInput || "").trim();
    let sourceText = (extractedText || "").trim();
    if (!sourceText && !chapterSelectionRaw) {
      setFlashcardError("?뚮옒?쒖뭅?쒕? ?앹꽦?섍린??異붿텧???띿뒪?멸? 遺議깊빀?덈떎.");
      return;
    }

    setFlashcardError("");
    setIsGeneratingFlashcards(true);
    try {
      let scopeLabel = "";
      if (chapterSelectionRaw) {
        const scoped = await extractTextForChapterSelection({
          featureLabel: "移대뱶",
          chapterSelectionInput: chapterSelectionRaw,
        });
        sourceText = String(scoped.text || "").trim();
        scopeLabel = scoped.scopeLabel;
      }
      if (sourceText.length < 80) {
        throw new Error("?뚮옒?쒖뭅?쒕? ?앹꽦?섍린??異붿텧???띿뒪?멸? 遺議깊빀?덈떎.");
      }

      setFlashcardStatus(
        scopeLabel ? `AI ?뚮옒?쒖뭅???앹꽦 以?(${scopeLabel})...` : "AI ?뚮옒?쒖뭅???앹꽦 以?.."
      );
      const { generateFlashcards } = await getOpenAiService();
      const result = await generateFlashcards(sourceText, { count: 8, outputLanguage });
      const rawCards = Array.isArray(result?.cards)
        ? result.cards
        : Array.isArray(result)
          ? result
          : [];
      const cleaned = rawCards
        .map((card) => ({
          front: String(card?.front || "").trim(),
          back: String(card?.back || "").trim(),
          hint: String(card?.hint || "").trim(),
        }))
        .filter((card) => card.front && card.back);
      if (cleaned.length === 0) {
        throw new Error("蹂몃Ц?먯꽌 ?좏슚???뚮옒?쒖뭅?쒕? ?앹꽦?섏? 紐삵뻽?듬땲??");
      }
      const deckId = selectedFileId || "default";
      const saved = user
        ? await addFlashcards({ userId: user.id, deckId, cards: cleaned })
        : cleaned.map((card) => ({
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front: card.front,
            back: card.back,
            hint: card.hint || "",
            created_at: new Date().toISOString(),
          }));
      if (!saved.length) {
        throw new Error("?앹꽦???뚮옒?쒖뭅????μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
      }
      setFlashcards((prev) => [...saved, ...prev]);
      setFlashcardStatus(
        scopeLabel ? `${saved.length}媛쒖쓽 AI ?뚮옒?쒖뭅?쒕? ?앹꽦?덉뒿?덈떎 (${scopeLabel}).` : `${saved.length}媛쒖쓽 AI ?뚮옒?쒖뭅?쒕? ?앹꽦?덉뒿?덈떎.`
      );
    } catch (err) {
      setFlashcardError(`AI ?뚮옒?쒖뭅???앹꽦???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [
    isGeneratingFlashcards,
    user,
    file,
    selectedFileId,
    isLoadingText,
    extractedText,
    flashcardChapterSelectionInput,
    extractTextForChapterSelection,
    getOpenAiService,
    outputLanguage,
  ]);

  const handleResetTutor = useCallback(() => {
    setTutorMessages([]);
    setTutorError("");
    setIsTutorLoading(false);
  }, []);

  const handleSendTutorMessage = useCallback(
    async (requestPayload) => {
      const { prompt, displayPrompt, attachmentFile } = normalizeTutorRequestPayload(requestPayload);
      const hasAttachment = Boolean(attachmentFile);
      const effectivePrompt =
        String(prompt || "").trim() ||
        (hasAttachment ? "Explain the attached screenshot clearly for a student." : "");
      const effectiveDisplayPrompt = String(displayPrompt || effectivePrompt).trim();
      if ((!effectivePrompt && !hasAttachment) || isTutorLoading) return false;

      const selectedKind = detectSupportedDocumentKind(file);
      const canUsePdfEvidence = Boolean(file && selectedFileId && isPdfDocumentKind(selectedKind));
      if (!canUsePdfEvidence && !hasAttachment) {
        setTutorError("Open a PDF or attach a screenshot before asking the tutor.");
        return false;
      }
      if (canUsePdfEvidence && isLoadingText && !hasAttachment) {
        setTutorError("PDF text extraction is still running. Attach a screenshot or wait a moment.");
        return false;
      }

      let attachmentEvidenceText = "";
      let attachmentHistoryText = "";
      let attachmentImageDataUrl = "";
      let attachmentMeta = null;

      if (hasAttachment) {
        try {
          const { buildVisionImageDataUrl, extractImageText, isTutorImageFile } = await import("./utils/imageOcr");
          if (!isTutorImageFile(attachmentFile)) {
            setTutorError("Only image files can be attached to the tutor.");
            setStatus("");
            return false;
          }

          setStatus("Preparing screenshot...");
          const [imageResult, imageDataUrl] = await Promise.all([
            extractImageText(attachmentFile, {
              ocrLang: "kor+eng",
              maxLength: 18000,
              onProgress: (message) => setStatus(String(message || "")),
            }),
            buildVisionImageDataUrl(attachmentFile),
          ]);
          attachmentImageDataUrl = String(imageDataUrl || "");
          attachmentHistoryText = String(imageResult?.text || "").slice(0, 900);
          attachmentEvidenceText = buildTutorImageEvidenceBlock({
            attachmentName: attachmentFile.name,
            attachmentType: attachmentFile.type,
            dimensions: imageResult,
            ocrText: imageResult?.text,
          });
          attachmentMeta = {
            attachmentName: attachmentFile.name,
            attachmentType: attachmentFile.type,
            attachmentText: attachmentHistoryText,
          };

          if (!attachmentEvidenceText && !canUsePdfEvidence) {
            setTutorError("No readable text was found in the screenshot.");
            setStatus("");
            return false;
          }
        } catch (err) {
          setTutorError(`Failed to read the screenshot: ${err.message}`);
          setStatus("");
          return false;
        }
      }

      let pdfEvidenceText = "";
      if (canUsePdfEvidence && !isLoadingText) {
        const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
        if (!totalPages) {
          if (!hasAttachment) {
            setTutorError("Page information is unavailable. Reopen the PDF and try again.");
            return false;
          }
        } else {
          const requestedPages = buildTutorPageCandidates(effectivePrompt, totalPages);
          const sectionHints = extractTutorSectionCandidates(effectivePrompt);
          const problemHints = extractTutorProblemTokenCandidates(effectivePrompt);
          const targetTokens = [...new Set([...sectionHints, ...problemHints])];
          const primaryToken = targetTokens[0] || "";
          const tutorDocKey = String(selectedFileId || file?.name || "").trim();
          const currentKnownPage = Math.max(1, Number(currentPage || 1));
          const anchorPage = requestedPages.length
            ? requestedPages[0]
            : Math.max(1, Math.min(totalPages, currentKnownPage));

          const buildPageRange = (start, end, cap = 120) => {
            const lo = Math.max(1, Math.min(totalPages, Number.parseInt(start, 10) || 1));
            const hi = Math.max(lo, Math.min(totalPages, Number.parseInt(end, 10) || lo));
            const pages = [];
            for (let page = lo; page <= hi; page += 1) {
              pages.push(page);
              if (pages.length >= cap) break;
            }
            return pages;
          };
          const mergePages = (...lists) =>
            Array.from(
              new Set(
                lists
                  .flat()
                  .map((page) => Number.parseInt(page, 10))
                  .filter((page) => Number.isFinite(page) && page > 0 && page <= totalPages)
              )
            ).sort((a, b) => a - b);
          const pageCacheKey = (pageNumber) => `${tutorDocKey}:${pageNumber}`;
          const loadPageEntries = async (pages, { useOcr = false, maxCharsPerPage = 5000 } = {}) => {
            const normalizedPages = mergePages(pages);
            if (!normalizedPages.length) return [];

            const missing = [];
            const entriesByPage = new Map();
            for (const pageNumber of normalizedPages) {
              const cached = tutorPageTextCacheRef.current.get(pageCacheKey(pageNumber));
              const shouldReloadForOcr =
                useOcr &&
                (!cached || !cached.ocrUsed || String(cached.text || "").trim().length < 220);
              if (!cached || !String(cached.text || "").trim() || shouldReloadForOcr) {
                missing.push(pageNumber);
                continue;
              }
              entriesByPage.set(pageNumber, {
                pageNumber,
                text: String(cached.text || "").trim(),
                ocrUsed: Boolean(cached.ocrUsed),
              });
            }

            if (missing.length) {
              const fetched = await extractPdfPageTexts(file, missing, {
                useOcr,
                ocrLang: "kor+eng",
                maxCharsPerPage,
              });
              for (const pageEntry of fetched?.pages || []) {
                const pageNumber = Number.parseInt(pageEntry?.pageNumber, 10);
                if (!Number.isFinite(pageNumber)) continue;
                const text = String(pageEntry?.text || "").trim();
                const payload = {
                  pageNumber,
                  text,
                  ocrUsed: Boolean(pageEntry?.ocrUsed),
                };
                if (text) {
                  tutorPageTextCacheRef.current.set(pageCacheKey(pageNumber), {
                    text,
                    ocrUsed: payload.ocrUsed,
                  });
                  entriesByPage.set(pageNumber, payload);
                }
              }
            }

            return mergePages(normalizedPages)
              .map((pageNumber) => entriesByPage.get(pageNumber))
              .filter((entry) => entry && entry.text);
          };

          setStatus("Searching relevant PDF pages...");
          const narrowScanPages = buildPageRange(anchorPage - 20, anchorPage + 90, 130);
          const broadScanPages = buildPageRange(anchorPage - 70, anchorPage + 220, 260);

          let scannedEntries = await loadPageEntries(narrowScanPages, {
            useOcr: false,
            maxCharsPerPage: 4200,
          });

          let detectedRange =
            primaryToken && tutorDocKey
              ? tutorSectionRangeCacheRef.current.get(`${tutorDocKey}:${primaryToken}:${anchorPage}`) || null
              : null;

          if (!detectedRange && primaryToken) {
            detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
          }

          if (!detectedRange && primaryToken) {
            const broadEntries = await loadPageEntries(broadScanPages, {
              useOcr: false,
              maxCharsPerPage: 4200,
            });
            if (broadEntries.length > scannedEntries.length) scannedEntries = broadEntries;
            detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
          }

          if (!detectedRange && primaryToken) {
            const ocrProbePages = requestedPages.length
              ? mergePages(requestedPages, buildPageRange(anchorPage - 10, anchorPage + 30, 60))
              : buildPageRange(anchorPage - 12, anchorPage + 45, 70);
            const ocrEntries = await loadPageEntries(ocrProbePages, {
              useOcr: true,
              maxCharsPerPage: 4200,
            });
            detectedRange = detectTutorSectionPageRange(ocrEntries, primaryToken);
          }

          if (detectedRange && tutorDocKey && primaryToken) {
            tutorSectionRangeCacheRef.current.set(
              `${tutorDocKey}:${primaryToken}:${anchorPage}`,
              detectedRange
            );
          }

          let finalPages = [];
          if (detectedRange?.startPage && detectedRange?.endPage) {
            finalPages = buildPageRange(detectedRange.startPage - 1, detectedRange.endPage + 1, 120);
          } else if (requestedPages.length) {
            const firstRequested = requestedPages[0];
            const lastRequested = requestedPages[requestedPages.length - 1];
            finalPages = buildPageRange(
              firstRequested - 1,
              Math.max(lastRequested + 18, firstRequested + 12),
              120
            );
          } else {
            finalPages = buildPageRange(anchorPage - 3, anchorPage + 15, 40);
          }
          finalPages = mergePages(finalPages, requestedPages);

          const finalEntries = await loadPageEntries(finalPages, {
            useOcr: true,
            maxCharsPerPage: 5200,
          });
          if (!finalEntries.length) {
            if (!attachmentEvidenceText) {
              setTutorError("No readable evidence was found on nearby PDF pages. Reopen the PDF and try again.");
              setStatus("");
              return false;
            }
          } else {
            const loadedPages = finalEntries.map((entry) => entry.pageNumber);
            const tutorEvidence = finalEntries
              .map((entry) => `[p.${entry.pageNumber}]\n${entry.text}`)
              .join("\n\n")
              .slice(0, 180000);

            pdfEvidenceText = [
              "[RAW PDF EVIDENCE]",
              `- query: ${effectivePrompt}`,
              `- requested_pages: ${requestedPages.length ? requestedPages.join(", ") : "none"}`,
              `- requested_problem_or_section: ${primaryToken || "none"}`,
              detectedRange
                ? `- detected_range: p.${detectedRange.startPage}-${detectedRange.endPage}`
                : "- detected_range: not_found",
              `- loaded_pages: ${loadedPages.join(", ")}`,
              "",
              tutorEvidence,
            ].join("\n");
          }
        }
      }

      const tutorSourceText = [attachmentEvidenceText, pdfEvidenceText].filter(Boolean).join("\n\n");
      if (!tutorSourceText) {
        setTutorError("No readable study evidence was available for the tutor.");
        setStatus("");
        return false;
      }

      setTutorError("");
      const history = tutorMessages
        .slice(-8)
        .map((msg) => ({
          role: msg?.role,
          content: buildTutorHistoryMessageContent(msg).slice(0, 1200),
        }))
        .filter((msg) => msg.role && msg.content.trim());
      const userMessage = {
        role: "user",
        content: effectiveDisplayPrompt,
        ...(attachmentMeta || {}),
      };
      setTutorMessages((prev) => [...prev, userMessage]);
      setIsTutorLoading(true);
      try {
        const { generateTutorReply } = await getOpenAiService();
        const reply = await generateTutorReply({
          question: effectivePrompt,
          extractedText: tutorSourceText,
          messages: history,
          imageAttachment: attachmentImageDataUrl
            ? {
                dataUrl: attachmentImageDataUrl,
                name: attachmentFile?.name || "",
                mimeType: attachmentFile?.type || "",
              }
            : null,
          outputLanguage,
        });
        const safeReply = resolveTutorReplyText(reply, {
          question: effectivePrompt,
          rawEvidenceText: tutorSourceText,
        });
        setTutorMessages((prev) => [...prev, { role: "assistant", content: safeReply }]);
        return true;
      } catch (err) {
        setTutorError(`AI tutor reply failed: ${err.message}`);
        return false;
      } finally {
        setIsTutorLoading(false);
        setStatus("");
      }
    },
    [
      currentPage,
      file,
      getOpenAiService,
      isLoadingText,
      isTutorLoading,
      outputLanguage,
      pageInfo?.total,
      pageInfo?.used,
      selectedFileId,
      tutorMessages,
    ]
  );

  const handleCreateMockExam = useCallback(async () => {
    if (isGeneratingMockExam) return;
    if (AUTH_ENABLED && !user) {
      setMockExamError("먼저 로그인해 주세요.");
      return;
    }
    if (!file || !selectedFileId) {
      setMockExamError("먼저 PDF를 열어 주세요.");
      return;
    }
    if (isLoadingText) {
      setMockExamError("PDF 텍스트 추출이 아직 진행 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    const chapterSelectionRaw = String(mockExamChapterSelectionInput || "").trim();
    const hasChapterScope = Boolean(chapterSelectionRaw);
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    let sourceText = "";
    let scopeLabel = "";
    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "모의고사",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      sourceText = String(scopedSource?.text || "").trim();
      scopeLabel = String(scopedSource?.scopeLabel || "").trim();
    } catch (err) {
      setMockExamError(String(err?.message || "모의고사 텍스트 추출에 실패했습니다."));
      return;
    }
    if (!sourceText) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }
    if (sourceText.length < 80) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }

    setMockExamStatus("모의고사 생성 중...");
    setMockExamError("");
    setIsGeneratingMockExam(true);

    try {
      const ai = await getOpenAiService();
      let oxPool = (Array.isArray(oxItems) ? oxItems : []).filter(
        (item) => !isLowValueStudyPrompt(getOxPromptText(item))
      );
      let quizPool = [];
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidMockQuestionTexts = dedupeQuestionTexts(historicalMockTexts).slice(0, 120);
      const usedMockQuestionKeys = createQuestionKeySet(avoidMockQuestionTexts);

      const shouldGeneratePoolsFromSource = hasChapterScope || isPdfSource;
      if (shouldGeneratePoolsFromSource) {
        if (scopeLabel) {
          setMockExamStatus(`모의고사 생성 중 (${scopeLabel})...`);
        }
        const instructorEmphasisText = getEffectiveInstructorEmphasisText();

        const [oxResult, quizResult] = await Promise.all([
          ai.generateOxQuiz(sourceText, {
            instructorEmphasis: instructorEmphasisText,
            avoidStatements: avoidMockQuestionTexts,
            outputLanguage,
          }),
          ai.generateQuiz(sourceText, {
            multipleChoiceCount: 4,
            shortAnswerCount: 1,
            instructorEmphasis: instructorEmphasisText,
            avoidQuestions: avoidMockQuestionTexts,
            outputLanguage,
          }),
        ]);

        oxPool = (Array.isArray(oxResult?.items) ? oxResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(getOxPromptText(item))
        );
        const normalizedQuiz = normalizeQuizPayload(quizResult);
        const scopedMultipleChoice = Array.isArray(normalizedQuiz?.multipleChoice)
          ? normalizedQuiz.multipleChoice
          : [];
        const scopedShortAnswers = Array.isArray(normalizedQuiz?.shortAnswer) ? normalizedQuiz.shortAnswer : [];

        scopedMultipleChoice.forEach((question) => {
          const prompt = String(question?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const choices = Array.isArray(question?.choices) ? question.choices : [];
          const explanation = String(question?.explanation || "").trim();
          quizPool.push({
            type: "quiz-mc",
            prompt,
            choices,
            answerIndex: resolveAnswerIndex({
              answerIndex: question?.answerIndex,
              explanation,
              choices,
            }),
            explanation,
          });
        });
        scopedShortAnswers.forEach((item) => {
          const prompt = String(item?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const explanation = String(item?.explanation || "").trim();
          quizPool.push({
            type: "quiz-short",
            prompt,
            answer: resolveShortAnswerText(item?.answer, explanation),
            explanation,
          });
        });
      } else {
        quizSets.forEach((set) => {
          const multipleChoice = set.questions?.multipleChoice || [];
          const shortAnswers = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
          multipleChoice.forEach((question) => {
            const prompt = String(question?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const choices = Array.isArray(question?.choices) ? question.choices : [];
            const explanation = String(question?.explanation || "").trim();
            quizPool.push({
              type: "quiz-mc",
              prompt,
              choices,
              answerIndex: resolveAnswerIndex({
                answerIndex: question?.answerIndex,
                explanation,
                choices,
              }),
              explanation,
            });
          });
          shortAnswers.forEach((item) => {
            const prompt = String(item?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const explanation = String(item?.explanation || "").trim();
            quizPool.push({
              type: "quiz-short",
              prompt,
              answer: resolveShortAnswerText(item?.answer, explanation),
              explanation,
            });
          });
        });
      }

      if (oxPool.length < 3) {
        throw new Error("모의고사를 만들려면 O/X 문항이 최소 3개 필요합니다.");
      }
      if (quizPool.length < 4) {
        throw new Error("모의고사를 만들려면 퀴즈 문항이 최소 4개 필요합니다.");
      }

      const pickedOx = pickRandomUniqueByQuestionKey(oxPool, 3, getOxPromptText, usedMockQuestionKeys);
      const pickedQuiz = pickRandomUniqueByQuestionKey(quizPool, 4, getMockExamPromptText, usedMockQuestionKeys);

      if (pickedOx.length < 3) {
        throw new Error("이미 출제된 문항을 제외하느라 O/X 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }
      if (pickedQuiz.length < 4) {
        throw new Error("이미 출제된 문항을 제외하느라 퀴즈 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }

      const mergedAvoidForMock = mergeQuestionHistory(
        avoidMockQuestionTexts,
        [...pickedOx.map((item) => getOxPromptText(item)), ...pickedQuiz.map((item) => getMockExamPromptText(item))],
        160
      );
      avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidForMock);

      const hardCount = Math.max(3, 10 - (pickedOx.length + pickedQuiz.length));
      const hardItems = [];
      const maxHardAttempts = 3;
      for (let attempt = 0; attempt < maxHardAttempts; attempt += 1) {
        if (hardItems.length >= hardCount) break;
        const requestCount = Math.min(10, hardCount + attempt * 2 + 1);
        const hardResult = await ai.generateHardQuiz(sourceText, {
          count: requestCount,
          avoidQuestions: avoidMockQuestionTexts,
          scopeLabel,
          questionStyleProfile: questionStyleProfileContent,
          outputLanguage,
        });
        const rawHardItems = (Array.isArray(hardResult?.items) ? hardResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(String(item?.question || "").trim())
        );
        pushUniqueByQuestionKey(
          hardItems,
          rawHardItems,
          (item) => String(item?.question || "").trim(),
          usedMockQuestionKeys,
          hardCount
        );
        const mergedAvoidWithHard = mergeQuestionHistory(
          avoidMockQuestionTexts,
          hardItems.map((item) => String(item?.question || "").trim()),
          200
        );
        avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidWithHard);
      }

      if (hardItems.length < hardCount) {
        throw new Error("고난도 문항을 충분히 생성하지 못했습니다.");
      }

      const mappedOx = pickedOx.map((item) => ({
        type: "ox",
        prompt: String(item?.statement || "").trim(),
        answer: item?.answer === true ? "O" : "X",
        explanation: String(item?.explanation || "").trim(),
        evidence: String(item?.evidence || "").trim(),
      }));

      const mappedQuiz = pickedQuiz.map((item) => ({ ...item }));

      const mappedHard = hardItems.map((item) => ({
        type: "hard",
        prompt: String(item?.question || "").trim(),
        choices: Array.isArray(item?.choices) ? item.choices : [],
        answerIndex: resolveAnswerIndex({
          answerIndex: item?.answerIndex,
          explanation: String(item?.explanation || "").trim(),
          choices: Array.isArray(item?.choices) ? item.choices : [],
        }),
        explanation: String(item?.explanation || "").trim(),
      }));

      const examItems = [...mappedOx, ...mappedQuiz, ...mappedHard].map((item, idx) => ({
        ...item,
        order: idx + 1,
      }));

      if (examItems.length !== 10) {
        throw new Error("모의고사는 정확히 10문항이어야 합니다.");
      }

      const answerSheet = buildMockExamAnswerSheet(examItems);

      const now = new Date();
      const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      const nextIndex = mockExams.length + 1;
      const title = `${dateStamp} 모의고사 ${nextIndex}`;
      const payload = {
        title,
        items: examItems,
        answerSheet,
        source: {
          oxCount: mappedOx.length,
          quizCount: mappedQuiz.length,
          hardCount: mappedHard.length,
        },
        generatedAt: new Date().toISOString(),
      };

      const saved = user
        ? await saveMockExam({
            userId: user.id,
            docId: selectedFileId,
            docName: file?.name || "",
            title,
            totalQuestions: examItems.length,
            payload,
          })
        : {
            id: createLocalEntityId("mock-exam"),
            doc_id: selectedFileId,
            doc_name: file?.name || "",
            title,
            total_questions: examItems.length,
            payload,
            created_at: new Date().toISOString(),
          };

      setMockExams((prev) => [saved, ...prev]);
      setActiveMockExamId(saved.id);
      setShowMockExamAnswers(true);
      setMockExamStatus(
        scopeLabel
          ? `모의고사와 답지가 저장되었습니다 (${scopeLabel}).`
          : "모의고사와 답지가 저장되었습니다."
      );
    } catch (err) {
      setMockExamError(`모의고사 생성에 실패했습니다: ${err.message}`);
      setMockExamStatus("");
    } finally {
      setIsGeneratingMockExam(false);
    }
  }, [
    extractedText,
    file,
    isGeneratingMockExam,
    isLoadingText,
    oxItems,
    mockExams,
    quizSets,
    mockExamChapterSelectionInput,
    selectedFileId,
    getOpenAiService,
    getEffectiveInstructorEmphasisText,
    outputLanguage,
    resolveQuestionSourceText,
    user,
  ]);

  const handleGenerateExamCram = useCallback(
    async ({ chapterSelectionInput = "" } = {}) => {
      if (isGeneratingExamCram) return;
      if (!selectedFileId) {
        setExamCramError("먼저 문서를 선택해 주세요.");
        setExamCramStatus("");
        return;
      }

      const scoped = selectReviewNotesBySection(reviewNotesWithSections, chapterSelectionInput);
      if (scoped.error) {
        setExamCramError(scoped.error);
        setExamCramStatus("");
        return;
      }

      const summaryText = String(summary || partialSummary || "").trim();
      const quizReferenceItems = examCramQuizItems.slice(0, 12);
      const oxReferenceItems = (Array.isArray(oxItems) ? oxItems : []).slice(0, 10);
      const reviewNoteReferences = sortReviewNotesByRecentWrong(
        scoped.items.filter((item) => item && !item.resolved)
      ).slice(0, 10);
      const hasSources =
        Boolean(summaryText) ||
        quizReferenceItems.length > 0 ||
        oxReferenceItems.length > 0 ||
        reviewNoteReferences.length > 0;

      if (!hasSources) {
        setExamCramError("먼저 요약, 퀴즈, O/X, 오답노트 중 하나를 준비해주세요.");
        setExamCramStatus("");
        return;
      }

      const scopeLabel = scoped.selectedSectionNumbers.length
        ? `섹션 ${scoped.selectedSectionNumbers.join(", ")} 기준`
        : "";

      setIsGeneratingExamCram(true);
      setExamCramError("");
      setExamCramStatus(scopeLabel ? `시험 직전 AI 정리 생성 중... (${scopeLabel})` : "시험 직전 AI 정리 생성 중...");

      try {
        const ai = await getOpenAiService();
        const generated = await ai.generateExamCramSheet({
          summaryText,
          oxItems: oxReferenceItems,
          quizItems: quizReferenceItems,
          reviewNotes: reviewNoteReferences,
          scopeLabel,
          outputLanguage,
        });
        const trimmed = String(generated || "").trim();
        if (!trimmed) {
          throw new Error("AI가 비어 있는 정리를 반환했습니다.");
        }

        const nextUpdatedAt = new Date().toISOString();
        setExamCramContent(trimmed);
        setExamCramUpdatedAt(nextUpdatedAt);
        setExamCramScopeLabel(scopeLabel);
        setExamCramStatus(scopeLabel ? `시험 직전 AI 정리가 준비되었습니다. (${scopeLabel})` : "시험 직전 AI 정리가 준비되었습니다.");
        persistExamCramBundle({
          content: trimmed,
          scopeLabel,
          updatedAt: nextUpdatedAt,
        });
      } catch (err) {
        setExamCramError(`시험 직전 AI 정리 생성에 실패했습니다: ${err.message}`);
        setExamCramStatus("");
      } finally {
        setIsGeneratingExamCram(false);
      }
    },
    [
      examCramQuizItems,
      getOpenAiService,
      isGeneratingExamCram,
      oxItems,
      partialSummary,
      persistExamCramBundle,
      reviewNotesWithSections,
      selectReviewNotesBySection,
      selectedFileId,
      summary,
      outputLanguage,
    ]
  );

  const handleCreateReviewNotesMockExam = useCallback(
    async ({
      chapterSelectionInput = "",
      titlePrefix = "오답노트",
      sourceKind = "review_notes",
      statusLabel = "오답노트",
    } = {}) => {
      if (isGeneratingMockExam) return;

      const notes = Array.isArray(reviewNotesWithSections) ? reviewNotesWithSections : [];
      const scoped = selectReviewNotesBySection(notes, chapterSelectionInput);
      if (scoped.error) {
        setMockExamError(scoped.error);
        setMockExamStatus("");
        return;
      }

      const pendingNotes = sortReviewNotesByRecentWrong(
        scoped.items.filter((item) => item && !item.resolved)
      );

      if (!pendingNotes.length) {
        setMockExamError(
          scoped.selectedSectionNumbers.length > 0
            ? "선택한 섹션에 복습할 최근 오답이 없습니다."
            : "오답노트에 복습할 최근 오답이 없습니다."
        );
        setMockExamStatus("");
        return;
      }

      if (AUTH_ENABLED && !user) {
        setMockExamError("먼저 로그인해 주세요.");
        setMockExamStatus("");
        return;
      }
      if (!selectedFileId) {
        setMockExamError("먼저 문서를 선택해 주세요.");
        setMockExamStatus("");
        return;
      }

      setIsGeneratingMockExam(true);
      setMockExamError("");
      setMockExamStatus(`${statusLabel} 모의고사 생성 중...`);

      try {
        const examItems = pendingNotes.slice(0, REVIEW_NOTE_MOCK_EXAM_LIMIT).map((note, index) => {
          const base = {
            order: index + 1,
            prompt: String(note?.prompt || "").trim(),
            explanation: String(note?.explanation || "").trim(),
            evidencePages: Array.isArray(note?.evidencePages) ? note.evidencePages : [],
            evidenceSnippet: String(note?.evidenceSnippet || "").trim(),
            evidenceLabel: String(note?.evidenceLabel || "").trim(),
            evidence: String(note?.evidenceLabel || note?.evidenceSnippet || "").trim(),
          };

          if (note?.sourceType === "ox") {
            return {
              ...base,
              type: "ox",
              answer: note?.correctAnswerValue === true ? "O" : "X",
            };
          }

          if (note?.sourceType === "quiz_short_answer") {
            return {
              ...base,
              type: "quiz-short",
              answer: String(note?.correctAnswerText || "").trim(),
            };
          }

          return {
            ...base,
            type: "quiz",
            choices: Array.isArray(note?.choices) ? note.choices : [],
            answerIndex: Number.isFinite(note?.answerIndex) ? note.answerIndex : null,
          };
        });

        const answerSheet = buildMockExamAnswerSheet(examItems);
        const now = new Date();
        const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
        const nextIndex = mockExams.length + 1;
        const title = `${dateStamp} ${titlePrefix} 모의고사 ${nextIndex}`;
        const payload = {
          title,
          items: examItems,
          answerSheet,
          source: {
            kind: sourceKind,
            totalReviewNotes: pendingNotes.length,
            sectionNumbers: scoped.selectedSectionNumbers,
            recentOnly: true,
          },
          generatedAt: now.toISOString(),
        };

        const saved = user
          ? await saveMockExam({
              userId: user.id,
              docId: selectedFileId,
              docName: file?.name || "",
              title,
              totalQuestions: examItems.length,
              payload,
            })
          : {
              id: createLocalEntityId("mock-exam"),
              doc_id: selectedFileId,
              doc_name: file?.name || "",
              title,
              total_questions: examItems.length,
              payload,
              created_at: now.toISOString(),
            };

        setMockExams((prev) => [saved, ...prev]);
        setActiveMockExamId(saved.id);
        setShowMockExamAnswers(false);
        setPanelTab("mockExam");
        setMockExamStatus(`${examItems.length}문항 ${statusLabel} 모의고사를 만들었습니다.`);
      } catch (err) {
        setMockExamError(`${statusLabel} 모의고사 생성에 실패했습니다: ${err.message}`);
        setMockExamStatus("");
      } finally {
        setIsGeneratingMockExam(false);
      }
    },
    [
      file?.name,
      isGeneratingMockExam,
      mockExams.length,
      reviewNotesWithSections,
      selectReviewNotesBySection,
      selectedFileId,
      user,
    ]
  );

  const handleDeleteMockExam = useCallback(
    async (examId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setMockExams((prev) => prev.filter((item) => item.id !== examId));
          if (activeMockExamId === examId) {
            setActiveMockExamId(null);
          }
          setMockExamStatus("모의고사를 삭제했습니다. (로컬 모드)");
          return;
        }
        setMockExamError("먼저 로그인해 주세요.");
        return;
      }
      try {
        await deleteMockExam({ userId: user.id, examId });
        setMockExams((prev) => prev.filter((item) => item.id !== examId));
        if (activeMockExamId === examId) {
          setActiveMockExamId(null);
        }
        setMockExamStatus("모의고사를 삭제했습니다.");
      } catch (err) {
        setMockExamError(`모의고사 삭제에 실패했습니다: ${err.message}`);
      }
    },
    [activeMockExamId, user]
  );

  const handleExportMockExam = useCallback(
    async (exam) => {
      if (!exam) {
        setMockExamError("내보낼 모의고사가 선택되지 않았습니다.");
        return;
      }
      if (!mockExamPrintRef.current) {
        setMockExamError("모의고사 출력 영역을 찾을 수 없습니다.");
        return;
      }
      setMockExamError("");
      try {
        const examIndex = mockExams.findIndex((item) => item.id === exam.id);
        const displayTitle = formatMockExamTitle(exam, examIndex >= 0 ? examIndex : 0);
        const safeTitle = (displayTitle || "mock-exam").replace(/[^\w-]+/g, "-");
        const answerSheet = buildMockExamAnswerSheet(
          Array.isArray(exam?.payload?.items) ? exam.payload.items : [],
          exam?.payload?.answerSheet
        );

        await exportPagedElementToPdf(mockExamPrintRef.current, {
          filename: `${safeTitle}.pdf`,
          margin: 0,
          pageSelector: ".mock-exam-page",
        });
        await exportMockAnswerSheetToPdf({
          title: `${displayTitle} 답지`,
          entries: answerSheet,
          filename: `${safeTitle}-answers.pdf`,
        });
        setMockExamStatus("모의고사 문제지와 답지 PDF를 함께 저장했습니다.");
      } catch (err) {
        setMockExamError(`PDF 내보내기에 실패했습니다: ${err.message}`);
      }
    },
    [mockExamPrintRef, mockExams]
  );

  const handleSubmitFeedback = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSubmittingFeedback) return;
      const trimmedFeedback = String(feedbackInput || "").trim();
      if (!trimmedFeedback) {
        setFeedbackError("\uD53C\uB4DC\uBC31 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      if (!user?.id) {
        setFeedbackError("\uB85C\uADF8\uC778 \uD6C4 \uD53C\uB4DC\uBC31\uC744 \uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        return;
      }

      setIsSubmittingFeedback(true);
      setFeedbackError("");
      try {
        const feedbackUserName =
          String(
            user?.user_metadata?.name ||
              user?.user_metadata?.full_name ||
              user?.user_metadata?.nickname ||
              user?.email ||
              ""
          ).trim() || "";
        const feedbackPayload = {
          userId: user.id,
          userEmail: user?.email || "",
          userName: feedbackUserName,
          category: feedbackCategory,
          content: trimmedFeedback,
          docId: selectedFileId || null,
          docName: file?.name || "",
          panel: panelTab || "",
          metadata: {
            currentPage,
            totalPages: pageInfo?.total || pageInfo?.used || null,
            tier,
            platform: Capacitor.getPlatform(),
          },
        };
        let savedFeedback = null;
        let saveError = null;
        let notifyError = null;

        try {
          savedFeedback = await saveUserFeedback({
            ...feedbackPayload,
          });
        } catch (error) {
          saveError = error;
          console.warn("Feedback DB save failed.", error);
        }

        try {
          await notifyFeedbackEmail({
            ...feedbackPayload,
            feedbackId: savedFeedback?.id || null,
          });
        } catch (error) {
          notifyError = error;
          console.warn("Feedback email notification failed.", error);
        }

        const saveSucceeded = Boolean(savedFeedback);
        const notifySucceeded = !notifyError;

        if (!saveSucceeded && !notifySucceeded) {
          if (isMissingFeedbackTableError(saveError)) {
            throw new Error(
              `피드백 저장 테이블이 준비되지 않았고 메일 발송도 실패했습니다. ${notifyError?.message || ""}`.trim()
            );
          }
          throw new Error(saveError?.message || notifyError?.message || "알 수 없는 오류가 발생했습니다.");
        }

        setIsFeedbackDialogOpen(false);
        setFeedbackCategory("general");
        setFeedbackInput("");
        if (saveSucceeded && notifySucceeded) {
          setStatus("\uD53C\uB4DC\uBC31\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAC10\uC0AC\uD569\uB2C8\uB2E4.");
        } else if (notifySucceeded) {
          setStatus(
            "\uD53C\uB4DC\uBC31 \uBA54\uC77C\uC740 \uC804\uC1A1\uB418\uC5C8\uC9C0\uB9CC \uC571 \uC800\uC7A5\uC740 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
          );
        } else {
          setStatus(
            "\uD53C\uB4DC\uBC31\uC740 \uC800\uC7A5\uB418\uC5C8\uC9C0\uB9CC \uBA54\uC77C \uC54C\uB9BC \uC804\uC1A1\uC740 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
          );
        }
      } catch (err) {
        setFeedbackError(`\uD53C\uB4DC\uBC31 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: ${err.message}`);
      } finally {
        setIsSubmittingFeedback(false);
      }
    },
    [
      feedbackCategory,
      feedbackInput,
      file?.name,
      isSubmittingFeedback,
      pageInfo?.total,
      pageInfo?.used,
      panelTab,
      currentPage,
      selectedFileId,
      saveUserFeedback,
      tier,
      user?.email,
      user?.id,
      user?.user_metadata,
    ]
  );

  const activeMockExam = useMemo(() => {
    if (!mockExams.length) return null;
    if (activeMockExamId) {
      return mockExams.find((exam) => exam.id === activeMockExamId) || mockExams[0];
    }
    return mockExams[0];
  }, [activeMockExamId, mockExams]);
  const activeMockExamIndex = useMemo(
    () => (activeMockExam ? mockExams.findIndex((exam) => exam.id === activeMockExam.id) : -1),
    [activeMockExam, mockExams]
  );
  const getMockExamTitle = useCallback(
    (exam, index) => formatMockExamTitle(exam, index),
    []
  );
  const activeMockExamTitle = useMemo(
    () => getMockExamTitle(activeMockExam, activeMockExamIndex),
    [activeMockExam, activeMockExamIndex, getMockExamTitle]
  );

  const mockExamOrderedItems = useMemo(() => {
    const items = Array.isArray(activeMockExam?.payload?.items) ? activeMockExam.payload.items : [];
    if (!items.length) return [];
    return [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [activeMockExam]);

  const mockExamPages = useMemo(
    () => chunkMockExamPages(mockExamOrderedItems),
    [mockExamOrderedItems]
  );

  const startPageProps = {
    file,
    pageInfo,
    isLoadingText,
    thumbnailUrl,
    uploadedFiles,
    onSelectFile: handleSelectFile,
    onFileChange: handleFileChange,
    selectedFileId,
    folders,
    selectedFolderId,
    onSelectFolder: handleSelectFolder,
    onCreateFolder: handleCreateFolder,
    onDeleteFolder: handleDeleteFolder,
    selectedUploadIds,
    onToggleUploadSelect: handleToggleUploadSelect,
    onMoveUploads: handleMoveUploadsToFolder,
    onClearSelection: handleClearSelection,
    isFolderFeatureEnabled,
    onDeleteUpload: handleDeleteUpload,
    isGuest: AUTH_ENABLED && !user,
    showIntro: !AUTH_ENABLED && !user && showGuestIntro,
    onIntroDone: () => setShowGuestIntro(false),
    onRequireAuth: openAuth,
    currentTier: tier,
    maxPdfSizeBytes: limits.maxPdfSizeBytes,
    outputLanguage,
    setOutputLanguage,
  };
  const detailPageProps = {
    detailContainerRef,
    splitStyle,
    pdfUrl,
    documentUrl: activeDocumentUrl,
    file,
    pendingDocumentOpen,
    pageInfo,
    currentPage,
    handlePageChange,
    handleDragStart,
    panelTab,
    setPanelTab,
    outputLanguage,
    requestSummary,
    isLoadingSummary,
    isLoadingText,
    previewText,
    isFreeTier,
    summary,
    instructorEmphasisInput,
    setInstructorEmphasisInput,
    savedInstructorEmphases,
    activeInstructorEmphasisId,
    handleSaveInstructorEmphasis,
    handleSelectInstructorEmphasis,
    handleDeleteInstructorEmphasis,
    cycleActiveInstructorEmphasis,
    partialSummary,
    partialSummaryRange,
    savedPartialSummaries,
    isSavedPartialSummaryOpen,
    setIsPageSummaryOpen,
    setIsSavedPartialSummaryOpen,
    setPageSummaryError,
    isPageSummaryOpen,
    pageSummaryInput,
    setPageSummaryInput,
    pageSummaryError: safePageSummaryError,
    handleSummaryByPages,
    handleSaveCurrentPartialSummary,
    handleLoadSavedPartialSummary,
    handleRenameSavedPartialSummary,
    handleNormalizeSavedPartialSummaryName,
    handleDeleteSavedPartialSummary,
    isPageSummaryLoading,
    isChapterRangeOpen,
    setIsChapterRangeOpen,
    chapterRangeInput,
    setChapterRangeInput,
    chapterRangeError: safeChapterRangeError,
    setChapterRangeError,
    handleAutoDetectChapterRanges,
    isDetectingChapterRanges,
    handleConfirmChapterRanges,
    handleExportSummaryPdf,
    isExportingSummary,
    status: safeStatus,
    error: safeError,
    summaryRef,
    mockExams,
    mockExamMenuRef,
    mockExamMenuButtonRef,
    isMockExamMenuOpen,
    setIsMockExamMenuOpen,
    isLoadingMockExams,
    activeMockExam,
    activeMockExamTitle,
    formatMockExamTitle: getMockExamTitle,
    handleDeleteMockExam,
    handleCreateMockExam,
    mockExamChapterSelectionInput,
    setMockExamChapterSelectionInput,
    isGeneratingMockExam,
    selectedFileId,
    handleExportMockExam,
    mockExamOrderedItems,
    mockExamPrintRef,
    mockExamPages,
    showMockExamAnswers,
    setShowMockExamAnswers,
    mockExamStatus: safeMockExamStatus,
    mockExamError: safeMockExamError,
    setActiveMockExamId,
    isLoadingQuiz,
    shortPreview,
    requestQuestions,
    quizChapterSelectionInput,
    setQuizChapterSelectionInput,
    quizMixInput,
    setQuizMixInput,
    quizMix,
    setQuizMix: (nextMix) => {
      const nextMultipleChoice = Math.max(0, Number(nextMix?.multipleChoice) || 0);
      const nextShortAnswer = Math.max(0, Number(nextMix?.shortAnswer) || 0);
      setQuizMixInput(`${nextMultipleChoice}-${nextShortAnswer}`);
    },
    quizMixError,
    quizSets,
    deleteQuiz: handleDeleteQuiz,
    deleteQuizItem: handleDeleteQuizItem,
    handleChoiceSelect,
    handleShortAnswerChange,
    handleShortAnswerCheck,
    handleQuizOxSelect,
    handleToggleQuizOxExplanation,
    regenerateQuiz,
    reviewNotes: reviewNotesPanelState.items,
    reviewNoteSections: configuredReviewSections,
    reviewNotesSectionSelectionInput: reviewNotesChapterSelectionInput,
    setReviewNotesSectionSelectionInput: setReviewNotesChapterSelectionInput,
    reviewNotesSectionError: reviewNotesPanelState.error,
    examCramItems: examCramState.items,
    examCramPendingCount: examCramState.pendingCount,
    examCramSectionError: examCramState.error,
    examCramReferenceCounts: examCramState.referenceCounts,
    examCramHasAnySource: examCramState.hasAnySource,
    examCramContent,
    examCramUpdatedAt,
    examCramScopeLabel,
    examCramStatus: safeExamCramStatus,
    examCramError: safeExamCramError,
    isGeneratingExamCram,
    handleReviewNoteAttempt,
    handleDeleteReviewNote,
    handleGenerateExamCram,
    handleCreateReviewNotesMockExam,
    isLoadingOx,
    requestOxQuiz,
    oxChapterSelectionInput,
    setOxChapterSelectionInput,
    regenerateOxQuiz,
    oxItems,
    oxSelections,
    handleOxSelect,
    setOxSelections,
    oxExplanationOpen,
    setOxExplanationOpen,
    flashcards,
    isLoadingFlashcards,
    handleAddFlashcard,
    handleDeleteFlashcard,
    handleGenerateFlashcards,
    flashcardChapterSelectionInput,
    setFlashcardChapterSelectionInput,
    isGeneratingFlashcards,
    extractedText,
    flashcardStatus: safeFlashcardStatus,
    flashcardError: safeFlashcardError,
    tutorMessages,
    isTutorLoading,
    tutorError: safeTutorError,
    tutorNotice,
    handleSendTutorMessage,
    handleResetTutor,
  };

  if (AUTH_ENABLED && isNativePlatform && !authReady) {
    return <div className="min-h-screen bg-black" />;
  }

  if (shouldRenderAuthScreen) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <LoginBackground theme={theme}>
          <div className="relative z-10 min-h-screen px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex items-center justify-start">
              <a
                href="/start"
                className="text-sm font-semibold tracking-[0.18em] text-slate-100/92 transition hover:text-white"
              >
                Zeusian.ai
              </a>
            </div>
            <div className="flex min-h-[calc(100vh-96px)] items-center justify-center">
              <AuthPanel user={user} onAuth={refreshSession} theme={theme} outputLanguage={outputLanguage} />
            </div>
          </div>
        </LoginBackground>
      </Suspense>
    );
  }

  const isGuestFreeMode = !AUTH_ENABLED && !user;
  const showHeader = Boolean(user || showDetail || (isGuestFreeMode && !showGuestIntro));
  const showAmbient = showHeader;

  return (
    <div
      style={appShellStyle}
      className={`relative min-h-screen overflow-hidden ${
        theme === "light" ? "text-slate-900" : "text-slate-100"
      } ${showAmbient ? "" : "bg-black"} app-banner-offset`}
    >
      {showPayment && (
        <Suspense fallback={null}>
          <PaymentPage
            onClose={closePayment}
            currentTier={tier}
            currentTierExpiresAt={tierExpiresAt}
            currentTierRemainingDays={tierRemainingDays}
            theme={theme}
            user={user}
            onTierUpdated={refreshTier}
            paymentReturnSignal={paymentReturnSignal}
          />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsDialog
            onClose={closeSettings}
            theme={theme}
            onThemeChange={setTheme}
            outputLanguage={outputLanguage}
            onOutputLanguageChange={setOutputLanguage}
            user={user}
            authEnabled={AUTH_ENABLED}
            currentTier={tier}
            currentTierExpiresAt={tierExpiresAt}
            currentTierRemainingDays={tierRemainingDays}
            loadingTier={loadingTier}
            activeProfile={activePremiumProfile}
            premiumSpaceMode={premiumSpaceMode}
            onOpenBilling={() => {
              closeSettings();
              openBilling();
            }}
            onOpenFeedbackDialog={() => {
              closeSettings();
              handleOpenFeedbackDialog();
            }}
            onOpenLogin={() => {
              closeSettings();
              openAuth();
            }}
            onSignOut={handleSignOut}
            signingOut={isSigningOut}
            onRefresh={handleManualSync}
            isRefreshing={isManualSyncing}
          />
        </Suspense>
      )}
      {shouldShowPremiumProfilePicker && (
        <Suspense fallback={null}>
          <PremiumProfilePicker
            profiles={premiumProfiles}
            activeProfileId={activePremiumProfileId}
            maxProfiles={PREMIUM_PROFILE_LIMIT}
            theme={theme}
            onSelectProfile={handleSelectPremiumProfile}
            onCreateProfile={handleCreatePremiumProfile}
            onClose={handleCloseProfilePicker}
            canClose={Boolean(activePremiumProfileId)}
          />
        </Suspense>
      )}
      {showProfilePinDialog && activePremiumProfile && (
        <div className="fixed inset-0 z-[155] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="PIN 변경 창 닫기"
            onClick={handleCloseProfilePinDialog}
            className={`absolute inset-0 ${theme === "light" ? "bg-slate-900/25" : "bg-black/75"} backdrop-blur-[2px]`}
          />
          <form
            onSubmit={handleSubmitProfilePinChange}
            className={`relative z-[156] w-full max-w-md rounded-2xl border p-5 ${
              theme === "light"
                ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
            }`}
          >
            <p className="text-sm font-semibold">{activePremiumProfile.name} PIN 변경</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              현재 PIN을 입력하고 새 4자리 PIN을 설정해주세요.
            </p>
            <div className="mt-4 space-y-2">
              <input
                name="current-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.currentPin}
                onChange={(event) => handleChangeProfilePinInput("currentPin", event.target.value)}
                placeholder="현재 PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                name="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.nextPin}
                onChange={(event) => handleChangeProfilePinInput("nextPin", event.target.value)}
                placeholder="새 PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                name="confirm-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.confirmPin}
                onChange={(event) => handleChangeProfilePinInput("confirmPin", event.target.value)}
                placeholder="새 PIN 확인"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
            </div>
            {safeProfilePinError && <p className="mt-2 text-xs text-rose-300">{safeProfilePinError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseProfilePinDialog}
                className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      {isFeedbackDialogOpen && (
        <div className="fixed inset-0 z-[165] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="\uD53C\uB4DC\uBC31 \uCC3D \uB2EB\uAE30"
            onClick={handleCloseFeedbackDialog}
            className={`absolute inset-0 ${
              theme === "light" ? "bg-slate-900/25" : "bg-black/75"
            } backdrop-blur-[2px]`}
          />
          <form
            onSubmit={handleSubmitFeedback}
            className={`relative z-[166] w-full max-w-lg rounded-2xl border p-5 ${
              theme === "light"
                ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
            }`}
          >
            <p className="text-sm font-semibold">{"\uD53C\uB4DC\uBC31 \uBCF4\uB0B4\uAE30"}</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              {"\uBC84\uADF8, \uAE30\uB2A5 \uC81C\uC548, \uC0AC\uC6A9\uC131 \uAC1C\uC120 \uC758\uACAC\uC744 \uC790\uC720\uB86D\uAC8C \uB0A8\uACA8 \uC8FC\uC138\uC694."}
            </p>
            <div className="mt-4 space-y-3">
              <select
                name="feedback-category"
                value={feedbackCategory}
                onChange={(event) => setFeedbackCategory(event.target.value)}
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-white/15 bg-white/5 text-slate-100"
                }`}
              >
                <option value="general">{"\uC77C\uBC18"}</option>
                <option value="bug">{"\uBC84\uADF8 \uC81C\uBCF4"}</option>
                <option value="feature">{"\uAE30\uB2A5 \uC81C\uC548"}</option>
                <option value="ux">{"\uC0AC\uC6A9\uC131 \uC758\uACAC"}</option>
              </select>
              <textarea
                name="feedback-message"
                value={feedbackInput}
                onChange={(event) => setFeedbackInput(event.target.value)}
                rows={7}
                maxLength={2000}
                placeholder={"\uC5B4\uB5A4 \uBB38\uC81C\uB97C \uACAA\uC73C\uC168\uB294\uC9C0, \uC5B4\uB5BB\uAC8C \uAC1C\uC120\uD558\uBA74 \uC88B\uC744\uC9C0 \uC791\uC131\uD574 \uC8FC\uC138\uC694."}
                className={`w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                  {"\uBB38\uB9E5: "}{file?.name || "\uC120\uD0DD\uB41C \uBB38\uC11C \uC5C6\uC74C"}
                </span>
                <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                  {feedbackInput.length}/2000
                </span>
              </div>
            </div>
            {feedbackError && <p className="mt-2 text-xs text-rose-300">{feedbackError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseFeedbackDialog}
                disabled={isSubmittingFeedback}
                className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                {"\uCDE8\uC18C"}
              </button>
              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {isSubmittingFeedback ? "\uC804\uC1A1 \uC911..." : "\uC804\uC1A1"}
              </button>
            </div>
          </form>
        </div>
      )}
      {isResizingSplit && showDetail && (
        <div className="pointer-events-none fixed inset-0 z-[160] cursor-col-resize" aria-hidden="true" />
      )}
      {showAmbient && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-[-80px] top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 py-4">
        {showHeader && (
          <Suspense fallback={null}>
            <Header
              user={user}
              onSignOut={handleSignOut}
              signingOut={isSigningOut}
              theme={theme}
              onGoHome={showDetail ? goBackToList : null}
              onOpenFeedbackDialog={AUTH_ENABLED ? handleOpenFeedbackDialog : null}
              onOpenBilling={openBilling}
              onOpenSettings={openSettings}
              showBilling={AUTH_ENABLED}
              onToggleTheme={toggleTheme}
              onOpenLogin={openAuth}
              authEnabled={AUTH_ENABLED}
              isPremiumTier={isPremiumTier}
              loadingTier={loadingTier}
              onRefresh={handleManualSync}
              isRefreshing={isManualSyncing}
              activeProfile={activePremiumProfile}
              onOpenProfilePicker={handleOpenProfilePicker}
              onOpenProfilePinDialog={handleOpenProfilePinDialog}
              premiumSpaceMode={premiumSpaceMode}
              onTogglePremiumSpaceMode={handleTogglePremiumSpaceMode}
              outputLanguage={outputLanguage}
            />
          </Suspense>
        )}
        <div className="px-0">
          {!showDetail && <StartPage {...startPageProps} />}
          {showDetail && (
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-300">
                  Loading...
                </div>
              }
            >
              <DetailPage {...detailPageProps} />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;







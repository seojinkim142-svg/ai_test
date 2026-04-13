import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Capacitor } from "@capacitor/core";
import ActionsPanel from "../components/ActionsPanel";
import AiTutorPanel from "../components/AiTutorPanel";
import FlashcardsPanel from "../components/FlashcardsPanel";
import OxSection from "../components/OxSection";
import PdfPreview from "../components/PdfPreview";
import QuizSection from "../components/QuizSection";
import ReviewNotesPanel from "../components/ReviewNotesPanel";
import SummaryCard from "../components/SummaryCard";
import { useQuizMixCarousel } from "../hooks/useQuizMixCarousel";
import { LETTERS } from "../constants";
import { getDetailCopy } from "../utils/detailCopy";

const MOCK_BARE_LATEX_RE =
  /\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)\b/;
const MOCK_INLINE_EQUATION_RE =
  /[A-Za-z][A-Za-z0-9]*(?:\([^\)\n]{0,40}\))?\s*=\s*[^,.;!?\n$]{2,220}/g;
const MOCK_POWER_EXPR_RE =
  /[A-Za-z][A-Za-z0-9]*\s*\^\s*\{[^}\n]{1,50}\}[A-Za-z0-9{}^_\\\-]*/g;
const MOCK_EXPECTATION_EXPR_RE = /E\[[A-Za-z0-9\\^_{}\[\]().,+\-*\/|=\s\u221E]{2,260}\]/g;
const MOCK_INTEGRAL_EXPR_RE = /(?:\\+int|\u222B)\s*[A-Za-z0-9\\^_{}\[\]().,+\-*\/|=\s\u221E]{2,260}/g;
const MOCK_NESTED_MATH_EXPECTATION_RE = /E\[\$([^$\n]{1,300})\$\]/g;
const MOCK_MATH_TOKEN_RE =
  /(?:\\(?:int|infty|sum|frac|dfrac|tfrac|sqrt|left|right|cdot|times|to|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim|mid)|[_^=+\-*/])/;

function isInsideMathSegment(text, index) {
  let delimiterCount = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '$' && text[i - 1] !== '\\') {
      delimiterCount += 1;
    }
  }
  return delimiterCount % 2 === 1;
}

function toLatexMath(expr) {
  return String(expr || "")
    .normalize("NFKC")
    .trim()
    .replace(
      /\\{2,}(?=(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)\b)/g,
      "\\"
    )
    .replace(/\u2212/g, "-")
    .replace(/<=|\u2264/g, " \\le ")
    .replace(/>=|\u2265/g, " \\ge ")
    .replace(/!=|\u2260/g, " \\ne ")
    .replace(/~=|\u2248/g, " \\approx ")
    .replace(/->|\u2192/g, " \\to ")
    .replace(/\u221E/g, " \\infty ")
    .replace(/\u2211/g, " \\sum ")
    .replace(/\\int\s*\\infty\s*0/g, " \\int_0^\\infty ")
    .replace(/\\int\s*0\s*\\infty/g, " \\int_0^\\infty ")
    .replace(/\\int\s*\u221E\s*0/g, " \\int_0^\\infty ")
    .replace(/\\int\s*0\s*\u221E/g, " \\int_0^\\infty ")
    .replace(/\u222B\s*\u221E\s*0/g, " \\int_0^\\infty ")
    .replace(/\u222B\s*0\s*\u221E/g, " \\int_0^\\infty ")
    .replace(/\u222B/g, " \\int ")
    .replace(/[\u00D7\u2715\u2716]/g, " \\times ")
    .replace(/[\u00B7\u22C5]/g, " \\cdot ")
    .replace(/\|/g, " \\mid ")
    .replace(/\bd([A-Za-z])\b/g, " \\, d$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wrapPatternAsLatexMath(text, pattern, options = {}) {
  const compact = options.compact === true;
  return String(text || "").replace(pattern, (match, offset, source) => {
    if (typeof offset !== "number" || isInsideMathSegment(source, offset)) {
      return match;
    }
    const normalized = toLatexMath(match);
    if (!normalized) return match;
    if (!MOCK_MATH_TOKEN_RE.test(normalized)) return match;
    const expression = compact ? normalized.replace(/\s+/g, "") : normalized;
    return `$${expression}$`;
  });
}

function toMarkdownText(rawText) {
  return String(rawText || "")
    .replace(/[\uFF61-\uFFEF\uFFF0-\uFFFF]/g, " ")
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\uFFFD+/g, "")
    .replace(/^[\u00B7\u2022\u318D\uFF65]+\s*/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toMarkdownWithLatexMath(rawText) {
  const source = toMarkdownText(String(rawText || "").replace(/\r\n/g, "\n"));
  if (!source) return "";

  const lines = source.split("\n");
  let inCodeFence = false;

  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCodeFence = !inCodeFence;
        return line;
      }
      if (inCodeFence) return line;
      if (line.includes("`")) return line;

      let working = String(line || "");
      working = wrapPatternAsLatexMath(working, MOCK_INTEGRAL_EXPR_RE);
      working = working.replace(MOCK_NESTED_MATH_EXPECTATION_RE, (full, inner, offset, sourceText) => {
        if (isInsideMathSegment(sourceText, Number(offset))) return full;
        const normalized = toLatexMath(`E[${inner}]`);
        if (!normalized) return full;
        return `$${normalized}$`;
      });
      working = wrapPatternAsLatexMath(working, MOCK_EXPECTATION_EXPR_RE);
      working = wrapPatternAsLatexMath(working, MOCK_INLINE_EQUATION_RE);
      working = wrapPatternAsLatexMath(working, MOCK_POWER_EXPR_RE, { compact: true });

      if (MOCK_BARE_LATEX_RE.test(working)) {
        working = working.replace(
          /(^|[\s(])((?:\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)[^,\n)]{0,180}))/g,
          (full, prefix, expr, offset, sourceText) => {
            const exprIndex = Number(offset) + String(prefix || "").length;
            if (isInsideMathSegment(sourceText, exprIndex)) return full;
            const normalized = toLatexMath(expr);
            if (!normalized) return full;
            return `${prefix}$${normalized}$`;
          }
        );
      }

      return working;
    })
    .join("\n");
}

export default function DetailPage({
  detailContainerRef,
  splitStyle,
  pdfUrl,
  documentUrl,
  file,
  pendingDocumentOpen,
  pageInfo,
  currentPage,
  handlePageChange,
  handleDragStart,
  panelTab,
  setPanelTab,
  outputLanguage = "ko",
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
  setIsSavedPartialSummaryOpen,
  handleSaveCurrentPartialSummary,
  handleLoadSavedPartialSummary,
  handleDeleteSavedPartialSummary,
  setIsPageSummaryOpen,
  setPageSummaryError,
  isPageSummaryOpen,
  pageSummaryInput,
  setPageSummaryInput,
  pageSummaryError,
  handleSummaryByPages,
  isPageSummaryLoading,
  isChapterRangeOpen,
  setIsChapterRangeOpen,
  chapterRangeInput,
  setChapterRangeInput,
  chapterRangeError,
  chapterRangeNotice,
  setChapterRangeError,
  setChapterRangeNotice,
  handleAutoDetectChapterRanges,
  isDetectingChapterRanges,
  handleConfirmChapterRanges,
  handleExportSummaryPdf,
  isExportingSummary,
  status,
  error,
  summaryRef,
  mockExams,
  mockExamMenuRef,
  mockExamMenuButtonRef,
  isMockExamMenuOpen,
  setIsMockExamMenuOpen,
  isLoadingMockExams,
  activeMockExam,
  activeMockExamTitle,
  formatMockExamTitle,
  handleDeleteMockExam,
  handleCreateMockExam,
  mockExamChapterSelectionInput,
  setMockExamChapterSelectionInput,
  mockExamPromptAddonInput,
  setMockExamPromptAddonInput,
  isGeneratingMockExam,
  selectedFileId,
  handleExportMockExam,
  mockExamOrderedItems,
  mockExamPrintRef,
  mockExamPages,
  showMockExamAnswers,
  setShowMockExamAnswers,
  mockExamStatus,
  mockExamError,
  setActiveMockExamId,
  isLoadingQuiz,
  shortPreview,
  requestQuestions,
  quizChapterSelectionInput,
  setQuizChapterSelectionInput,
  quizPromptAddonInput,
  setQuizPromptAddonInput,
  quizMixInput,
  setQuizMixInput,
  quizMix,
  setQuizMix,
  quizMixError,
  quizSets,
  handleChoiceSelect,
  handleShortAnswerChange,
  handleShortAnswerCheck,
  handleQuizOxSelect,
  handleToggleQuizOxExplanation,
  regenerateQuiz,
  deleteQuiz,
  deleteQuizItem,
  reviewNotes,
  reviewNoteSections,
  reviewNotesSectionSelectionInput,
  setReviewNotesSectionSelectionInput,
  reviewNotesSectionError,
  examCramItems,
  examCramPendingCount,
  examCramSectionError,
  examCramReferenceCounts,
  examCramHasAnySource,
  examCramContent,
  examCramUpdatedAt,
  examCramScopeLabel,
  examCramStatus,
  examCramError,
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
  flashcardStatus,
  flashcardError,
  tutorMessages,
  isTutorLoading,
  tutorError,
  tutorNotice,
  handleSendTutorMessage,
  handleResetTutor,
}) {
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const copy = useMemo(() => getDetailCopy(outputLanguage), [outputLanguage]);
  const detailTabs = useMemo(
    () => [
      { id: "summary", label: copy.tabs.summary },
      { id: "quiz", label: copy.tabs.quiz },
      { id: "reviewNotes", label: copy.tabs.reviewNotes },
      { id: "mockExam", label: copy.tabs.mockExam },
      { id: "flashcards", label: copy.tabs.flashcards },
      { id: "tutor", label: copy.tabs.tutor },
    ],
    [copy]
  );
  const quizMixOptions = useMemo(
    () => [
      { multipleChoice: 5, shortAnswer: 0, label: "媛쒓???5 / 二쇨???0" },
      { multipleChoice: 4, shortAnswer: 1, label: "媛쒓???4 / 二쇨???1" },
      { multipleChoice: 3, shortAnswer: 2, label: "媛쒓???3 / 二쇨???2" },
      { multipleChoice: 2, shortAnswer: 3, label: "媛쒓???2 / 二쇨???3" },
      { multipleChoice: 1, shortAnswer: 4, label: "媛쒓???1 / 二쇨???4" },
      { multipleChoice: 0, shortAnswer: 5, label: "媛쒓???0 / 二쇨???5" },
    ],
    []
  );
  const { quizMixScrollRef, handleQuizMixScroll } = useQuizMixCarousel({
    quizMix,
    quizMixOptions,
    setQuizMix,
  });
  const normalizeChapterSelectionInput = (value) => String(value || "").replace(/\s+/g, "");
  const truncateText = (value, maxLength = 30) => {
    const normalized = String(value || "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
  };
  const mockMarkdownComponents = useMemo(
    () => ({
      p: ({ children }) => <p className="my-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
      li: ({ children }) => <li className="my-0.5">{children}</li>,
    }),
    []
  );
  const renderMockRichText = useCallback(
    (text, className = "") => {
      const normalized = toMarkdownWithLatexMath(String(text || "").trim());
      if (!normalized) return null;
      return (
        <div
          className={`summary-prose max-w-none break-words [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto ${className}`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={mockMarkdownComponents}
          >
            {normalized}
          </ReactMarkdown>
        </div>
      );
    },
    [mockMarkdownComponents]
  );
  const renderMockExamItem = useCallback(
    (item, number) => {
      const choices = Array.isArray(item?.choices) ? item.choices : [];
      const isOx = item?.type === "ox";
      const isShort = item?.type === "quiz-short";
      const isMultiple = !isOx && !isShort;

      return (
        <div key={`mock-exam-q-${number}`} className="space-y-2">
          <p className="text-[13px] font-semibold text-black">{number}.</p>
          {renderMockRichText(item?.prompt, "text-[13px] text-black")}
          {isOx && <p className="text-[12px] text-black/80">1) O  2) X</p>}
          {isShort && <p className="text-[12px] text-black/80">?? ____________________</p>}
          {isMultiple && choices.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-black/85">
              {choices.slice(0, 4).map((choice, idx) => (
                <div key={`choice-${number}-${idx}`} className="flex gap-2">
                  <span className="w-4">{idx + 1})</span>
                  {renderMockRichText(choice, "min-w-0 flex-1 text-[12px] text-black/85")}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
    [renderMockRichText]
  );
  const mockExamAnswerEntries = useMemo(() => {
    const persistedAnswerSheet = Array.isArray(activeMockExam?.payload?.answerSheet)
      ? activeMockExam.payload.answerSheet
      : [];

    const deriveAnswerFromItem = (item) => {
      const answerText =
        item.type === "ox"
          ? item.answer || "-"
          : item.type === "quiz-short"
            ? item.answer || "-"
            : Number.isFinite(item.answerIndex)
              ? LETTERS[item.answerIndex] || "-"
              : "-";
      return String(answerText || "-").trim() || "-";
    };

    if (mockExamOrderedItems.length === 0 && persistedAnswerSheet.length > 0) {
      return persistedAnswerSheet.map((item, idx) => ({
        number: Number.isFinite(item?.number) ? item.number : idx + 1,
        answer: String(item?.answer || "-").trim() || "-",
        explanation: String(item?.explanation || "").trim(),
        evidence: String(item?.evidence || "").trim(),
      }));
    }

    return mockExamOrderedItems.map((item, idx) => {
      const persisted = persistedAnswerSheet[idx] || {};
      const persistedAnswer = String(persisted?.answer || "").trim();
      const fallbackAnswer = deriveAnswerFromItem(item);
      const answer =
        persistedAnswer && persistedAnswer !== "-" ? persistedAnswer : fallbackAnswer;

      return {
        number: idx + 1,
        answer,
        explanation: String(persisted?.explanation || item?.explanation || "").trim(),
        evidence: String(persisted?.evidence || item?.evidence || "").trim(),
      };
    });
  }, [activeMockExam?.payload?.answerSheet, mockExamOrderedItems]);
  const emphasisTextareaRef = useRef(null);
  const savedInstructorScrollRef = useRef(null);
  const savedInstructorScrollTimerRef = useRef(null);
  const partialSummaryListRef = useRef(null);
  const emphasisWheelRowHeight = 38;
  const emphasisWheelViewportHeight = emphasisWheelRowHeight * 5;
  const emphasisWheelCenterOffset = (emphasisWheelViewportHeight - emphasisWheelRowHeight) / 2;
  const normalizedSavedInstructorEmphases = useMemo(
    () => (Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []),
    [savedInstructorEmphases]
  );
  const normalizedSavedPartialSummaries = useMemo(
    () => (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []),
    [savedPartialSummaries]
  );
  const activeInstructorEmphasis = useMemo(
    () =>
      normalizedSavedInstructorEmphases.find((item) => item.id === activeInstructorEmphasisId) ||
      normalizedSavedInstructorEmphases[0] ||
      null,
    [activeInstructorEmphasisId, normalizedSavedInstructorEmphases]
  );
  const activeInstructorEmphasisIndex = useMemo(
    () =>
      activeInstructorEmphasis
        ? normalizedSavedInstructorEmphases.findIndex((item) => item.id === activeInstructorEmphasis.id)
        : -1,
    [activeInstructorEmphasis, normalizedSavedInstructorEmphases]
  );
  const pendingDocumentId = String(pendingDocumentOpen?.id || "").trim();
  const isPendingDocumentOpen = Boolean(pendingDocumentId);
  const pendingDocumentName =
    String(pendingDocumentOpen?.name || file?.name || copy.pending.fallbackDocumentName).trim() ||
    copy.pending.fallbackDocumentName;
  const handleRequestSummary = useCallback(
    () => requestSummary({ force: true, replaceExisting: true }),
    [requestSummary]
  );

  useEffect(() => {
    if (panelTab === "ox") {
      setPanelTab("quiz");
    }
  }, [panelTab, setPanelTab]);

  useEffect(() => {
    const target = emphasisTextareaRef.current;
    if (!target) return;
    target.style.height = "auto";
    const next = Math.max(44, Math.min(240, target.scrollHeight));
    target.style.height = `${next}px`;
    target.style.overflowY = target.scrollHeight > 240 ? "auto" : "hidden";
  }, [instructorEmphasisInput]);

  useEffect(() => {
    return () => {
      if (savedInstructorScrollTimerRef.current) {
        clearTimeout(savedInstructorScrollTimerRef.current);
      }
    };
  }, []);

  const handleSavedInstructorWheelSelect = useCallback(() => {
    const container = savedInstructorScrollRef.current;
    if (!container || normalizedSavedInstructorEmphases.length === 0) return;
    const nearestIndex = Math.max(
      0,
      Math.min(
        normalizedSavedInstructorEmphases.length - 1,
        Math.round(container.scrollTop / emphasisWheelRowHeight)
      )
    );
    const nearest = normalizedSavedInstructorEmphases[nearestIndex];
    if (!nearest || nearest.id === activeInstructorEmphasis?.id) return;
    handleSelectInstructorEmphasis(nearest.id);
  }, [
    activeInstructorEmphasis?.id,
    emphasisWheelRowHeight,
    handleSelectInstructorEmphasis,
    normalizedSavedInstructorEmphases,
  ]);

  const handleSavedInstructorWheelScroll = useCallback(() => {
    if (savedInstructorScrollTimerRef.current) {
      clearTimeout(savedInstructorScrollTimerRef.current);
    }
    savedInstructorScrollTimerRef.current = setTimeout(() => {
      handleSavedInstructorWheelSelect();
      savedInstructorScrollTimerRef.current = null;
    }, 90);
  }, [handleSavedInstructorWheelSelect]);

  const handleSavedInstructorClick = useCallback(
    (itemId) => {
      handleSelectInstructorEmphasis(itemId);
      emphasisTextareaRef.current?.focus();
    },
    [handleSelectInstructorEmphasis]
  );

  const resizeHandle = (
    <div className="hidden w-8 shrink-0 items-stretch justify-center px-1 lg:flex">
      <button
        type="button"
        onPointerDown={handleDragStart}
        className="group relative flex h-full w-full cursor-col-resize touch-none items-center justify-center border-0 bg-transparent p-0 outline-none"
        role="separator"
        aria-label="PDF? ?⑤꼸 ?ш린 議곗젅"
        aria-orientation="vertical"
      >
        <span className="pointer-events-none h-full w-px rounded-full bg-white/12 transition group-hover:bg-emerald-300/35" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-20 w-5 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-white/12 bg-slate-950/92 shadow-[0_14px_32px_rgba(2,6,23,0.45)] transition group-hover:border-emerald-300/35 group-hover:bg-slate-900/95">
          <span className="h-1 w-1 rounded-full bg-slate-200/85" />
          <span className="h-1 w-1 rounded-full bg-slate-200/85" />
          <span className="h-1 w-1 rounded-full bg-slate-200/85" />
        </span>
      </button>
    </div>
  );

  useEffect(() => {
    const container = savedInstructorScrollRef.current;
    if (!container || normalizedSavedInstructorEmphases.length === 0) return;
    const targetIndex = activeInstructorEmphasisIndex >= 0 ? activeInstructorEmphasisIndex : 0;
    const targetTop = Math.max(0, targetIndex * emphasisWheelRowHeight);
    if (Math.abs(container.scrollTop - targetTop) < 1) return;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [
    activeInstructorEmphasisIndex,
    emphasisWheelRowHeight,
    normalizedSavedInstructorEmphases.length,
  ]);

  useEffect(() => {
    if (!isSavedPartialSummaryOpen) return;
    partialSummaryListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isSavedPartialSummaryOpen]);

  if (isPendingDocumentOpen) {
    return (
      <section
        ref={detailContainerRef}
        className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
      >
        <div
          className="flex flex-col gap-3 lg:h-full lg:flex-[0_0_var(--split-basis)] lg:overflow-y-auto"
          style={splitStyle}
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-lg shadow-black/20 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{pendingDocumentName}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                {copy.pending.status}
              </span>
            </div>
          </div>

          <div className="flex h-[58svh] min-h-[24rem] flex-1 items-center justify-center rounded-3xl border border-white/10 bg-slate-950/70 px-6 text-center shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl border border-emerald-300/20 bg-emerald-400/10" />
              <p className="text-base font-semibold text-white">{pendingDocumentName}</p>
              <p className="mt-2 text-sm text-slate-300">{copy.pending.opening}</p>
              <p className="mt-2 text-xs text-slate-400">
                {copy.pending.previewing}
              </p>
            </div>
          </div>
        </div>

        {resizeHandle}

        <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 shadow-lg shadow-black/30">
            <p className="text-lg font-semibold text-white">{pendingDocumentName}</p>
            <p className="mt-2 text-sm text-slate-300">{copy.pending.readySoon}</p>
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
              {copy.pending.firstLoadNotice}
            </div>
          </div>
        </div>
      </section>
    );
  }


  return (
    <section
      ref={detailContainerRef}
      className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
    >
      <div
        className="flex flex-col gap-3 lg:h-full lg:flex-[0_0_var(--split-basis)] lg:overflow-y-auto"
        style={splitStyle}
      >
        <PdfPreview
          pdfUrl={pdfUrl}
          documentUrl={documentUrl}
          file={file}
          pageInfo={pageInfo}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          previewText={previewText}
          isLoadingText={isLoadingText}
        />
      </div>

      {resizeHandle}

      <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/30 sm:grid-cols-6 lg:sticky lg:top-0 lg:z-10 lg:backdrop-blur">
          {detailTabs.map((item) => {
            const active = panelTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPanelTab(item.id)}
                className="ghost-button w-full text-sm text-slate-200"
                data-ghost-size="sm"
                data-ghost-active={active}
                style={{ "--ghost-color": active ? "52, 211, 153" : "148, 163, 184" }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto pr-1 pb-1">
          {panelTab === "summary" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-200">{copy.summary.title}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleRequestSummary}
                    disabled={isLoadingSummary || isLoadingText}
                    className="ghost-button text-xs text-emerald-100"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingSummary ? copy.summary.generating : copy.summary.generate}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageSummaryOpen((prev) => !prev);
                      setPageSummaryError("");
                    }}
                    className="ghost-button text-xs text-slate-200"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    {copy.summary.pageSummary}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChapterRangeOpen((prev) => !prev);
                      setChapterRangeError("");
                    }}
                    className="ghost-button text-xs text-slate-200"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    {copy.summary.chapterRange}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSummaryPdf}
                    disabled={
                      isLoadingSummary || isLoadingText || !summary || isExportingSummary
                    }
                    className="ghost-button text-xs text-indigo-100"
                    style={{ "--ghost-color": "99, 102, 241" }}
                  >
                    {isExportingSummary ? copy.summary.exporting : copy.summary.export}
                  </button>
                </div>
              </div>
              {status && <p className="mt-2 text-sm text-emerald-200">{status}</p>}
              {error && (
                <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
                  {error}
                </p>
              )}
              {isPageSummaryOpen && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{copy.summary.pageSummaryTitle}</p>
                      <p className="text-xs text-slate-400">{copy.summary.pageSummaryHint(pageInfo.total || pageInfo.used || "-")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPageSummaryOpen(false)}
                      className="ghost-button text-[11px] text-slate-200"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "148, 163, 184" }}
                    >
                      {copy.summary.close}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={pageSummaryInput}
                      onChange={(event) => {
                        setPageSummaryInput(event.target.value);
                        setPageSummaryError("");
                      }}
                      placeholder={copy.summary.pageSummaryPlaceholder}
                      className="w-full flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
                    />
                    <button
                      type="button"
                      onClick={handleSummaryByPages}
                      disabled={isPageSummaryLoading || isLoadingSummary || isLoadingText}
                      className="ghost-button text-sm text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      {isPageSummaryLoading ? copy.summary.pageSummaryLoading : copy.summary.pageSummary}
                    </button>
                  </div>
                  {pageSummaryError && (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/30">
                      {pageSummaryError}
                    </p>
                  )}
                </div>
              )}
              {isChapterRangeOpen && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">사용자 지정 챕터 범위</p>
                      <p className="text-xs text-slate-400">
                        형식: 챕터번호:시작-끝 (예: 1:1-12, 2:13-24)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsChapterRangeOpen(false)}
                      className="ghost-button text-[11px] text-slate-200"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "148, 163, 184" }}
                    >
                      닫기
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={chapterRangeInput}
                      onChange={(event) => {
                        setChapterRangeInput(event.target.value);
                        setChapterRangeError("");
                        setChapterRangeNotice("");
                      }}
                      placeholder={`1:1-12\n2:13-24\n3:25-38`}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleAutoDetectChapterRanges}
                        disabled={isLoadingSummary || isLoadingText || isDetectingChapterRanges}
                        className="ghost-button text-xs text-slate-200"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "100, 116, 139" }}
                      >
                        {isDetectingChapterRanges ? "목차 추출 중..." : "목차 자동 추출"}
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmChapterRanges}
                        disabled={isLoadingSummary || isLoadingText || isDetectingChapterRanges}
                        className="ghost-button text-xs text-emerald-100"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "52, 211, 153" }}
                      >
                        확인
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      목차 자동 추출 또는 직접 입력한 범위는 요약 생성 시 챕터 분할 기준으로 적용됩니다.
                    </p>
                  </div>
                  {chapterRangeError && (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/30">
                      {chapterRangeError}
                    </p>
                  )}
                  {!chapterRangeError && chapterRangeNotice && (
                    <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/20">
                      {chapterRangeNotice}
                    </p>
                  )}
                </div>
              )}
              <div className="hidden mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      {"\uAD50\uC218\uB2D8/\uAC15\uC0AC \uAC15\uC870 \uD3EC\uC778\uD2B8"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {
                        "\uD559\uC2B5 \uC911 \uBC18\uB4DC\uC2DC \uD655\uC778\uD558\uB77C\uACE0 \uD55C \uD3EC\uC778\uD2B8\uB97C \uBA54\uBAA8\uD558\uC138\uC694."
                      }
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveInstructorEmphasis()}
                    className="ghost-button text-xs text-emerald-100"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    {"\uC800\uC7A5"}
                  </button>
                </div>
                <textarea
                  ref={emphasisTextareaRef}
                  value={instructorEmphasisInput}
                  onChange={(event) => setInstructorEmphasisInput(event.target.value)}
                  rows={1}
                  maxLength={2000}
                  placeholder={
                    "\uC608) 3\uC7A5 \uC815\uB9AC \uBB38\uC81C\uB294 \uAE30\uCD9C \uD45C\uD604\uC744 \uADF8\uB300\uB85C \uBB3B\uB294\uB2E4. \uAD6C\uBD84 \uAC1C\uB150(A vs B)\uC744 \uBE44\uAD50\uD558\uB294 \uC720\uD615\uC774 \uC790\uC8FC \uB098\uC628\uB2E4."
                  }
                  className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  {String(instructorEmphasisInput || "").length}/2000
                </p>
                {normalizedSavedInstructorEmphases.length > 0 && (
                  <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-slate-300">
                        {`\uC800\uC7A5\uB41C \uAC15\uC870 \uD3EC\uC778\uD2B8 ${normalizedSavedInstructorEmphases.length}\uAC1C`}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDeleteInstructorEmphasis(activeInstructorEmphasis?.id)}
                        disabled={!activeInstructorEmphasis}
                        className="ghost-button text-[11px] text-slate-200"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "226, 232, 240" }}
                      >
                        선택 삭제
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative flex-1">
                        <div
                          className="pointer-events-none absolute inset-x-1 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-emerald-300/45 bg-emerald-400/10 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
                          style={{ height: `${emphasisWheelRowHeight}px` }}
                        />
                        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 rounded-t-lg bg-gradient-to-b from-slate-950/95 to-transparent" />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 rounded-b-lg bg-gradient-to-t from-slate-950/95 to-transparent" />
                        <div
                          ref={savedInstructorScrollRef}
                          onScroll={handleSavedInstructorWheelScroll}
                          className="relative overflow-y-auto rounded-lg snap-y snap-mandatory"
                          style={{
                            height: `${emphasisWheelViewportHeight}px`,
                            scrollPaddingTop: `${emphasisWheelCenterOffset}px`,
                            scrollPaddingBottom: `${emphasisWheelCenterOffset}px`,
                          }}
                        >
                          <div
                            style={{
                              paddingTop: `${emphasisWheelCenterOffset}px`,
                              paddingBottom: `${emphasisWheelCenterOffset}px`,
                            }}
                          >
                            {normalizedSavedInstructorEmphases.map((item, idx) => {
                              const isActive = item.id === activeInstructorEmphasis?.id;
                              const distance =
                                activeInstructorEmphasisIndex >= 0
                                  ? Math.abs(idx - activeInstructorEmphasisIndex)
                                  : 999;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  data-emphasis-id={item.id}
                                  onClick={() => handleSavedInstructorClick(item.id)}
                                  className={`mx-1 flex w-[calc(100%-0.5rem)] snap-center items-center gap-2 rounded-lg px-3 text-left text-xs transition ${
                                    isActive
                                      ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-300/60"
                                      : "text-slate-300 hover:bg-white/5"
                                  } ${distance >= 2 ? "opacity-35" : distance === 1 ? "opacity-70" : "opacity-100"}`}
                                  style={{ height: `${emphasisWheelRowHeight}px` }}
                                >
                                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                    {idx + 1}
                                  </span>
                                  <span
                                    className="truncate leading-relaxed"
                                    title={String(item.text || "").trim()}
                                  >
                                    {truncateText(item.text, 30)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex h-[190px] shrink-0 flex-col items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => cycleActiveInstructorEmphasis(-1)}
                          disabled={normalizedSavedInstructorEmphases.length < 2}
                          className="ghost-button h-7 w-7 text-[11px] text-slate-200"
                          data-ghost-size="sm"
                          style={{ "--ghost-color": "148, 163, 184", padding: 0 }}
                          aria-label="이전 강조"
                        >
                          {"˄"}
                        </button>
                        <button
                          type="button"
                          onClick={() => cycleActiveInstructorEmphasis(1)}
                          disabled={normalizedSavedInstructorEmphases.length < 2}
                          className="ghost-button h-7 w-7 text-[11px] text-slate-200"
                          data-ghost-size="sm"
                          style={{ "--ghost-color": "148, 163, 184", padding: 0 }}
                          aria-label="다음 강조"
                        >
                          {"˅"}
                        </button>
                      </div>
                    </div>
                    {activeInstructorEmphasis && (
                      <p className="mt-2 text-[11px] text-emerald-200">
                        {`\uD604\uC7AC \uC120\uD0DD: ${activeInstructorEmphasisIndex + 1}\uBC88`}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">{"\uC694\uC57D \uC0DD\uC131 \uC911..."}</p>}
              {!isLoadingSummary && summary && (
                <div ref={summaryRef}>
                  <SummaryCard summary={summary} renderExportPages={isExportingSummary} />
                </div>
              )}
              {!isLoadingSummary && !summary && (
                <p className="mt-2 text-sm text-slate-400">{"\uC694\uC57D\uC774 \uC900\uBE44\uB418\uBA74 \uD45C\uC2DC\uB429\uB2C8\uB2E4."}</p>
              )}
              {!isLoadingSummary && (partialSummary || normalizedSavedPartialSummaries.length > 0) && (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-emerald-100">
                        {"\uBD80\uBD84 \uC694\uC57D"}
                      </p>
                      <p className="text-xs text-slate-300">
                        {partialSummaryRange
                          ? `\uC120\uD0DD \uBC94\uC704: ${partialSummaryRange}`
                          : "\uC120\uD0DD \uD398\uC774\uC9C0 \uC694\uC57D \uACB0\uACFC"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveCurrentPartialSummary}
                        disabled={!String(partialSummary || "").trim()}
                        className="ghost-button text-xs text-emerald-100"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "52, 211, 153" }}
                      >
                        {"\uC800\uC7A5"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsSavedPartialSummaryOpen((prev) => !prev)}
                        className="ghost-button text-xs text-slate-200"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "148, 163, 184" }}
                      >
                        {isSavedPartialSummaryOpen
                          ? `\uC800\uC7A5 \uBAA9\uB85D \uB2EB\uAE30 (${normalizedSavedPartialSummaries.length})`
                          : `\uC800\uC7A5 \uBAA9\uB85D (${normalizedSavedPartialSummaries.length})`}
                      </button>
                    </div>
                  </div>

                  {isSavedPartialSummaryOpen && (
                    <div ref={partialSummaryListRef} className="mt-3 max-h-[240px] space-y-2 overflow-auto pr-1">
                      {normalizedSavedPartialSummaries.length === 0 ? (
                        <p className="rounded-lg border border-white/10 bg-slate-900/35 px-3 py-2 text-xs text-slate-400">
                          {"\uC800\uC7A5\uB41C \uBD80\uBD84 \uC694\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                        </p>
                      ) : (
                        normalizedSavedPartialSummaries.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/35 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-100">
                                {String(item.name || "").trim() || "\uBB34\uC81C"}
                              </p>
                              <p className="truncate text-[11px] text-slate-400">
                                {String(item.range || "").trim()
                                  ? `\uBC94\uC704: ${String(item.range || "").trim()}`
                                  : "\uBC94\uC704 \uC815\uBCF4 \uC5C6\uC74C"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLoadSavedPartialSummary(item.id)}
                                className="ghost-button text-[11px] text-emerald-100"
                                data-ghost-size="sm"
                                style={{ "--ghost-color": "52, 211, 153" }}
                              >
                                {"\uBD88\uB7EC\uC624\uAE30"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedPartialSummary(item.id)}
                                className="ghost-button text-[11px] text-slate-200"
                                data-ghost-size="sm"
                                style={{ "--ghost-color": "148, 163, 184" }}
                              >
                                {"\uC0AD\uC81C"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {partialSummary ? (
                    <SummaryCard summary={partialSummary} />
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">
                      {
                        "\uC544\uC9C1 \uD604\uC7AC \uBB38\uC11C\uC758 \uBD80\uBD84 \uC694\uC57D \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
                      }
                    </p>
                  )}

                </div>
              )}
            </div>
          )}
          {panelTab === "mockExam" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">총 모의고사</p>
                  <h3 className="text-lg font-semibold text-white">모의고사</h3>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
                  {mockExams.length}개
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={mockExamChapterSelectionInput}
                      onChange={(event) =>
                        setMockExamChapterSelectionInput(
                          normalizeChapterSelectionInput(event.target.value)
                        )
                      }
                      placeholder="챕터 범위 (예: 1-3,5)"
                      className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
                    />
                    <button
                      type="button"
                      onClick={handleCreateMockExam}
                      disabled={isGeneratingMockExam || isLoadingText || !selectedFileId}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      확인
                    </button>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                  <label className="block text-xs font-semibold text-slate-300">추가 요청</label>
                  <textarea
                    value={mockExamPromptAddonInput}
                    onChange={(event) => setMockExamPromptAddonInput(event.target.value)}
                    disabled={isGeneratingMockExam || isLoadingText}
                    placeholder="예: 계산형 문항 위주로, 헷갈리는 함정 선택지를 더 넣어줘, 정의 비교 문제를 포함해줘"
                    className="mt-2 min-h-[88px] w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
                  />
                  <p className="mt-2 text-xs text-slate-400">선택사항. 모의고사 생성 프롬프트에 함께 반영됩니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative" ref={mockExamMenuRef}>
                    <button
                      ref={mockExamMenuButtonRef}
                      type="button"
                      onClick={() => setIsMockExamMenuOpen((prev) => !prev)}
                      className="ghost-button text-sm text-emerald-100"
                      data-ghost-size="lg"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      모의고사 고르기
                    </button>
                    {isMockExamMenuOpen && (
                      <div className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
                        {isLoadingMockExams && (
                          <div className="px-4 py-3 text-xs text-slate-400">모의고사 불러오는 중...</div>
                        )}
                        {!isLoadingMockExams && mockExams.length === 0 && (
                          <div className="px-4 py-3 text-xs text-slate-400">저장된 모의고사가 없습니다.</div>
                        )}
                        {!isLoadingMockExams &&
                          mockExams.map((exam, idx) => {
                            const isActive = activeMockExam?.id === exam.id;
                            const displayTitle = formatMockExamTitle(exam, idx);
                            return (
                              <div
                                key={exam.id}
                                className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${
                                  idx === 0 ? "" : "border-t border-white/10"
                                } ${isActive ? "bg-emerald-500/10" : "hover:bg-white/5"}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMockExamId(exam.id);
                                    setShowMockExamAnswers(true);
                                    setIsMockExamMenuOpen(false);
                                  }}
                                  className="flex flex-1 flex-col items-start text-left"
                                >
                                  <span className="text-sm font-semibold text-slate-100">{displayTitle}</span>
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(exam.created_at).toLocaleString("ko-KR")}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteMockExam(exam.id);
                                    setIsMockExamMenuOpen(false);
                                  }}
                                  className="ghost-button text-[11px] text-slate-200"
                                  data-ghost-size="sm"
                                  style={{ "--ghost-color": "226, 232, 240" }}
                                >
                                  삭제
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                  {activeMockExam && (
                    <span className="text-xs text-slate-300">선택됨: {activeMockExamTitle}</span>
                  )}
                  <button
                    type="button"
                    onClick={handleCreateMockExam}
                    disabled={isGeneratingMockExam || isLoadingText || !selectedFileId}
                    className="ghost-button text-sm text-emerald-100"
                    data-ghost-size="lg"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    {isGeneratingMockExam ? "모의고사 생성 중..." : "모의고사 생성"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportMockExam(activeMockExam)}
                    disabled={!activeMockExam || mockExamOrderedItems.length === 0}
                    className="ghost-button text-sm text-indigo-100"
                    data-ghost-size="lg"
                    style={{ "--ghost-color": "99, 102, 241" }}
                  >
                    PDF 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMockExamAnswers((prev) => !prev)}
                    disabled={!activeMockExam}
                    className="ghost-button text-sm text-slate-200"
                    data-ghost-size="lg"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    {showMockExamAnswers ? "정답 숨기기" : "정답 보기"}
                  </button>
                </div>

                {mockExamStatus && <p className="text-sm text-emerald-200">{mockExamStatus}</p>}
                {mockExamError && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
                    {mockExamError}
                  </p>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100 overflow-auto">
                  {!activeMockExam && <p className="text-sm text-slate-400">선택된 모의고사가 없습니다.</p>}
                  {activeMockExam && (
                    <div className="space-y-6">
                      {mockExamOrderedItems.length === 0 && (
                        <p className="text-sm text-slate-400">모의고사 문항이 없습니다.</p>
                      )}
                      {mockExamOrderedItems.length > 0 && (
                        <div ref={mockExamPrintRef} className="space-y-10 flex flex-col items-center">
                          {mockExamPages.map((pageItems, pageIndex) => {
                            const isFourGrid = pageItems.length === 4;
                            const pageStart = pageIndex === 0 ? 1 : pageIndex === 1 ? 5 : 9;
                            return (
                              <section
                                key={`mock-exam-page-${pageIndex}`}
                                className="mock-exam-page relative mx-auto bg-white text-black shadow-sm"
                                style={{
                                  width: isNativePlatform ? "min(100%, 794px)" : "794px",
                                  minHeight: "1123px",
                                  padding: isNativePlatform ? "32px 24px 36px" : "44px 52px 48px",
                                }}
                              >
                                <div className="relative flex items-start justify-center">
                                  <h4 className="text-[18px] font-semibold">{activeMockExamTitle}</h4>
                                  <span className="absolute right-0 top-0 text-[18px] font-semibold">
                                    {pageIndex + 1}
                                  </span>
                                </div>
                                <div className="mt-3 border-t border-black" />
                                <div
                                  className={`relative mt-6 grid gap-8 ${
                                    isFourGrid ? "grid-cols-2 grid-rows-2" : "grid-cols-2"
                                  }`}
                                  style={{
                                    minHeight: "900px",
                                    gridAutoFlow: isFourGrid ? "column" : "row",
                                  }}
                                >
                                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/80" />
                                  {pageItems.map((item, idx) => {
                                    const columnIndex = isFourGrid ? Math.floor(idx / 2) : idx % 2;
                                    const paddingClass = columnIndex === 0 ? "pr-6" : "pl-6";
                                    return (
                                      <div key={`mock-exam-cell-${pageIndex}-${idx}`} className={paddingClass}>
                                        {renderMockExamItem(item, pageStart + idx)}
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}

                      {showMockExamAnswers && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                          <p className="text-sm font-semibold text-emerald-200">정답/해설</p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200">
                            {mockExamAnswerEntries.length === 0 && (
                              <p className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">
                                답지 데이터가 없습니다.
                              </p>
                            )}
                            {mockExamAnswerEntries.map((item, idx) => (
                              <div key={`mock-exam-answer-${idx}`} className="rounded-lg bg-white/5 px-3 py-2">
                                <p className="font-semibold text-emerald-200">
                                  {item.number}번 정답: {item.answer}
                                </p>
                                {item.explanation && (
                                  <div className="mt-1">
                                    <p className="font-semibold text-slate-100">해설</p>
                                    {renderMockRichText(item.explanation, "text-xs text-slate-200")}
                                  </div>
                                )}
                                {item.evidence && (
                                  <div className="mt-1">
                                    <p className="font-semibold text-slate-100">근거</p>
                                    {renderMockRichText(item.evidence, "text-xs text-slate-200")}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          
          {panelTab === "quiz" && (
            <>
              <ActionsPanel
                title="퀴즈 생성"
                stepLabel="퀴즈"
                hideSummary
                hideQuiz
                isLoadingQuiz={isLoadingQuiz}
                isLoadingSummary={isLoadingSummary}
                isLoadingText={isLoadingText}
                status={status}
                error={error}
                shortPreview={shortPreview}
                onRequestQuiz={requestQuestions}
                onRequestSummary={handleRequestSummary}
              />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200 shadow-lg shadow-black/20">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">챕터 범위</label>
                    <input
                      type="text"
                      value={quizChapterSelectionInput}
                      onChange={(event) =>
                        setQuizChapterSelectionInput(
                          normalizeChapterSelectionInput(event.target.value)
                        )
                      }
                      placeholder="예: 1-3,5"
                      className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">형식</label>
                    <input
                      type="text"
                      value={quizMixInput}
                      onChange={(event) => setQuizMixInput(event.target.value)}
                      disabled={isLoadingQuiz || isLoadingText}
                      placeholder="객관식-주관식 예: 4-1"
                      className={`mt-2 w-full rounded-xl border bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 ${
                        quizMixError
                          ? "border-red-400/45 focus:border-red-300/60"
                          : "border-white/15 focus:border-emerald-300/60"
                      }`}
                    />
                    <p className={`mt-2 text-xs ${quizMixError ? "text-red-200" : "text-slate-400"}`}>
                      {quizMixError || "객관식-주관식 (예: 4-1)"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300">추가 요청</label>
                    <textarea
                      value={quizPromptAddonInput}
                      onChange={(event) => setQuizPromptAddonInput(event.target.value)}
                      disabled={isLoadingQuiz || isLoadingText}
                      placeholder="예: 응용형 위주로, 개념 비교 문제를 더 넣어줘, 수능형 문제로 만들어줘, 단답형은 공식/용어 중심으로 만들어줘"
                      className="mt-2 min-h-[104px] w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
                    />
                    <p className="mt-2 text-xs text-slate-400">선택사항. 퀴즈 생성 프롬프트에 함께 반영됩니다.</p>
                  </div>
                </div>
              </div>

              <div className="hidden rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
                <div
                  ref={quizMixScrollRef}
                  onScroll={handleQuizMixScroll}
                  className="show-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
                >
                  {quizMixOptions.map((option, index) => {
                    const isActive =
                      quizMix?.multipleChoice === option.multipleChoice &&
                      quizMix?.shortAnswer === option.shortAnswer;
                    return (
                      <button
                        key={`mix-${option.multipleChoice}-${option.shortAnswer}`}
                        data-mix-index={index}
                        type="button"
                        onClick={() => setQuizMix(option)}
                        disabled={isLoadingQuiz || isLoadingText}
                        aria-pressed={isActive}
                        className={`w-full shrink-0 snap-center rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/60"
                            : "bg-white/5 text-slate-200 ring-white/10 hover:ring-emerald-300/40"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {quizSets.length > 0 && (
                <div className="space-y-4">
                  {quizSets.map((set, idx) => (
                    <QuizSection
                      key={set.id}
                      title={`퀴즈 세트 ${idx + 1}`}
                      questions={set.questions}
                      summary={null}
                      selectedChoices={set.selectedChoices}
                      revealedChoices={set.revealedChoices}
                      shortAnswerInput={set.shortAnswerInput}
                      shortAnswerResult={set.shortAnswerResult}
                      oxSelections={set.oxSelections}
                      oxExplanationOpen={set.oxExplanationOpen}
                      onSelectChoice={(qIdx, choiceIdx) => handleChoiceSelect(set.id, qIdx, choiceIdx)}
                      onShortAnswerChange={(idx, val) => handleShortAnswerChange(set.id, idx, val)}
                      onShortAnswerCheck={(idx) => handleShortAnswerCheck(set.id, idx)}
                      onOxSelect={(qIdx, choice) => handleQuizOxSelect(set.id, qIdx, choice)}
                      onToggleOxExplanation={(qIdx) =>
                        handleToggleQuizOxExplanation(set.id, qIdx)
                      }
                        onDeleteMultipleChoice={(qIdx) => deleteQuizItem?.(set.id, "multipleChoice", qIdx)}
                        onDeleteShortAnswer={(qIdx) => deleteQuizItem?.(set.id, "shortAnswer", qIdx)}
                    />
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-slate-300">
                현재 구성: 객관식 {quizMix?.multipleChoice ?? 0} / 주관식 {quizMix?.shortAnswer ?? 0}
                {` (총 ${(Number(quizMix?.multipleChoice) || 0) + (Number(quizMix?.shortAnswer) || 0)}문항)`}
              </p>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={requestQuestions}
                  disabled={
                    isLoadingQuiz ||
                    isLoadingText ||
                    Boolean(quizMixError) ||
                    ((Number(quizMix?.multipleChoice) || 0) +
                      (Number(quizMix?.shortAnswer) || 0) <=
                      0) ||
                    (isFreeTier && quizSets.length > 0)
                  }
                  title={
                    isFreeTier && quizSets.length > 0
                      ? "무료 티어에서는 퀴즈 세트를 1개만 생성할 수 없습니다."
                      : quizMixError || undefined
                  }
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingQuiz
                    ? "퀴즈 생성 중..."
                    : `퀴즈 생성하기 (총 ${(Number(quizMix?.multipleChoice) || 0) +
                        (Number(quizMix?.shortAnswer) || 0)}문항)`}
                </button>
                <button
                  type="button"
                  onClick={() => requestOxQuiz({ auto: false })}
                  disabled={isLoadingOx || isLoadingText}
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingOx ? "O/X 생성 중..." : "O/X 퀴즈 생성하기"}
                </button>
              </div>

              {oxItems && oxItems.length > 0 && (
                <div className="mt-4">
                  <OxSection
                    title="O/X 퀴즈"
                    items={oxItems}
                    selections={oxSelections}
                    explanationsOpen={oxExplanationOpen}
                    onSelect={handleOxSelect}
                    onToggleExplanation={(qIdx) =>
                      setOxExplanationOpen((prev) => ({
                        ...prev,
                        [qIdx]: !prev?.[qIdx],
                      }))
                    }
                  />
                </div>
              )}

              <div className="hidden mt-4 space-y-4 rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
                <div>
                  <p className="mt-1 text-sm text-slate-300">퀴즈 안에서 바로 O/X도 같이 풀 수 있습니다.</p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={oxChapterSelectionInput}
                      onChange={(event) =>
                        setOxChapterSelectionInput(
                          normalizeChapterSelectionInput(event.target.value)
                        )
                      }
                      placeholder="梨뺥꽣 踰붿쐞 (?? 1-3,5)"
                      className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
                    />
                    <button
                      type="button"
                      onClick={() => requestOxQuiz({ auto: false })}
                      disabled={isLoadingOx || isLoadingText}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      ?뺤씤
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => requestOxQuiz({ auto: false })}
                    disabled={isLoadingOx || isLoadingText}
                    className="ghost-button w-full text-sm text-emerald-100"
                    data-ghost-size="xl"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingOx ? "O/X ?앹꽦 以?.." : "O/X ?댁쫰 ?앹꽦"}
                  </button>
                  <button
                    type="button"
                    onClick={regenerateOxQuiz}
                    disabled={isLoadingOx || isLoadingText}
                    className="ghost-button w-full text-sm text-emerald-100"
                    data-ghost-size="xl"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingOx ? "O/X ?ъ깮??以?.." : "O/X ?댁쫰 ?ъ깮????뼱?곌린)"}
                  </button>
                </div>

                {oxItems && oxItems.length > 0 && (
                  <OxSection
                    title="O/X ?댁쫰"
                    items={oxItems}
                    selections={oxSelections}
                    explanationsOpen={oxExplanationOpen}
                    onSelect={handleOxSelect}
                    onToggleExplanation={(qIdx) =>
                      setOxExplanationOpen((prev) => ({
                        ...prev,
                        [qIdx]: !prev?.[qIdx],
                      }))
                    }
                  />
                )}
              </div>

              <div className="hidden mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={requestQuestions}
                  disabled={isLoadingQuiz || isLoadingText || (isFreeTier && quizSets.length > 0)}
                  title={
                    isFreeTier && quizSets.length > 0
                      ? "무료 티어에서는 퀴즈를 재생성할 수 없습니다."
                      : undefined
                  }
                  className="ghost-button w-full max-w-[320px] text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingQuiz
                    ? "퀴즈 생성 중.."
                    : `퀴즈 5문제 바로 생성하기 (객관식 ${quizMix?.multipleChoice ?? 0} / 주관식 ${quizMix?.shortAnswer ?? 0})`}
                </button>
                {!isFreeTier && (
                  <button
                    type="button"
                    onClick={regenerateQuiz}
                    disabled={isLoadingQuiz || isLoadingText}
                    className="ghost-button w-full text-sm text-emerald-100"
                    data-ghost-size="xl"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingQuiz
                      ? "퀴즈 재생성 중..."
                      : "퀴즈 재생성(덮어쓰기)"}
                  </button>
                )}
                {quizSets.length > 0 && (
                  <button
                    type="button"
                    onClick={deleteQuiz}
                    disabled={isLoadingQuiz || isLoadingText}
                    className="ghost-button w-full max-w-[320px] text-sm text-slate-100"
                    data-ghost-size="xl"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    퀴즈 전체 삭제
                  </button>
                )}
              </div>
            </>
          )}

{false && panelTab === "ox" && (
            <div className="space-y-4">
              <ActionsPanel
                title="O/X 퀴즈 생성"
                stepLabel="O/X"
                hideSummary
                hideQuiz
                isLoadingQuiz={isLoadingOx}
                isLoadingSummary={isLoadingSummary}
                isLoadingText={isLoadingText}
                status={status}
                error={error}
                shortPreview={shortPreview}
                onRequestQuiz={requestOxQuiz}
                onRequestSummary={handleRequestSummary}
              />

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={oxChapterSelectionInput}
                    onChange={(event) =>
                      setOxChapterSelectionInput(
                        normalizeChapterSelectionInput(event.target.value)
                      )
                    }
                    placeholder="챕터 범위 (예: 1-3,5)"
                    className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
                  />
                  <button
                    type="button"
                    onClick={() => requestOxQuiz({ auto: false })}
                    disabled={isLoadingOx || isLoadingText}
                    className="ghost-button text-xs text-emerald-100"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    확인
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => requestOxQuiz({ auto: false })}
                  disabled={isLoadingOx || isLoadingText}
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingOx ? "O/X 생성 중..." : "O/X 퀴즈 생성"}
                </button>
                <button
                  type="button"
                  onClick={regenerateOxQuiz}
                  disabled={isLoadingOx || isLoadingText}
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingOx ? "O/X 재생성 중..." : "O/X 퀴즈 재생성(덮어쓰기)"}
                </button>
              </div>

              {oxItems && oxItems.length > 0 && (
                <OxSection
                  title="O/X 퀴즈"
                  items={oxItems}
                  selections={oxSelections}
                  explanationsOpen={oxExplanationOpen}
                  onSelect={(qIdx, choice) =>
                    setOxSelections((prev) => ({
                      ...prev,
                      [qIdx]: choice,
                    }))
                  }
                  onToggleExplanation={(qIdx) =>
                    setOxExplanationOpen((prev) => ({
                      ...prev,
                      [qIdx]: !prev?.[qIdx],
                    }))
                  }
                />
              )}
            </div>
          )}

          {panelTab === "reviewNotes" && (
            <ReviewNotesPanel
              items={reviewNotes}
              availableSections={reviewNoteSections}
              sectionSelectionInput={reviewNotesSectionSelectionInput}
              onSectionSelectionChange={setReviewNotesSectionSelectionInput}
              sectionSelectionError={reviewNotesSectionError}
              examCramItems={examCramItems}
              examCramPendingCount={examCramPendingCount}
              examCramSectionError={examCramSectionError}
              examCramReferenceCounts={examCramReferenceCounts}
              examCramHasAnySource={examCramHasAnySource}
              examCramContent={examCramContent}
              examCramUpdatedAt={examCramUpdatedAt}
              examCramScopeLabel={examCramScopeLabel}
              examCramStatus={examCramStatus}
              examCramError={examCramError}
              onSubmitAttempt={handleReviewNoteAttempt}
              onDelete={handleDeleteReviewNote}
              onGenerateExamCram={handleGenerateExamCram}
              onCreateMockExam={handleCreateReviewNotesMockExam}
              isCreatingMockExam={isGeneratingMockExam}
              isGeneratingExamCram={isGeneratingExamCram}
            />
          )}

          {panelTab === "flashcards" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={flashcardChapterSelectionInput}
                    onChange={(event) =>
                      setFlashcardChapterSelectionInput(
                        normalizeChapterSelectionInput(event.target.value)
                      )
                    }
                    placeholder="챕터 범위 (예: 1-3,5)"
                    className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateFlashcards}
                    disabled={isGeneratingFlashcards || isLoadingText || !file || !selectedFileId}
                    className="ghost-button text-xs text-emerald-100"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    확인
                  </button>
                </div>
              </div>
              <FlashcardsPanel
                cards={flashcards}
                isLoading={isLoadingFlashcards}
                onAdd={handleAddFlashcard}
                onDelete={handleDeleteFlashcard}
                onGenerate={handleGenerateFlashcards}
                isGenerating={isGeneratingFlashcards}
                canGenerate={Boolean(file && selectedFileId && !isLoadingText)}
                status={flashcardStatus}
                error={flashcardError}
              />
            </div>
          )}
          {panelTab === "tutor" && (
            <AiTutorPanel
              messages={tutorMessages}
              isLoading={isTutorLoading}
              error={tutorError}
              canChat={!isTutorLoading}
              notice={tutorNotice}
              fileName={file?.name || ""}
              outputLanguage={outputLanguage}
              onSend={handleSendTutorMessage}
              onReset={handleResetTutor}
            />
          )}
        </div>
      </div>
    </section>
  );
}



import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import ActionsPanel from "../components/ActionsPanel";
import AiTutorPanel from "../components/AiTutorPanel";
import FlashcardsPanel from "../components/FlashcardsPanel";
import {
  MARKDOWN_MATH_REHYPE_PLUGINS,
  MARKDOWN_MATH_REMARK_PLUGINS,
  normalizeMathMarkdown,
} from "../components/MathMarkdown";
import EvidencePageLinks from "../components/EvidencePageLinks";
import OxSection from "../components/OxSection";
import PdfPreview from "../components/PdfPreview";
import QuizSection from "../components/QuizSection";
import ReviewNotesPanel from "../components/ReviewNotesPanel";
import SummaryCard from "../components/SummaryCard";
import { useQuizMixCarousel } from "../hooks/useQuizMixCarousel";
import { LETTERS } from "../constants";

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
  documentRemoteUrl,
  file,
  pendingDocumentOpen,
  pageInfo,
  currentPage,
  activeEvidenceHighlight,
  handlePageChange,
  handleDragStart,
  panelTab,
  setPanelTab,
  requestSummary,
  isLoadingSummary,
  isLoadingText,
  isFreeTier,
  isPdfDocument = true,
  summary,
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
  setChapterRangeError,
  handleAutoDetectChapterRanges,
  isDetectingChapterRanges,
  handleConfirmChapterRanges,
  handleExportSummaryPdf,
  isExportingSummary,
  status,
  error,
  summaryRef,
  jumpToEvidencePage,
  resolveSummaryEvidence,
  resolvePartialSummaryEvidence,
  resolveMockExamEvidence,
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
  quizMix,
  setQuizMix,
  quizSets,
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
  resolveQuizEvidence,
  handleChoiceSelect,
  handleShortAnswerChange,
  handleShortAnswerCheck,
  handleQuizOxSelect,
  handleToggleQuizOxExplanation,
  handleReviewNoteAttempt,
  handleToggleReviewNoteResolved,
  handleDeleteReviewNote,
  handleGenerateExamCram,
  handleCreateReviewNotesMockExam,
  regenerateQuiz,
  isLoadingOx,
  requestOxQuiz,
  oxChapterSelectionInput,
  setOxChapterSelectionInput,
  regenerateOxQuiz,
  oxItems,
  resolveOxEvidence,
  oxSelections,
  handleOxSelect,
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
  const quizMixOptionsLegacy = useMemo(
    () => [
      { multipleChoice: 5, shortAnswer: 0, label: "객관식 5 / 주관식 0" },
      { multipleChoice: 4, shortAnswer: 1, label: "객관식 4 / 주관식 1" },
      { multipleChoice: 3, shortAnswer: 2, label: "객관식 3 / 주관식 2" },
      { multipleChoice: 2, shortAnswer: 3, label: "객관식 2 / 주관식 3" },
      { multipleChoice: 1, shortAnswer: 4, label: "객관식 1 / 주관식 4" },
      { multipleChoice: 0, shortAnswer: 5, label: "객관식 0 / 주관식 5" },
    ],
    []
  );
  void quizMixOptionsLegacy;
  const quizMixOptions = useMemo(
    () =>
      Array.from({ length: 8 }, (_, multipleChoice) => multipleChoice)
        .reverse()
        .flatMap((multipleChoice) =>
          Array.from({ length: 8 - multipleChoice }, (_, shortAnswer) => shortAnswer)
            .reverse()
            .map((shortAnswer) => ({
              multipleChoice,
              shortAnswer,
              ox: 7 - multipleChoice - shortAnswer,
              label: `OX ${7 - multipleChoice - shortAnswer} / 객관식 ${multipleChoice} / 주관식 ${shortAnswer}`,
            }))
        ),
    []
  );
  const { quizMixScrollRef, handleQuizMixScroll } = useQuizMixCarousel({
    quizMix,
    quizMixOptions,
    setQuizMix,
  });
  const normalizeChapterSelectionInput = (value) => String(value || "").replace(/\s+/g, "");
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
          className={`mock-exam-rich-text summary-prose max-w-none min-w-0 break-words ${className}`}
        >
          <ReactMarkdown
            remarkPlugins={MARKDOWN_MATH_REMARK_PLUGINS}
            rehypePlugins={MARKDOWN_MATH_REHYPE_PLUGINS}
            components={mockMarkdownComponents}
          >
            {normalizeMathMarkdown(normalized)}
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
        <div key={`mock-exam-q-${number}`} className="min-w-0 space-y-2 overflow-hidden">
          <p className="text-[13px] font-semibold text-black">{number}.</p>
          {renderMockRichText(item?.prompt, "text-[13px] text-black")}
          {isOx && <p className="text-[12px] text-black/80">1) O  2) X</p>}
          {isShort && <p className="text-[12px] text-black/80">정답 ____________________</p>}
          {isMultiple && choices.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-black/85">
              {choices.slice(0, 4).map((choice, idx) => (
                <div key={`choice-${number}-${idx}`} className="mock-exam-choice min-w-0 flex gap-2 overflow-hidden">
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
        prompt: String(item?.prompt || "").trim(),
        evidencePages: Array.isArray(item?.evidencePages) ? item.evidencePages : [],
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
        prompt: String(item?.prompt || "").trim(),
        explanation: String(persisted?.explanation || item?.explanation || "").trim(),
        evidence: String(persisted?.evidence || item?.evidence || "").trim(),
        evidencePages: Array.isArray(item?.evidencePages) ? item.evidencePages : [],
      };
    });
  }, [activeMockExam?.payload?.answerSheet, mockExamOrderedItems]);
  const partialSummaryListRef = useRef(null);
  const normalizedSavedPartialSummaries = useMemo(
    () => (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []),
    [savedPartialSummaries]
  );
  const handleRequestSummary = useCallback(
    () => requestSummary({ force: true, replaceExisting: true }),
    [requestSummary]
  );

  useEffect(() => {
    if (!isSavedPartialSummaryOpen) return;
    partialSummaryListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [isSavedPartialSummaryOpen]);

  useEffect(() => {
    if (panelTab === "ox") {
      setPanelTab("quiz");
    }
  }, [panelTab, setPanelTab]);

  const panelItems = [
    { id: "summary", label: "\uC694\uC57D" },
    { id: "quiz", label: "\uD034\uC988" },
    { id: "reviewNotes", label: "\uC624\uB2F5\uB178\uD2B8" },
    { id: "mockExam", label: "\uBAA8\uC758\uACE0\uC0AC" },
    { id: "flashcards", label: "\uCE74\uB4DC" },
    { id: "tutor", label: "AI \uD29C\uD130" },
  ];
  const totalPageCount = Number(pageInfo?.total || pageInfo?.used || 0);
  const isPendingWithoutFile = Boolean(pendingDocumentOpen && !file);
  const pendingDocumentName = String(pendingDocumentOpen?.name || "문서").trim() || "문서";

  if (isPendingWithoutFile) {
    return (
      <section
        ref={detailContainerRef}
        className="app-safe-bottom flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
      >
        <div
          className="flex flex-col gap-3 lg:h-full lg:min-w-0 lg:flex-[0_0_var(--split-basis)] lg:overflow-y-auto"
          style={splitStyle}
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-lg shadow-black/20 lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75">
                  Document
                </p>
                <p className="truncate text-sm font-semibold text-white">{pendingDocumentName}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                준비 중
              </span>
            </div>
          </div>
          <div className="flex h-[58svh] min-h-[24rem] flex-1 items-center justify-center rounded-3xl border border-white/10 bg-slate-950/70 px-6 text-center shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0">
            <div className="max-w-sm">
              <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-2xl border border-emerald-300/20 bg-emerald-400/10" />
              <p className="text-base font-semibold text-white">{pendingDocumentName}</p>
              <p className="mt-2 text-sm text-slate-300">문서를 여는 중입니다.</p>
              <p className="mt-2 text-xs text-slate-400">
                원격 저장소에서 파일을 불러오고 미리보기를 준비하고 있습니다.
              </p>
            </div>
          </div>
        </div>

        <div className="hidden w-5 shrink-0 lg:block xl:w-6" />

        <div className="flex min-w-0 flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
          <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-5 shadow-lg shadow-black/30">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/75">
              Opening
            </p>
            <p className="mt-3 text-lg font-semibold text-white">{pendingDocumentName}</p>
            <p className="mt-2 text-sm text-slate-300">
              파일 준비가 끝나면 요약, 퀴즈, 오답노트 화면이 바로 표시됩니다.
            </p>
            <div className="mt-4 rounded-2xl border border-emerald-300/15 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100">
              잠시만 기다려 주세요. 첫 진입에서는 원격 저장소 다운로드 때문에 시간이 조금 걸릴 수 있습니다.
            </div>
          </div>
        </div>
      </section>
    );
  }


  return (
    <section
      ref={detailContainerRef}
      className="app-safe-bottom flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
    >
      <div
        className="flex flex-col gap-3 lg:h-full lg:min-w-0 lg:flex-[0_0_var(--split-basis)] lg:overflow-y-auto"
        style={splitStyle}
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-lg shadow-black/20 lg:hidden">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300/75">
                  Document
                </p>
                <p className="truncate text-sm font-semibold text-white">{file?.name || "Preview"}</p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                {currentPage} / {totalPageCount || "-"}
              </span>
            </div>
            <div className="flex items-center justify-end gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="ghost-button text-[11px] text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(Math.min(totalPageCount || currentPage, currentPage + 1))}
                disabled={currentPage >= totalPageCount}
                className="ghost-button text-[11px] text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                다음
              </button>
            </div>
          </div>
        </div>
        <PdfPreview
          pdfUrl={pdfUrl}
          documentUrl={documentRemoteUrl}
          file={file}
          pageInfo={pageInfo}
          currentPage={currentPage}
          evidenceHighlight={activeEvidenceHighlight}
          onPageChange={handlePageChange}
          previewText={extractedText}
          isLoadingText={isLoadingText}
        />
      </div>

      <div className="hidden w-5 shrink-0 cursor-col-resize items-stretch justify-center lg:flex xl:w-6">
        <button
          type="button"
          onPointerDown={handleDragStart}
          role="separator"
          aria-label="Resize panel"
          aria-orientation="vertical"
          className="group relative flex h-full w-full items-center justify-center bg-transparent outline-none"
          style={{ touchAction: "none" }}
        >
          <span className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-white/10 transition group-hover:bg-emerald-300/60 group-focus-visible:bg-emerald-300/60" />
          <span className="pointer-events-none relative z-10 flex h-16 w-4 items-center justify-center rounded-full border border-white/10 bg-slate-950/85 shadow-lg shadow-black/30 transition group-hover:border-emerald-300/40 group-hover:bg-slate-900/95 group-focus-visible:border-emerald-300/50 group-focus-visible:bg-slate-900/95">
            <span className="grid grid-cols-2 gap-1">
              <span className="h-1 w-1 rounded-full bg-slate-300/80" />
              <span className="h-1 w-1 rounded-full bg-slate-300/80" />
              <span className="h-1 w-1 rounded-full bg-slate-300/80" />
              <span className="h-1 w-1 rounded-full bg-slate-300/80" />
            </span>
          </span>
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
        <div className="detail-tab-strip mobile-tab-row flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/85 p-1.5 shadow-lg shadow-black/30 md:grid md:grid-cols-6 md:px-3 md:py-2">
          {panelItems.map((item) => {
            const active = panelTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPanelTab(item.id)}
                className="ghost-button min-w-[92px] shrink-0 text-xs text-slate-200 md:min-w-0 md:w-full md:text-sm"
                data-ghost-size="sm"
                data-ghost-active={active}
                style={{ "--ghost-color": active ? "52, 211, 153" : "148, 163, 184" }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="pb-20 pr-0 sm:flex-1 sm:overflow-auto sm:pb-2 sm:pr-1">
          {panelTab === "summary" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-200">요약</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleRequestSummary}
                    disabled={isLoadingSummary || isLoadingText}
                    className="ghost-button text-xs text-emerald-100"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingSummary ? "요약 생성 중..." : "요약 생성"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPdfDocument) return;
                      setIsPageSummaryOpen((prev) => !prev);
                      setPageSummaryError("");
                    }}
                    disabled={!isPdfDocument}
                    title={!isPdfDocument ? "PDF 문서에서만 사용할 수 있습니다." : undefined}
                    className="ghost-button text-xs text-slate-200"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    선택 페이지 요약
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
                    챕터 범위 설정
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
                    {isExportingSummary ? "PDF 내보내는 중..." : "요약 PDF 다운로드"}
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
                      <p className="text-sm font-semibold text-slate-100">선택 페이지 요약</p>
                      <p className="text-xs text-slate-400">
                        예: 1-3,5,8 (총 {pageInfo.total || pageInfo.used || "-"}p)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPageSummaryOpen(false)}
                      className="ghost-button text-[11px] text-slate-200"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "148, 163, 184" }}
                    >
                      닫기
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
                      placeholder="페이지 번호 또는 범위를 입력하세요"
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
                      {isPageSummaryLoading ? "생성 중..." : "선택 페이지 요약"}
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
                      }}
                      placeholder={`1:1-12\n2:13-24\n3:25-38`}
                      rows={4}
                      className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
                    />
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleAutoDetectChapterRanges}
                        disabled={!isPdfDocument || isLoadingSummary || isLoadingText || isDetectingChapterRanges}
                        title={!isPdfDocument ? "자동 목차 추출은 PDF에서만 지원됩니다." : undefined}
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
                    {!isPdfDocument && (
                      <p className="text-xs text-slate-400">
                        비PDF 문서에서는 자동 목차 추출 없이, 입력한 범위를 기준으로 텍스트를 논리적으로 분할해 사용합니다.
                      </p>
                    )}
                  </div>
                  {chapterRangeError && (
                    <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/30">
                      {chapterRangeError}
                    </p>
                  )}
                </div>
              )}
              {/*
                {false && (
                  <div className="instructor-emphasis-wheel-shell mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-2">
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
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <div
                          className="instructor-emphasis-wheel-focus pointer-events-none absolute inset-x-1 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-emerald-300/45 bg-emerald-400/10 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
                          style={{ height: `${emphasisWheelRowHeight}px` }}
                        />
                        <div className="instructor-emphasis-wheel-fade instructor-emphasis-wheel-fade-top pointer-events-none absolute inset-x-0 top-0 z-20 h-10 rounded-t-lg bg-gradient-to-b from-slate-950/95 to-transparent" />
                        <div className="instructor-emphasis-wheel-fade instructor-emphasis-wheel-fade-bottom pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 rounded-b-lg bg-gradient-to-t from-slate-950/95 to-transparent" />
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
                                  className={`instructor-emphasis-wheel-item mx-1 flex w-[calc(100%-0.5rem)] snap-center items-center gap-2 rounded-lg px-3 text-left text-xs transition ${
                                    isActive
                                      ? "is-active bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-300/60"
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
                        <button
                          type="button"
                          onClick={() => cycleActiveInstructorEmphasis(-1)}
                          disabled={normalizedSavedInstructorEmphases.length < 2}
                          className="ghost-button h-7 w-7 text-[11px] text-slate-200"
                          data-ghost-size="sm"
                          style={{ "--ghost-color": "148, 163, 184", padding: 0 }}
                          aria-label="이전 강조"
                        >
                          {"?"}
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
                          {"?"}
                        </button>
                      </div>
                    </div>
                )}
              */}
              {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">{"\uC694\uC57D \uC0DD\uC131 \uC911..."}</p>}
              {!isLoadingSummary && summary && (
                <div ref={summaryRef}>
                  <SummaryCard
                    summary={summary}
                    renderExportPages={isExportingSummary}
                  />
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
                    <SummaryCard
                      summary={partialSummary}
                    />
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
                    PDF 다운로드
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
                            const pageStart = pageIndex * 4 + 1;
                            return (
                              <section
                                key={`mock-exam-page-${pageIndex}`}
                                className="mock-exam-page relative mx-auto bg-white text-black shadow-sm"
                                style={{ width: "794px", minHeight: "1123px", padding: "44px 52px 48px" }}
                              >
                                <div className="relative flex items-start justify-center">
                                  <h4 className="text-[18px] font-semibold">{activeMockExamTitle}</h4>
                                  <span className="absolute right-0 top-0 text-[18px] font-semibold">
                                    {pageIndex + 1}
                                  </span>
                                </div>
                                <div className="mt-3 border-t border-black" />
                                <div
                                  className="relative mt-6 grid grid-cols-2 gap-8"
                                  style={{
                                    minHeight: "900px",
                                    gridAutoFlow: "row",
                                  }}
                                >
                                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/80" />
                                  {pageItems.map((item, idx) => {
                                    const columnIndex = idx % 2;
                                    const paddingClass = columnIndex === 0 ? "pr-6" : "pl-6";
                                    return (
                                      <div key={`mock-exam-cell-${pageIndex}-${idx}`} className={`${paddingClass} min-w-0`}>
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

                      {mockExamOrderedItems.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                          <p className="text-sm font-semibold text-emerald-200">문항별 근거 페이지</p>
                          <div className="mt-3 space-y-3">
                            {mockExamOrderedItems.map((item, idx) => (
                              <div key={`mock-exam-evidence-${idx}`} className="rounded-xl bg-white/5 px-3 py-3">
                                <p className="text-xs font-semibold text-emerald-100">{idx + 1}번 문항</p>
                                {item?.prompt && (
                                  <div className="mt-1">
                                    {renderMockRichText(item.prompt, "text-xs text-slate-200")}
                                  </div>
                                )}
                                <EvidencePageLinks
                                  requestKey={`mock:${idx}:${String(item?.prompt || "").trim()}`}
                                  onResolveEvidence={() => resolveMockExamEvidence?.(item)}
                                  onJumpToPage={jumpToEvidencePage}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {showMockExamAnswers && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                          <p className="text-sm font-semibold text-emerald-200">정답/해설</p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200">
                            {mockExamAnswerEntries.length === 0 && (
                              <p className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">
                                아직 답안 데이터가 없습니다.
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

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={quizChapterSelectionInput}
                    onChange={(event) =>
                      setQuizChapterSelectionInput(
                        normalizeChapterSelectionInput(event.target.value)
                      )
                    }
                    placeholder="챕터 범위 (예: 1-3,5)"
                    className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
                  />
                  <button
                    type="button"
                    onClick={requestQuestions}
                    disabled={isLoadingQuiz || isLoadingText || (isFreeTier && quizSets.length > 0)}
                    className="ghost-button text-xs text-emerald-100"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    확인
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-300">문항 비율</p>
                <div
                  ref={quizMixScrollRef}
                  onScroll={handleQuizMixScroll}
                  className="show-scrollbar mt-3 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth"
                >
                  {quizMixOptions.map((option, index) => {
                    const isActive =
                      quizMix?.multipleChoice === option.multipleChoice &&
                      quizMix?.shortAnswer === option.shortAnswer &&
                      quizMix?.ox === option.ox;
                    return (
                      <button
                        key={`mix-${option.multipleChoice}-${option.shortAnswer}-${option.ox}`}
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
                      onResolveEvidence={resolveQuizEvidence}
                      onJumpToEvidencePage={jumpToEvidencePage}
                      selectedChoices={set.selectedChoices}
                      revealedChoices={set.revealedChoices}
                      shortAnswerInput={set.shortAnswerInput}
                      shortAnswerResult={set.shortAnswerResult}
                      oxSelections={set.oxSelections}
                      oxExplanationOpen={set.oxExplanationOpen}
                      onSelectChoice={(qIdx, choiceIdx) => handleChoiceSelect(set.id, qIdx, choiceIdx)}
                      onShortAnswerChange={(idx, val) => handleShortAnswerChange(set.id, idx, val)}
                      onShortAnswerCheck={(idx) => handleShortAnswerCheck(set.id, idx)}
                      onOxSelect={(idx, choice) => handleQuizOxSelect(set.id, idx, choice)}
                      onToggleOxExplanation={(idx) => handleToggleQuizOxExplanation(set.id, idx)}
                    />
                  ))}
                </div>
              )}

              <p className="mt-4 text-xs text-slate-300">
                총 7문항으로 생성됩니다. 현재 비율: OX {quizMix?.ox ?? 0} / 객관식{" "}
                {quizMix?.multipleChoice ?? 0} / 주관식 {quizMix?.shortAnswer ?? 0}
              </p>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={requestQuestions}
                  disabled={isLoadingQuiz || isLoadingText || (isFreeTier && quizSets.length > 0)}
                  title={
                    isFreeTier && quizSets.length > 0
                      ? "무료 티어에서는 퀴즈를 재생성할 수 없습니다."
                      : undefined
                  }
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingQuiz
                    ? "퀴즈 생성 중..."
                    : `퀴즈 7문제 바로 생성하기 (OX ${quizMix?.ox ?? 0} / 객관식 ${
                        quizMix?.multipleChoice ?? 0
                      } / 주관식 ${quizMix?.shortAnswer ?? 0})`}
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
                      : "퀴즈 재생성 (덮어쓰기)"}
                  </button>
                )}
              </div>
            </>
          )}

{panelTab === "ox" && (
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
                  {isLoadingOx ? "O/X 재생성 중..." : "O/X 퀴즈 재생성 (덮어쓰기)"}
                </button>
              </div>

              {oxItems && oxItems.length > 0 && (
                <OxSection
                  title="O/X 퀴즈"
                  items={oxItems}
                  onResolveEvidence={resolveOxEvidence}
                  onJumpToEvidencePage={jumpToEvidencePage}
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
              onJumpToEvidencePage={jumpToEvidencePage}
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
                canGenerate={Boolean(file && selectedFileId && extractedText && !isLoadingText)}
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
              canChat={!tutorNotice}
              notice={tutorNotice}
              fileName={file?.name || ""}
              onSend={handleSendTutorMessage}
              onReset={handleResetTutor}
            />
          )}
        </div>
      </div>
    </section>
  );
}


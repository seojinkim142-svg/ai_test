import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import ActionsPanel from "../components/ActionsPanel";
import AiTutorPanel from "../components/AiTutorPanel";
import FlashcardsPanel from "../components/FlashcardsPanel";
import MockExamPanel from "../components/MockExamPanel";
import PdfPreview from "../components/PdfPreview";
import QuizPanel from "../components/QuizPanel";
import ReviewNotesPanel from "../components/ReviewNotesPanel";
import SummaryCard from "../components/SummaryCard";
import MindMapView from "../components/MindMapView";
import TopicStructurePanel from "../components/TopicStructurePanel";
import { getDetailCopy } from "../utils/detailCopy";

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
  requestMindMap,
  mindmapData,
  isLoadingMindmap,
  onJumpToSummaryPage,
  isLoadingSummary,
  isLoadingText,
  previewText,
  isFreeTier,
  hasReachedSummaryLimit = false,
  hasReachedQuizLimit = false,
  hasReachedOxLimit = false,
  hasReachedFlashcardLimit = false,
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
  quizDifficulty,
  setQuizDifficulty,
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
  handleUpdateFlashcard,
  handleSaveFlashcardScore,
  flashcardScores,
  handleGenerateFlashcards,
  handleGenerateVocabularyFlashcards,
  isVocabularyFile = false,
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
  folderTutorMode = false,
  onToggleFolderTutorMode,
  canUseFolderTutorMode = false,
  folderName = "",
  topicStructure,
  isLoadingTopicStructure,
  topicStructureError,
  onRequestTopicStructure,
  onExplainConcept,
  // 폴더 통합 퀴즈
  isFolderMode = false,
  currentFolderInfo = null,
  folderQuizQuestions,
  isLoadingFolderQuiz = false,
  folderQuizError = "",
  folderSelectedChoices,
  folderRevealedChoices,
  folderShortAnswerInput,
  folderShortAnswerResult,
  onRequestFolderQuiz,
  onFolderSelectChoice,
  onFolderShortAnswerChange,
  onFolderShortAnswerCheck,
}) {
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const copy = useMemo(() => getDetailCopy(outputLanguage), [outputLanguage]);
  const [summaryViewMode, setSummaryViewMode] = useState("text"); // "text" | "mindmap"
  const [pendingTopicExamCards, setPendingTopicExamCards] = useState(null);
  const detailTabs = useMemo(
    () => [
      { id: "topicStructure", label: copy.tabs.topicStructure },
      { id: "summary", label: copy.tabs.summary },
      { id: "quiz", label: copy.tabs.quiz },
      { id: "reviewNotes", label: copy.tabs.reviewNotes },
      { id: "mockExam", label: copy.tabs.mockExam },
      { id: "flashcards", label: copy.tabs.flashcards },
      { id: "tutor", label: copy.tabs.tutor },
    ],
    [copy]
  );
  const normalizeChapterSelectionInput = (value) => String(value || "").replace(/\s+/g, "");
  const truncateText = (value, maxLength = 30) => {
    const normalized = String(value || "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
  };
  const mindmapContainerRef = useRef(null);
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
  const summaryLimitTitle = hasReachedSummaryLimit
    ? "무료 플랜에서는 파일당 요약을 1회만 생성할 수 있습니다."
    : undefined;
  const quizLimitTitle = hasReachedQuizLimit
    ? "무료 플랜에서는 파일당 퀴즈를 1회만 생성할 수 있습니다."
    : undefined;
  const oxLimitTitle = hasReachedOxLimit
    ? "무료 플랜에서는 파일당 O/X를 1회만 생성할 수 있습니다."
    : undefined;
  const flashcardLimitTitle = hasReachedFlashcardLimit
    ? "무료 플랜에서는 파일당 AI 플래시카드를 1회만 생성할 수 있습니다."
    : undefined;

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

  if (isFolderMode) {
    return (
      <section
        ref={detailContainerRef}
        className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
      >
        {/* 왼쪽: 폴더 정보 */}
        <div
          className="flex flex-col gap-3 lg:h-full lg:flex-[0_0_var(--split-basis)] lg:overflow-y-auto"
          style={splitStyle}
        >
          <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300 text-lg">📁</div>
              <div>
                <p className="text-xs text-emerald-400 font-medium">폴더 통합 학습</p>
                <p className="text-base font-bold text-white">{currentFolderInfo?.folderName}</p>
              </div>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex flex-col gap-1.5">
              {(currentFolderInfo?.files || []).map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                  <span className="text-[10px] text-slate-500">📄</span>
                  <span className="truncate text-xs text-slate-300">{f.name}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">총 {currentFolderInfo?.files?.length || 0}개 파일의 내용으로 퀴즈가 생성됩니다.</p>
          </div>
        </div>

        {resizeHandle}

        {/* 오른쪽: 통합 퀴즈 */}
        <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
          <div className="flex flex-col gap-4 lg:overflow-y-auto lg:h-full pb-4">
            {isLoadingFolderQuiz ? (
              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-8 shadow-2xl shadow-black/30 flex flex-col items-center gap-3">
                <svg className="animate-spin h-6 w-6 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm text-slate-300">폴더 전체 내용 분석 중...</p>
                <p className="text-xs text-slate-500">여러 파일을 합쳐서 통합 퀴즈를 만들고 있습니다</p>
              </div>
            ) : folderQuizError ? (
              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30">
                <p className="text-red-400 text-sm mb-3">{folderQuizError}</p>
                <button
                  type="button"
                  onClick={onRequestFolderQuiz}
                  className="rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 transition-colors"
                >다시 시도</button>
              </div>
            ) : folderQuizQuestions ? (
              <QuizSection
                title={`${currentFolderInfo?.folderName || "폴더"} 통합 퀴즈`}
                questions={folderQuizQuestions}
                selectedChoices={folderSelectedChoices}
                revealedChoices={folderRevealedChoices}
                shortAnswerInput={folderShortAnswerInput}
                shortAnswerResult={folderShortAnswerResult}
                onSelectChoice={onFolderSelectChoice}
                onShortAnswerChange={onFolderShortAnswerChange}
                onShortAnswerCheck={onFolderShortAnswerCheck}
              />
            ) : (
              <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-8 shadow-2xl shadow-black/30 flex flex-col items-center gap-4 text-center">
                <p className="text-slate-400 text-sm">통합 퀴즈를 생성합니다.</p>
                <button
                  type="button"
                  onClick={onRequestFolderQuiz}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-5 py-2.5 transition-colors"
                >퀴즈 생성 시작</button>
              </div>
            )}
            {folderQuizQuestions && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onRequestFolderQuiz}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
                >다시 생성</button>
              </div>
            )}
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
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/30 sm:grid-cols-7 lg:sticky lg:top-0 lg:z-10 lg:backdrop-blur">
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
          {panelTab === "topicStructure" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-0 shadow-lg shadow-black/30">
              <TopicStructurePanel
                topicStructure={topicStructure}
                isLoading={isLoadingTopicStructure}
                error={topicStructureError}
                onRequestGenerate={() => onRequestTopicStructure({ force: true })}
                onExplainConcept={onExplainConcept}
                isVocabularyMode={isVocabularyFile}
                onStartQuiz={(topic) => {
                  if (topic?.title) setQuizPromptAddonInput(topic.title + " 위주로");
                  setPanelTab("quiz");
                }}
                onStartVocabExam={(topic) => {
                  const concepts = (topic?.keyConcepts || []).map((c) => c.toLowerCase());
                  const matched = (flashcards || []).filter((card) => {
                    const front = String(card.front || "").toLowerCase();
                    return concepts.some((c) => front.includes(c) || c.includes(front));
                  });
                  const examCards = matched.length > 0 ? matched : flashcards || [];
                  setPendingTopicExamCards({ cards: examCards, topicTitle: topic?.title || "" });
                  setPanelTab("flashcards");
                }}
              />
            </div>
          )}
          {panelTab === "summary" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <p className="text-sm font-semibold text-emerald-200">{copy.summary.title}</p>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    onClick={handleRequestSummary}
                    disabled={isLoadingSummary || isLoadingText || hasReachedSummaryLimit}
                    title={summaryLimitTitle}
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
                  <button
                    type="button"
                    disabled={!summary || isLoadingSummary}
                    title={!summary ? "요약을 먼저 생성해 주세요" : undefined}
                    onClick={() => {
                      const next = summaryViewMode === "mindmap" ? "text" : "mindmap";
                      setSummaryViewMode(next);
                      if (next === "mindmap" && !mindmapData && !isLoadingMindmap) {
                        requestMindMap?.();
                      }
                    }}
                    className="ghost-button text-xs"
                    style={{ "--ghost-color": summaryViewMode === "mindmap" ? "52, 211, 153" : "148, 163, 184" }}
                  >
                    {isLoadingMindmap && summaryViewMode === "mindmap"
                      ? "생성 중..."
                      : summaryViewMode === "mindmap"
                      ? "텍스트 보기"
                      : "마인드맵"}
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
              {!isLoadingSummary && summary && summaryViewMode === "mindmap" && (
                <div className="mt-3">
                  {isLoadingMindmap ? (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                      마인드맵 생성 중...
                    </div>
                  ) : (
                    <>
                      <MindMapView
                        mindmapData={mindmapData}
                        summary={summary}
                        containerRef={mindmapContainerRef}
                        onJumpToPage={typeof onJumpToSummaryPage === "function"
                          ? (pageNumber, ...rest) => { onJumpToSummaryPage(pageNumber, ...rest); }
                          : undefined}
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!mindmapContainerRef.current) return;
                            const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
                              import("html2canvas"),
                              import("jspdf"),
                            ]);
                            const el = mindmapContainerRef.current;
                            const canvas = await html2canvas(el, { useCORS: true, scale: 4, logging: false });
                            const imgData = canvas.toDataURL("image/png");
                            const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 4, canvas.height / 4] });
                            pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 4, canvas.height / 4);
                            pdf.save("mindmap.pdf");
                          }}
                          className="ghost-button text-[11px] text-slate-400"
                          data-ghost-size="sm"
                          style={{ "--ghost-color": "148, 163, 184" }}
                        >
                          ↓ 저장
                        </button>
                        <button
                          type="button"
                          onClick={() => requestMindMap?.({ force: true })}
                          className="ghost-button text-[11px] text-slate-400"
                          data-ghost-size="sm"
                          style={{ "--ghost-color": "148, 163, 184" }}
                        >
                          ↺ 재생성
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!isLoadingSummary && summary && summaryViewMode === "text" && (
                <div ref={summaryRef}>
                  <SummaryCard
                    summary={summary}
                    renderExportPages={isExportingSummary}
                    onJumpToEvidencePage={typeof onJumpToSummaryPage === "function"
                      ? (pageNumber, ...rest) => {
                          onJumpToSummaryPage(pageNumber, ...rest);
                          // 모바일: PDF 패널이 화면 위에 있으므로 스크롤 맨 위로 이동
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      : undefined}
                    onAskTutor={typeof handleSendTutorMessage === "function" && typeof setPanelTab === "function"
                      ? (selectedText) => {
                          setPanelTab("tutor");
                          handleSendTutorMessage(`다음 내용에 대해 자세히 설명해줘:\n\n"${selectedText}"`);
                        }
                      : undefined}
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
            <MockExamPanel
              mockExams={mockExams}
              mockExamMenuRef={mockExamMenuRef}
              mockExamMenuButtonRef={mockExamMenuButtonRef}
              isMockExamMenuOpen={isMockExamMenuOpen}
              setIsMockExamMenuOpen={setIsMockExamMenuOpen}
              isLoadingMockExams={isLoadingMockExams}
              activeMockExam={activeMockExam}
              activeMockExamTitle={activeMockExamTitle}
              formatMockExamTitle={formatMockExamTitle}
              handleDeleteMockExam={handleDeleteMockExam}
              handleCreateMockExam={handleCreateMockExam}
              mockExamChapterSelectionInput={mockExamChapterSelectionInput}
              setMockExamChapterSelectionInput={setMockExamChapterSelectionInput}
              mockExamPromptAddonInput={mockExamPromptAddonInput}
              setMockExamPromptAddonInput={setMockExamPromptAddonInput}
              isGeneratingMockExam={isGeneratingMockExam}
              selectedFileId={selectedFileId}
              isLoadingText={isLoadingText}
              handleExportMockExam={handleExportMockExam}
              mockExamOrderedItems={mockExamOrderedItems}
              mockExamPrintRef={mockExamPrintRef}
              mockExamPages={mockExamPages}
              showMockExamAnswers={showMockExamAnswers}
              setShowMockExamAnswers={setShowMockExamAnswers}
              mockExamStatus={mockExamStatus}
              mockExamError={mockExamError}
              setActiveMockExamId={setActiveMockExamId}
            />
          )}
          {panelTab === "quiz" && (
            <QuizPanel
              isLoadingQuiz={isLoadingQuiz}
              isLoadingSummary={isLoadingSummary}
              isLoadingText={isLoadingText}
              status={status}
              error={error}
              shortPreview={shortPreview}
              requestQuestions={requestQuestions}
              handleRequestSummary={handleRequestSummary}
              quizChapterSelectionInput={quizChapterSelectionInput}
              setQuizChapterSelectionInput={setQuizChapterSelectionInput}
              quizPromptAddonInput={quizPromptAddonInput}
              setQuizPromptAddonInput={setQuizPromptAddonInput}
              quizDifficulty={quizDifficulty}
              setQuizDifficulty={setQuizDifficulty}
              quizMixInput={quizMixInput}
              setQuizMixInput={setQuizMixInput}
              quizMix={quizMix}
              setQuizMix={setQuizMix}
              quizMixError={quizMixError}
              quizSets={quizSets}
              handleChoiceSelect={handleChoiceSelect}
              handleShortAnswerChange={handleShortAnswerChange}
              handleShortAnswerCheck={handleShortAnswerCheck}
              handleQuizOxSelect={handleQuizOxSelect}
              handleToggleQuizOxExplanation={handleToggleQuizOxExplanation}
              deleteQuizItem={deleteQuizItem}
              oxItems={oxItems}
              oxSelections={oxSelections}
              handleOxSelect={handleOxSelect}
              setOxExplanationOpen={setOxExplanationOpen}
              oxExplanationOpen={oxExplanationOpen}
              requestOxQuiz={requestOxQuiz}
              isLoadingOx={isLoadingOx}
              hasReachedOxLimit={hasReachedOxLimit}
              oxLimitTitle={oxLimitTitle}
              hasReachedQuizLimit={hasReachedQuizLimit}
              quizLimitTitle={quizLimitTitle}
            />
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
              {isVocabularyFile ? (
                <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded-full bg-violet-500 px-2.5 py-0.5 text-[11px] font-bold text-white">단어장</span>
                    <p className="text-sm text-slate-300">단어-뜻 쌍을 자동으로 추출해 플래시카드를 만들어요</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateVocabularyFlashcards}
                    disabled={isGeneratingFlashcards || isLoadingText || !file || !selectedFileId}
                    className="ghost-button w-full text-sm text-violet-200"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "167, 139, 250" }}
                  >
                    {isGeneratingFlashcards ? "단어 추출 중..." : "단어 자동 추출"}
                  </button>
                  <p className="mt-2 text-xs text-slate-400">일반 AI 플래시카드 생성도 아래에서 계속 사용할 수 있어요</p>
                </div>
              ) : (
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
                      disabled={
                        isGeneratingFlashcards ||
                        isLoadingText ||
                        !file ||
                        !selectedFileId ||
                        hasReachedFlashcardLimit
                      }
                      title={flashcardLimitTitle}
                      className="ghost-button text-xs text-emerald-100"
                      data-ghost-size="sm"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      확인
                    </button>
                  </div>
                </div>
              )}
              <FlashcardsPanel
                cards={flashcards}
                isLoading={isLoadingFlashcards}
                onAdd={handleAddFlashcard}
                onDelete={handleDeleteFlashcard}
                onUpdate={handleUpdateFlashcard}
                onSaveScore={handleSaveFlashcardScore}
                savedScores={flashcardScores}
                onGenerate={handleGenerateFlashcards}
                isGenerating={isGeneratingFlashcards}
                canGenerate={Boolean(file && selectedFileId && !isLoadingText) && !hasReachedFlashcardLimit}
                generateButtonTitle={flashcardLimitTitle}
                status={flashcardStatus}
                error={flashcardError}
                isVocabularyMode={isVocabularyFile}
                pendingTopicExam={pendingTopicExamCards}
                onPendingTopicExamConsumed={() => setPendingTopicExamCards(null)}
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
              folderMode={folderTutorMode}
              folderName={folderName}
              canUseFolderMode={canUseFolderTutorMode}
              onToggleFolderMode={onToggleFolderTutorMode}
            />
          )}
        </div>
      </div>
    </section>
  );
}



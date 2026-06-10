import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import ActionsPanel from "../components/ActionsPanel";
import AiTutorPanel from "../components/AiTutorPanel";
import FlashcardsPanel from "../components/FlashcardsPanel";
import VocabQuizPanel from "../components/VocabQuizPanel";
import MockExamPanel from "../components/MockExamPanel";
import PdfPreview from "../components/PdfPreview";
import QuizPanel from "../components/QuizPanel";
import ReviewNotesPanel from "../components/ReviewNotesPanel";
import SummaryCard from "../components/SummaryCard";
import MindMapView from "../components/MindMapView";
import TopicStructurePanel from "../components/TopicStructurePanel";
import PredictedScoreBadge from "../components/diagnostic/PredictedScoreBadge";
import ChapterRangeSection from "../components/summary/ChapterRangeSection";
import InstructorEmphasisSection from "../components/summary/InstructorEmphasisSection";
import PartialSummarySection from "../components/summary/PartialSummarySection";
import { getDetailCopy } from "../utils/detailCopy";
import {
  useDocumentStore,
  useSummaryStore,
  useQuizStore,
  useFlashcardStore,
  useMockExamStore,
  useTutorStore,
  useUiStore,
} from "../stores";
import { parseQuizMixInput } from "../utils/appStateHelpers";

export default function DetailPage({
  // Layout / navigation
  detailContainerRef,
  splitStyle,
  documentUrl,
  pendingDocumentOpen,
  handlePageChange,
  handleDragStart,
  outputLanguage = "ko",
  // Summary callbacks
  requestSummary,
  requestMindMap,
  mindmapData,
  isLoadingMindmap,
  onJumpToSummaryPage,
  diagnosticResult,
  onRetakeDiagnostic,
  isFreeTier,
  hasReachedSummaryLimit = false,
  hasReachedQuizLimit = false,
  hasReachedOxLimit = false,
  hasReachedFlashcardLimit = false,
  handleSaveInstructorEmphasis,
  handleSelectInstructorEmphasis,
  handleDeleteInstructorEmphasis,
  cycleActiveInstructorEmphasis,
  handleSaveCurrentPartialSummary,
  handleLoadSavedPartialSummary,
  handleDeleteSavedPartialSummary,
  handleSummaryByPages,
  handleAutoDetectChapterRanges,
  handleConfirmChapterRanges,
  handleExportSummaryPdf,
  summaryRef,
  // MockExam callbacks
  mockExamMenuRef,
  mockExamMenuButtonRef,
  activeMockExam,
  activeMockExamTitle,
  formatMockExamTitle,
  handleDeleteMockExam,
  handleCreateMockExam,
  handleExportMockExam,
  mockExamOrderedItems,
  mockExamPrintRef,
  mockExamPages,
  // Quiz callbacks
  shortPreview,
  requestQuestions,
  handleChoiceSelect,
  handleShortAnswerChange,
  handleShortAnswerCheck,
  handleQuizOxSelect,
  handleToggleQuizOxExplanation,
  regenerateQuiz,
  deleteQuiz,
  deleteQuizItem,
  // ReviewNotes callbacks
  reviewNoteSections,
  reviewNotesSectionSelectionInput,
  setReviewNotesSectionSelectionInput,
  reviewNotesSectionError,
  examCramItems,
  examCramPendingCount,
  examCramSectionError,
  examCramReferenceCounts,
  examCramHasAnySource,
  handleReviewNoteAttempt,
  handleDeleteReviewNote,
  handleGenerateExamCram,
  handleCreateReviewNotesMockExam,
  // OX callbacks
  requestOxQuiz,
  regenerateOxQuiz,
  handleOxSelect,
  // Flashcard callbacks
  handleAddFlashcard,
  handleDeleteFlashcard,
  handleDeleteAllFlashcards,
  handleUpdateFlashcard,
  handleUpdateFlashcardSrs,
  handleDeduplicateFlashcards,
  handleSaveFlashcardScore,
  handleSaveVocabQuizScore,
  handleGenerateFlashcards,
  handleGenerateVocabularyFlashcards,
  handleReextractVocabulary,
  handleRegenerateFlashcards,
  isVocabularyFile = false,
  // Tutor callbacks
  tutorNotice,
  handleSendTutorMessage,
  handleResetTutor,
  onToggleFolderTutorMode,
  canUseFolderTutorMode = false,
  folderName = "",
  // Topic structure callbacks
  onRequestTopicStructure,
  onExplainConcept,
  // Folder mode
  isFolderMode = false,
  currentFolderInfo = null,
  onRequestFolderQuiz,
  onFolderSelectChoice,
  onFolderShortAnswerChange,
  onFolderShortAnswerCheck,
}) {
  // ── Store subscriptions ──────────────────────────────────────────────────────
  const {
    pdfUrl,
    file,
    pageInfo,
    currentPage,
    status,
    error,
    isLoadingText,
    previewText,
    extractedText,
    selectedFileId,
  } = useDocumentStore();

  const {
    summary,
    isLoadingSummary,
    isExportingSummary,
    isPageSummaryOpen,
    setIsPageSummaryOpen,
    pageSummaryInput,
    setPageSummaryInput,
    pageSummaryError,
    setPageSummaryError,
    isPageSummaryLoading,
    chapterRangeError,
    setChapterRangeError,
    isChapterRangeOpen,
    setIsChapterRangeOpen,
    topicStructure,
    isLoadingTopicStructure,
    topicStructureError,
  } = useSummaryStore();

  const {
    isLoadingQuiz,
    quizMixInput,
    setQuizMixInput,
    quizChapterSelectionInput,
    setQuizChapterSelectionInput,
    quizPromptAddonInput,
    setQuizPromptAddonInput,
    quizDifficulty,
    setQuizDifficulty,
    quizSets,
    oxItems,
    oxSelections,
    setOxSelections,
    oxExplanationOpen,
    setOxExplanationOpen,
    isLoadingOx,
    oxChapterSelectionInput,
    setOxChapterSelectionInput,
  } = useQuizStore();

  const {
    flashcards,
    isLoadingFlashcards,
    isGeneratingFlashcards,
    flashcardStatus,
    flashcardError,
    flashcardScores,
    vocabQuizScores,
    flashcardChapterSelectionInput,
    setFlashcardChapterSelectionInput,
    flashcardGenerateCount,
    setFlashcardGenerateCount,
  } = useFlashcardStore();

  const {
    mockExams,
    isLoadingMockExams,
    isGeneratingMockExam,
    mockExamStatus,
    mockExamError,
    activeMockExamId,
    setActiveMockExamId,
    showMockExamAnswers,
    setShowMockExamAnswers,
    isMockExamMenuOpen,
    setIsMockExamMenuOpen,
    mockExamChapterSelectionInput,
    setMockExamChapterSelectionInput,
    mockExamPromptAddonInput,
    setMockExamPromptAddonInput,
    examCramContent,
    examCramUpdatedAt,
    examCramScopeLabel,
    isGeneratingExamCram,
    examCramStatus,
    examCramError,
    reviewNotes,
  } = useMockExamStore();

  const {
    tutorMessages,
    isTutorLoading,
    tutorError,
  } = useTutorStore();

  const {
    panelTab,
    setPanelTab,
    folderTutorMode,
    folderQuizQuestions,
    isLoadingFolderQuiz,
    folderQuizError,
    folderSelectedChoices,
    folderRevealedChoices,
    folderShortAnswerInput,
    folderShortAnswerResult,
  } = useUiStore();

  // Derived state
  const parsedQuizMix = useMemo(() => parseQuizMixInput(quizMixInput), [quizMixInput]);
  const quizMix = parsedQuizMix.mix;
  const quizMixError = parsedQuizMix.error;
  const setQuizMix = useCallback((nextMix) => {
    const nextMultipleChoice = Math.max(0, Number(nextMix?.multipleChoice) || 0);
    const nextShortAnswer = Math.max(0, Number(nextMix?.shortAnswer) || 0);
    setQuizMixInput(`${nextMultipleChoice}-${nextShortAnswer}`);
  }, [setQuizMixInput]);
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const copy = useMemo(() => getDetailCopy(outputLanguage), [outputLanguage]);
  const [summaryViewMode, setSummaryViewMode] = useState("text"); // "text" | "mindmap"
  const [pendingTopicExamCards, setPendingTopicExamCards] = useState(null);
  const detailTabs = useMemo(
    () => isVocabularyFile
      ? [
          { id: "flashcards", label: copy.tabs.flashcards },
          { id: "vocabQuiz", label: copy.tabs.vocabQuiz },
        ]
      : [
          { id: "topicStructure", label: copy.tabs.topicStructure },
          { id: "summary", label: copy.tabs.summary },
          { id: "quiz", label: copy.tabs.quiz },
          { id: "reviewNotes", label: copy.tabs.reviewNotes },
          { id: "mockExam", label: copy.tabs.mockExam },
          { id: "flashcards", label: copy.tabs.flashcards },
          { id: "tutor", label: copy.tabs.tutor },
        ],
    [copy, isVocabularyFile]
  );
  const normalizeChapterSelectionInput = (value) => String(value || "").replace(/\s+/g, "");
  const mindmapContainerRef = useRef(null);
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
    if (isVocabularyFile) {
      setPanelTab("flashcards");
    }
  }, [isVocabularyFile]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <PredictedScoreBadge
          result={diagnosticResult}
          onRetake={onRetakeDiagnostic}
          canRetake={Boolean(String(extractedText || "").trim())}
        />
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
              <ChapterRangeSection
                isLoadingSummary={isLoadingSummary}
                isLoadingText={isLoadingText}
                onAutoDetect={handleAutoDetectChapterRanges}
                onConfirm={handleConfirmChapterRanges}
              />
              <InstructorEmphasisSection
                onSave={handleSaveInstructorEmphasis}
                onDelete={handleDeleteInstructorEmphasis}
                onSelect={handleSelectInstructorEmphasis}
                onCycle={cycleActiveInstructorEmphasis}
              />
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
              {!isLoadingSummary && (
                <PartialSummarySection
                  onSave={handleSaveCurrentPartialSummary}
                  onLoad={handleLoadSavedPartialSummary}
                  onDelete={handleDeleteSavedPartialSummary}
                />
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
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-slate-400 whitespace-nowrap">개수</span>
                      <select
                        value={flashcardGenerateCount}
                        onChange={(e) => setFlashcardGenerateCount?.(Number(e.target.value))}
                        className="rounded-xl border border-white/15 bg-slate-950/60 px-2 py-2 text-sm text-white outline-none transition focus:border-emerald-300/60"
                      >
                        {[5, 8, 10, 15, 20].map((n) => (
                          <option key={n} value={n}>{n}개</option>
                        ))}
                      </select>
                    </div>
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
                      className="ghost-button text-xs text-emerald-100 shrink-0"
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
                onDeleteAll={handleDeleteAllFlashcards}
                onUpdate={handleUpdateFlashcard}
                onUpdateSrs={handleUpdateFlashcardSrs}
                onDeduplicate={handleDeduplicateFlashcards}
                onSaveScore={handleSaveFlashcardScore}
                savedScores={flashcardScores}
                onGenerate={isVocabularyFile ? handleGenerateVocabularyFlashcards : handleGenerateFlashcards}
                onRegenerate={isVocabularyFile ? handleReextractVocabulary : handleRegenerateFlashcards}
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
          {panelTab === "vocabQuiz" && (
            <VocabQuizPanel
              cards={flashcards}
              savedScores={vocabQuizScores}
              onSaveScore={handleSaveVocabQuizScore}
            />
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



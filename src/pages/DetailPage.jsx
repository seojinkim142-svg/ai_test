import { useMemo } from "react";
import ActionsPanel from "../components/ActionsPanel";
import AiTutorPanel from "../components/AiTutorPanel";
import FlashcardsPanel from "../components/FlashcardsPanel";
import OxSection from "../components/OxSection";
import PdfPreview from "../components/PdfPreview";
import QuizSection from "../components/QuizSection";
import SummaryCard from "../components/SummaryCard";
import { useQuizMixCarousel } from "../hooks/useQuizMixCarousel";
import { LETTERS } from "../constants";

export default function DetailPage({
  detailContainerRef,
  splitStyle,
  pdfUrl,
  file,
  pageInfo,
  currentPage,
  handleDragStart,
  panelTab,
  setPanelTab,
  requestSummary,
  isLoadingSummary,
  isLoadingText,
  isFreeTier,
  summary,
  regenerateSummary,
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
  renderMockExamItem,
  setActiveMockExamId,
  isLoadingQuiz,
  shortPreview,
  requestQuestions,
  quizMix,
  setQuizMix,
  quizSets,
  handleChoiceSelect,
  handleShortAnswerChange,
  handleShortAnswerCheck,
  regenerateQuiz,
  isLoadingOx,
  requestOxQuiz,
  regenerateOxQuiz,
  oxItems,
  oxSelections,
  setOxSelections,
  oxExplanationOpen,
  setOxExplanationOpen,
  flashcards,
  isLoadingFlashcards,
  handleAddFlashcard,
  handleDeleteFlashcard,
  handleGenerateFlashcards,
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
  const quizMixOptions = useMemo(
    () => [
      { multipleChoice: 5, shortAnswer: 0, label: "개관식 5 / 주관식 0" },
      { multipleChoice: 4, shortAnswer: 1, label: "개관식 4 / 주관식 1" },
      { multipleChoice: 3, shortAnswer: 2, label: "개관식 3 / 주관식 2" },
      { multipleChoice: 2, shortAnswer: 3, label: "개관식 2 / 주관식 3" },
      { multipleChoice: 1, shortAnswer: 4, label: "개관식 1 / 주관식 4" },
      { multipleChoice: 0, shortAnswer: 5, label: "개관식 0 / 주관식 5" },
    ],
    []
  );
  const { quizMixScrollRef, handleQuizMixScroll } = useQuizMixCarousel({
    quizMix,
    quizMixOptions,
    setQuizMix,
  });


  return (
    <section
      ref={detailContainerRef}
      className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:gap-0 lg:overflow-hidden"
    >
      <div className="flex flex-col gap-3 lg:h-full lg:overflow-y-auto" style={splitStyle}>
        <PdfPreview
          pdfUrl={pdfUrl}
          file={file}
          pageInfo={pageInfo}
          currentPage={currentPage}
        />
      </div>

      <div className="hidden w-2 cursor-col-resize items-stretch justify-center lg:flex">
        <div
          className="h-full w-1 rounded-full bg-white/10 transition hover:bg-white/30"
          onPointerDown={handleDragStart}
          role="separator"
          aria-label="Resize panel"
        />
      </div>

        <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
        <div className="grid grid-cols-6 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/30 lg:sticky lg:top-0 lg:z-10 lg:backdrop-blur">
          {[
            { id: "summary", label: "\uC694\uC57D", type: "tab" },
            { id: "quiz", label: "\uD034\uC988", type: "tab" },
            { id: "ox", label: "O/X", type: "tab" },
            { id: "mockExam", label: "\uBAA8\uC758\uACE0\uC0AC", type: "tab" },
            { id: "flashcards", label: "\uCE74\uB4DC", type: "tab" },
            { id: "tutor", label: "AI 튜터", type: "tab" },
          ].map((item) => {
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
                <p className="text-sm font-semibold text-emerald-200">요약</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => requestSummary({ force: true })}
                    disabled={isLoadingSummary || isLoadingText || (isFreeTier && summary)}
                    title={isFreeTier && summary ? "무료 티어에서는 요약을 재생성할 수 없습니다." : undefined}
                    className="ghost-button text-xs text-emerald-100"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingSummary ? "요약 생성 중..." : "요약 새로 생성"}
                  </button>
                  {!isFreeTier && (
                    <button
                      type="button"
                      onClick={regenerateSummary}
                      disabled={isLoadingSummary || isLoadingText}
                      className="ghost-button text-xs text-emerald-100"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      요약 재생성
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPageSummaryOpen((prev) => !prev);
                      setPageSummaryError("");
                    }}
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
                </div>
              )}
              {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">요약 생성 중...</p>}
              {!isLoadingSummary && summary && (
                <div ref={summaryRef}>
                  <SummaryCard summary={summary} renderExportPages={isExportingSummary} />
                </div>
              )}
              {!isLoadingSummary && !summary && <p className="mt-2 text-sm text-slate-400">요약이 준비되면 표시됩니다.</p>}
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
                            {mockExamOrderedItems.map((item, idx) => {
                              const answerText =
                                item.type === "ox"
                                  ? item.answer || "-"
                                  : item.type === "quiz-short"
                                    ? item.answer || "-"
                                    : Number.isFinite(item.answerIndex)
                                      ? LETTERS[item.answerIndex] || "-"
                                      : "-";
                              return (
                                <div key={`mock-exam-answer-${idx}`} className="rounded-lg bg-white/5 px-3 py-2">
                                  <p className="font-semibold text-emerald-200">
                                    {idx + 1}번 정답: {answerText}
                                  </p>
                                  {item.explanation && <p className="mt-1">해설: {item.explanation}</p>}
                                  {item.evidence && <p className="mt-1">근거: {item.evidence}</p>}
                                </div>
                              );
                            })}
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
                onRequestSummary={requestSummary}
              />

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
                      onSelectChoice={(qIdx, choiceIdx) => handleChoiceSelect(set.id, qIdx, choiceIdx)}
                      onShortAnswerChange={(idx, val) => handleShortAnswerChange(set.id, idx, val)}
                      onShortAnswerCheck={(idx) => handleShortAnswerCheck(set.id, idx)}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                onRequestSummary={requestSummary}
              />

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

          {panelTab === "flashcards" && (
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

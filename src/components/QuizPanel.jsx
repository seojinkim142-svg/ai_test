import { useMemo } from "react";
import ActionsPanel from "./ActionsPanel";
import QuizSection from "./QuizSection";
import OxSection from "./OxSection";
import { useQuizMixCarousel } from "../hooks/useQuizMixCarousel";

const normalizeInput = (value) => String(value || "").replace(/\s+/g, "");

const DIFFICULTY_OPTIONS = [
  { value: null, label: "자동" },
  { value: "하", label: "쉬움 (하)" },
  { value: "중", label: "보통 (중)" },
  { value: "상", label: "어려움 (상)" },
];

export default function QuizPanel({
  isLoadingQuiz,
  isLoadingSummary,
  isLoadingText,
  status,
  error,
  shortPreview,
  requestQuestions,
  handleRequestSummary,
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
  deleteQuizItem,
  oxItems,
  oxSelections,
  handleOxSelect,
  setOxExplanationOpen,
  oxExplanationOpen,
  requestOxQuiz,
  isLoadingOx,
  hasReachedOxLimit,
  oxLimitTitle,
  hasReachedQuizLimit,
  quizLimitTitle,
}) {
  const quizMixOptions = useMemo(
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

  const { quizMixScrollRef, handleQuizMixScroll } = useQuizMixCarousel({
    quizMix,
    quizMixOptions,
    setQuizMix,
  });

  const totalQuestions =
    (Number(quizMix?.multipleChoice) || 0) + (Number(quizMix?.shortAnswer) || 0);

  return (
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
              onChange={(e) => setQuizChapterSelectionInput(normalizeInput(e.target.value))}
              placeholder="예: 1-3,5"
              className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300">형식</label>
            <input
              type="text"
              value={quizMixInput}
              onChange={(e) => setQuizMixInput(e.target.value)}
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
            <label className="block text-xs font-semibold text-slate-300">난이도</label>
            <div className="mt-2 flex gap-2">
              {DIFFICULTY_OPTIONS.map(({ value, label }) => (
                <button
                  key={String(value)}
                  type="button"
                  disabled={isLoadingQuiz || isLoadingText}
                  onClick={() => setQuizDifficulty(value)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                    quizDifficulty === value
                      ? "bg-emerald-500/25 text-emerald-100 ring-emerald-400/60"
                      : "bg-white/5 text-slate-300 ring-white/10 hover:ring-emerald-300/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300">추가 요청</label>
            <textarea
              value={quizPromptAddonInput}
              onChange={(e) => setQuizPromptAddonInput(e.target.value)}
              disabled={isLoadingQuiz || isLoadingText}
              placeholder="예: 응용형 위주로, 개념 비교 문제를 더 넣어줘, 수능형 문제로 만들어줘, 단답형은 공식/용어 중심으로 만들어줘"
              className="mt-2 min-h-[104px] w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
            />
            <p className="mt-2 text-xs text-slate-400">선택사항. 퀴즈 생성 프롬프트에 함께 반영됩니다.</p>
          </div>
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
              onShortAnswerChange={(i, val) => handleShortAnswerChange(set.id, i, val)}
              onShortAnswerCheck={(i) => handleShortAnswerCheck(set.id, i)}
              onOxSelect={(qIdx, choice) => handleQuizOxSelect(set.id, qIdx, choice)}
              onToggleOxExplanation={(qIdx) => handleToggleQuizOxExplanation(set.id, qIdx)}
              onDeleteMultipleChoice={(qIdx) => deleteQuizItem?.(set.id, "multipleChoice", qIdx)}
              onDeleteShortAnswer={(qIdx) => deleteQuizItem?.(set.id, "shortAnswer", qIdx)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-300">
        현재 구성: 객관식 {quizMix?.multipleChoice ?? 0} / 주관식 {quizMix?.shortAnswer ?? 0}
        {` (총 ${totalQuestions}문항)`}
      </p>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={requestQuestions}
          disabled={isLoadingQuiz || isLoadingText || Boolean(quizMixError) || totalQuestions <= 0 || hasReachedQuizLimit}
          title={hasReachedQuizLimit ? quizLimitTitle : quizMixError || undefined}
          className="ghost-button w-full text-sm text-emerald-100"
          data-ghost-size="xl"
          style={{ "--ghost-color": "16, 185, 129" }}
        >
          {isLoadingQuiz ? "퀴즈 생성 중..." : `퀴즈 생성하기 (총 ${totalQuestions}문항)`}
        </button>
        <button
          type="button"
          onClick={() => requestOxQuiz({ auto: false })}
          disabled={isLoadingOx || isLoadingText || hasReachedOxLimit}
          title={oxLimitTitle}
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
              setOxExplanationOpen((prev) => ({ ...prev, [qIdx]: !prev?.[qIdx] }))
            }
          />
        </div>
      )}
    </>
  );
}

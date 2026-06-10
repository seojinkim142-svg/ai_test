import { useState } from "react";

/**
 * FlashcardGenerateForm
 * 플래시카드 생성 폼: 카드 추가 입력폼 + 컨트롤 버튼들 (생성, 재생성, 시험치기 등)
 * Props:
 *   cards, filteredCards, categories, activeCategory, setActiveCategory,
 *   isLoading, isGenerating, isExamMode, isVocabularyMode, isRetryMode, topicExamLabel,
 *   canGenerate, generateButtonTitle, duplicateCount,
 *   canStartExam, scoreHistory, showScoreHistory, setShowScoreHistory,
 *   status, error,
 *   onGenerate, onRegenerate, onDeduplicate, onDeleteAll,
 *   onAdd, onStartExam, onEndExam
 */
function FlashcardGenerateForm({
  cards,
  filteredCards,
  categories,
  activeCategory,
  setActiveCategory,
  isLoading,
  isGenerating,
  isExamMode,
  isVocabularyMode,
  isRetryMode,
  topicExamLabel,
  canGenerate,
  generateButtonTitle,
  duplicateCount,
  canStartExam,
  dueCount = 0,
  onStartReview,
  scoreHistory,
  showScoreHistory,
  setShowScoreHistory,
  status,
  error,
  onGenerate,
  onRegenerate,
  onDeduplicate,
  onDeleteAll,
  onAdd,
  onStartExam,
  onEndExam,
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");

  return (
    <>
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">암기 카드</p>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">플래시카드</h3>
            {isVocabularyMode && (
              <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[11px] font-bold text-white">단어장</span>
            )}
            {isRetryMode && isExamMode && !topicExamLabel && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">복습</span>
            )}
            {topicExamLabel && isExamMode && (
              <span className="max-w-[120px] truncate rounded-full bg-violet-500 px-2 py-0.5 text-[11px] font-bold text-white" title={topicExamLabel}>
                {topicExamLabel}
              </span>
            )}
          </div>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
          {activeCategory ? `${filteredCards.length} / ${cards.length}개` : `${cards.length}개`}
        </span>
      </div>

      {/* 버튼 그룹 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating || isLoading || isExamMode}
          title={generateButtonTitle}
          className="ghost-button text-sm text-emerald-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          {isGenerating
            ? (isVocabularyMode ? "단어 추출 중..." : "AI 플래시카드 생성 중...")
            : (isVocabularyMode ? "단어 자동 추출" : "AI 플래시카드 생성")}
        </button>
        {cards.length > 0 && !isExamMode && onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={isGenerating || isLoading}
            className="ghost-button text-sm text-sky-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "125, 211, 252" }}
          >
            {isGenerating
              ? (isVocabularyMode ? "재추출 중..." : "재생성 중...")
              : (isVocabularyMode ? "단어 재추출" : "플래시카드 재생성")}
          </button>
        )}
        <p className="text-xs text-slate-400">{isVocabularyMode ? "PDF에서 단어-뜻 전체 추출" : "PDF 기반 자동 생성"}</p>
        <button
          type="button"
          onClick={isExamMode ? onEndExam : () => onStartExam(filteredCards)}
          disabled={!isExamMode && !canStartExam}
          className="ghost-button text-sm text-emerald-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          {isExamMode ? "시험 종료" : "시험치기"}
        </button>
        {!isExamMode && dueCount > 0 && onStartReview && (
          <button
            type="button"
            onClick={onStartReview}
            disabled={!canStartExam}
            className="ghost-button text-sm text-amber-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "251, 191, 36" }}
          >
            오늘 복습 ({dueCount}개)
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowScoreHistory((prev) => !prev)}
          className="ghost-button text-sm text-slate-200"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          역대점수확인
        </button>
        {duplicateCount > 0 && !isExamMode && onDeduplicate && (
          <button
            type="button"
            onClick={onDeduplicate}
            disabled={isLoading || isGenerating}
            className="ghost-button text-sm text-amber-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "251, 191, 36" }}
          >
            중복 {duplicateCount}개 제거
          </button>
        )}
        {cards.length > 0 && !isExamMode && onDeleteAll && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`카드 ${cards.length}개를 모두 삭제할까요?`)) {
                onDeleteAll();
              }
            }}
            disabled={isLoading || isGenerating}
            className="ghost-button text-sm text-red-300"
            data-ghost-size="sm"
            style={{ "--ghost-color": "252, 165, 165" }}
          >
            전체 삭제
          </button>
        )}
      </div>

      {/* 카테고리 필터 */}
      {categories.length > 0 && !isExamMode && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
              activeCategory === null
                ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/50"
                : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
            }`}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`rounded-full px-2.5 py-0.5 text-xs border transition-colors ${
                activeCategory === cat
                  ? "bg-violet-500/30 text-violet-200 border-violet-400/50"
                  : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 상태/에러 메시지 */}
      {status && !isExamMode && <p className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

      {/* 점수 히스토리 */}
      {showScoreHistory && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-200">역대 점수</p>
            <span className="text-xs text-slate-400">{scoreHistory.length}건</span>
          </div>
          {scoreHistory.length === 0 && <p className="mt-2 text-xs text-slate-400">기록이 없습니다.</p>}
          {scoreHistory.length > 0 && (
            <div className="mt-2 space-y-2">
              {scoreHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/40 px-3 py-2 text-xs text-slate-200"
                >
                  <span className="text-slate-300">
                    {new Date(item.createdAt || item.created_at).toLocaleString("ko-KR")}
                  </span>
                  <span>{item.total}문항 / 알고있음 {item.known} / 모름 {item.unknown}</span>
                  <span className="font-semibold text-emerald-200">정답률 {item.accuracy}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 카드 추가 폼 */}
      {!isExamMode && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <textarea
              name="flashcard-front"
              value={front}
              onChange={(e) => setFront(e.target.value)}
              className="min-h-[80px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
              placeholder="앞면(용어/질문)"
            />
            <textarea
              name="flashcard-back"
              value={back}
              onChange={(e) => setBack(e.target.value)}
              className="min-h-[80px] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
              placeholder="뒷면(답/설명)"
            />
          </div>
          <input
            name="flashcard-hint"
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
            placeholder="힌트/예문 (선택)"
          />
          <button
            type="button"
            disabled={!front.trim() || !back.trim() || isLoading || isGenerating}
            onClick={() => {
              onAdd(front.trim(), back.trim(), hint.trim());
              setFront("");
              setBack("");
              setHint("");
            }}
            className="ghost-button mt-3 w-full text-sm text-emerald-100"
            data-ghost-size="lg"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isLoading ? "저장 중..." : "카드 추가"}
          </button>
        </>
      )}
    </>
  );
}

export default FlashcardGenerateForm;

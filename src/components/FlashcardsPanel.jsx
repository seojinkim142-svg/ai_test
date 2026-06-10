import { useCallback, useEffect, useRef, useState } from "react";
import FlashcardGenerateForm from "./flashcards/FlashcardGenerateForm";
import FlashcardList from "./flashcards/FlashcardList";
import { isCardDue } from "../utils/spacedRepetition";
import { normalizeFlashcardFront } from "../utils/flashcardUtils";

const SCORE_HISTORY_STORAGE_KEY = "flashcardExamHistory";
const REVIEW_BATCH_SIZE = 20;

function loadLocalScoreHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCORE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalScoreHistory(list) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SCORE_HISTORY_STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore
  }
}

function FlashcardsPanel({
  cards,
  onAdd,
  onDelete,
  onDeleteAll,
  onUpdate,
  onUpdateSrs,
  onDeduplicate,
  onSaveScore,
  savedScores,
  isLoading,
  onGenerate,
  onRegenerate,
  onReextract,
  isGenerating = false,
  canGenerate = true,
  generateButtonTitle,
  status,
  error,
  isVocabularyMode = false,
  pendingTopicExam = null,
  onPendingTopicExamConsumed,
}) {
  // 시험 모드
  const [isExamMode, setIsExamMode] = useState(false);
  const [examCards, setExamCards] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [unknownCards, setUnknownCards] = useState([]);
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [topicExamLabel, setTopicExamLabel] = useState("");

  // 카테고리 필터
  const [activeCategory, setActiveCategory] = useState(null); // null = 전체

  // 점수 히스토리
  const [showScoreHistory, setShowScoreHistory] = useState(false);
  const [localScoreHistory, setLocalScoreHistory] = useState(() => loadLocalScoreHistory());
  const [examSessionId, setExamSessionId] = useState(null);
  const [hasSavedScore, setHasSavedScore] = useState(false);

  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const panelTopRef = useRef(null);

  // Supabase 저장 성공분 + localStorage 저장분(저장 실패/게스트)을 합쳐 표시
  const scoreHistory = [...(savedScores || []), ...localScoreHistory]
    .sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
    .slice(0, 50);

  // 중복 카드 수 계산
  const duplicateCount = (() => {
    const seen = new Set();
    let count = 0;
    for (const card of (cards || [])) {
      const key = normalizeFlashcardFront(card.front);
      if (!key) continue;
      if (seen.has(key)) count++;
      else seen.add(key);
    }
    return count;
  })();

  // 카테고리 목록 도출
  const categories = Array.from(
    new Set((cards || []).map((c) => c.category).filter(Boolean))
  ).sort();

  // 카드 목록이 바뀌어 현재 선택된 카테고리가 더 이상 존재하지 않으면 필터 초기화
  useEffect(() => {
    if (activeCategory && !categories.includes(activeCategory)) {
      setActiveCategory(null);
    }
  }, [activeCategory, categories]);

  // 카테고리 필터 적용
  const filteredCards = activeCategory
    ? (cards || []).filter((c) => c.category === activeCategory)
    : (cards || []);

  // 오늘 복습할 카드 (간격 반복 due)
  const dueCards = filteredCards.filter((c) => isCardDue(c));
  // 한 세션에 복습할 카드 수 제한 (마이그레이션 직후 등 due 카드가 한꺼번에 몰릴 수 있음)
  const reviewBatchSize = Math.min(dueCards.length, REVIEW_BATCH_SIZE);

  const shuffleCards = useCallback((list) => {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const startExam = useCallback((targetCards, retryMode = false) => {
    const source = targetCards || cards;
    if (!source?.length) return;
    setExamCards(shuffleCards(source));
    setExamIndex(0);
    setIsFlipped(false);
    setKnownCount(0);
    setUnknownCount(0);
    setUnknownCards([]);
    setIsRetryMode(retryMode);
    setExamSessionId(`${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    setHasSavedScore(false);
    setIsExamMode(true);
  }, [cards, shuffleCards]);

  const endExam = useCallback(() => {
    setIsExamMode(false);
    setExamCards([]);
    setExamIndex(0);
    setIsFlipped(false);
    setKnownCount(0);
    setUnknownCount(0);
    setUnknownCards([]);
    setIsRetryMode(false);
    setTopicExamLabel("");
    setExamSessionId(null);
    setHasSavedScore(false);
    setTimeout(() => panelTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const isExamComplete = isExamMode && examIndex >= examCards.length;
  const currentCard = !isExamComplete ? examCards[examIndex] : null;
  const totalQuestions = examCards.length;
  const accuracy = totalQuestions ? Math.round((knownCount / totalQuestions) * 100) : 0;

  const persistScoreRecord = useCallback(
    async ({ known, unknown, total }) => {
      const safeTotal = Math.max(0, Number(total) || 0);
      const safeKnown = Math.max(0, Number(known) || 0);
      const safeUnknown = Math.max(0, Number(unknown) || 0);
      const acc = safeTotal ? Math.round((safeKnown / safeTotal) * 100) : 0;

      let savedRemotely = false;
      if (onSaveScore) {
        try {
          const result = await onSaveScore({ total: safeTotal, known: safeKnown, unknown: safeUnknown, accuracy: acc });
          savedRemotely = Boolean(result);
        } catch {
          savedRemotely = false;
        }
      }

      // Supabase 저장에 성공하면 localStorage에는 중복 기록하지 않음
      if (!savedRemotely) {
        const record = {
          id: examSessionId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          created_at: new Date().toISOString(),
          total: safeTotal,
          known: safeKnown,
          unknown: safeUnknown,
          accuracy: acc,
        };
        setLocalScoreHistory((prev) => {
          const next = [record, ...prev].slice(0, 50);
          saveLocalScoreHistory(next);
          return next;
        });
      }
      setHasSavedScore(true);
    },
    [examSessionId, onSaveScore]
  );

  const advanceCard = useCallback(
    (result) => {
      if (isExamComplete) return;
      const nextKnown = result === "known" ? knownCount + 1 : knownCount;
      const nextUnknown = result === "known" ? unknownCount : unknownCount + 1;
      const nextIndex = examIndex + 1;
      const newUnknownCards = result === "unknown"
        ? [...unknownCards, examCards[examIndex]]
        : unknownCards;

      setKnownCount(nextKnown);
      setUnknownCount(nextUnknown);
      setUnknownCards(newUnknownCards);
      setExamIndex(nextIndex);
      setIsFlipped(false);

      onUpdateSrs?.(examCards[examIndex], result);

      if (!hasSavedScore && nextIndex >= examCards.length) {
        persistScoreRecord({
          known: nextKnown,
          unknown: nextUnknown,
          total: examCards.length,
        });
      }
    },
    [
      examCards,
      examIndex,
      hasSavedScore,
      isExamComplete,
      knownCount,
      onUpdateSrs,
      persistScoreRecord,
      unknownCount,
      unknownCards,
    ]
  );

  const handleCardClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setIsFlipped((prev) => !prev);
  }, []);

  const handlePointerDown = useCallback((event) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      const start = pointerStartRef.current;
      if (!start || isExamComplete) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      pointerStartRef.current = null;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 40 || absX < absY) return;
      suppressClickRef.current = true;
      if (dx > 0) {
        advanceCard("known");
      } else {
        advanceCard("unknown");
      }
    },
    [advanceCard, isExamComplete]
  );

  const handlePointerCancel = useCallback(() => {
    pointerStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!isExamMode || isExamComplete) return;
    const handleKeyDown = (event) => {
      if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA") return;
      if (event.key === "ArrowRight") {
        advanceCard("known");
        return;
      }
      if (event.key === "ArrowLeft") {
        advanceCard("unknown");
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setIsFlipped((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advanceCard, isExamComplete, isExamMode]);

  // 학습구조에서 주제별 단어 시험 진입
  useEffect(() => {
    if (!pendingTopicExam) return;
    const { cards: examCards, topicTitle } = pendingTopicExam;
    if (examCards && examCards.length > 0) {
      setTopicExamLabel(topicTitle || "");
      startExam(examCards, true);
    }
    onPendingTopicExamConsumed?.();
  }, [pendingTopicExam]); // eslint-disable-line react-hooks/exhaustive-deps

  const canStartExam = Boolean(filteredCards.length) && !isLoading && !isGenerating;

  const containerClassName = `rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30${
    isExamMode ? " flex min-h-[60vh] flex-col lg:min-h-[70vh]" : ""
  }`;

  return (
    <div className={containerClassName} ref={panelTopRef}>
      {/* 생성 폼 + 컨트롤 버튼들 */}
      <FlashcardGenerateForm
        cards={cards}
        filteredCards={filteredCards}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        isLoading={isLoading}
        isGenerating={isGenerating}
        isExamMode={isExamMode}
        isVocabularyMode={isVocabularyMode}
        isRetryMode={isRetryMode}
        topicExamLabel={topicExamLabel}
        canGenerate={canGenerate}
        generateButtonTitle={generateButtonTitle}
        duplicateCount={duplicateCount}
        canStartExam={canStartExam}
        dueCount={reviewBatchSize}
        onStartReview={() => startExam(shuffleCards(dueCards).slice(0, REVIEW_BATCH_SIZE), true)}
        scoreHistory={scoreHistory}
        showScoreHistory={showScoreHistory}
        setShowScoreHistory={setShowScoreHistory}
        status={status}
        error={error}
        onGenerate={onGenerate}
        onRegenerate={onRegenerate}
        onDeduplicate={onDeduplicate}
        onDeleteAll={onDeleteAll}
        onAdd={onAdd}
        onStartExam={startExam}
        onEndExam={endExam}
      />

      {/* 시험 모드 UI */}
      {isExamMode && (
        <div className="mt-4 flex flex-1 flex-col gap-3">
          {!isExamComplete && currentCard && (
            <>
              {/* 진행 상태 */}
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">
                  {examIndex + 1} <span className="text-slate-500">/ {examCards.length}</span>
                  {isRetryMode && !topicExamLabel && <span className="ml-1.5 text-amber-300">복습</span>}
                </span>
                <div className="flex gap-3">
                  <span className="text-emerald-400">○ {knownCount}</span>
                  <span className="text-red-400">✕ {unknownCount}</span>
                </div>
              </div>

              {/* 진행 바 */}
              <div className="h-1 w-full rounded-full bg-white/10">
                <div
                  className="h-1 rounded-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${(examIndex / examCards.length) * 100}%` }}
                />
              </div>

              {/* 카드 */}
              <button
                type="button"
                onClick={handleCardClick}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className="relative flex min-h-[42vh] w-full flex-1 flex-col items-center justify-center rounded-3xl border border-black/5 bg-white px-8 py-10 shadow-lg shadow-black/10 transition hover:shadow-xl active:scale-[0.99] select-none"
                style={{ touchAction: "pan-y" }}
              >
                {!isFlipped ? (
                  <p className="text-center text-2xl font-bold tracking-wide text-slate-800">
                    {currentCard.front}
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-lg font-semibold text-emerald-600">{currentCard.back}</p>
                    {currentCard.hint && (
                      <p className="mt-1 text-sm text-slate-400 italic">"{currentCard.hint}"</p>
                    )}
                  </div>
                )}
                <p className="absolute bottom-4 text-[11px] text-slate-400">
                  {isFlipped ? "다시 앞면 보기" : "탭해서 뜻 보기"}
                </p>
              </button>

              {/* X / O 버튼 */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => advanceCard("unknown")}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/20 py-4 text-base font-semibold text-red-300 transition hover:bg-red-500/30 active:scale-95"
                >
                  <span className="text-lg">✕</span> 모름
                </button>
                <button
                  type="button"
                  onClick={() => advanceCard("known")}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/20 py-4 text-base font-semibold text-emerald-300 transition hover:bg-emerald-500/30 active:scale-95"
                >
                  <span className="text-lg">○</span> 알고있음
                </button>
              </div>

              <p className="text-center text-[11px] text-slate-600">← 스와이프: 모름 · 알고있음 →</p>
            </>
          )}

          {isExamComplete && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-black/5 bg-white px-6 py-10 text-center shadow-lg shadow-black/10">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-500">완료</p>
              <p className="text-4xl font-bold text-slate-800">{accuracy}%</p>
              <p className="text-sm text-slate-500">{examCards.length}문항 · 알고있음 {knownCount} · 모름 {unknownCount}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => startExam()}
                  className="ghost-button text-sm text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  다시 시작
                </button>
                {unknownCards.length > 0 && (
                  <button
                    type="button"
                    onClick={() => startExam(unknownCards, true)}
                    className="ghost-button text-sm text-amber-200"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "251, 191, 36" }}
                  >
                    틀린 카드 복습 ({unknownCards.length}개)
                  </button>
                )}
                <button
                  type="button"
                  onClick={endExam}
                  className="ghost-button text-sm text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  종료
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 카드 목록 */}
      {!isExamMode && (
        <FlashcardList
          cards={cards}
          filteredCards={filteredCards}
          isLoading={isLoading}
          isGenerating={isGenerating}
          onDelete={onDelete}
          onUpdate={onUpdate}
        />
      )}
    </div>
  );
}

export default FlashcardsPanel;

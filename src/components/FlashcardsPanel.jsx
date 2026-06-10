import { useCallback, useEffect, useRef, useState } from "react";

const SCORE_HISTORY_STORAGE_KEY = "flashcardExamHistory";

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
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");

  // 편집 모드
  const [editingCardId, setEditingCardId] = useState(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editHint, setEditHint] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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

  // savedScores(Supabase) 있으면 우선, 없으면 localStorage fallback
  const scoreHistory = (savedScores && savedScores.length > 0) ? savedScores : localScoreHistory;

  // 중복 카드 수 계산
  const duplicateCount = (() => {
    const seen = new Set();
    let count = 0;
    for (const card of (cards || [])) {
      const key = String(card.front || "").trim().toLowerCase();
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

  // 카테고리 필터 적용
  const filteredCards = activeCategory
    ? (cards || []).filter((c) => c.category === activeCategory)
    : (cards || []);

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
    ({ known, unknown, total }) => {
      const safeTotal = Math.max(0, Number(total) || 0);
      const safeKnown = Math.max(0, Number(known) || 0);
      const safeUnknown = Math.max(0, Number(unknown) || 0);
      const acc = safeTotal ? Math.round((safeKnown / safeTotal) * 100) : 0;
      const record = {
        id: examSessionId || `${Date.now()}`,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString(),
        total: safeTotal,
        known: safeKnown,
        unknown: safeUnknown,
        accuracy: acc,
      };
      // localStorage 저장
      setLocalScoreHistory((prev) => {
        const next = [record, ...prev].slice(0, 50);
        saveLocalScoreHistory(next);
        return next;
      });
      // Supabase 저장
      if (onSaveScore) {
        onSaveScore({ total: safeTotal, known: safeKnown, unknown: safeUnknown, accuracy: acc });
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

  // 편집 시작
  const startEdit = useCallback((card) => {
    setEditingCardId(card.id);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditHint(card.hint || "");
  }, []);

  // 편집 저장
  const saveEdit = useCallback(async () => {
    if (!editFront.trim() || !editBack.trim() || !onUpdate) return;
    setIsSavingEdit(true);
    try {
      await onUpdate(editingCardId, editFront.trim(), editBack.trim(), editHint.trim());
      setEditingCardId(null);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingCardId, editFront, editBack, editHint, onUpdate]);

  // 편집 취소
  const cancelEdit = useCallback(() => {
    setEditingCardId(null);
  }, []);

  const canStartExam = Boolean(filteredCards.length) && !isLoading && !isGenerating;

  const containerClassName = `rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30${
    isExamMode ? " flex min-h-[60vh] flex-col lg:min-h-[70vh]" : ""
  }`;

  return (
    <div className={containerClassName} ref={panelTopRef}>
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
          onClick={isExamMode ? endExam : () => startExam(filteredCards)}
          disabled={!isExamMode && !canStartExam}
          className="ghost-button text-sm text-emerald-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          {isExamMode ? "시험 종료" : "시험치기"}
        </button>
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

      {status && !isExamMode && <p className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

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

          <div className="mt-4 space-y-2">
            {isLoading && <p className="text-sm text-slate-300">불러오는 중...</p>}
            {!isLoading && cards.length === 0 && (
              <p className="text-sm text-slate-400">저장된 카드가 없습니다.</p>
            )}
            {!isLoading && cards.length > 0 && filteredCards.length === 0 && (
              <p className="text-sm text-slate-400">선택한 카테고리에 카드가 없습니다.</p>
            )}
            {!isLoading &&
              filteredCards.map((card) => {
                const isEditing = editingCardId === card.id;
                return (
                  <div
                    key={card.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 shadow-inner shadow-black/20"
                  >
                    {isEditing ? (
                      <>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <textarea
                            value={editFront}
                            onChange={(e) => setEditFront(e.target.value)}
                            className="min-h-[70px] rounded-xl border border-emerald-300/40 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="앞면"
                          />
                          <textarea
                            value={editBack}
                            onChange={(e) => setEditBack(e.target.value)}
                            className="min-h-[70px] rounded-xl border border-emerald-300/40 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                            placeholder="뒷면"
                          />
                        </div>
                        <input
                          type="text"
                          value={editHint}
                          onChange={(e) => setEditHint(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none"
                          placeholder="힌트/예문 (선택)"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={isSavingEdit}
                            className="ghost-button text-xs text-slate-300"
                            data-ghost-size="sm"
                            style={{ "--ghost-color": "148, 163, 184" }}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={!editFront.trim() || !editBack.trim() || isSavingEdit}
                            className="ghost-button text-xs text-emerald-100"
                            data-ghost-size="sm"
                            style={{ "--ghost-color": "52, 211, 153" }}
                          >
                            {isSavingEdit ? "저장 중..." : "저장"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs uppercase tracking-[0.15em] text-emerald-200">앞면</p>
                          {card.category && (
                            <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300 border border-violet-400/30 shrink-0">
                              {card.category}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-semibold text-white">{card.front}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.15em] text-cyan-200">뒷면</p>
                        <p className="mt-1 text-slate-100">{card.back}</p>
                        {card.hint && (
                          <p className="mt-2 text-xs text-slate-300">
                            힌트: <span className="text-slate-100">{card.hint}</span>
                          </p>
                        )}
                        <div className="mt-2 flex justify-end gap-2">
                          {onUpdate && (
                            <button
                              type="button"
                              onClick={() => startEdit(card)}
                              className="ghost-button text-xs text-slate-200"
                              data-ghost-size="sm"
                              style={{ "--ghost-color": "226, 232, 240" }}
                            >
                              편집
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDelete(card.id)}
                            className="ghost-button text-xs text-slate-200"
                            data-ghost-size="sm"
                            style={{ "--ghost-color": "226, 232, 240" }}
                          >
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}

export default FlashcardsPanel;

import { useCallback, useEffect, useRef, useState } from "react";

function FlashcardsPanel({
  cards,
  onAdd,
  onDelete,
  isLoading,
  onGenerate,
  isGenerating = false,
  canGenerate = true,
  status,
  error,
  onExamComplete,
}) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [isExamMode, setIsExamMode] = useState(false);
  const [examCards, setExamCards] = useState([]);
  const [examIndex, setExamIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [knownCount, setKnownCount] = useState(0);
  const [unknownCount, setUnknownCount] = useState(0);
  const [showScoreHistory, setShowScoreHistory] = useState(false);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [examSessionId, setExamSessionId] = useState(null);
  const [hasSavedScore, setHasSavedScore] = useState(false);
  const pointerStartRef = useRef(null);
  const suppressClickRef = useRef(false);
  const storageKey = "flashcardExamHistory";

  const shuffleCards = useCallback((list) => {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const startExam = useCallback(() => {
    if (!cards?.length) return;
    setExamCards(shuffleCards(cards));
    setExamIndex(0);
    setIsFlipped(false);
    setKnownCount(0);
    setUnknownCount(0);
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
    setExamSessionId(null);
    setHasSavedScore(false);
  }, []);

  const isExamComplete = isExamMode && examIndex >= examCards.length;
  const currentCard = !isExamComplete ? examCards[examIndex] : null;
  const totalQuestions = examCards.length;
  const accuracy = totalQuestions ? Math.round((knownCount / totalQuestions) * 100) : 0;

  const advanceCard = useCallback(
    (result) => {
      if (isExamComplete) return;
      if (result === "known") {
        setKnownCount((prev) => prev + 1);
      } else {
        setUnknownCount((prev) => prev + 1);
      }
      setExamIndex((prev) => prev + 1);
      setIsFlipped(false);
    },
    [isExamComplete]
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setScoreHistory(parsed);
      }
    } catch (err) {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (!isExamComplete || hasSavedScore) return;
    if (typeof window === "undefined") return;
    const record = {
      id: examSessionId || `${Date.now()}`,
      createdAt: new Date().toISOString(),
      total: totalQuestions,
      known: knownCount,
      unknown: unknownCount,
      accuracy,
    };
    const next = [record, ...scoreHistory].slice(0, 50);
    onExamComplete?.(record);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch (err) {
      // ignore storage errors
    }
    setScoreHistory(next);
    setHasSavedScore(true);
  }, [
    accuracy,
    examSessionId,
    hasSavedScore,
    isExamComplete,
    knownCount,
    onExamComplete,
    scoreHistory,
    totalQuestions,
    unknownCount,
  ]);

  const canStartExam = Boolean(cards?.length) && !isLoading && !isGenerating;

  const containerClassName = `rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30${
    isExamMode ? " flex min-h-[60vh] flex-col lg:min-h-[70vh]" : ""
  }`;

  return (
    <div className={containerClassName}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">암기 카드</p>
          <h3 className="text-lg font-semibold text-white">플래시카드</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
          {cards.length}개
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate || isGenerating || isLoading || isExamMode}
          className="ghost-button text-sm text-emerald-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          {isGenerating ? "AI 플래시카드 생성 중.." : "AI 플래시카드 생성"}
        </button>
        <p className="text-xs text-slate-400">PDF 기반 자동 생성</p>
        <button
          type="button"
          onClick={isExamMode ? endExam : startExam}
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
      </div>

      {status && <p className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

      {isExamMode && (
        <div className="mt-4 flex flex-1 flex-col rounded-3xl border border-emerald-200/20 bg-slate-950/80 p-4 shadow-lg shadow-black/30">
          {!isExamComplete && currentCard && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  {examIndex + 1} / {examCards.length}
                </span>
                <span>
                  알고있음 {knownCount} · 모름 {unknownCount}
                </span>
              </div>
              <div className="mt-3 grid min-h-[40vh] w-full flex-1 grid-cols-[auto,1fr,auto] items-center gap-3">
                <button
                  type="button"
                  onClick={() => advanceCard("unknown")}
                  className="ghost-button h-12 w-12 rounded-full text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                  aria-label="모름"
                >
                  <span className="text-xl">←</span>
                </button>
                <button
                  type="button"
                  onClick={handleCardClick}
                  onPointerDown={handlePointerDown}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  className="flex min-h-[40vh] w-full flex-1 items-center rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-left text-slate-100 shadow-inner shadow-black/20 transition hover:border-emerald-300/40 select-none"
                  style={{ touchAction: "pan-y" }}
                >
                  <div className="flex w-full flex-col justify-center">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">
                      {isFlipped ? "뒷면" : "앞면"}
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-white">
                      {isFlipped ? currentCard.back : currentCard.front}
                    </p>
                    {isFlipped && currentCard.hint && (
                      <p className="mt-4 text-sm text-slate-300">
                        힌트: <span className="text-slate-100">{currentCard.hint}</span>
                      </p>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => advanceCard("known")}
                  className="ghost-button h-12 w-12 rounded-full text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                  aria-label="알고있음"
                >
                  <span className="text-xl">→</span>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>탭: 뒷면 보기</span>
                <span>← 모름 · → 알고있음</span>
              </div>
            </>
          )}
          {isExamComplete && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-emerald-200">시험 완료</p>
              <p className="text-2xl font-semibold text-white">{examCards.length}장</p>
              <p className="text-sm text-slate-200">정답률 {accuracy}%</p>
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-slate-200">
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1">
                  알고있음 {knownCount}
                </span>
                <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1">
                  모름 {unknownCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startExam}
                  className="ghost-button text-sm text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  다시 시작
                </button>
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
                    {new Date(item.createdAt).toLocaleString("ko-KR")}
                  </span>
                  <span>
                    {item.total}장 · 알고있음 {item.known} · 모름 {item.unknown}
                  </span>
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
            {isLoading ? "저장 중.." : "카드 추가"}
          </button>

          <div className="mt-4 space-y-2">
            {isLoading && <p className="text-sm text-slate-300">불러오는 중..</p>}
            {!isLoading && cards.length === 0 && <p className="text-sm text-slate-400">저장된 카드가 없습니다.</p>}
            {!isLoading &&
              cards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-100 shadow-inner shadow-black/20"
                >
                  <p className="text-xs uppercase tracking-[0.15em] text-emerald-200">앞면</p>
                  <p className="mt-1 font-semibold text-white">{card.front}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.15em] text-cyan-200">뒷면</p>
                  <p className="mt-1 text-slate-100">{card.back}</p>
                  {card.hint && (
                    <p className="mt-2 text-xs text-slate-300">
                      힌트: <span className="text-slate-100">{card.hint}</span>
                    </p>
                  )}
                  <div className="mt-2 flex justify-end">
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
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

export default FlashcardsPanel;

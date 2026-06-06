import { useCallback, useMemo, useState } from "react";

const SCORES_KEY = "vocabQuizScores";
const OPTION_LABELS = ["①", "②", "③", "④"];

function loadLocalScores() {
  try {
    const raw = typeof window !== "undefined" && window.localStorage.getItem(SCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalScore(record) {
  try {
    const prev = loadLocalScores();
    window.localStorage.setItem(SCORES_KEY, JSON.stringify([record, ...prev].slice(0, 100)));
  } catch {}
}

function buildQuestions(cards) {
  const pool = (cards || []).filter((c) => c.front && c.back);
  if (pool.length < 2) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.map((card) => {
    const wrongPool = pool.filter((c) => c.id !== card.id);
    const wrongs = wrongPool
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.back);
    const options = [...wrongs, card.back].sort(() => Math.random() - 0.5);
    return { front: card.front, back: card.back, options, correctIndex: options.indexOf(card.back) };
  });
}

function VocabQuizPanel({ cards = [], savedScores, onSaveScore }) {
  const [view, setView] = useState("home"); // "home" | "quiz" | "scores" | "done" | "review"
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [questionCount, setQuestionCount] = useState(20);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [wrongCards, setWrongCards] = useState([]); // 오답 추적 [{ front, back }]
  const [localScores, setLocalScores] = useState(() => loadLocalScores());

  // Supabase 점수가 있으면 우선, 없으면 localStorage
  const scoreHistory = savedScores && savedScores.length > 0 ? savedScores : localScores;

  const categories = useMemo(
    () => Array.from(new Set((cards || []).map((c) => c.category).filter(Boolean))).sort(),
    [cards]
  );

  const filteredCards = useMemo(
    () => selectedCategory ? (cards || []).filter((c) => c.category === selectedCategory) : cards,
    [cards, selectedCategory]
  );

  // 버그 2 수정: adjustedCount 기준으로 칩 하이라이트
  const adjustedCount = Math.min(questionCount, filteredCards.length);

  const countOptions = useMemo(() => {
    const len = filteredCards.length;
    const presets = [10, 20, 50, 100].filter((n) => n <= len);
    if (!presets.includes(len)) presets.push(len);
    return presets;
  }, [filteredCards.length]);

  // 버그 1 수정: adjustedCount를 deps에 추가
  const startQuiz = useCallback((targetCards) => {
    const source = targetCards || filteredCards;
    const all = buildQuestions(source);
    if (!all.length) return;
    const limit = targetCards ? all.length : adjustedCount;
    const q = limit >= all.length ? all : all.slice(0, limit);
    setQuestions(q);
    setIndex(0);
    setSelected(null);
    setScore(0);
    setWrongCards([]);
    setView("quiz");
  }, [filteredCards, adjustedCount]);

  const finishQuiz = useCallback((finalScore, total, finalWrongCards) => {
    const pct = total ? Math.round((finalScore / total) * 100) : 0;
    const record = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      total,
      score: finalScore,
      accuracy: pct,
      category: selectedCategory || "전체",
    };
    saveLocalScore(record);
    setLocalScores(loadLocalScores());
    setWrongCards(finalWrongCards);
    if (onSaveScore) {
      onSaveScore({ total, score: finalScore, accuracy: pct, category: selectedCategory || "전체" });
    }
    setView("done");
  }, [selectedCategory, onSaveScore]);

  // ── 홈 화면 ──────────────────────────────────────────────
  if (view === "home") {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/30 flex flex-col gap-4">
        <div>
          <p className="text-xs text-slate-400">단어장 퀴즈</p>
          <h3 className="text-lg font-semibold text-white mt-0.5">어떤 단어를 풀까요?</h3>
        </div>

        {categories.length > 0 && (
          <div>
            <p className="mb-2 text-xs text-slate-400">카테고리</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  selectedCategory === null
                    ? "bg-violet-500 text-white border-violet-400"
                    : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                }`}
              >
                전체 ({cards.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    selectedCategory === cat
                      ? "bg-violet-500 text-white border-violet-400"
                      : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {cat} ({cards.filter((c) => c.category === cat).length})
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs text-slate-400">문항 수</p>
          <div className="flex flex-wrap gap-1.5">
            {countOptions.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setQuestionCount(n)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  // 버그 2 수정: adjustedCount로 비교
                  adjustedCount === n
                    ? "bg-emerald-500/30 text-emerald-200 border-emerald-400/50"
                    : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                }`}
              >
                {n === filteredCards.length ? `전체 (${n})` : `${n}개`}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {selectedCategory ? `'${selectedCategory}' ` : "전체 "}{filteredCards.length}개 단어
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => startQuiz()}
            disabled={filteredCards.length < 2}
            className="ghost-button w-full text-sm text-violet-200 disabled:opacity-40"
            data-ghost-size="sm"
            style={{ "--ghost-color": "167, 139, 250" }}
          >
            퀴즈 시작
          </button>
          <button
            type="button"
            onClick={() => setView("scores")}
            className="ghost-button w-full text-sm text-slate-300"
            data-ghost-size="sm"
            style={{ "--ghost-color": "148, 163, 184" }}
          >
            역대 점수 확인
          </button>
        </div>
      </div>
    );
  }

  // ── 역대 점수 ─────────────────────────────────────────────
  if (view === "scores") {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/30 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">역대 점수</h3>
          <button type="button" onClick={() => setView("home")} className="text-xs text-slate-400 hover:text-slate-200">
            ← 돌아가기
          </button>
        </div>
        {scoreHistory.length === 0 && <p className="text-sm text-slate-500">아직 기록이 없습니다.</p>}
        <div className="space-y-2">
          {scoreHistory.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300">
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-400">{new Date(item.createdAt || item.created_at).toLocaleString("ko-KR")}</span>
                <span className="text-violet-300 font-medium">{item.category || "전체"}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{item.total}문항 · 정답 {item.score ?? item.known}</span>
                <span className="text-base font-bold text-white">{item.accuracy}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── 오답 복습 ─────────────────────────────────────────────
  if (view === "review") {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/30 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">오답 목록 <span className="text-slate-400 font-normal text-sm">({wrongCards.length}개)</span></h3>
          <button type="button" onClick={() => setView("done")} className="text-xs text-slate-400 hover:text-slate-200">← 결과로</button>
        </div>
        <div className="space-y-2">
          {wrongCards.map((card, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="font-semibold text-white text-sm">{card.front}</p>
              <p className="mt-1 text-xs text-emerald-300">{card.back}</p>
            </div>
          ))}
        </div>
        {wrongCards.length >= 2 && (
          <button
            type="button"
            onClick={() => startQuiz(wrongCards.map((c) => ({ ...c, id: c.front, category: selectedCategory })))}
            className="ghost-button w-full text-sm text-amber-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "251, 191, 36" }}
          >
            오답만 다시 풀기 ({wrongCards.length}개)
          </button>
        )}
      </div>
    );
  }

  // ── 완료 화면 ─────────────────────────────────────────────
  if (view === "done") {
    const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/30">
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-black/5 bg-white px-6 py-10 text-center shadow-lg shadow-black/10">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500">완료</p>
          <p className="text-5xl font-bold text-slate-800">{pct}%</p>
          <p className="text-sm text-slate-500">
            {questions.length}문항 · 정답 {score}개 · 오답 {questions.length - score}개
          </p>
          {selectedCategory && (
            <span className="rounded-full bg-violet-100 px-3 py-0.5 text-xs text-violet-600 font-medium">{selectedCategory}</span>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => startQuiz()} className="ghost-button text-sm text-violet-200" data-ghost-size="sm" style={{ "--ghost-color": "167, 139, 250" }}>
              다시 풀기
            </button>
            {wrongCards.length >= 1 && (
              <button type="button" onClick={() => setView("review")} className="ghost-button text-sm text-amber-200" data-ghost-size="sm" style={{ "--ghost-color": "251, 191, 36" }}>
                오답 확인 ({wrongCards.length}개)
              </button>
            )}
            <button type="button" onClick={() => setView("home")} className="ghost-button text-sm text-slate-300" data-ghost-size="sm" style={{ "--ghost-color": "148, 163, 184" }}>
              홈으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 퀴즈 화면 ─────────────────────────────────────────────
  const q = questions[index];
  if (!q) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-medium text-slate-300">
              {index + 1} <span className="text-slate-500">/ {questions.length}</span>
            </span>
            {selectedCategory && (
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300 border border-violet-400/30">{selectedCategory}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-violet-400">정답 {score}</span>
            <button type="button" onClick={() => setView("home")} className="text-slate-500 hover:text-slate-300">✕</button>
          </div>
        </div>
        <div className="h-1 w-full rounded-full bg-white/10">
          <div className="h-1 rounded-full bg-violet-400 transition-all duration-300" style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>

        <div className="flex flex-col items-center justify-center rounded-3xl border border-black/5 bg-white px-8 py-8 text-center shadow-lg shadow-black/10 min-h-[140px]">
          <p className="mb-2 text-xs text-slate-400">아래 단어의 뜻은?</p>
          <p className="text-2xl font-bold text-slate-800">{q.front}</p>
        </div>

        <div className="flex flex-col gap-2">
          {q.options.map((option, idx) => {
            const isCorrect = idx === q.correctIndex;
            const isSelected = selected === idx;
            let cls = "w-full rounded-2xl border px-4 py-3.5 text-sm font-medium text-left transition ";
            if (selected === null) {
              cls += "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10";
            } else if (isCorrect) {
              cls += "border-emerald-500/50 bg-emerald-500/20 text-emerald-200";
            } else if (isSelected) {
              cls += "border-red-500/50 bg-red-500/20 text-red-300";
            } else {
              cls += "border-white/5 bg-transparent text-slate-500";
            }
            return (
              <button
                key={idx}
                type="button"
                disabled={selected !== null}
                onClick={() => {
                  setSelected(idx);
                  const isRight = idx === q.correctIndex;
                  const nextScore = isRight ? score + 1 : score;
                  if (isRight) setScore(nextScore);
                  // 버그 3 수정: 오답 추적
                  const nextWrong = isRight ? wrongCards : [...wrongCards, { front: q.front, back: q.back }];
                  if (!isRight) setWrongCards(nextWrong);
                  if (index + 1 >= questions.length) {
                    setTimeout(() => finishQuiz(nextScore, questions.length, nextWrong), 600);
                  }
                }}
                className={cls}
              >
                <span className="mr-2 text-slate-500">{OPTION_LABELS[idx]}</span>
                {option}
              </button>
            );
          })}
        </div>

        {selected !== null && index + 1 < questions.length && (
          <button
            type="button"
            onClick={() => { setIndex((i) => i + 1); setSelected(null); }}
            className="ghost-button w-full text-sm text-violet-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "167, 139, 250" }}
          >
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}

export default VocabQuizPanel;

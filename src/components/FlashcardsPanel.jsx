import { useState } from "react";

function FlashcardsPanel({ cards, onAdd, onDelete, isLoading }) {
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">암기 카드</p>
          <h3 className="text-lg font-semibold text-white">플래시카드</h3>
        </div>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
          {cards.length}개
        </span>
      </div>

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
        disabled={!front.trim() || !back.trim() || isLoading}
        onClick={() => {
          onAdd(front.trim(), back.trim(), hint.trim());
          setFront("");
          setBack("");
          setHint("");
        }}
        className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
      >
        {isLoading ? "저장 중..." : "카드 추가"}
      </button>

      <div className="mt-4 space-y-2">
        {isLoading && <p className="text-sm text-slate-300">불러오는 중...</p>}
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
                  className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/20"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

export default FlashcardsPanel;

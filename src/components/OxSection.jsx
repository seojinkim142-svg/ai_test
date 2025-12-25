function OxCard({ item, idx, selection, onSelect }) {
  const revealed = selection === "o" || selection === "x";
  const isCorrect =
    revealed && ((selection === "o" && item.answer === true) || (selection === "x" && item.answer === false));

  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">
          Q{idx + 1}. {item.statement}
        </h3>
        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">O/X</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { id: "o", label: "O (참)", style: "bg-emerald-500 text-emerald-950 hover:bg-emerald-400" },
          { id: "x", label: "X (거짓)", style: "bg-red-500 text-red-950 hover:bg-red-400" },
          { id: "skip", label: "문제가 별로에요", style: "bg-white/10 text-slate-100 hover:bg-white/20" },
        ].map((btn) => {
          const active = selection === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onSelect(btn.id)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${btn.style} ${
                active ? "ring-2 ring-white/60" : "ring-1 ring-white/10"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ring-1 ${
            isCorrect
              ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
              : "bg-red-500/10 text-red-100 ring-red-400/40"
          }`}
        >
          {isCorrect ? "정답입니다!" : `오답입니다. 정답: ${item.answer ? "O (참)" : "X (거짓)"}`}
        </div>
      )}

      {item.explanation && (
        <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
          해설: {item.explanation}
        </p>
      )}
    </article>
  );
}

function OxSection({ title = "O/X 퀴즈", items, selections, onSelect }) {
  const list = items || [];

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">결과 미리보기</p>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>
        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
          {list.length}문항
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {list.map((item, idx) => (
          <OxCard
            key={`ox-${idx}`}
            idx={idx}
            item={item}
            selection={selections?.[idx]}
            onSelect={(choice) => onSelect?.(idx, choice)}
          />
        ))}
      </div>
    </div>
  );
}

export default OxSection;

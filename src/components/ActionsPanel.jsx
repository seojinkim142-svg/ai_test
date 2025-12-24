function ActionsPanel({
  isLoadingQuiz,
  isLoadingSummary,
  isLoadingText,
  status,
  error,
  shortPreview,
  onRequestQuiz,
  onRequestSummary,
  hideQuiz = false,
  hideSummary = false,
  title = "문제 생성",
  stepLabel = "2단계",
}) {
  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <p className="text-sm text-slate-300">{stepLabel}</p>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">
        퀴즈를 생성중입니다.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {!hideQuiz && (
          <button
            onClick={onRequestQuiz}
            disabled={isLoadingQuiz || isLoadingText}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
          >
            {isLoadingQuiz ? "문제 생성 중.." : "퀴즈 생성 (5문항)"}
          </button>
        )}
        {!hideSummary && (
          <button
            onClick={onRequestSummary}
            disabled={isLoadingSummary || isLoadingText}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-500/50"
          >
            {isLoadingSummary ? "요약 생성 중.." : "요약 생성"}
          </button>
        )}
      </div>

      {status && <p className="mt-3 text-sm text-emerald-200">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

      {shortPreview && (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-slate-200 ring-1 ring-white/10">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">본문 미리보기</p>
          <p className="mt-2 leading-relaxed">{shortPreview}</p>
        </div>
      )}
    </div>
  );
}

export default ActionsPanel;

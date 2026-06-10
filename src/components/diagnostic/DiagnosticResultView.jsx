export default function DiagnosticResultView({ result, theme, onClose, onGoToQuiz, onGoToSummary }) {
  if (!result) return null;
  const { predictedScore, totalQuestions, correctCount, topicBreakdown, feedback } = result;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className={`text-lg leading-none ${theme === "light" ? "text-slate-400 hover:text-slate-600" : "text-slate-500 hover:text-slate-300"}`}
        >
          {"×"}
        </button>
      </div>
      <div className="-mt-6 flex flex-col items-center gap-1 py-2 text-center">
        <span className={`text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
          {"당신의 현재 예상 점수는"}
        </span>
        <span className="text-5xl font-bold text-emerald-300">{`${predictedScore}점`}</span>
        <span className={`text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
          {`100점 만점 · ${correctCount} / ${totalQuestions} 정답`}
        </span>
      </div>

      <div
        className={`rounded-xl border px-3 py-2 text-sm ${
          theme === "light"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
        }`}
      >
        <p className="font-semibold">{feedback?.tier}</p>
        <p className="mt-0.5 text-xs opacity-90">{feedback?.message}</p>
      </div>

      {topicBreakdown?.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className={`text-xs font-medium ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
            {"주제별 결과"}
          </p>
          {topicBreakdown.map((entry, index) => (
            <div
              key={index}
              className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs ${
                theme === "light" ? "border-slate-200 bg-white" : "border-white/10 bg-white/5"
              }`}
            >
              <span className="truncate pr-2">{entry.topic}</span>
              <span>{entry.correct ? "✅" : "❌"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onGoToQuiz}
          className="ghost-button w-full text-sm text-emerald-100"
          data-ghost-size="md"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          {"전체 퀴즈 풀어보기"}
        </button>
        <button
          type="button"
          onClick={onGoToSummary}
          className={`ghost-button w-full text-sm ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
          data-ghost-size="md"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          {"요약 먼저 보기"}
        </button>
      </div>
    </div>
  );
}

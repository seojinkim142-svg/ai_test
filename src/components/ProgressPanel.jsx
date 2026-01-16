function StatCard({ title, value, helper }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner shadow-black/20">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {helper && <p className="mt-1 text-xs text-slate-400">{helper}</p>}
    </div>
  );
}

function ProgressPanel({
  totalQuestions = 0,
  answeredQuestions = 0,
  correctQuestions = 0,
  quizProgress = { total: 0, answered: 0, correct: 0 },
  oxProgress = { total: 0, answered: 0, correct: 0 },
  flashcardProgress = null,
  pageTotal = 0,
  pageVisited = 0,
  pageProgress = 0,
}) {
  const completionRate = totalQuestions ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
  const accuracyRate = answeredQuestions ? Math.round((correctQuestions / answeredQuestions) * 100) : 0;
  const pagePercent = pageTotal ? Math.round((pageVisited / pageTotal) * 100) : Math.round(pageProgress * 100);
  const formatAccuracy = (correctCount, answeredCount) => {
    if (!answeredCount) {
      return { value: "-", helper: "기록 없음" };
    }
    const rate = Math.round((correctCount / answeredCount) * 100);
    return { value: `${rate}%`, helper: `${correctCount}/${answeredCount} 정답` };
  };
  const quizRecord = formatAccuracy(quizProgress.correct, quizProgress.answered);
  const oxRecord = formatAccuracy(oxProgress.correct, oxProgress.answered);
  const flashcardTotal = flashcardProgress?.total || 0;
  const flashcardKnown = flashcardProgress?.known || 0;
  const flashcardHasRecord = flashcardTotal > 0;
  const flashcardAccuracy = Number.isFinite(flashcardProgress?.accuracy)
    ? flashcardProgress.accuracy
    : flashcardHasRecord
      ? Math.round((flashcardKnown / flashcardTotal) * 100)
      : 0;
  const flashcardRecord = flashcardHasRecord
    ? { value: `${flashcardAccuracy}%`, helper: `${flashcardKnown}/${flashcardTotal} 정답` }
    : { value: "-", helper: "기록 없음" };

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">{"\uC2DC\uD5D8/\uD559\uC2B5 \uC9C4\uB3C4"}</p>
          <h2 className="text-2xl font-bold text-white">{"\uC9C4\uB3C4 \uD2B8\uB798\uD0B9"}</h2>
        </div>
        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
          Progress
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-emerald-200">정답률 기록</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard title={"퀴즈 정답률"} value={quizRecord.value} helper={quizRecord.helper} />
          <StatCard title={"O/X 정답률"} value={oxRecord.value} helper={oxRecord.helper} />
          <StatCard
            title={"플래시카드 시험 정답률"}
            value={flashcardRecord.value}
            helper={flashcardRecord.helper}
          />
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-emerald-200">{"\uD398\uC774\uC9C0 \uC9C4\uB3C4"}</p>
        <div className="mt-3">
          {pageTotal > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{"\uBC29\uBB38\uD55C \uD398\uC774\uC9C0"}</p>
                  <p className="text-xs text-slate-400">{pageVisited}/{pageTotal}p</p>
                </div>
                <div className="text-xs text-slate-300">{pagePercent}%</div>
              </div>
              <div className="mt-3 h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-emerald-400/80"
                  style={{ width: `${pagePercent}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              {"PDF\uB97C \uC120\uD0DD\uD558\uBA74 \uD398\uC774\uC9C0 \uC9C4\uB3C4\uAC00 \uD45C\uC2DC\uB429\uB2C8\uB2E4."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProgressPanel;

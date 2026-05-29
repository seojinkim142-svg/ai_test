import { useMemo } from "react";
import { readReviewNotesFromHighlights } from "../utils/studyArtifacts";

export default function KnowledgeGapPanel({
  uploadedFiles = [],
  allArtifacts = [],
  outputLanguage = "ko",
  collapsed = false,
  onCollapse,
  onSelectFile,
}) {
  const label =
    {
      ko: { title: "학습 현황", summary: "요약", quiz: "퀴즈", ox: "OX", structure: "구조", allDone: "모든 파일 학습 완료!", recommend: "지금 이 파일부터", files: "파일", questions: "문제", wrongs: "오답", wrongsLeft: "개 남음", noQuiz: "퀴즈 없음", noSummary: "요약 없음" },
      en: { title: "Study Progress", summary: "Sum", quiz: "Quiz", ox: "OX", structure: "Str", allDone: "All files complete!", recommend: "Start here", files: "files", questions: "Q", wrongs: "Wrong", wrongsLeft: " left", noQuiz: "No quiz", noSummary: "No summary" },
      zh: { title: "学习进度", summary: "摘要", quiz: "测验", ox: "OX", structure: "结构", allDone: "全部完成！", recommend: "从这里开始", files: "文件", questions: "题", wrongs: "错误", wrongsLeft: "个", noQuiz: "无测验", noSummary: "无摘要" },
      ja: { title: "学習状況", summary: "要約", quiz: "クイズ", ox: "OX", structure: "構造", allDone: "全完了！", recommend: "ここから", files: "件", questions: "問", wrongs: "誤答", wrongsLeft: "件", noQuiz: "クイズなし", noSummary: "要約なし" },
    }[outputLanguage] ||
    { title: "학습 현황", summary: "요약", quiz: "퀴즈", ox: "OX", structure: "구조", allDone: "모든 파일 학습 완료!", recommend: "지금 이 파일부터", files: "파일", questions: "문제", wrongs: "오답", wrongsLeft: "개 남음", noQuiz: "퀴즈 없음", noSummary: "요약 없음" };

  const artifactMap = useMemo(() => {
    const map = new Map();
    allArtifacts.forEach((a) => map.set(String(a.doc_id), a));
    return map;
  }, [allArtifacts]);

  const fileStats = useMemo(() => {
    return uploadedFiles.map((file) => {
      const art = artifactMap.get(String(file.id)) || {};
      const hasSummary = Boolean(art.summary);
      const hasQuiz = Boolean(art.quiz_json);
      const hasOx = Boolean(art.ox_json);
      const hasStructure = Boolean(art.highlights_json?.__topic_structure_v1?.topics?.length);

      const qMc = Array.isArray(art.quiz_json?.multipleChoice) ? art.quiz_json.multipleChoice.length : 0;
      const qSa = Array.isArray(art.quiz_json?.shortAnswer) ? art.quiz_json.shortAnswer.length : 0;
      const questionCount = qMc + qSa;

      const reviewNotes = readReviewNotesFromHighlights(art.highlights_json);
      const unresolvedCount = reviewNotes.filter((n) => !n.resolved).length;

      const missing = [
        !hasSummary && label.summary,
        !hasQuiz && label.quiz,
        !hasOx && label.ox,
        !hasStructure && label.structure,
      ].filter(Boolean);

      const attentionScore = unresolvedCount * 3 + (!hasQuiz ? 2 : 0) + (!hasSummary ? 1 : 0);

      return {
        id: file.id,
        name: file.name,
        file,
        hasSummary,
        hasQuiz,
        hasOx,
        hasStructure,
        questionCount,
        unresolvedCount,
        missing,
        attentionScore,
      };
    });
  }, [uploadedFiles, artifactMap, label.summary, label.quiz, label.ox, label.structure]);

  const totalFiles = fileStats.length;
  const completeCount = fileStats.filter((f) => f.missing.length === 0).length;
  const totalQuestions = fileStats.reduce((sum, f) => sum + f.questionCount, 0);
  const totalUnresolved = fileStats.reduce((sum, f) => sum + f.unresolvedCount, 0);
  const progress = totalFiles ? Math.round((completeCount / totalFiles) * 100) : 0;

  const recommended = useMemo(() => {
    const candidates = fileStats.filter((f) => f.attentionScore > 0);
    if (!candidates.length) return null;
    return candidates.reduce((best, cur) => (cur.attentionScore > best.attentionScore ? cur : best));
  }, [fileStats]);

  const recommendReason = recommended
    ? recommended.unresolvedCount > 0
      ? `오답 ${recommended.unresolvedCount}${label.wrongsLeft}`
      : !recommended.hasQuiz
        ? label.noQuiz
        : label.noSummary
    : null;

  if (totalFiles === 0) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-sm">
      {/* 헤더 */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => onCollapse?.(!collapsed)}
      >
        <span className="text-xs font-semibold text-slate-100">{label.title}</span>
        <span className="text-[11px] font-medium text-emerald-400">{progress}%</span>
      </button>

      {!collapsed && (
        <div className="mt-2.5 flex flex-col gap-3">
          {/* 진행 바 */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 핵심 수치 3개 */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-slate-700/50 px-1 py-1.5">
              <p className="text-sm font-bold text-white">{totalFiles}</p>
              <p className="text-[10px] text-slate-400">{label.files}</p>
            </div>
            <div className="rounded-lg bg-slate-700/50 px-1 py-1.5">
              <p className="text-sm font-bold text-white">{totalQuestions}</p>
              <p className="text-[10px] text-slate-400">{label.questions}</p>
            </div>
            <div className={`rounded-lg px-1 py-1.5 ${totalUnresolved > 0 ? "bg-amber-500/20" : "bg-slate-700/50"}`}>
              <p className={`text-sm font-bold ${totalUnresolved > 0 ? "text-amber-300" : "text-white"}`}>{totalUnresolved}</p>
              <p className={`text-[10px] ${totalUnresolved > 0 ? "text-amber-400/80" : "text-slate-400"}`}>{label.wrongs}</p>
            </div>
          </div>

          {/* 추천 파일 */}
          {recommended ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">{label.recommend}</p>
              <button
                type="button"
                onClick={() => onSelectFile?.(recommended.file)}
                className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-left transition hover:bg-emerald-500/20"
              >
                <p className="truncate text-[11px] font-semibold text-white">{recommended.name}</p>
                <p className="mt-0.5 text-[10px] text-emerald-400">{recommendReason}</p>
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-emerald-400">{label.allDone} 🎉</p>
          )}

          {/* 파일별 현황 */}
          <div className="flex flex-col gap-1">
            {fileStats.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onSelectFile?.(f.file)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-white/5"
              >
                {/* 완료 여부 아이콘 */}
                <span className={`shrink-0 text-[10px] ${f.missing.length === 0 ? "text-emerald-400" : "text-slate-600"}`}>
                  {f.missing.length === 0 ? "✓" : "○"}
                </span>

                {/* 파일명 */}
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{f.name}</span>

                {/* 오답 뱃지 */}
                {f.unresolvedCount > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
                    {f.unresolvedCount}
                  </span>
                )}

                {/* 기능 도트 4개 */}
                <div className="flex shrink-0 gap-0.5">
                  {[f.hasSummary, f.hasQuiz, f.hasOx, f.hasStructure].map((has, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${has ? "bg-emerald-500" : "bg-slate-600"}`}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* 도트 범례 */}
          <div className="flex items-center gap-2 flex-wrap">
            {[label.summary, label.quiz, label.ox, label.structure].map((name, i) => (
              <span key={i} className="flex items-center gap-1 text-[9px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

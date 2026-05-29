import { useMemo } from "react";

export default function KnowledgeGapPanel({ uploadedFiles = [], allArtifacts = [], outputLanguage = "ko", collapsed = false, onCollapse, onSelectFile }) {

  const label = {
    ko: { title: "학습 현황", noFiles: "업로드된 파일이 없습니다.", summary: "요약", quiz: "퀴즈", ox: "OX", structure: "학습구조", allDone: "전부 완료", missing: "미완성", progress: "진행도", close: "접기", open: "학습 현황" },
    en: { title: "Study Progress", noFiles: "No files uploaded.", summary: "Summary", quiz: "Quiz", ox: "OX", structure: "Structure", allDone: "All done", missing: "Missing", progress: "Progress", close: "Hide", open: "Study Progress" },
    zh: { title: "学习进度", noFiles: "没有上传文件。", summary: "摘要", quiz: "测验", ox: "判断题", structure: "学习结构", allDone: "全部完成", missing: "缺少", progress: "进度", close: "收起", open: "学习进度" },
    ja: { title: "学習状況", noFiles: "ファイルがありません。", summary: "要約", quiz: "クイズ", ox: "OX", structure: "学習構造", allDone: "全完了", missing: "未完成", progress: "進捗", close: "閉じる", open: "学習状況" },
    hi: { title: "अध्ययन प्रगति", noFiles: "कोई फ़ाइल नहीं।", summary: "सारांश", quiz: "प्रश्नोत्तरी", ox: "OX", structure: "संरचना", allDone: "सब पूर्ण", missing: "अधूरा", progress: "प्रगति", close: "बंद करें", open: "अध्ययन प्रगति" },
  }[outputLanguage] || { title: "학습 현황", noFiles: "업로드된 파일이 없습니다.", summary: "요약", quiz: "퀴즈", ox: "OX", structure: "학습구조", allDone: "전부 완료", missing: "미완성", progress: "진행도", close: "접기", open: "학습 현황" };

  const artifactMap = useMemo(() => {
    const map = new Map();
    allArtifacts.forEach((a) => map.set(String(a.doc_id), a));
    return map;
  }, [allArtifacts]);

  const gaps = useMemo(() => {
    return uploadedFiles.map((file) => {
      const art = artifactMap.get(String(file.id)) || {};
      const hasSummary = Boolean(art.summary);
      const hasQuiz = Boolean(art.quiz_json);
      const hasOx = Boolean(art.ox_json);
      const hasStructure = Boolean(art.highlights?.__topic_structure_v1?.topics?.length);
      const missing = [
        !hasSummary && label.summary,
        !hasQuiz && label.quiz,
        !hasOx && label.ox,
        !hasStructure && label.structure,
      ].filter(Boolean);
      return { id: file.id, name: file.name, hasSummary, hasQuiz, hasOx, hasStructure, missing };
    });
  }, [uploadedFiles, artifactMap, label.summary, label.quiz, label.ox, label.structure]);

  const totalFiles = gaps.length;
  const completeCount = gaps.filter((g) => g.missing.length === 0).length;
  const incompleteGaps = gaps.filter((g) => g.missing.length > 0);
  const progress = totalFiles ? Math.round((completeCount / totalFiles) * 100) : 0;

  if (totalFiles === 0) return null;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => onCollapse?.(!collapsed)}
      >
        <span className="text-xs font-semibold text-slate-100">{collapsed ? label.open : label.title}</span>
        <span className="text-[11px] font-medium text-emerald-400">{progress}%</span>
      </button>

      {!collapsed && (
        <div className="mt-2.5 space-y-2">
          {/* 진행 바 */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {incompleteGaps.length === 0 ? (
            <p className="text-[11px] text-emerald-400">{label.allDone} 🎉</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {incompleteGaps.map((gap) => {
                const fileItem = uploadedFiles.find((f) => String(f.id) === String(gap.id));
                return (
                  <li key={gap.id}>
                    <button
                      type="button"
                      onClick={() => fileItem && onSelectFile?.(fileItem)}
                      className="w-full flex items-start gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/5"
                    >
                      <span className="mt-0.5 shrink-0 text-yellow-400 text-[11px]">⚠</span>
                      <span className="min-w-0 text-[11px]">
                        <span className="block truncate font-medium text-slate-200">{gap.name}</span>
                        <span className="text-slate-500">{label.missing}: {gap.missing.join(", ")}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

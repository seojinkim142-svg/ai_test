import { useMemo, useState } from "react";

export default function KnowledgeGapPanel({ uploadedFiles = [], allArtifacts = [], outputLanguage = "ko" }) {
  const [collapsed, setCollapsed] = useState(false);

  const label = {
    ko: { title: "학습 현황", noFiles: "업로드된 파일이 없습니다.", summary: "요약", quiz: "퀴즈", ox: "OX", allDone: "전부 완료", missing: "미완성", progress: "진행도", close: "접기", open: "학습 현황" },
    en: { title: "Study Progress", noFiles: "No files uploaded.", summary: "Summary", quiz: "Quiz", ox: "OX", allDone: "All done", missing: "Missing", progress: "Progress", close: "Hide", open: "Study Progress" },
    zh: { title: "学习进度", noFiles: "没有上传文件。", summary: "摘要", quiz: "测验", ox: "判断题", allDone: "全部完成", missing: "缺少", progress: "进度", close: "收起", open: "学习进度" },
    ja: { title: "学習状況", noFiles: "ファイルがありません。", summary: "要約", quiz: "クイズ", ox: "OX", allDone: "全完了", missing: "未完成", progress: "進捗", close: "閉じる", open: "学習状況" },
    hi: { title: "अध्ययन प्रगति", noFiles: "कोई फ़ाइल नहीं।", summary: "सारांश", quiz: "प्रश्नोत्तरी", ox: "OX", allDone: "सब पूर्ण", missing: "अधूरा", progress: "प्रगति", close: "बंद करें", open: "अध्ययन प्रगति" },
  }[outputLanguage] || label?.ko || { title: "학습 현황", noFiles: "업로드된 파일이 없습니다.", summary: "요약", quiz: "퀴즈", ox: "OX", allDone: "전부 완료", missing: "미완성", progress: "진행도", close: "접기", open: "학습 현황" };

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
      const missing = [
        !hasSummary && label.summary,
        !hasQuiz && label.quiz,
        !hasOx && label.ox,
      ].filter(Boolean);
      return { id: file.id, name: file.name, hasSummary, hasQuiz, hasOx, missing };
    });
  }, [uploadedFiles, artifactMap, label.summary, label.quiz, label.ox]);

  const totalFiles = gaps.length;
  const completeCount = gaps.filter((g) => g.missing.length === 0).length;
  const incompleteGaps = gaps.filter((g) => g.missing.length > 0);
  const progress = totalFiles ? Math.round((completeCount / totalFiles) * 100) : 0;

  if (totalFiles === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className="font-semibold text-white/90">{collapsed ? label.open : label.title}</span>
        <span className="text-xs text-white/50">{progress}% {label.progress}</span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-2">
          {/* 진행 바 */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          {incompleteGaps.length === 0 ? (
            <p className="text-xs text-emerald-400">{label.allDone} 🎉</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {incompleteGaps.map((gap) => (
                <li key={gap.id} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-yellow-400">⚠</span>
                  <span className="min-w-0 break-all text-xs">
                    <span className="font-medium text-white/90">{gap.name}</span>
                    <span className="ml-1 text-white/50">— {label.missing}: {gap.missing.join(", ")}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

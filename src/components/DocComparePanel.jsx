import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const DocComparePanel = memo(function DocComparePanel({
  selectedFiles = [],
  result = "",
  isLoading = false,
  error = "",
  onCompare,
  onClose,
  outputLanguage = "ko",
}) {
  const copy = {
    ko: { title: "문서 비교 분석", btn: "비교 분석", loading: "AI가 문서를 비교하고 있어요...", selectTwo: "파일을 2개 이상 선택하면 비교 분석이 가능합니다.", close: "닫기", selectedLabel: "선택된 문서" },
    en: { title: "Document Comparison", btn: "Compare", loading: "AI is comparing documents...", selectTwo: "Select 2+ files to compare.", close: "Close", selectedLabel: "Selected" },
    zh: { title: "文档比较", btn: "比较", loading: "AI正在比较文档...", selectTwo: "选择2个或更多文件进行比较。", close: "关闭", selectedLabel: "已选" },
    ja: { title: "文書比較", btn: "比較", loading: "AIが文書を比較中...", selectTwo: "2つ以上のファイルを選択してください。", close: "閉じる", selectedLabel: "選択済み" },
    hi: { title: "दस्तावेज़ तुलना", btn: "तुलना करें", loading: "AI दस्तावेज़ों की तुलना कर रहा है...", selectTwo: "2+ फ़ाइलें चुनें।", close: "बंद करें", selectedLabel: "चयनित" },
  }[outputLanguage] || { title: "문서 비교 분석", btn: "비교 분석", loading: "AI가 문서를 비교하고 있어요...", selectTwo: "파일을 2개 이상 선택하면 비교 분석이 가능합니다.", close: "닫기", selectedLabel: "선택된 문서" };

  const canCompare = selectedFiles.length >= 2 && !isLoading;

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-4 text-sm text-white/85">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-semibold text-white/95">{copy.title}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs text-white/40 hover:bg-white/10 hover:text-white/70"
          >
            {copy.close}
          </button>
        )}
      </div>

      {selectedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selectedFiles.map((f) => (
            <span
              key={f.id}
              className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-xs text-indigo-200"
            >
              {f.name}
            </span>
          ))}
        </div>
      )}

      {selectedFiles.length < 2 && !result && (
        <p className="text-xs text-white/45">{copy.selectTwo}</p>
      )}

      {canCompare && !result && (
        <button
          type="button"
          onClick={onCompare}
          className="mt-1 rounded-xl bg-indigo-500/80 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          {copy.btn}
        </button>
      )}

      {isLoading && (
        <p className="mt-2 animate-pulse text-xs text-indigo-300">{copy.loading}</p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {result && !isLoading && (
        <div className="mt-3 rounded-xl bg-white/5 px-4 py-3 text-xs leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          <button
            type="button"
            onClick={onCompare}
            className="mt-3 rounded-xl bg-indigo-500/50 px-3 py-1.5 text-xs hover:bg-indigo-500/70"
          >
            {copy.btn}
          </button>
        </div>
      )}
    </div>
  );
});

export default DocComparePanel;

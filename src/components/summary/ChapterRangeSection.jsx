import { useSummaryStore } from "../../stores";

/**
 * ChapterRangeSection
 * 챕터 범위 설정 UI — isChapterRangeOpen일 때만 렌더링
 * 스토어에서 상태 직접 구독, 콜백은 props로 받음
 */
function ChapterRangeSection({
  isLoadingSummary,
  isLoadingText,
  onAutoDetect,
  onConfirm,
}) {
  const {
    chapterRangeInput,
    setChapterRangeInput,
    chapterRangeError,
    setChapterRangeError,
    chapterRangeNotice,
    setChapterRangeNotice,
    isChapterRangeOpen,
    setIsChapterRangeOpen,
    isDetectingChapterRanges,
  } = useSummaryStore();

  if (!isChapterRangeOpen) return null;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">사용자 지정 챕터 범위</p>
          <p className="text-xs text-slate-400">
            형식: 챕터번호:시작-끝 (예: 1:1-12, 2:13-24)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsChapterRangeOpen(false)}
          className="ghost-button text-[11px] text-slate-200"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          닫기
        </button>
      </div>
      <div className="mt-3 space-y-2">
        <textarea
          value={chapterRangeInput}
          onChange={(event) => {
            setChapterRangeInput(event.target.value);
            setChapterRangeError("");
            setChapterRangeNotice("");
          }}
          placeholder={`1:1-12\n2:13-24\n3:25-38`}
          rows={4}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onAutoDetect}
            disabled={isLoadingSummary || isLoadingText || isDetectingChapterRanges}
            className="ghost-button text-xs text-slate-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "100, 116, 139" }}
          >
            {isDetectingChapterRanges ? "목차 추출 중..." : "목차 자동 추출"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoadingSummary || isLoadingText || isDetectingChapterRanges}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            확인
          </button>
        </div>
        <p className="text-xs text-slate-400">
          목차 자동 추출 또는 직접 입력한 범위는 요약 생성 시 챕터 분할 기준으로 적용됩니다.
        </p>
      </div>
      {chapterRangeError && (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-400/30">
          {chapterRangeError}
        </p>
      )}
      {!chapterRangeError && chapterRangeNotice && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/20">
          {chapterRangeNotice}
        </p>
      )}
    </div>
  );
}

export default ChapterRangeSection;

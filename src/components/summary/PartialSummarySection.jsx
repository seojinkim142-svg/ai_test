import { useMemo, useRef } from "react";
import { useSummaryStore } from "../../stores";
import SummaryCard from "../SummaryCard";

/**
 * PartialSummarySection
 * 페이지/챕터 범위별 요약 UI 섹션
 * 스토어에서 상태 직접 구독, 콜백은 props로 받음
 */
function PartialSummarySection({
  onSave,
  onLoad,
  onDelete,
}) {
  const {
    partialSummary,
    partialSummaryRange,
    savedPartialSummaries,
    isSavedPartialSummaryOpen,
    setIsSavedPartialSummaryOpen,
  } = useSummaryStore();

  const partialSummaryListRef = useRef(null);

  const normalizedSavedPartialSummaries = useMemo(
    () => (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []),
    [savedPartialSummaries]
  );

  // partialSummary도 없고 저장 목록도 없으면 표시 안함
  if (!partialSummary && normalizedSavedPartialSummaries.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-100">
            부분 요약
          </p>
          <p className="text-xs text-slate-300">
            {partialSummaryRange
              ? `선택 범위: ${partialSummaryRange}`
              : "선택 페이지 요약 결과"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={!String(partialSummary || "").trim()}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            저장
          </button>
          <button
            type="button"
            onClick={() => setIsSavedPartialSummaryOpen((prev) => !prev)}
            className="ghost-button text-xs text-slate-200"
            data-ghost-size="sm"
            style={{ "--ghost-color": "148, 163, 184" }}
          >
            {isSavedPartialSummaryOpen
              ? `저장 목록 닫기 (${normalizedSavedPartialSummaries.length})`
              : `저장 목록 (${normalizedSavedPartialSummaries.length})`}
          </button>
        </div>
      </div>

      {isSavedPartialSummaryOpen && (
        <div ref={partialSummaryListRef} className="mt-3 max-h-[240px] space-y-2 overflow-auto pr-1">
          {normalizedSavedPartialSummaries.length === 0 ? (
            <p className="rounded-lg border border-white/10 bg-slate-900/35 px-3 py-2 text-xs text-slate-400">
              저장된 부분 요약이 없습니다.
            </p>
          ) : (
            normalizedSavedPartialSummaries.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-900/35 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">
                    {String(item.name || "").trim() || "무제"}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {String(item.range || "").trim()
                      ? `범위: ${String(item.range || "").trim()}`
                      : "범위 정보 없음"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onLoad?.(item.id)}
                    className="ghost-button text-[11px] text-emerald-100"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "52, 211, 153" }}
                  >
                    불러오기
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete?.(item.id)}
                    className="ghost-button text-[11px] text-slate-200"
                    data-ghost-size="sm"
                    style={{ "--ghost-color": "148, 163, 184" }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {partialSummary ? (
        <SummaryCard summary={partialSummary} />
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          아직 현재 문서의 부분 요약 결과가 없습니다.
        </p>
      )}
    </div>
  );
}

export default PartialSummarySection;

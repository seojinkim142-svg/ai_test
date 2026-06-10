import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSummaryStore } from "../../stores";

/**
 * InstructorEmphasisSection
 * 강조 내용(출제자 강조) 설정 UI 섹션 — 현재 hidden으로 숨겨진 상태
 * 스토어에서 상태 직접 구독, 콜백은 props로 받음
 */
function InstructorEmphasisSection({
  onSave,
  onDelete,
  onSelect,
  onCycle,
}) {
  const {
    instructorEmphasisInput,
    setInstructorEmphasisInput,
    savedInstructorEmphases,
    activeInstructorEmphasisId,
  } = useSummaryStore();

  const emphasisTextareaRef = useRef(null);
  const savedInstructorScrollRef = useRef(null);
  const savedInstructorScrollTimerRef = useRef(null);

  const emphasisWheelRowHeight = 38;
  const emphasisWheelViewportHeight = emphasisWheelRowHeight * 5;
  const emphasisWheelCenterOffset = (emphasisWheelViewportHeight - emphasisWheelRowHeight) / 2;

  const normalizedSavedInstructorEmphases = useMemo(
    () => (Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []),
    [savedInstructorEmphases]
  );

  const activeInstructorEmphasis = useMemo(
    () =>
      normalizedSavedInstructorEmphases.find((item) => item.id === activeInstructorEmphasisId) ||
      normalizedSavedInstructorEmphases[0] ||
      null,
    [activeInstructorEmphasisId, normalizedSavedInstructorEmphases]
  );

  const activeInstructorEmphasisIndex = useMemo(
    () =>
      activeInstructorEmphasis
        ? normalizedSavedInstructorEmphases.findIndex((item) => item.id === activeInstructorEmphasis.id)
        : -1,
    [activeInstructorEmphasis, normalizedSavedInstructorEmphases]
  );

  // textarea 자동 높이 조절
  useEffect(() => {
    const target = emphasisTextareaRef.current;
    if (!target) return;
    target.style.height = "auto";
    const next = Math.max(44, Math.min(240, target.scrollHeight));
    target.style.height = `${next}px`;
    target.style.overflowY = target.scrollHeight > 240 ? "auto" : "hidden";
  }, [instructorEmphasisInput]);

  // 스크롤 정리
  useEffect(() => {
    return () => {
      if (savedInstructorScrollTimerRef.current) {
        clearTimeout(savedInstructorScrollTimerRef.current);
      }
    };
  }, []);

  // 활성 항목에 맞춰 스크롤 동기화
  useEffect(() => {
    const container = savedInstructorScrollRef.current;
    if (!container || normalizedSavedInstructorEmphases.length === 0) return;
    const targetIndex = activeInstructorEmphasisIndex >= 0 ? activeInstructorEmphasisIndex : 0;
    const targetTop = Math.max(0, targetIndex * emphasisWheelRowHeight);
    if (Math.abs(container.scrollTop - targetTop) < 1) return;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  }, [
    activeInstructorEmphasisIndex,
    emphasisWheelRowHeight,
    normalizedSavedInstructorEmphases.length,
  ]);

  const handleSavedInstructorWheelSelect = useCallback(() => {
    const container = savedInstructorScrollRef.current;
    if (!container || normalizedSavedInstructorEmphases.length === 0) return;
    const nearestIndex = Math.max(
      0,
      Math.min(
        normalizedSavedInstructorEmphases.length - 1,
        Math.round(container.scrollTop / emphasisWheelRowHeight)
      )
    );
    const nearest = normalizedSavedInstructorEmphases[nearestIndex];
    if (!nearest || nearest.id === activeInstructorEmphasis?.id) return;
    onSelect?.(nearest.id);
  }, [
    activeInstructorEmphasis?.id,
    emphasisWheelRowHeight,
    onSelect,
    normalizedSavedInstructorEmphases,
  ]);

  const handleSavedInstructorWheelScroll = useCallback(() => {
    if (savedInstructorScrollTimerRef.current) {
      clearTimeout(savedInstructorScrollTimerRef.current);
    }
    savedInstructorScrollTimerRef.current = setTimeout(() => {
      handleSavedInstructorWheelSelect();
      savedInstructorScrollTimerRef.current = null;
    }, 90);
  }, [handleSavedInstructorWheelSelect]);

  const handleSavedInstructorClick = useCallback(
    (itemId) => {
      onSelect?.(itemId);
      emphasisTextareaRef.current?.focus();
    },
    [onSelect]
  );

  const truncateText = (text, maxLength = 30) => {
    const normalized = String(text || "").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}...`;
  };

  return (
    <div className="hidden mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-100">
            교수님/강사 강조 포인트
          </p>
          <p className="text-xs text-slate-400">
            학습 중 반드시 확인하라고 한 포인트를 메모하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSave?.()}
          className="ghost-button text-xs text-emerald-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "52, 211, 153" }}
        >
          저장
        </button>
      </div>
      <textarea
        ref={emphasisTextareaRef}
        value={instructorEmphasisInput}
        onChange={(event) => setInstructorEmphasisInput(event.target.value)}
        rows={1}
        maxLength={2000}
        placeholder="예) 3장 정리 문제는 기출 표현을 그대로 묻는다. 구분 개념(A vs B)을 비교하는 유형이 자주 나온다."
        className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-relaxed text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
      />
      <p className="mt-1 text-right text-[11px] text-slate-400">
        {String(instructorEmphasisInput || "").length}/2000
      </p>
      {normalizedSavedInstructorEmphases.length > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/35 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-300">
              {`저장된 강조 포인트 ${normalizedSavedInstructorEmphases.length}개`}
            </p>
            <button
              type="button"
              onClick={() => onDelete?.(activeInstructorEmphasis?.id)}
              disabled={!activeInstructorEmphasis}
              className="ghost-button text-[11px] text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "226, 232, 240" }}
            >
              선택 삭제
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="relative flex-1">
              <div
                className="pointer-events-none absolute inset-x-1 top-1/2 z-20 -translate-y-1/2 rounded-lg border border-emerald-300/45 bg-emerald-400/10 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
                style={{ height: `${emphasisWheelRowHeight}px` }}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 rounded-t-lg bg-gradient-to-b from-slate-950/95 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 rounded-b-lg bg-gradient-to-t from-slate-950/95 to-transparent" />
              <div
                ref={savedInstructorScrollRef}
                onScroll={handleSavedInstructorWheelScroll}
                className="relative overflow-y-auto rounded-lg snap-y snap-mandatory"
                style={{
                  height: `${emphasisWheelViewportHeight}px`,
                  scrollPaddingTop: `${emphasisWheelCenterOffset}px`,
                  scrollPaddingBottom: `${emphasisWheelCenterOffset}px`,
                }}
              >
                <div
                  style={{
                    paddingTop: `${emphasisWheelCenterOffset}px`,
                    paddingBottom: `${emphasisWheelCenterOffset}px`,
                  }}
                >
                  {normalizedSavedInstructorEmphases.map((item, idx) => {
                    const isActive = item.id === activeInstructorEmphasis?.id;
                    const distance =
                      activeInstructorEmphasisIndex >= 0
                        ? Math.abs(idx - activeInstructorEmphasisIndex)
                        : 999;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-emphasis-id={item.id}
                        onClick={() => handleSavedInstructorClick(item.id)}
                        className={`mx-1 flex w-[calc(100%-0.5rem)] snap-center items-center gap-2 rounded-lg px-3 text-left text-xs transition ${
                          isActive
                            ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-300/60"
                            : "text-slate-300 hover:bg-white/5"
                        } ${distance >= 2 ? "opacity-35" : distance === 1 ? "opacity-70" : "opacity-100"}`}
                        style={{ height: `${emphasisWheelRowHeight}px` }}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          {idx + 1}
                        </span>
                        <span
                          className="truncate leading-relaxed"
                          title={String(item.text || "").trim()}
                        >
                          {truncateText(item.text, 30)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex h-[190px] shrink-0 flex-col items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => onCycle?.(-1)}
                disabled={normalizedSavedInstructorEmphases.length < 2}
                className="ghost-button h-7 w-7 text-[11px] text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184", padding: 0 }}
                aria-label="이전 강조"
              >
                {"˄"}
              </button>
              <button
                type="button"
                onClick={() => onCycle?.(1)}
                disabled={normalizedSavedInstructorEmphases.length < 2}
                className="ghost-button h-7 w-7 text-[11px] text-slate-200"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184", padding: 0 }}
                aria-label="다음 강조"
              >
                {"˅"}
              </button>
            </div>
          </div>
          {activeInstructorEmphasis && (
            <p className="mt-2 text-[11px] text-emerald-200">
              {`현재 선택: ${activeInstructorEmphasisIndex + 1}번`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default InstructorEmphasisSection;

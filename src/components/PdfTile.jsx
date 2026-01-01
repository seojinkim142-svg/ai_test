import PropTypes from "prop-types";

function PdfTile({
  file,
  thumbnailUrl,
  pageInfo,
  isLoadingText,
  onProceed,
  active = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  draggable = false,
  onDragStart,
  onDragEnd,
  fullWidth = false,
}) {
  return (
    <div
      className={`group flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-2xl border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 ${
        fullWidth ? "sm:w-full" : "sm:w-[260px] sm:flex-shrink-0"
      } ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      } ${selectable ? "cursor-pointer" : ""}`}
      onClick={onProceed}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        const uploadId = file?.id || file?.name || "";
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/upload-id", uploadId);
        e.dataTransfer.setData("text/plain", uploadId);
        if (e.currentTarget) {
          const { offsetWidth, offsetHeight } = e.currentTarget;
          e.dataTransfer.setDragImage(e.currentTarget, offsetWidth / 2, offsetHeight / 2);
        }
        onDragStart?.(uploadId, e);
      }}
      onDragEnd={() => onDragEnd?.()}
    >
      <div className={`relative w-full bg-slate-800 ${fullWidth ? "h-40" : "h-32"}`}>
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="PDF 썸네일 미리보기" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">썸네일 생성 중...</div>
        )}
        {isLoadingText && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-emerald-950">
            추출 중...
          </span>
        )}
        {selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
              selected
                ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                : "border-white/30 bg-black/40 text-white/80 hover:border-emerald-300 hover:text-emerald-100"
            }`}
          >
            {selected ? "✓" : "□"}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <p className="truncate text-sm font-semibold text-white">{file?.name}</p>
        <p className="text-xs text-slate-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF` : "PDF"}</p>
        {pageInfo?.total > 0 && (
          <p className="text-xs text-emerald-200">
            {pageInfo.used} / {pageInfo.total} 페이지 사용
          </p>
        )}
      </div>
    </div>
  );
}

PdfTile.propTypes = {
  file: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    size: PropTypes.number,
  }),
  thumbnailUrl: PropTypes.string,
  pageInfo: PropTypes.shape({
    used: PropTypes.number,
    total: PropTypes.number,
  }),
  isLoadingText: PropTypes.bool,
  onProceed: PropTypes.func,
  active: PropTypes.bool,
  selectable: PropTypes.bool,
  selected: PropTypes.bool,
  onToggleSelect: PropTypes.func,
  draggable: PropTypes.bool,
  onDragStart: PropTypes.func,
  onDragEnd: PropTypes.func,
  fullWidth: PropTypes.bool,
};

export default PdfTile;

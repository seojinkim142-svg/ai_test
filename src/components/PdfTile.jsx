import PropTypes from "prop-types";

function PdfTile({
  file,
  thumbnailUrl,
  pageInfo,
  isLoadingText,
  metaText,
  onProceed,
  active = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  draggable = false,
  onDragStart,
  onDragEnd,
  compactGrid = false,
  fullWidth = false,
  rowLayout = false,
  onDelete,
  onContextMenu,
}) {
  if (rowLayout) {
    return (
      <div
        className={`group flex w-full min-w-0 flex-row items-center gap-3 overflow-hidden rounded-2xl border bg-slate-900/70 px-3 py-3 text-left shadow-md shadow-black/20 ring-1 transition active:scale-[0.98] ${
          active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
        } ${selectable ? "cursor-pointer" : ""}`}
        onClick={onProceed}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(e);
          }
        }}
        draggable={false}
      >
        {/* 썸네일 */}
        <div className="relative h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-800">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="PDF 썸네일" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">PDF</div>
          )}
          {isLoadingText && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-[9px] font-semibold text-emerald-300">
              추출 중
            </span>
          )}
        </div>
        {/* 정보 */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold leading-snug text-white">{file?.name}</p>
          <p className="text-[11px] text-slate-400">
            {metaText || (file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF` : "PDF")}
          </p>
          {pageInfo?.total > 0 && (
            <p className="text-[11px] text-emerald-300">
              {pageInfo.used} / {pageInfo.total} 페이지
            </p>
          )}
        </div>
        {/* 삭제 버튼 */}
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-sm text-white/70 transition hover:bg-rose-500 hover:text-white"
            title="삭제"
          >
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`group flex h-full min-h-[208px] w-full min-w-0 flex-col overflow-hidden rounded-[1.4rem] border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 aspect-[4/5] sm:min-h-[190px] sm:max-w-none sm:rounded-2xl sm:aspect-auto ${
        compactGrid
          ? "sm:w-full"
          : fullWidth
            ? "sm:w-full"
            : "sm:w-[260px] sm:flex-shrink-0"
      } ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      } ${selectable ? "cursor-pointer" : ""}`}
      onClick={onProceed}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        }
      }}
      draggable={false}
    >
      <div className={`relative w-full bg-slate-800 ${fullWidth ? "h-32 sm:h-40" : "h-28 sm:h-32"}`}>
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
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-sm text-white/90 transition hover:bg-rose-500 hover:text-white"
            title="삭제"
          >
            ×
          </button>
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
        <p className="text-xs text-slate-400">
          {metaText || (file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF` : "PDF")}
        </p>
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
  metaText: PropTypes.string,
  onProceed: PropTypes.func,
  active: PropTypes.bool,
  selectable: PropTypes.bool,
  selected: PropTypes.bool,
  onToggleSelect: PropTypes.func,
  draggable: PropTypes.bool,
  onDragStart: PropTypes.func,
  onDragEnd: PropTypes.func,
  compactGrid: PropTypes.bool,
  fullWidth: PropTypes.bool,
  rowLayout: PropTypes.bool,
  onDelete: PropTypes.func,
  onContextMenu: PropTypes.func,
};

export default PdfTile;

import PropTypes from "prop-types";

function FolderTile({
  name,
  count,
  active,
  onClick,
  onDelete,
  onDragOver,
  onDrop,
  onDragEnter,
  onDragLeave,
  canDrop,
  onAdd,
  dragHighlight = false,
}) {
  return (
    <div
      className={`group flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-2xl border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 sm:w-[260px] sm:flex-shrink-0 ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      } ${canDrop ? "cursor-pointer" : ""}`}
      onClick={onClick}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDragEnter={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        onDragEnter?.();
      }}
      onDragLeave={() => {
        if (!canDrop) return;
        onDragLeave?.();
      }}
      onDrop={(e) => {
        if (!canDrop) return;
        e.stopPropagation();
        onDrop?.(e);
      }}
    >
      <div className="flex flex-1 flex-col justify-between px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl text-emerald-200 transition ${
              dragHighlight ? "bg-emerald-500/30 ring-2 ring-emerald-300/70" : "bg-emerald-500/15"
            }`}
          >
            Folder
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] text-slate-200 opacity-80 transition hover:bg-white/10 hover:text-white"
              >
                X
              </button>
          )}
        </div>
        <div className="mt-4">
          <p className="truncate text-base font-semibold text-white">{name}</p>
          <p className="text-xs text-slate-300">{count}개 파일</p>
          {active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.();
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-100 underline underline-offset-4 hover:text-emerald-50"
            >
              여기에 새 파일 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

FolderTile.propTypes = {
  name: PropTypes.string,
  count: PropTypes.number,
  active: PropTypes.bool,
  onClick: PropTypes.func,
  onDelete: PropTypes.func,
  onDragOver: PropTypes.func,
  onDrop: PropTypes.func,
  onDragEnter: PropTypes.func,
  onDragLeave: PropTypes.func,
  canDrop: PropTypes.bool,
  onAdd: PropTypes.func,
  dragHighlight: PropTypes.bool,
};

export default FolderTile;

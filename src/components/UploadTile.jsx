import PropTypes from "prop-types";

function UploadTile({ onFileChange, onOpenMenu, inputRef }) {
  return (
    <div className="relative flex h-full min-h-[170px] w-full sm:w-[260px] sm:flex-shrink-0">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 text-center transition hover:-translate-y-1 hover:border-emerald-300/60 hover:bg-emerald-400/5"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-200">
          +
        </div>
        <p className="text-base font-semibold text-white">새 PDF 추가</p>
        <p className="max-w-xs text-sm text-slate-200">클릭하거나 끌어와서 업로드</p>
        <p className="max-w-xs text-xs text-slate-400">최대 30페이지까지 읽습니다(추가 페이지는 무시)</p>
      </button>
      <input
        ref={inputRef}
        id="pdf"
        name="pdf"
        type="file"
        accept="application/pdf"
        multiple
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}

UploadTile.propTypes = {
  onFileChange: PropTypes.func,
  onOpenMenu: PropTypes.func,
  inputRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
};

export default UploadTile;

import PropTypes from "prop-types";
import { SUPPORTED_UPLOAD_ACCEPT } from "../utils/document";

function UploadTile({ onFileChange, onOpenMenu, inputRef }) {
  return (
    <div className="relative flex h-full min-h-[208px] w-full min-w-0 aspect-[4/5] sm:min-h-[170px] sm:w-[260px] sm:max-w-none sm:aspect-auto sm:flex-shrink-0">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-[1.4rem] border border-dashed border-white/20 bg-white/5 px-5 text-center transition hover:-translate-y-1 hover:border-emerald-300/60 hover:bg-emerald-400/5 sm:rounded-2xl"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-200">
          +
        </div>
        <p className="text-base font-semibold text-white">문서 추가</p>
        <p className="max-w-xs text-sm text-slate-200">PDF, DOCX, PPTX 파일을 업로드하세요</p>
        <p className="max-w-xs text-xs text-slate-400">미리보기는 PDF만 지원됩니다</p>
      </button>
      <input
        ref={inputRef}
        id="document-upload"
        name="document-upload"
        type="file"
        accept={SUPPORTED_UPLOAD_ACCEPT}
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

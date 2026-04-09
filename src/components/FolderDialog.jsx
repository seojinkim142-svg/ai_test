import PropTypes from "prop-types";

function FolderDialog({
  open,
  onClose,
  onSubmit,
  title = "폴더 만들기",
  description = "폴더 이름을 입력해 주세요.",
  submitLabel = "생성",
  initialValue = "",
  placeholder = "예: 1주차 강의, 중간고사 요약",
  cancelLabel = "취소",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/90 p-5 text-slate-100 shadow-2xl ring-1 ring-white/15">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-slate-300">{description}</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            const name = (fd.get("folderName") || "").toString().trim();
            if (!name) return;
            onSubmit?.(name);
          }}
        >
          <input
            name="folderName"
            type="text"
            autoFocus
            defaultValue={initialValue}
            className="w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40"
            placeholder={placeholder}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ghost-button text-sm text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              className="ghost-button text-sm text-emerald-100"
              data-ghost-size="sm"
              style={{ "--ghost-color": "52, 211, 153" }}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

FolderDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  onSubmit: PropTypes.func,
  title: PropTypes.string,
  description: PropTypes.string,
  submitLabel: PropTypes.string,
  initialValue: PropTypes.string,
  placeholder: PropTypes.string,
  cancelLabel: PropTypes.string,
};

export default FolderDialog;

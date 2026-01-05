function FolderDialog({ open, onClose, onSubmit }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/90 p-5 text-slate-100 shadow-2xl ring-1 ring-white/15">
        <h3 className="text-lg font-semibold text-white">폴더 만들기</h3>
        <p className="mt-1 text-sm text-slate-300">폴더 이름을 입력하세요.</p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = (fd.get("folderName") || "").toString().trim();
            if (!name) return;
            onSubmit?.(name);
          }}
        >
          <input
            name="folderName"
            type="text"
            autoFocus
            className="w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40"
            placeholder="예: 1주차 강의, 중간고사 요약"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="ghost-button text-sm text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              취소
            </button>
            <button
              type="submit"
              className="ghost-button text-sm text-emerald-100"
              data-ghost-size="sm"
              style={{ "--ghost-color": "52, 211, 153" }}
            >
              생성
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default FolderDialog;

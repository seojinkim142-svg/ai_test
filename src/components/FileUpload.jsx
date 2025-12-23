function UploadTile({ onFileChange }) {
  return (
    <label
      htmlFor="pdf"
      className="flex h-full min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 text-center transition hover:border-emerald-300/60 hover:bg-emerald-400/5"
    >
      <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-100">PDF 파일 선택</div>
      <p className="text-lg font-semibold text-white">클릭하거나 끌어와서 업로드</p>
      <p className="max-w-xs text-sm text-slate-300">최대 30페이지까지 읽습니다(추가 페이지는 무시)</p>
      <input
        id="pdf"
        name="pdf"
        type="file"
        accept="application/pdf"
        multiple
        onChange={onFileChange}
        className="hidden"
      />
    </label>
  );
}

function PdfTile({ file, thumbnailUrl, pageInfo, isLoadingText, onProceed, active = false }) {
  return (
    <button
      type="button"
      onClick={onProceed}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      }`}
    >
      <div className="relative h-44 w-full bg-slate-800">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="PDF 첫 페이지 썸네일" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">썸네일 생성 중...</div>
        )}
        {isLoadingText && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-emerald-950">
            추출 중...
          </span>
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
    </button>
  );
}

function FileUpload({
  file,
  pageInfo,
  isLoadingText,
  thumbnailUrl,
  uploadedFiles = [],
  onFileChange,
  onSelectFile,
  selectedFileId,
}) {
  return (
    <div className="col-span-2 rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-300">1단계</p>
          <h2 className="text-xl font-semibold text-white">PDF 선택</h2>
        </div>
        {pageInfo.used > 0 && (
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
            {pageInfo.used} / {pageInfo.total} 페이지 사용
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <UploadTile onFileChange={onFileChange} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-1">
          {uploadedFiles.length === 0 && (
            <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300 ring-1 ring-white/5">
              업로드한 PDF가 여기 카드로 표시됩니다.
            </div>
          )}
          {uploadedFiles.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {uploadedFiles.map((item) => (
                <PdfTile
                  key={item.id}
                  file={item.file}
                  thumbnailUrl={item.thumbnail || thumbnailUrl}
                  pageInfo={file?.name === item.file.name ? pageInfo : null}
                  isLoadingText={isLoadingText && file?.name === item.file.name}
                  active={selectedFileId === item.id}
                  onProceed={() => {
                    onSelectFile?.(item);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FileUpload;

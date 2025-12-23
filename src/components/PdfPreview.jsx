function PdfPreview({ pdfUrl, pageInfo }) {
  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-300">PDF 미리보기</p>
          <h3 className="text-lg font-semibold text-white">문제 추출 근거</h3>
        </div>
        {pageInfo.used > 0 && (
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
            {pageInfo.used}/{pageInfo.total} p
          </span>
        )}
      </div>
      {pdfUrl ? (
        <div className="h-[75vh] overflow-hidden rounded-2xl ring-1 ring-white/10">
          <object data={pdfUrl} type="application/pdf" className="h-full w-full">
            <iframe src={pdfUrl} title="PDF preview" className="h-full w-full" />
          </object>
        </div>
      ) : (
        <div className="flex h-[75vh] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-300">
          PDF를 업로드하면 미리보기가 표시됩니다.
        </div>
      )}
    </div>
  );
}

export default PdfPreview;

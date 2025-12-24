function PdfPreview({ pdfUrl, pageInfo }) {
  return (
    <div className="flex flex-col gap-2">
      {pageInfo.used > 0 && (
        <span className="self-start rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
          {pageInfo.used}/{pageInfo.total} p
        </span>
      )}
      {pdfUrl ? (
        <div className="h-[78vh] overflow-hidden">
          <object data={pdfUrl} type="application/pdf" className="h-full w-full">
            <iframe src={pdfUrl} title="PDF preview" className="h-full w-full" />
          </object>
        </div>
      ) : (
        <div className="flex h-[78vh] items-center justify-center text-sm text-slate-300">
          PDF를 업로드하면 미리보기가 표시됩니다.
        </div>
      )}
    </div>
  );
}

export default PdfPreview;

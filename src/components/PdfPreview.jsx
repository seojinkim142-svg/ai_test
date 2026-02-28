import { useMemo, useState } from "react";

function normalizePageNumber(page) {
  const parsed = Number.parseInt(page, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

function buildViewerSrc(pdfUrl, currentPage) {
  const [baseUrl] = String(pdfUrl || "").split("#");
  const page = normalizePageNumber(currentPage);
  return `${baseUrl}#page=${page}&zoom=page-fit`;
}

function PdfPreview({ pdfUrl, currentPage = 1 }) {
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");

  const viewerSrc = useMemo(() => {
    if (!pdfUrl) return "";
    return buildViewerSrc(pdfUrl, currentPage);
  }, [currentPage, pdfUrl]);

  const hasViewer = Boolean(viewerSrc);
  const hasLoadError = hasViewer && failedSrc === viewerSrc;
  const isLoading = hasViewer && loadedSrc !== viewerSrc && failedSrc !== viewerSrc;

  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300">
        PDF를 업로드하면 미리보기가 표시됩니다.
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-[72vh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 lg:min-h-0">
      {!hasLoadError && (
        <iframe
          key={viewerSrc}
          src={viewerSrc}
          title="PDF Preview"
          className="h-full w-full bg-white"
          loading="eager"
          onLoad={() => {
            setLoadedSrc(viewerSrc);
            setFailedSrc("");
          }}
          onError={() => {
            setFailedSrc(viewerSrc);
          }}
        />
      )}

      {isLoading && !hasLoadError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 text-sm text-slate-200">
          PDF 뷰어를 불러오는 중입니다...
        </div>
      )}

      {hasLoadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-sm text-rose-100">
          <p>PDF 뷰어를 불러오지 못했습니다.</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-rose-300/40 px-3 py-2 text-xs text-rose-100 hover:bg-rose-400/10"
          >
            새 탭에서 열기
          </a>
        </div>
      )}
    </div>
  );
}

export default PdfPreview;

import { useCallback, useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerSrc;

function PdfPreview({ pdfUrl, file, pageInfo, onPageChange }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [targetPages, setTargetPages] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [thumbOffset, setThumbOffset] = useState(0);

  const setContainerNode = useCallback((node) => {
    containerRef.current = node;
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(node);
    setContainerWidth(node.clientWidth || 0);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let canceled = false;
    const loadPages = async () => {
      if (!file) {
        setPages([]);
        setRenderError(false);
        setPdfDoc(null);
        setTargetPages(0);
        return;
      }
      setRenderError(false);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(pdf);
        const pagesToRender = Math.min(pdf.numPages, pageInfo.used || pageInfo.total || pdf.numPages);
        setTargetPages(pagesToRender);
        const initialCount = Math.min(pagesToRender, 3);
        const rendered = [];

        for (let i = 1; i <= initialCount; i += 1) {
          const page = await pdf.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth
            ? Math.min(containerWidth / baseViewport.width, 1.5)
            : 1.1;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          if (canceled) return;
          rendered.push({
            pageNumber: i,
            src: canvas.toDataURL("image/png"),
            width: viewport.width,
            height: viewport.height,
            displayWidth: viewport.width,
            displayHeight: viewport.height,
            aspectRatio: viewport.width / viewport.height,
          });
        }
        if (!canceled) setPages(rendered);
      } catch (err) {
        if (!canceled) {
          console.error("PDF render error", err);
          setPages([]);
          setRenderError(true);
        }
      } finally {
        // no-op
      }
    };

    loadPages();
    return () => {
      canceled = true;
    };
  }, [file, pageInfo.used, pageInfo.total, containerWidth]);

  useEffect(() => {
    // 파일이나 페이지 수가 바뀌면 첫 페이지부터 시작
    setActiveIndex(0);
  }, [file, pages.length]);

  const loadMorePages = useCallback(
    async (startFrom) => {
      if (!pdfDoc || isLoadingMore) return;
      if (startFrom > targetPages) return;
      setIsLoadingMore(true);
      try {
        const batchSize = 3;
        const end = Math.min(targetPages, startFrom + batchSize - 1);
        const rendered = [];
        for (let i = startFrom; i <= end; i += 1) {
          const page = await pdfDoc.getPage(i);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth
            ? Math.min(containerWidth / baseViewport.width, 1.5)
            : 1.1;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          rendered.push({
            pageNumber: i,
            src: canvas.toDataURL("image/png"),
            width: viewport.width,
            height: viewport.height,
            displayWidth: viewport.width,
            displayHeight: viewport.height,
            aspectRatio: viewport.width / viewport.height,
          });
        }
        setPages((prev) => {
          const existingNumbers = new Set(prev.map((p) => p.pageNumber));
          const merged = [...prev];
          rendered.forEach((r) => {
            if (!existingNumbers.has(r.pageNumber)) merged.push(r);
          });
          return merged.sort((a, b) => a.pageNumber - b.pageNumber);
        });
      } catch (err) {
        console.error("PDF lazy load error", err);
      } finally {
        setIsLoadingMore(false);
      }
    },
    [pdfDoc, isLoadingMore, targetPages, containerWidth]
  );

  const clampIndex = useCallback(
    (idx) => Math.min(Math.max(idx, 0), Math.max(pages.length - 1, 0)),
    [pages.length]
  );

  const handleWheel = useCallback(
    (e) => {
      if (!pages.length) return;
      const direction = e.deltaY > 0 ? 1 : -1;
      setActiveIndex((prev) => clampIndex(prev + direction));
    },
    [pages.length, clampIndex]
  );

  const handleBarClick = useCallback(
    (event) => {
      if (!pages.length) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      const idx = Math.round(ratio * (pages.length - 1));
      setActiveIndex(clampIndex(idx));
    },
    [pages.length, clampIndex]
  );

  const sliderProgress = pages.length > 1 ? activeIndex / (pages.length - 1) : 0;

  useEffect(() => {
    const trackEl = trackRef.current;
    if (!trackEl) return;
    const { height } = trackEl.getBoundingClientRect();
    const inset = 10;
    const thumbH = 22;
    const usable = Math.max(0, height - inset * 2 - thumbH);
    setThumbOffset(inset + usable * sliderProgress);
  }, [sliderProgress]);

  useEffect(() => {
    if (onPageChange) {
      onPageChange(activeIndex + 1);
    }
  }, [activeIndex, onPageChange]);

  useEffect(() => {
    if (pages.length && activeIndex >= pages.length - 2 && pages.length < targetPages) {
      const next = pages.length + 1;
      loadMorePages(next);
    }
  }, [activeIndex, pages.length, targetPages, loadMorePages]);

  return (
    <div className="flex h-full flex-col gap-3">
      {pageInfo.used > 0 && (
        <span className="self-start rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
          {pageInfo.used}/{pageInfo.total} p
        </span>
      )}

      {pages.length > 0 && !renderError ? (
        <div
          ref={setContainerNode}
          onWheel={handleWheel}
          className="relative flex-1 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/80 via-slate-900/70 to-slate-950/80 shadow-2xl shadow-black/50"
        >
          <div className="absolute left-4 top-4 z-10 rounded-full bg-slate-900/70 px-3 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur ring-1 ring-white/10">
            Page {activeIndex + 1}/{pages.length}
          </div>
          {/* 수직 스크롤 슬라이더 */}
          {pages.length > 1 && (
            <div className="absolute right-4 top-2 bottom-2 z-10 flex items-center">
              <div
                ref={trackRef}
                className="relative h-full w-4 cursor-pointer rounded-full bg-transparent"
                onClick={handleBarClick}
                aria-label="Scroll pages"
              >
        <div className="absolute inset-x-0 top-[10px] bottom-[10px] mx-auto w-[8px] rounded-full bg-neutral-500/60 shadow-inner shadow-black/40" />
        <div
          className="absolute left-0 right-0 mx-auto w-[12px] rounded-full bg-white/85 shadow-lg shadow-black/50 transition-transform duration-200"
          style={{
            height: "22px",
            transform: `translateY(${thumbOffset}px)`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="relative h-full w-full overflow-hidden">
            {pages.map((page, idx) => {
              const availableWidth = containerWidth || page.width;
              const displayWidth = Math.min(page.displayWidth || page.width, availableWidth || page.width);
              const displayHeight = displayWidth / page.aspectRatio;
              const offset = (idx - activeIndex) * 100;
              const isActive = idx === activeIndex;
              return (
                <div
                  key={page.pageNumber}
                  className="absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out"
                  style={{
                    transform: `translateX(${offset}%)`,
                    opacity: isActive ? 1 : 0.3,
                    pointerEvents: isActive ? "auto" : "none",
                  }}
                >
                  <div
                    className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/60 shadow-2xl shadow-black/60 ring-1 ring-white/5"
                    style={{ width: `${displayWidth}px`, height: `${displayHeight}px`, maxWidth: "100%" }}
                  >
                    <img
                      src={page.src}
                      alt={`Page ${page.pageNumber}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : pdfUrl ? (
        <div className="flex h-full flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <object data={pdfUrl} type="application/pdf" className="h-full w-full">
            <iframe src={pdfUrl} title="PDF preview" className="h-full w-full" />
          </object>
        </div>
      ) : (
        <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300">
          PDF를 업로드하면 미리보기가 표시됩니다.
        </div>
      )}
    </div>
  );
}

export default PdfPreview;

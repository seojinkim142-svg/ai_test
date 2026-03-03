import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

let pdfRuntimePromise = null;

async function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = (async () => {
      const [pdfjs, workerSrcModule] = await Promise.all([
        import("pdfjs-dist"),
        import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
      ]);
      const workerSrc = workerSrcModule?.default || workerSrcModule;
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs;
    })();
  }
  return pdfRuntimePromise;
}

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

function buildFileSignature(file) {
  if (!file) return "";
  const name = String(file.name || "");
  const size = Number(file.size || 0);
  const modified = Number(file.lastModified || 0);
  return `${name}:${size}:${modified}`;
}

function detectTabletDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
  const hasTouch = maxTouchPoints > 0;
  const screenWidth = Number(window.screen?.width || window.innerWidth || 0);
  const screenHeight = Number(window.screen?.height || window.innerHeight || 0);
  const shorterSide = Math.min(screenWidth, screenHeight);
  const longerSide = Math.max(screenWidth, screenHeight);

  const isIpad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && hasTouch);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  const isLargeTouchDevice = hasTouch && shorterSide >= 700 && longerSide >= 900;

  return isIpad || isAndroidTablet || isLargeTouchDevice;
}

function PdfPreview({ pdfUrl, file = null, pageInfo = null, currentPage = 1, onPageChange = null }) {
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const [nativeError, setNativeError] = useState("");
  const [isNativeLoading, setIsNativeLoading] = useState(false);
  const [isTabletDevice, setIsTabletDevice] = useState(() => detectTabletDevice());
  const [pageJumpInput, setPageJumpInput] = useState(() =>
    String(normalizePageNumber(currentPage))
  );
  const [docVersion, setDocVersion] = useState(0);
  const canvasRef = useRef(null);
  const nativeScrollRef = useRef(null);
  const pdfDocRef = useRef(null);
  const renderTaskRef = useRef(null);
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef(null);
  const sourceKey = useMemo(
    () => (file ? buildFileSignature(file) : String(pdfUrl || "")),
    [file, pdfUrl]
  );
  const normalizedCurrentPage = normalizePageNumber(currentPage);
  const totalPages = useMemo(() => {
    const fromInfo = Number(pageInfo?.total || pageInfo?.used || 0);
    const fromDoc = Number(pdfDocRef.current?.numPages || 0);
    return Math.max(1, fromInfo, fromDoc);
  }, [docVersion, pageInfo?.total, pageInfo?.used]);

  const goToPage = useCallback(
    (pageNumber) => {
      const parsed = Number.parseInt(pageNumber, 10);
      if (!Number.isFinite(parsed)) return;
      const bounded = Math.min(Math.max(1, parsed), totalPages);
      if (typeof onPageChange === "function") {
        onPageChange(bounded);
      }
    },
    [onPageChange, totalPages]
  );

  const handlePageJumpSubmit = useCallback(() => {
    const parsed = Number.parseInt(pageJumpInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageJumpInput(String(normalizedCurrentPage));
      return;
    }
    goToPage(parsed);
    if (nativeScrollRef.current) nativeScrollRef.current.scrollTop = 0;
  }, [goToPage, normalizedCurrentPage, pageJumpInput]);

  useEffect(() => {
    setPageJumpInput(String(normalizedCurrentPage));
  }, [normalizedCurrentPage, sourceKey]);

  const goToNextPage = useCallback(() => {
    if (normalizedCurrentPage >= totalPages) return;
    goToPage(normalizedCurrentPage + 1);
    if (nativeScrollRef.current) nativeScrollRef.current.scrollTop = 0;
  }, [goToPage, normalizedCurrentPage, totalPages]);

  const goToPreviousPage = useCallback(() => {
    if (normalizedCurrentPage <= 1) return;
    goToPage(normalizedCurrentPage - 1);
    if (nativeScrollRef.current) nativeScrollRef.current.scrollTop = 0;
  }, [goToPage, normalizedCurrentPage]);

  useEffect(() => {
    if (!isNativePlatform) return undefined;
    const syncTabletState = () => {
      setIsTabletDevice(detectTabletDevice());
    };
    syncTabletState();
    window.addEventListener("resize", syncTabletState);
    window.addEventListener("orientationchange", syncTabletState);
    return () => {
      window.removeEventListener("resize", syncTabletState);
      window.removeEventListener("orientationchange", syncTabletState);
    };
  }, [isNativePlatform]);

  const handleNativeWheel = useCallback(
    (event) => {
      if (isTabletDevice) return;
      const container = nativeScrollRef.current;
      if (!container) return;

      const now = Date.now();
      if (now - wheelLockRef.current < 260) return;

      const atTop = container.scrollTop <= 2;
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;

      if (event.deltaY > 12 && atBottom && normalizedCurrentPage < totalPages) {
        event.preventDefault();
        wheelLockRef.current = now;
        goToNextPage();
      } else if (event.deltaY < -12 && atTop && normalizedCurrentPage > 1) {
        event.preventDefault();
        wheelLockRef.current = now;
        goToPreviousPage();
      }
    },
    [goToNextPage, goToPreviousPage, isTabletDevice, normalizedCurrentPage, totalPages]
  );

  const handleNativeTouchStart = useCallback((event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleNativeTouchEnd = useCallback(
    (event) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;

      if (isTabletDevice) {
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        const travel = Math.hypot(deltaX, deltaY);
        const elapsed = Date.now() - start.time;
        if (travel > 24 || elapsed > 350) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasRect = canvas.getBoundingClientRect();
        const insideX = touch.clientX >= canvasRect.left && touch.clientX <= canvasRect.right;
        const insideY = touch.clientY >= canvasRect.top && touch.clientY <= canvasRect.bottom;
        if (!insideX || !insideY) return;

        const midX = canvasRect.left + canvasRect.width / 2;
        if (touch.clientX < midX) {
          goToPreviousPage();
        } else {
          goToNextPage();
        }
        return;
      }

      const deltaY = touch.clientY - start.y;
      const travel = Math.abs(deltaY);
      const elapsed = Date.now() - start.time;
      if (travel < 70 || elapsed > 900) return;

      const container = nativeScrollRef.current;
      if (!container) return;

      const atTop = container.scrollTop <= 2;
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;

      if (deltaY < 0 && atBottom) {
        goToNextPage();
      } else if (deltaY > 0 && atTop) {
        goToPreviousPage();
      }
    },
    [goToNextPage, goToPreviousPage, isTabletDevice]
  );

  const viewerSrc = useMemo(() => {
    if (!pdfUrl) return "";
    return buildViewerSrc(pdfUrl, currentPage);
  }, [currentPage, pdfUrl]);

  useEffect(() => {
    if (!isNativePlatform) return undefined;
    let cancelled = false;

    const releaseCurrentDoc = async () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancelled/finished render task cleanup errors
        }
        renderTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        const previousDoc = pdfDocRef.current;
        pdfDocRef.current = null;
        try {
          await previousDoc.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    };

    const loadNativeDocument = async () => {
      setNativeError("");
      setIsNativeLoading(true);

      try {
        await releaseCurrentDoc();

        let source = null;
        if (file && typeof file.arrayBuffer === "function") {
          source = { data: await file.arrayBuffer() };
        } else if (pdfUrl) {
          source = pdfUrl;
        }
        if (!source) return;

        const pdfjsLib = await loadPdfRuntime();
        const loadingTask = pdfjsLib.getDocument(source);
        const doc = await loadingTask.promise;

        if (cancelled) {
          await doc.destroy();
          return;
        }

        pdfDocRef.current = doc;
        setDocVersion((prev) => prev + 1);
      } catch (err) {
        if (!cancelled) {
          setNativeError(err?.message || "PDF 미리보기를 초기화하지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setIsNativeLoading(false);
        }
      }
    };

    loadNativeDocument();

    return () => {
      cancelled = true;
      releaseCurrentDoc();
    };
  }, [file, isNativePlatform, pdfUrl, sourceKey]);

  useEffect(() => {
    if (!isNativePlatform) return undefined;

    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return undefined;

    let cancelled = false;

    const renderCurrentPage = async () => {
      setNativeError("");
      setIsNativeLoading(true);

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const maxPage = Math.max(1, Number(doc.numPages) || 1);
        const targetPage = Math.min(Math.max(1, normalizePageNumber(currentPage)), maxPage);
        if (targetPage !== normalizePageNumber(currentPage) && typeof onPageChange === "function") {
          onPageChange(targetPage);
        }
        const page = await doc.getPage(targetPage);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context is unavailable.");

        const parentWidth = canvas.parentElement?.clientWidth || 920;
        const maxCssWidth = Math.max(320, Math.min(parentWidth - 16, 1400));
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = maxCssWidth / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.max(1, Math.floor(viewport.width / pixelRatio))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(viewport.height / pixelRatio))}px`;

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({
          canvasContext: context,
          viewport,
          intent: "display",
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled) return;
      } catch (err) {
        if (cancelled || err?.name === "RenderingCancelledException") return;
        setNativeError(err?.message || "PDF 페이지 렌더링에 실패했습니다.");
      } finally {
        if (!cancelled) {
          setIsNativeLoading(false);
        }
      }
    };

    renderCurrentPage();

    const handleResize = () => {
      renderCurrentPage();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cleanup errors
        }
        renderTaskRef.current = null;
      }
    };
  }, [currentPage, docVersion, isNativePlatform, onPageChange]);

  if (!pdfUrl && !file) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300">
        PDF를 업로드하면 미리보기가 표시됩니다.
      </div>
    );
  }

  if (isNativePlatform) {
    return (
      <div className="relative flex h-full min-h-[72vh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 lg:min-h-0">
        <div
          ref={nativeScrollRef}
          className="h-full w-full overflow-auto p-2 sm:p-3"
          onWheel={handleNativeWheel}
          onTouchStart={handleNativeTouchStart}
          onTouchEnd={handleNativeTouchEnd}
        >
          <canvas ref={canvasRef} className="mx-auto block rounded-xl bg-white shadow-lg shadow-black/30" />
        </div>

        {isNativeLoading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/35 text-sm text-slate-200">
            PDF가 로딩중입니다.
          </div>
        )}

        {nativeError && (
          <div className="absolute inset-x-3 bottom-3 z-20 rounded-xl border border-rose-300/40 bg-rose-950/70 px-3 py-2 text-xs text-rose-100">
            <p className="font-semibold">PDF 미리보기를 불러오지 못했습니다.</p>
            <p className="mt-1 opacity-90">{nativeError}</p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-slate-900/90 px-2 py-1 text-xs text-slate-100 shadow-lg shadow-black/40">
            <button
              type="button"
              onClick={goToPreviousPage}
              disabled={normalizedCurrentPage <= 1}
              className="rounded-full border border-white/20 px-3 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="min-w-[78px] text-center tabular-nums">
              {normalizedCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={normalizedCurrentPage >= totalPages}
              className="rounded-full border border-white/20 px-3 py-1 disabled:opacity-40"
            >
              Next
            </button>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageJumpInput}
              onChange={(event) => {
                const next = String(event.target.value || "");
                if (!/^\d*$/.test(next)) return;
                setPageJumpInput(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handlePageJumpSubmit();
                }
              }}
              placeholder="p"
              className="w-14 rounded-md border border-white/20 bg-black/25 px-2 py-1 text-center text-xs text-slate-100 outline-none ring-1 ring-transparent focus:border-emerald-300/60 focus:ring-emerald-300/40"
            />
            <button
              type="button"
              onClick={handlePageJumpSubmit}
              className="rounded-full border border-emerald-300/40 px-3 py-1 text-emerald-100"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasViewer = Boolean(viewerSrc);
  const hasLoadError = hasViewer && failedSrc === viewerSrc;
  const isLoading = hasViewer && loadedSrc !== viewerSrc && failedSrc !== viewerSrc;

  return (
    <div className="relative flex h-full min-h-[72vh] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 lg:min-h-0">
      {!hasLoadError && (
        <iframe
          key={viewerSrc}
          src={viewerSrc}
          title="PDF Preview"
          className="absolute inset-0 z-0 h-full w-full bg-white"
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
          PDF가 로딩중입니다.
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


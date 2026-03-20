import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectSupportedDocumentKind, isPdfDocumentKind } from "../utils/document";

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

function buildOfficeViewerSrc(documentUrl) {
  const normalized = String(documentUrl || "").trim();
  if (!normalized) return "";
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(normalized)}`;
}

function buildFileSignature(file) {
  if (!file) return "";
  const name = String(file.name || "");
  const size = Number(file.size || 0);
  const modified = Number(file.lastModified || 0);
  return `${name}:${size}:${modified}`;
}

function getFileExtension(fileName) {
  const raw = String(fileName || "").trim().toLowerCase();
  if (!raw) return "";
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === raw.length - 1) return "";
  return raw.slice(dotIndex + 1);
}

function isPdfLikeFile(file) {
  if (!file) return false;
  const fileType = String(file.type || "").trim().toLowerCase();
  if (fileType.includes("pdf")) return true;
  return getFileExtension(file.name) === "pdf";
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

function PdfPreview({
  pdfUrl,
  documentUrl = "",
  file = null,
  pageInfo = null,
  currentPage = 1,
  onPageChange = null,
  previewText = "",
  isLoadingText = false,
}) {
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const [officeViewMode, setOfficeViewMode] = useState("original");
  const [loadedOfficeSrc, setLoadedOfficeSrc] = useState("");
  const [failedOfficeSrc, setFailedOfficeSrc] = useState("");
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
  const renderRequestRef = useRef(0);
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef(null);
  const sourceKey = useMemo(
    () => (file ? buildFileSignature(file) : String(pdfUrl || "")),
    [file, pdfUrl]
  );
  const documentKind = useMemo(() => detectSupportedDocumentKind(file), [file]);
  const canPreviewPdf = useMemo(
    () => Boolean(pdfUrl) || isPdfLikeFile(file) || isPdfDocumentKind(documentKind),
    [documentKind, file, pdfUrl]
  );
  const officePreviewLabel = useMemo(() => {
    if (documentKind === "pptx") return "슬라이드 텍스트 미리보기";
    if (documentKind === "docx") return "본문 텍스트 미리보기";
    return "";
  }, [documentKind]);
  const officePreviewMeta = useMemo(() => {
    if (documentKind === "pptx") {
      const totalSlides = Number(pageInfo?.total || pageInfo?.used || 0);
      if (totalSlides > 0) return `${totalSlides}개 슬라이드 텍스트`;
      return "슬라이드 텍스트 기반 미리보기";
    }
    if (documentKind === "docx") {
      return "문서에서 추출한 텍스트 기반 미리보기";
    }
    return "";
  }, [documentKind, pageInfo?.total, pageInfo?.used]);
  const hasOfficePreviewText = useMemo(() => Boolean(String(previewText || "").trim()), [previewText]);
  const hasOfficeViewerUrl = useMemo(
    () => Boolean(documentUrl) && (documentKind === "docx" || documentKind === "pptx"),
    [documentKind, documentUrl]
  );
  const officeViewerSrc = useMemo(
    () => (hasOfficeViewerUrl ? buildOfficeViewerSrc(documentUrl) : ""),
    [documentUrl, hasOfficeViewerUrl]
  );
  const normalizedCurrentPage = normalizePageNumber(currentPage);
  const totalPages = useMemo(() => {
    const fromInfo = Number(pageInfo?.total || pageInfo?.used || 0);
    const fromDoc = Number(pdfDocRef.current?.numPages || 0);
    return Math.max(1, fromInfo, fromDoc);
  }, [docVersion, pageInfo?.total, pageInfo?.used]);
  const isOfficeDocument = documentKind === "docx" || documentKind === "pptx";
  const canDownloadFile = file instanceof File || Boolean(pdfUrl) || Boolean(documentUrl);

  const handleDownloadFile = useCallback(() => {
    const targetUrl =
      file instanceof File ? URL.createObjectURL(file) : String(pdfUrl || documentUrl || "").trim();
    if (!targetUrl) return;

    const downloadName =
      String(file?.name || "").trim() ||
      (documentKind === "pptx" ? "document.pptx" : documentKind === "docx" ? "document.docx" : "document.pdf");

    const link = document.createElement("a");
    link.href = targetUrl;
    link.download = downloadName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (file instanceof File) {
      setTimeout(() => URL.revokeObjectURL(targetUrl), 60_000);
    }
  }, [documentKind, documentUrl, file, pdfUrl]);

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
    const bounded = Math.min(Math.max(1, parsed), totalPages);
    goToPage(bounded);
    setPageJumpInput(String(bounded));
    if (nativeScrollRef.current) nativeScrollRef.current.scrollTop = 0;
  }, [goToPage, normalizedCurrentPage, pageJumpInput, totalPages]);

  useEffect(() => {
    setPageJumpInput(String(normalizedCurrentPage));
  }, [normalizedCurrentPage, sourceKey]);

  useEffect(() => {
    if (!isOfficeDocument) {
      setOfficeViewMode("original");
      setLoadedOfficeSrc("");
      setFailedOfficeSrc("");
      return;
    }
    setLoadedOfficeSrc("");
    setFailedOfficeSrc("");
    setOfficeViewMode(hasOfficeViewerUrl ? "original" : "text");
  }, [hasOfficeViewerUrl, isOfficeDocument, sourceKey, officeViewerSrc]);

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
    const handleKeyNavigation = (event) => {
      const tagName = String(event?.target?.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea") return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goToPreviousPage();
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goToNextPage();
      }
    };
    window.addEventListener("keydown", handleKeyNavigation);
    return () => {
      window.removeEventListener("keydown", handleKeyNavigation);
    };
  }, [goToNextPage, goToPreviousPage, isNativePlatform]);

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

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const elapsed = Date.now() - start.time;

      // Horizontal swipe: move pages regardless of in-page scroll location.
      if (elapsed <= 900 && absX >= 70 && absX > absY * 1.1) {
        if (deltaX < 0) goToNextPage();
        else goToPreviousPage();
        return;
      }

      if (isTabletDevice) {
        const travel = Math.hypot(deltaX, deltaY);
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

      if (absY < 70 || elapsed > 900) return;

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

  const handleNativeCanvasClick = useCallback(
    (event) => {
      if (!isTabletDevice) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const isInsideX = event.clientX >= rect.left && event.clientX <= rect.right;
      const isInsideY = event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (!isInsideX || !isInsideY) return;
      const midX = rect.left + rect.width / 2;
      if (event.clientX < midX) {
        goToPreviousPage();
      } else {
        goToNextPage();
      }
    },
    [goToNextPage, goToPreviousPage, isTabletDevice]
  );

  const viewerSrc = useMemo(() => {
    if (!pdfUrl) return "";
    return buildViewerSrc(pdfUrl, currentPage);
  }, [currentPage, pdfUrl]);

  const pageController = (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-2 sm:bottom-3 sm:px-3">
      <div className="pointer-events-auto inline-flex w-full max-w-[22rem] items-center justify-between gap-1 rounded-[1.35rem] border border-white/15 bg-slate-900/92 px-2 py-1.5 text-[11px] text-slate-100 shadow-lg shadow-black/40 sm:w-auto sm:max-w-none sm:gap-2 sm:rounded-2xl sm:px-2 sm:py-1 sm:text-xs">
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
          onBlur={handlePageJumpSubmit}
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
          이동
        </button>
      </div>
    </div>
  );

  useEffect(() => {
    if (!isNativePlatform || !canPreviewPdf) return undefined;
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
        if (isPdfLikeFile(file) && typeof file?.arrayBuffer === "function") {
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
  }, [canPreviewPdf, file, isNativePlatform, pdfUrl, sourceKey]);

  useEffect(() => {
    if (!isNativePlatform || !canPreviewPdf) return undefined;

    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return undefined;

    const requestId = renderRequestRef.current + 1;
    renderRequestRef.current = requestId;
    let cancelled = false;

    const renderCurrentPage = async () => {
      setNativeError("");
      setIsNativeLoading(true);
      let renderTask = null;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const maxPage = Math.max(1, Number(doc.numPages) || 1);
        const requestedPage = normalizePageNumber(currentPage);
        const targetPage = Math.min(Math.max(1, requestedPage), maxPage);
        if (targetPage !== requestedPage && typeof onPageChange === "function") {
          onPageChange(targetPage);
          return;
        }
        const page = await doc.getPage(targetPage);
        if (cancelled || renderRequestRef.current !== requestId) return;
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

        if (cancelled || renderRequestRef.current !== requestId) return;

        renderTask = page.render({
          canvasContext: context,
          viewport,
          intent: "display",
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (cancelled || renderRequestRef.current !== requestId) return;
      } catch (err) {
        if (cancelled || err?.name === "RenderingCancelledException") return;
        setNativeError(err?.message || "PDF 페이지 렌더링에 실패했습니다.");
      } finally {
        if (renderTask && renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
        if (!cancelled && renderRequestRef.current === requestId) {
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
      if (renderRequestRef.current === requestId) {
        renderRequestRef.current += 1;
      }
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
  }, [canPreviewPdf, currentPage, docVersion, isNativePlatform, onPageChange]);

  const isOfficeOriginalMode =
    isOfficeDocument && officeViewMode === "original" && Boolean(officeViewerSrc);
  const officeHasLoadError = isOfficeOriginalMode && failedOfficeSrc === officeViewerSrc;
  const isOfficeLoading =
    isOfficeOriginalMode && loadedOfficeSrc !== officeViewerSrc && failedOfficeSrc !== officeViewerSrc;

  if (!pdfUrl && !file) {
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300">
        PDF를 업로드하면 미리보기가 표시됩니다.
      </div>
    );
  }

  if (isOfficeDocument) {
    return (
      <div className="relative flex h-[58svh] min-h-[24rem] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0">
        <div className="border-b border-white/10 bg-slate-900/90 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
                  documentKind === "pptx"
                    ? "border-orange-300/30 bg-orange-400/10 text-orange-100"
                    : "border-emerald-300/30 bg-emerald-400/10 text-emerald-100"
                }`}
              >
                {String(documentKind || "").toUpperCase()}
              </span>
              <p className="text-sm font-semibold text-slate-100">
                {isOfficeOriginalMode ? "원본 보기" : officePreviewLabel}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadFile}
                disabled={!canDownloadFile}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                다운로드
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!hasOfficeViewerUrl) return;
                  setLoadedOfficeSrc("");
                  setFailedOfficeSrc("");
                  setOfficeViewMode("original");
                }}
                disabled={!hasOfficeViewerUrl}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  isOfficeOriginalMode
                    ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-100"
                    : "border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                원본 보기
              </button>
              <button
                type="button"
                onClick={() => setOfficeViewMode("text")}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  !isOfficeOriginalMode
                    ? "border-emerald-300/50 bg-emerald-400/10 text-emerald-100"
                    : "border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10"
                }`}
              >
                텍스트 보기
              </button>
              {officeViewerSrc && (
                <a
                  href={officeViewerSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-200 transition hover:border-white/30 hover:bg-white/10"
                >
                  새 탭
                </a>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {isOfficeOriginalMode
              ? "마이크로소프트 뷰어로 원본 레이아웃을 표시합니다."
              : `${officePreviewMeta}${hasOfficePreviewText ? " 이미지, 표, 도형 레이아웃은 제외되고 텍스트 위주로 표시됩니다." : ""}`}
          </p>
          {!hasOfficeViewerUrl && (
            <p className="mt-1 text-xs text-amber-200/90">
              원격 URL이 없어 원본 보기를 열 수 없습니다. 텍스트 보기로 표시합니다.
            </p>
          )}
        </div>

        {isOfficeOriginalMode ? (
          <div className="relative flex-1 bg-white">
            {!officeHasLoadError && (
              <iframe
                key={officeViewerSrc}
                src={officeViewerSrc}
                title="Microsoft Office Preview"
                className="absolute inset-0 h-full w-full bg-white"
                loading="eager"
                onLoad={() => {
                  setLoadedOfficeSrc(officeViewerSrc);
                  setFailedOfficeSrc("");
                }}
                onError={() => {
                  setFailedOfficeSrc(officeViewerSrc);
                }}
              />
            )}

            {isOfficeLoading && !officeHasLoadError && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/20 text-sm text-slate-700">
                마이크로소프트 뷰어를 불러오는 중입니다.
              </div>
            )}

            {officeHasLoadError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-5 text-center text-sm text-slate-700">
                <p>원본 보기를 불러오지 못했습니다.</p>
                <button
                  type="button"
                  onClick={() => setOfficeViewMode("text")}
                  className="rounded-full border border-slate-300/70 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
                >
                  텍스트 보기로 전환
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {hasOfficePreviewText ? (
              <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-slate-900/55 p-4 shadow-lg shadow-black/20 sm:p-5">
                <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">
                  {String(previewText || "").trim()}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 px-5 text-center text-sm text-slate-300">
                {isLoadingText
                  ? `${String(documentKind || "").toUpperCase()} 본문을 준비 중입니다.`
                  : "추출된 본문 텍스트가 없어 미리보기를 표시할 수 없습니다."}
              </div>
            )}
          </div>
        )}

        {isLoadingText && !hasOfficePreviewText && !isOfficeOriginalMode && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 text-sm text-slate-100">
            문서 텍스트를 추출 중입니다.
          </div>
        )}
      </div>
    );
  }

  if (!canPreviewPdf) {
    const extension = getFileExtension(file?.name);
    const label = extension ? extension.toUpperCase() : "문서";
    return (
      <div className="flex h-full flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 text-center text-sm text-slate-300">
        {label} 파일은 본문 미리보기를 지원하지 않습니다. 요약/퀴즈는 추출 텍스트 기반으로 생성됩니다.
      </div>
    );
  }

  if (isNativePlatform) {
    return (
      <div className="relative flex h-[58svh] min-h-[24rem] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0">
        {canDownloadFile && (
          <div className="absolute right-3 top-3 z-30">
            <button
              type="button"
              onClick={handleDownloadFile}
              className="rounded-full border border-white/20 bg-slate-900/88 px-3 py-1.5 text-xs text-slate-100 shadow-lg shadow-black/30 transition hover:border-emerald-300/50 hover:bg-slate-800"
            >
              다운로드
            </button>
          </div>
        )}
        <div
          ref={nativeScrollRef}
          className="h-full w-full overflow-y-auto overflow-x-hidden p-1.5 sm:p-3"
          onWheel={handleNativeWheel}
          onTouchStart={handleNativeTouchStart}
          onTouchEnd={handleNativeTouchEnd}
        >
          <canvas
            ref={canvasRef}
            onClick={handleNativeCanvasClick}
            className={`mx-auto block rounded-xl bg-white shadow-lg shadow-black/30 ${
              isTabletDevice ? "cursor-pointer" : ""
            }`}
          />
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

        {pageController}
      </div>
    );
  }

  const hasViewer = Boolean(viewerSrc);
  const hasLoadError = hasViewer && failedSrc === viewerSrc;
  const isLoading = hasViewer && loadedSrc !== viewerSrc && failedSrc !== viewerSrc;

  return (
    <div className="relative flex h-[58svh] min-h-[24rem] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0">
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


import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectSupportedDocumentKind, isPdfDocumentKind } from "../utils/document";
import { findHighlightRects } from "../utils/pdfHighlight";
import { ErrorCodes, handleError } from "../utils/errorHandler";
import ErrorDisplay from "./ErrorDisplay";

let pdfRuntimePromise = null;

function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === "function") return;
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

async function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = (async () => {
      ensurePromiseWithResolvers();
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

function stripUrlHash(url) {
  return String(url || "").split("#")[0];
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

function detectMobilePhoneViewport() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const width = Number(window.innerWidth || 0);
  const isPhoneUserAgent =
    /iPhone|iPod|Android.+Mobile|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isPhoneUserAgent || (width > 0 && width < 768 && !detectTabletDevice());
}

function PdfPreview({
  pdfUrl,
  documentUrl = "",
  file = null,
  pageInfo = null,
  currentPage = 1,
  evidenceHighlight = null,
  onPageChange = null,
  previewText = "",
  isLoadingText = false,
}) {
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const [loadedSrc, setLoadedSrc] = useState("");
  const [failedSrc, setFailedSrc] = useState("");
  const [iframeSrc, setIframeSrc] = useState("");
  const [officeViewMode, setOfficeViewMode] = useState("original");
  const [loadedOfficeSrc, setLoadedOfficeSrc] = useState("");
  const [failedOfficeSrc, setFailedOfficeSrc] = useState("");
  const [nativeError, setNativeError] = useState("");
  const [isNativeLoading, setIsNativeLoading] = useState(false);
  const [isTabletDevice, setIsTabletDevice] = useState(() => detectTabletDevice());
  const [isMobilePhoneViewport, setIsMobilePhoneViewport] = useState(() => detectMobilePhoneViewport());
  const [mobileFrameHeight, setMobileFrameHeight] = useState(null);
  const [highlightRects, setHighlightRects] = useState([]);
  const [pageJumpInput, setPageJumpInput] = useState(() =>
    String(normalizePageNumber(currentPage))
  );
  const [docVersion, setDocVersion] = useState(0);
  const previewRootRef = useRef(null);
  const iframeRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasShellRef = useRef(null);
  const nativeScrollRef = useRef(null);
  const pdfDocRef = useRef(null);
  const pageLayoutCacheRef = useRef(new Map());
  const renderTaskRef = useRef(null);
  const renderRequestRef = useRef(0);
  const renderCycleRef = useRef(0);
  const resizeRafRef = useRef(null);
  const wheelLockRef = useRef(0);
  const touchStartRef = useRef(null);
  const iframeRetrySrcRef = useRef("");
  const iframeResetTimerRef = useRef(null);
  const sourceKey = useMemo(() => {
    const parts = [
      file ? buildFileSignature(file) : "",
      String(pdfUrl || "").trim(),
      String(documentUrl || "").trim(),
    ].filter(Boolean);
    return parts.join("::");
  }, [documentUrl, file, pdfUrl]);
  const documentKind = useMemo(() => detectSupportedDocumentKind(file), [file]);
  const isOfficeDocument = useMemo(
    () => documentKind === "docx" || documentKind === "pptx",
    [documentKind]
  );
  const hasConvertedOfficePdfPreview = useMemo(
    () => isOfficeDocument && Boolean(String(pdfUrl || "").trim()),
    [isOfficeDocument, pdfUrl]
  );
  const shouldUseOfficeDocumentFallback = isOfficeDocument && !hasConvertedOfficePdfPreview;
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
  const activeHighlightTarget = useMemo(() => {
    if (!evidenceHighlight) return null;
    const pageNumber = normalizePageNumber(evidenceHighlight?.pageNumber);
    const snippet = String(evidenceHighlight?.snippet || "").trim();
    const label = String(evidenceHighlight?.label || "").trim();
    if (!pageNumber) return null;
    return {
      pageNumber,
      snippet,
      label,
      requestId: String(
        evidenceHighlight?.requestId || `${pageNumber}:${snippet}:${label}`
      ),
    };
  }, [evidenceHighlight]);
  const totalPages = useMemo(() => {
    const fromInfo = Number(pageInfo?.total || pageInfo?.used || 0);
    const fromDoc = Number(pdfDocRef.current?.numPages || 0);
    return Math.max(1, fromInfo, fromDoc);
  }, [docVersion, pageInfo?.total, pageInfo?.used]);
  const preferredPdfSourceUrl = useMemo(() => {
    const localUrl = String(pdfUrl || "").trim();
    const remoteUrl = shouldUseOfficeDocumentFallback ? "" : String(documentUrl || "").trim();
    return localUrl || remoteUrl;
  }, [documentUrl, pdfUrl, shouldUseOfficeDocumentFallback]);
  const viewerSrc = useMemo(() => {
    if (!preferredPdfSourceUrl) return "";
    return buildViewerSrc(preferredPdfSourceUrl, currentPage);
  }, [currentPage, preferredPdfSourceUrl]);
  const viewerBaseSrc = useMemo(() => stripUrlHash(viewerSrc), [viewerSrc]);
  const useCanvasPdfPreview = canPreviewPdf && isNativePlatform;
  const isMobileFullScreenPreview = isMobilePhoneViewport && !isTabletDevice;
  const canDownloadFile = file instanceof File || Boolean(pdfUrl) || Boolean(documentUrl);

  const previewShellClassName = useMemo(() => {
    if (isMobileFullScreenPreview) {
      return "relative flex flex-1 overflow-hidden bg-slate-950/88";
    }
    return "relative flex h-[58svh] min-h-[24rem] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0";
  }, [isMobileFullScreenPreview]);
  const previewColumnShellClassName = useMemo(() => {
    if (isMobileFullScreenPreview) {
      return "relative flex flex-1 flex-col overflow-hidden bg-slate-950/88";
    }
    return "relative flex h-[58svh] min-h-[24rem] flex-1 flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/40 sm:min-h-[72vh] lg:h-full lg:min-h-0";
  }, [isMobileFullScreenPreview]);
  const previewShellStyle = useMemo(() => {
    if (!isMobileFullScreenPreview || !Number.isFinite(mobileFrameHeight) || mobileFrameHeight <= 0) {
      return undefined;
    }
    const height = `${mobileFrameHeight}px`;
    return {
      height,
      minHeight: height,
    };
  }, [isMobileFullScreenPreview, mobileFrameHeight]);

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
    pageLayoutCacheRef.current.clear();
    setHighlightRects([]);
  }, [sourceKey]);

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

  const retryPdfIframeLoad = useCallback((targetSrc) => {
    if (!targetSrc || typeof window === "undefined") return;
    if (iframeResetTimerRef.current) {
      window.clearTimeout(iframeResetTimerRef.current);
      iframeResetTimerRef.current = null;
    }
    iframeRetrySrcRef.current = targetSrc;
    setFailedSrc("");
    setLoadedSrc("");
    setIframeSrc("about:blank");
    iframeResetTimerRef.current = window.setTimeout(() => {
      iframeResetTimerRef.current = null;
      setIframeSrc(targetSrc);
    }, 80);
  }, []);

  useEffect(() => {
    return () => {
      if (iframeResetTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(iframeResetTimerRef.current);
        iframeResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (iframeResetTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(iframeResetTimerRef.current);
      iframeResetTimerRef.current = null;
    }
    iframeRetrySrcRef.current = "";
    if (!viewerSrc) {
      setIframeSrc("");
      setLoadedSrc("");
      setFailedSrc("");
      return;
    }
    setFailedSrc("");
    setIframeSrc(viewerSrc);
    setLoadedSrc((prev) => (stripUrlHash(prev) === stripUrlHash(viewerSrc) ? viewerSrc : ""));
  }, [sourceKey, viewerSrc]);

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
    if (!useCanvasPdfPreview) return undefined;
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
  }, [goToNextPage, goToPreviousPage, useCanvasPdfPreview]);

  useEffect(() => {
    const syncViewportFrame = () => {
      setIsTabletDevice(detectTabletDevice());
      setIsMobilePhoneViewport(detectMobilePhoneViewport());
    };
    syncViewportFrame();
    window.addEventListener("resize", syncViewportFrame);
    window.addEventListener("orientationchange", syncViewportFrame);
    return () => {
      window.removeEventListener("resize", syncViewportFrame);
      window.removeEventListener("orientationchange", syncViewportFrame);
    };
  }, []);

  useEffect(() => {
    if (!isMobileFullScreenPreview) {
      setMobileFrameHeight(null);
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      const root = previewRootRef.current;
      if (!root || typeof window === "undefined") return;
      const top = root.getBoundingClientRect().top;
      const availableHeight = Math.max(320, Math.floor(window.innerHeight - Math.max(0, top)));
      setMobileFrameHeight((prev) => (prev === availableHeight ? prev : availableHeight));
    };

    const scheduleMeasure = () => {
      if (typeof window === "undefined") return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", scheduleMeasure);
    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
      if (frame && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isMobileFullScreenPreview, officeViewMode, sourceKey, useCanvasPdfPreview]);

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

  const buildNativePageLayout = useCallback(
    async (pageNumber) => {
      const doc = pdfDocRef.current;
      if (!doc) return null;

      const normalizedPage = normalizePageNumber(pageNumber);
      const cacheKey = `${sourceKey}:${normalizedPage}`;
      const cached = pageLayoutCacheRef.current.get(cacheKey);
      if (cached) return cached;

      const pdfjsLib = await loadPdfRuntime();
      const page = await doc.getPage(normalizedPage);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();

      let pageText = "";
      const items = [];
      for (const item of content.items || []) {
        const text = String(item?.str || "").trim();
        if (!text) continue;

        const withSpace = pageText ? " " : "";
        const start = pageText.length + withSpace.length;
        pageText += withSpace + text;
        const end = pageText.length;

        const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = transformed[4];
        const y = transformed[5];
        const scaleX = Math.hypot(transformed[0], transformed[1]);
        const scaleY = Math.hypot(transformed[2], transformed[3]);
        const widthPx = scaleX * item.width;
        const heightPx = scaleY * (item.height || Math.abs(transformed[3]));
        const highlightHeight = heightPx * 0.6;
        const topY = y - highlightHeight * 0.9;

        items.push({
          text,
          start,
          end,
          rect: {
            x: Math.min(1, Math.max(0, x / viewport.width)),
            y: Math.min(1, Math.max(0, topY / viewport.height)),
            width: Math.min(1, widthPx / viewport.width),
            height: Math.min(1, Math.max(0.01, highlightHeight / viewport.height)),
          },
        });
      }

      const layout = {
        pageNumber: normalizedPage,
        width: viewport.width,
        height: viewport.height,
        text: pageText,
        items,
      };
      pageLayoutCacheRef.current.set(cacheKey, layout);
      return layout;
    },
    [sourceKey]
  );

  useEffect(() => {
    if (!useCanvasPdfPreview || !activeHighlightTarget) {
      setHighlightRects([]);
      return undefined;
    }
    if (activeHighlightTarget.pageNumber !== normalizedCurrentPage) {
      setHighlightRects([]);
      return undefined;
    }

    let cancelled = false;
    const queryText = [activeHighlightTarget.snippet, activeHighlightTarget.label]
      .map((part) => String(part || "").trim())
      .filter(Boolean)
      .join(" ");
    if (!queryText) {
      setHighlightRects([]);
      return undefined;
    }

    const loadHighlight = async () => {
      try {
        const layout = await buildNativePageLayout(activeHighlightTarget.pageNumber);
        if (cancelled || !layout) return;
        const rects = findHighlightRects(layout, queryText);
        setHighlightRects(rects);
      } catch {
        if (!cancelled) {
          setHighlightRects([]);
        }
      }
    };

    loadHighlight();
    return () => {
      cancelled = true;
    };
  }, [
    activeHighlightTarget,
    buildNativePageLayout,
    normalizedCurrentPage,
    useCanvasPdfPreview,
  ]);

  const pageController = (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center px-2 sm:bottom-3 sm:px-3"
      style={
        isMobileFullScreenPreview
          ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }
          : undefined
      }
    >
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
    if (!useCanvasPdfPreview) return undefined;
    
    let cancelled = false;
    let abortController = new AbortController();

    // 강화된 리소스 해제 함수
    const releaseCurrentDoc = async () => {
      // 1. 렌더링 작업 취소 및 정리
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
          // 작업 완료 대기 (중첩된 Promise 해결)
          await renderTaskRef.current.promise.catch(() => {});
        } catch {
          // 무시 - 작업이 이미 완료되었거나 취소된 경우
        } finally {
          renderTaskRef.current = null;
        }
      }
      
      // 2. PDF 문서 해제
      if (pdfDocRef.current) {
        const previousDoc = pdfDocRef.current;
        pdfDocRef.current = null;
        try {
          await previousDoc.destroy();
          // 추가 정리: 내부 참조 제거
          if (previousDoc._pdfInfo) previousDoc._pdfInfo = null;
          if (previousDoc._transport) previousDoc._transport = null;
          if (previousDoc._pdfDocument) previousDoc._pdfDocument = null;
        } catch (error) {
          console.warn('PDF 문서 해제 중 오류:', error);
        }
      }
      
      // 3. 캐시 클리어
      pageLayoutCacheRef.current.clear();
      
      // 4. 캔버스 컨텍스트 정리
      if (canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          // 캔버스 크기 초기화
          canvasRef.current.width = 1;
          canvasRef.current.height = 1;
        }
      }
      
      // 5. 타이머 클리어
      if (iframeResetTimerRef.current) {
        clearTimeout(iframeResetTimerRef.current);
        iframeResetTimerRef.current = null;
      }
      
      // 6. AbortController 신호 전송
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
    };

    const loadNativeDocument = async () => {
      setNativeError("");
      setIsNativeLoading(true);

      try {
        // 기존 리소스 해제
        await releaseCurrentDoc();
        
        // 새로운 AbortController 생성
        abortController = new AbortController();
        const signal = abortController.signal;

        let source = null;
        if (pdfUrl) {
          source = pdfUrl;
        } else if (isPdfLikeFile(file) && typeof file?.arrayBuffer === "function") {
          source = { data: await file.arrayBuffer() };
        }
        
        if (!source) {
          setIsNativeLoading(false);
          return;
        }

        // 취소 체크
        if (cancelled || signal.aborted) {
          setIsNativeLoading(false);
          return;
        }

        const pdfjsLib = await loadPdfRuntime();
        const loadingTask = pdfjsLib.getDocument(source);
        
        // 취소 가능한 Promise 래퍼
        const docPromise = loadingTask.promise;
        const doc = await Promise.race([
          docPromise,
          new Promise((_, reject) => {
            if (signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
        ]);

        if (cancelled || signal.aborted) {
          await doc.destroy();
          setIsNativeLoading(false);
          return;
        }

        pdfDocRef.current = doc;
        setDocVersion((prev) => prev + 1);
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') {
          const handledError = handleError(err, { 
            component: 'PdfPreview',
            function: 'loadNativeDocument',
            source: pdfUrl || (file?.name || 'unknown')
          });
          setNativeError(handledError.message || "PDF 미리보기를 초기화하지 못했습니다.");
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
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      releaseCurrentDoc();
    };
  }, [file, pdfUrl, sourceKey, useCanvasPdfPreview]);

  useEffect(() => {
    if (!useCanvasPdfPreview) return undefined;

    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return undefined;

    const requestId = renderRequestRef.current + 1;
    renderRequestRef.current = requestId;
    let cancelled = false;
    let abortController = new AbortController();

    const renderCurrentPage = async () => {
      const cycleId = renderCycleRef.current + 1;
      renderCycleRef.current = cycleId;
      setNativeError("");
      setIsNativeLoading(true);
      let renderTask = null;
      let currentPageObj = null;

      try {
        // 이전 렌더링 작업 취소
        const previousTask = renderTaskRef.current;
        if (previousTask) {
          try {
            previousTask.cancel();
            // 작업 완료 대기
            await previousTask.promise.catch(() => {});
          } catch {
            // 무시 - 작업이 이미 완료되었거나 취소된 경우
          } finally {
            if (renderTaskRef.current === previousTask) {
              renderTaskRef.current = null;
            }
          }
        }

        // 취소 체크
        if (cancelled || abortController.signal.aborted) {
          setIsNativeLoading(false);
          return;
        }

        const maxPage = Math.max(1, Number(doc.numPages) || 1);
        const requestedPage = normalizePageNumber(currentPage);
        const targetPage = Math.min(Math.max(1, requestedPage), maxPage);
        
        if (targetPage !== requestedPage && typeof onPageChange === "function") {
          onPageChange(targetPage);
          setIsNativeLoading(false);
          return;
        }

        // 페이지 가져오기 (취소 가능)
        currentPageObj = await Promise.race([
          doc.getPage(targetPage),
          new Promise((_, reject) => {
            if (abortController.signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
            }
            abortController.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
        ]);

        if (
          cancelled ||
          abortController.signal.aborted ||
          renderRequestRef.current !== requestId ||
          renderCycleRef.current !== cycleId
        ) {
          if (currentPageObj) {
            currentPageObj.cleanup();
          }
          setIsNativeLoading(false);
          return;
        }

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas context is unavailable.");

        const scrollViewportWidth =
          nativeScrollRef.current?.clientWidth ||
          canvasShellRef.current?.parentElement?.clientWidth ||
          canvas.parentElement?.clientWidth ||
          920;
        const maxCssWidth = Math.max(320, Math.min(scrollViewportWidth - 24, 1400));
        const baseViewport = currentPageObj.getViewport({ scale: 1 });
        const cssScale = maxCssWidth / baseViewport.width;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const viewport = currentPageObj.getViewport({ scale: cssScale * pixelRatio });

        // 캔버스 크기 설정
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.max(1, Math.floor(viewport.width / pixelRatio))}px`;
        canvas.style.height = `${Math.max(1, Math.floor(viewport.height / pixelRatio))}px`;

        // 배경 채우기
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        // 취소 체크
        if (
          cancelled ||
          abortController.signal.aborted ||
          renderRequestRef.current !== requestId ||
          renderCycleRef.current !== cycleId
        ) {
          setIsNativeLoading(false);
          return;
        }

        // 렌더링 작업 시작
        renderTask = currentPageObj.render({
          canvasContext: context,
          viewport,
          intent: "display",
        });
        renderTaskRef.current = renderTask;

        // 렌더링 완료 대기 (취소 가능)
        await Promise.race([
          renderTask.promise,
          new Promise((_, reject) => {
            if (abortController.signal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
            }
            abortController.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          })
        ]);

        if (
          cancelled ||
          abortController.signal.aborted ||
          renderRequestRef.current !== requestId ||
          renderCycleRef.current !== cycleId
        ) {
          setIsNativeLoading(false);
          return;
        }

      } catch (err) {
        if (cancelled || err?.name === "RenderingCancelledException" || err?.name === "AbortError") {
          // 취소된 작업은 무시
          return;
        }
        
        const handledError = handleError(err, { 
          component: 'PdfPreview',
          function: 'renderCurrentPage',
          page: currentPage
        });
        setNativeError(handledError.message || "PDF 페이지 렌더링에 실패했습니다.");
        
      } finally {
        // 리소스 정리
        if (renderTask && renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
        
        if (currentPageObj) {
          try {
            currentPageObj.cleanup();
          } catch {
            // 무시
          }
        }
        
        if (
          !cancelled &&
          !abortController.signal.aborted &&
          renderRequestRef.current === requestId &&
          renderCycleRef.current === cycleId
        ) {
          setIsNativeLoading(false);
        }
      }
    };

    renderCurrentPage();

    const handleResize = () => {
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        if (!abortController.signal.aborted) {
          abortController.abort();
          abortController = new AbortController();
          renderCurrentPage();
        }
      });
    };
    
    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      renderCycleRef.current += 1;
      if (renderRequestRef.current === requestId) {
        renderRequestRef.current += 1;
      }
      
      // AbortController로 모든 비동기 작업 취소
      if (!abortController.signal.aborted) {
        abortController.abort();
      }
      
      window.removeEventListener("resize", handleResize);
      
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
      
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // 무시
        }
        renderTaskRef.current = null;
      }
      
      // 캔버스 컨텍스트 정리
      if (canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };
  }, [currentPage, docVersion, onPageChange, useCanvasPdfPreview]);

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

  if (shouldUseOfficeDocumentFallback) {
    return (
      <div ref={previewRootRef} className={previewColumnShellClassName} style={previewShellStyle}>
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
                className="rounded-full border border-white/15 bg-slate-800 px-3 py-1 text-xs text-slate-200 transition hover:border-white/30 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
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

  if (useCanvasPdfPreview) {
    return (
      <div ref={previewRootRef} className={previewShellClassName} style={previewShellStyle}>
        {canDownloadFile && (
          <div className="absolute right-3 top-3 z-30">
            <button
              type="button"
              onClick={handleDownloadFile}
              className="rounded-full border border-white/20 bg-slate-800 px-3 py-1.5 text-xs text-slate-100 shadow-lg shadow-black/30 transition hover:border-emerald-300/50 hover:bg-slate-700"
            >
              다운로드
            </button>
          </div>
        )}
        <div
          ref={nativeScrollRef}
          className={`h-full w-full overflow-y-auto overflow-x-hidden ${
            isMobileFullScreenPreview ? "p-0" : "p-1.5 sm:p-3"
          }`}
          onWheel={handleNativeWheel}
          onTouchStart={handleNativeTouchStart}
          onTouchEnd={handleNativeTouchEnd}
        >
          <div ref={canvasShellRef} className="relative mx-auto w-fit">
            <canvas
              ref={canvasRef}
              onClick={handleNativeCanvasClick}
              className={`mx-auto block bg-white ${isMobileFullScreenPreview ? "" : "rounded-xl shadow-lg shadow-black/30"} ${
                isTabletDevice ? "cursor-pointer" : ""
              }`}
            />
            {highlightRects.length > 0 && (
              <div className="pointer-events-none absolute inset-0">
                {highlightRects.map((rect, index) => (
                  <span
                    key={`pdf-highlight-${index}`}
                    className="absolute rounded-[6px] border border-emerald-400/80 bg-emerald-300/28 shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_0_18px_rgba(52,211,153,0.18)]"
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                  />
                ))}
                <div className="absolute left-3 top-3 rounded-full border border-emerald-300/55 bg-slate-950/78 px-3 py-1 text-[11px] font-semibold text-emerald-100 shadow-lg shadow-black/30">
                  근거 하이라이트
                </div>
              </div>
            )}
          </div>
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

  const hasViewer = Boolean(iframeSrc);
  const hasLoadError = Boolean(viewerSrc) && failedSrc === viewerSrc;
  const isLoading = Boolean(viewerSrc) && !hasLoadError && stripUrlHash(loadedSrc) !== viewerBaseSrc;

  return (
    <div ref={previewRootRef} className={previewShellClassName} style={previewShellStyle}>
      {!hasLoadError && hasViewer && (
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="PDF Preview"
          className="absolute inset-0 z-0 h-full w-full bg-white"
          loading="eager"
          onLoad={() => {
            if (!viewerSrc || iframeSrc === "about:blank") return;
            setLoadedSrc(viewerSrc);
            setFailedSrc("");
            if (iframeRetrySrcRef.current === viewerSrc) {
              iframeRetrySrcRef.current = "";
            }
          }}
          onError={() => {
            if (!viewerSrc) return;
            if (iframeRetrySrcRef.current !== viewerSrc) {
              retryPdfIframeLoad(viewerSrc);
              return;
            }
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
          <button
            type="button"
            onClick={() => retryPdfIframeLoad(viewerSrc)}
            className="inline-flex items-center rounded-lg border border-rose-300/40 px-3 py-2 text-xs text-rose-100 hover:bg-rose-400/10"
          >
            다시 불러오기
          </button>
          <a
            href={preferredPdfSourceUrl || pdfUrl || documentUrl}
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

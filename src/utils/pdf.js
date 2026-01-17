import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Ensure the worker bundle is correctly referenced in production builds.
GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractPdfText(file, pageLimit = 30, maxLength = 12000, options = {}) {
  const { includeLayout = false } = options || {};
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, pageLimit);

  const chunks = [];
  const layoutPages = includeLayout ? [] : null;
  let pagesUsed = 0;
  let currentLength = 0;

  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let viewport;
    let pageLayout;
    if (includeLayout) {
      viewport = page.getViewport({ scale: 1 });
      pageLayout = {
        pageNumber: i,
        width: viewport.width,
        height: viewport.height,
        text: "",
        items: [],
      };
    }

    let pageText = "";
    for (const item of content.items) {
      const str = item.str.trim();
      if (!str) continue;

      const withSpace = pageText ? " " : "";
      const start = pageText.length + withSpace.length;
      pageText += withSpace + str;
      const end = pageText.length;

      if (includeLayout) {
        const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = transformed[4];
        const y = transformed[5]; // baseline after viewport transform (top-left origin)
        const scaleX = Math.hypot(transformed[0], transformed[1]);
        const scaleY = Math.hypot(transformed[2], transformed[3]);
        const widthPx = scaleX * item.width; // advance width with transform applied
        const heightPx = scaleY * (item.height || Math.abs(transformed[3])); // ascent-ish height
        const highlightHeight = heightPx * 0.6; // underline-style highlight
        const topY = y - highlightHeight * 0.9; // sit just below baseline, light overlap
        const norm = {
          x: Math.min(1, Math.max(0, x / viewport.width)),
          y: Math.min(1, Math.max(0, topY / viewport.height)),
          width: Math.min(1, widthPx / viewport.width),
          height: Math.min(1, Math.max(0.01, highlightHeight / viewport.height)),
        };

        pageLayout.items.push({
          text: str,
          start,
          end,
          rect: norm,
        });
      }
    }

    if (includeLayout) {
      pageLayout.text = pageText;
      layoutPages.push(pageLayout);
    }

    if (pageText) {
      chunks.push(pageText);
      currentLength += pageText.length + 1;
    }
    pagesUsed = i;
    if (currentLength >= maxLength) break;
  }

  const normalized = chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return {
    text: normalized,
    pagesUsed,
    totalPages,
    layout: includeLayout ? { pages: layoutPages } : null,
  };
}

async function renderPageToCanvas(page, scale = 2) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

export async function extractPdfTextFromPages(file, pageNumbers, maxLength = 12000, options = {}) {
  let resolvedMaxLength = maxLength;
  let resolvedOptions = options || {};
  if (typeof maxLength === "object" && maxLength !== null) {
    resolvedOptions = maxLength;
    resolvedMaxLength = 12000;
  }
  const {
    useOcr = false,
    ocrLang = "kor+eng",
    ocrScale = 2,
    onOcrProgress,
  } = resolvedOptions;
  const notifyOcr = (message) => {
    if (typeof onOcrProgress === "function") onOcrProgress(message);
  };

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const normalizedPages = Array.from(
    new Set(
      (pageNumbers || [])
        .map((p) => Number.parseInt(p, 10))
        .filter((p) => Number.isFinite(p) && p > 0 && p <= totalPages)
    )
  ).sort((a, b) => a - b);

  const buildText = (items) => {
    const pieces = [];
    for (const item of items || []) {
      const raw = item?.str ?? "";
      const text = typeof raw === "string" ? raw.trim() : String(raw).trim();
      if (!text) continue;
      pieces.push(text);
    }
    return pieces.join(" ").replace(/\s+/g, " ").trim();
  };

  const extractPageText = async (page) => {
    const attempts = [
      null,
      { normalizeWhitespace: true, disableCombineTextItems: true },
      { normalizeWhitespace: true, disableCombineTextItems: false },
      { includeMarkedContent: true, normalizeWhitespace: true, disableCombineTextItems: true },
      { includeMarkedContent: true, normalizeWhitespace: true, disableCombineTextItems: false },
      { includeMarkedContent: true },
    ];
    for (const options of attempts) {
      const content = options ? await page.getTextContent(options) : await page.getTextContent();
      const text = buildText(content.items);
      if (text) return text;
    }
    return "";
  };

  const chunks = [];
  const pagesUsed = [];
  let currentLength = 0;

  for (const pageNumber of normalizedPages) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPageText(page);
    if (pageText) {
      chunks.push(pageText);
      pagesUsed.push(pageNumber);
      currentLength += pageText.length + 1;
    }
    if (currentLength >= resolvedMaxLength) break;
  }

  const normalized = chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, resolvedMaxLength);
  if (normalized || !useOcr || normalizedPages.length === 0) {
    return {
      text: normalized,
      pagesUsed,
      totalPages,
      ocrUsed: false,
    };
  }

  // OCR fallback for scanned pages.
  notifyOcr("선택한 페이지에서 텍스트가 없어 OCR을 시작합니다...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(ocrLang, 1, {
    logger: (info) => {
      if (!info || typeof info.progress !== "number") return;
      const pct = Math.round(info.progress * 100);
      notifyOcr(`OCR ${info.status || "processing"}... ${pct}%`);
    },
  });
  const ocrChunks = [];
  const ocrPagesUsed = [];
  let ocrLength = 0;
  try {
    for (let idx = 0; idx < normalizedPages.length; idx += 1) {
      if (ocrLength >= resolvedMaxLength) break;
      const pageNumber = normalizedPages[idx];
      notifyOcr(`OCR 진행 중... (${idx + 1}/${normalizedPages.length}페이지)`);
      const page = await pdf.getPage(pageNumber);
      const canvas = await renderPageToCanvas(page, ocrScale);
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || "").replace(/\s+/g, " ").trim();
      if (text) {
        ocrChunks.push(text);
        ocrPagesUsed.push(pageNumber);
        ocrLength += text.length + 1;
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }

  const ocrNormalized = ocrChunks.join("\n").replace(/\s+/g, " ").trim().slice(0, resolvedMaxLength);
  return {
    text: ocrNormalized,
    pagesUsed: ocrPagesUsed,
    totalPages,
    ocrUsed: true,
  };
}

// 썸네일 생성 속도를 위해 기본 스케일을 낮게 설정하고 WebP로 저장합니다.
export async function generatePdfThumbnail(file, { scale = 0.2, quality = 1.0 } = {}) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;
  const webp = canvas.toDataURL("image/webp", quality);
  // fallback
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL("image/png");
}

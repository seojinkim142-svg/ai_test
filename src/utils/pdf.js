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

const TOC_HEADER_RE = /(?:table\s+of\s+contents|contents|목차|차례)/i;
const CHAPTER_LIKE_TITLE_RE =
  /(?:^|\s)(?:chapter|chap\.?|ch\.?|part|unit)\s*[0-9ivxlcdm]+|제\s*\d+\s*장|\d+\s*장/i;

const SECTION_WORD_STOP_RE =
  /\b(?:section|sec\.?|appendix|reference|references|index|preface|foreword)\b|부록|참고문헌|찾아보기|서문/i;

function sanitizeTocTitle(raw) {
  return String(raw || "")
    .replace(/[·•⋯…]+/g, " ")
    .replace(/[._-]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function romanToInt(value) {
  const roman = String(value || "").toUpperCase();
  if (!/^[IVXLCDM]+$/.test(roman)) return null;
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let idx = roman.length - 1; idx >= 0; idx -= 1) {
    const current = map[roman[idx]] || 0;
    if (current < prev) total -= current;
    else total += current;
    prev = current;
  }
  return total > 0 ? total : null;
}

function inferChapterNumberFromTitle(title, fallback) {
  const normalized = sanitizeTocTitle(title);
  const arabicMatch =
    normalized.match(/(?:chapter|chap\.?|ch\.?|part|unit|제)?\s*([0-9]{1,3})\s*(?:장)?/i) ||
    normalized.match(/^([0-9]{1,3})(?:[.)]|\s|장)/);
  if (arabicMatch) {
    const parsed = Number.parseInt(arabicMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const romanMatch =
    normalized.match(/(?:chapter|chap\.?|ch\.?|part|unit)\s*([ivxlcdm]{1,8})/i) ||
    normalized.match(/^([ivxlcdm]{1,8})(?:[.)]|\s)/i);
  if (romanMatch) {
    const parsed = romanToInt(romanMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function isLikelyChapterTitle(rawTitle) {
  const title = sanitizeTocTitle(rawTitle);
  if (!title || title.length < 3) return false;
  if (SECTION_WORD_STOP_RE.test(title)) return false;
  if (CHAPTER_LIKE_TITLE_RE.test(title)) return true;
  return /^(?:\d{1,3}|[ivxlcdm]{1,8})(?:[.)]|\s+-|\s+)[A-Za-z가-힣]/i.test(title);
}

function clampPage(value, totalPages) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(1, parsed), totalPages);
}

function dedupeChapterStarts(entries) {
  const sorted = [...entries]
    .map((entry) => ({
      ...entry,
      title: sanitizeTocTitle(entry?.title || ""),
      pageStart: Number.parseInt(entry?.pageStart, 10),
      depth: Number.parseInt(entry?.depth, 10) || 0,
    }))
    .filter((entry) => entry.title && Number.isFinite(entry.pageStart) && entry.pageStart > 0)
    .sort((left, right) => left.pageStart - right.pageStart || left.depth - right.depth);

  const deduped = [];
  for (const entry of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.pageStart === entry.pageStart) continue;
    deduped.push(entry);
  }
  return deduped;
}

function buildChapterRangesFromStarts(entries, totalPages) {
  const starts = dedupeChapterStarts(entries).filter((entry) => entry.pageStart <= totalPages);
  if (starts.length < 2) return [];

  const ranges = [];
  for (let idx = 0; idx < starts.length; idx += 1) {
    const current = starts[idx];
    const next = starts[idx + 1];
    const start = clampPage(current.pageStart, totalPages);
    const end = clampPage(next ? next.pageStart - 1 : totalPages, totalPages);
    if (!start || !end || end < start) continue;

    const chapterNumber = ranges.length + 1;
    const inferredChapterNumber = inferChapterNumberFromTitle(current.title, chapterNumber);
    ranges.push({
      id: `chapter-${chapterNumber}`,
      chapterNumber: inferredChapterNumber || chapterNumber,
      chapterTitle: current.title,
      pageStart: start,
      pageEnd: end,
    });
  }

  return ranges
    .sort((left, right) => left.pageStart - right.pageStart)
    .map((chapter, index) => ({
      ...chapter,
      id: `chapter-${index + 1}`,
      chapterNumber: index + 1,
    }));
}

function flattenOutlineItems(items, depth = 0, acc = []) {
  for (const item of items || []) {
    acc.push({
      title: item?.title || "",
      dest: item?.dest || null,
      depth,
    });
    if (Array.isArray(item?.items) && item.items.length) {
      flattenOutlineItems(item.items, depth + 1, acc);
    }
  }
  return acc;
}

async function resolveOutlinePageNumber(pdf, dest) {
  if (!dest) return null;
  let resolvedDest = dest;
  if (typeof resolvedDest === "string") {
    resolvedDest = await pdf.getDestination(resolvedDest);
  }
  if (!Array.isArray(resolvedDest) || resolvedDest.length === 0) return null;
  const ref = resolvedDest[0];
  if (!ref) return null;

  try {
    if (typeof ref === "object") {
      const pageIndex = await pdf.getPageIndex(ref);
      if (Number.isFinite(pageIndex)) return pageIndex + 1;
    }
    if (Number.isInteger(ref)) return ref + 1;
  } catch {
    return null;
  }
  return null;
}

async function extractPageLines(page) {
  const content = await page.getTextContent({
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  });
  const lines = [];
  let currentLine = [];

  for (const item of content.items || []) {
    const text = String(item?.str || "").replace(/\s+/g, " ").trim();
    if (text) currentLine.push(text);
    if (item?.hasEOL) {
      const joined = currentLine.join(" ").replace(/\s+/g, " ").trim();
      if (joined) lines.push(joined);
      currentLine = [];
    }
  }

  const tail = currentLine.join(" ").replace(/\s+/g, " ").trim();
  if (tail) lines.push(tail);
  return lines;
}

function parseTocLine(line) {
  const raw = String(line || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const matched = raw.match(/^(.*?)(?:\s*[.·•⋯…-]{2,}\s*|\s+)(\d{1,4})$/);
  if (!matched) return null;

  const title = sanitizeTocTitle(matched[1]);
  const listedPage = Number.parseInt(matched[2], 10);
  if (!title || !Number.isFinite(listedPage) || listedPage <= 0) return null;
  if (!isLikelyChapterTitle(title)) return null;

  return { title, pageStart: listedPage };
}

export async function extractPdfText(file, pageLimit = 30, maxLength = 12000, options = {}) {
  const pdfjsLib = await loadPdfRuntime();
  const { getDocument } = pdfjsLib;
  const {
    includeLayout = false,
    useOcr = false,
    ocrLang = "kor+eng",
    ocrScale = 2,
    onOcrProgress,
  } = options || {};
  const notifyOcr = (message) => {
    if (typeof onOcrProgress === "function") onOcrProgress(message);
  };
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
  if (normalized || !useOcr) {
    return {
      text: normalized,
      pagesUsed,
      totalPages,
      layout: includeLayout ? { pages: layoutPages } : null,
      ocrUsed: false,
    };
  }

  // OCR fallback for scanned PDFs.
  notifyOcr("텍스트가 없어 OCR을 시작합니다...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(ocrLang, 1, {
    logger: (info) => {
      if (!info || typeof info.progress !== "number") return;
      const pct = Math.round(info.progress * 100);
      notifyOcr(`OCR ${info.status || "processing"}... ${pct}%`);
    },
  });
  const ocrChunks = [];
  let ocrLength = 0;
  try {
    for (let idx = 1; idx <= pagesToRead; idx += 1) {
      if (ocrLength >= maxLength) break;
      notifyOcr(`OCR 진행 중... (${idx}/${pagesToRead}페이지)`);
      const page = await pdf.getPage(idx);
      const canvas = await renderPageToCanvas(page, ocrScale);
      const result = await worker.recognize(canvas);
      const text = String(result?.data?.text || "").replace(/\s+/g, " ").trim();
      if (text) {
        ocrChunks.push(text);
        ocrLength += text.length + 1;
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }

  const ocrNormalized = ocrChunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return {
    text: ocrNormalized,
    pagesUsed,
    totalPages,
    layout: includeLayout ? { pages: layoutPages } : null,
    ocrUsed: true,
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

function buildTextFromItems(items) {
  const pieces = [];
  for (const item of items || []) {
    const raw = item?.str ?? "";
    const text = typeof raw === "string" ? raw.trim() : String(raw).trim();
    if (!text) continue;
    pieces.push(text);
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

async function extractPageTextWithAttempts(page) {
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
    const text = buildTextFromItems(content.items);
    if (text) return text;
  }
  return "";
}

export async function extractPdfTextFromPages(file, pageNumbers, maxLength = 12000, options = {}) {
  const pdfjsLib = await loadPdfRuntime();
  const { getDocument } = pdfjsLib;
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

  const chunks = [];
  const pagesUsed = [];
  let currentLength = 0;

  for (const pageNumber of normalizedPages) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPageTextWithAttempts(page);
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

export async function extractPdfTextByRanges(
  file,
  ranges,
  {
    maxLengthPerRange = 14000,
    useOcr = false,
    ocrLang = "kor+eng",
    ocrScale = 2,
    onOcrProgress,
  } = {}
) {
  const pdfjsLib = await loadPdfRuntime();
  const { getDocument } = pdfjsLib;
  const notifyOcr = (message) => {
    if (typeof onOcrProgress === "function") onOcrProgress(message);
  };

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const inputRanges = Array.isArray(ranges) ? ranges : [];
  const normalizedRanges = inputRanges
    .map((range, idx) => {
      const chapterNumber = Number.parseInt(range?.chapterNumber, 10);
      const parsedStart = Number.parseInt(range?.pageStart, 10);
      const parsedEnd = Number.parseInt(range?.pageEnd, 10);
      const start = Number.isFinite(parsedStart) ? Math.max(1, parsedStart) : 1;
      const end = Number.isFinite(parsedEnd) ? Math.min(totalPages, parsedEnd) : totalPages;
      if (start > end) return null;
      const pages = [];
      for (let page = start; page <= end; page += 1) pages.push(page);
      return {
        id: String(range?.id || `range-${idx + 1}`),
        chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : idx + 1,
        chapterTitle: String(range?.chapterTitle || `Chapter ${idx + 1}`),
        pageStart: start,
        pageEnd: end,
        pages,
      };
    })
    .filter(Boolean);

  const pageTextCache = new Map();
  const getPageText = async (pageNumber) => {
    if (pageTextCache.has(pageNumber)) return pageTextCache.get(pageNumber);
    const page = await pdf.getPage(pageNumber);
    const text = await extractPageTextWithAttempts(page);
    pageTextCache.set(pageNumber, text);
    return text;
  };

  const chapters = [];
  for (const range of normalizedRanges) {
    const chunks = [];
    const pagesUsed = [];
    let currentLength = 0;
    for (const pageNumber of range.pages) {
      if (currentLength >= maxLengthPerRange) break;
      const pageText = await getPageText(pageNumber);
      if (!pageText) continue;
      chunks.push(pageText);
      pagesUsed.push(pageNumber);
      currentLength += pageText.length + 1;
    }
    chapters.push({
      ...range,
      text: chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLengthPerRange),
      pagesUsed,
      ocrUsed: false,
    });
  }

  if (!useOcr) {
    return { totalPages, chapters };
  }

  const missing = chapters.filter((chapter) => !chapter.text && chapter.pages.length > 0);
  if (!missing.length) {
    return { totalPages, chapters };
  }

  notifyOcr("선택 챕터 텍스트가 없어 OCR을 시작합니다...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(ocrLang, 1, {
    logger: (info) => {
      if (!info || typeof info.progress !== "number") return;
      const pct = Math.round(info.progress * 100);
      notifyOcr(`OCR ${info.status || "processing"}... ${pct}%`);
    },
  });

  const ocrPageCache = new Map();
  const getOcrText = async (pageNumber) => {
    if (ocrPageCache.has(pageNumber)) return ocrPageCache.get(pageNumber);
    const page = await pdf.getPage(pageNumber);
    const canvas = await renderPageToCanvas(page, ocrScale);
    const result = await worker.recognize(canvas);
    const text = String(result?.data?.text || "").replace(/\s+/g, " ").trim();
    canvas.width = 0;
    canvas.height = 0;
    ocrPageCache.set(pageNumber, text);
    return text;
  };

  try {
    for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx += 1) {
      const chapter = chapters[chapterIdx];
      if (chapter.text || chapter.pages.length === 0) continue;
      const chunks = [];
      const pagesUsed = [];
      let currentLength = 0;
      for (let idx = 0; idx < chapter.pages.length; idx += 1) {
        if (currentLength >= maxLengthPerRange) break;
        const pageNumber = chapter.pages[idx];
        notifyOcr(`OCR 진행 중... (${chapter.chapterNumber}챕터 ${idx + 1}/${chapter.pages.length}페이지)`);
        const text = await getOcrText(pageNumber);
        if (!text) continue;
        chunks.push(text);
        pagesUsed.push(pageNumber);
        currentLength += text.length + 1;
      }
      chapters[chapterIdx] = {
        ...chapter,
        text: chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLengthPerRange),
        pagesUsed,
        ocrUsed: true,
      };
    }
  } finally {
    await worker.terminate();
  }

  return { totalPages, chapters };
}

async function extractChapterRangesFromOutline(pdf, totalPages) {
  const outline = await pdf.getOutline();
  if (!Array.isArray(outline) || outline.length === 0) return [];

  const flattened = flattenOutlineItems(outline, 0, []);
  const entries = [];
  for (const item of flattened) {
    const title = sanitizeTocTitle(item?.title || "");
    if (!title) continue;
    const pageStart = await resolveOutlinePageNumber(pdf, item?.dest);
    if (!Number.isFinite(pageStart) || pageStart <= 0 || pageStart > totalPages) continue;
    entries.push({
      title,
      pageStart,
      depth: item?.depth || 0,
      chapterLike: isLikelyChapterTitle(title),
    });
  }
  if (entries.length < 2) return [];

  const topLevel = entries.filter((entry) => entry.depth === 0);
  const topLevelChapterLike = topLevel.filter((entry) => entry.chapterLike);
  let selected =
    topLevelChapterLike.length >= 2
      ? topLevelChapterLike
      : entries.filter((entry) => entry.chapterLike);
  if (selected.length < 2) selected = topLevel;
  if (selected.length < 2) return [];

  return buildChapterRangesFromStarts(selected, totalPages);
}

async function extractChapterRangesFromFrontTocPages(pdf, totalPages, maxScanPages = 24) {
  const scanLimit = Math.min(Math.max(6, Number(maxScanPages) || 24), totalPages);
  const entries = [];
  let tocWindowUntil = 0;

  for (let pageNumber = 1; pageNumber <= scanLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const lines = await extractPageLines(page);
    const pageText = lines.join(" ");
    if (TOC_HEADER_RE.test(pageText)) {
      tocWindowUntil = Math.max(tocWindowUntil, pageNumber + 3);
    }
    const inTocWindow = pageNumber <= tocWindowUntil;

    for (const line of lines) {
      const parsed = parseTocLine(line);
      if (!parsed) continue;
      if (!inTocWindow && !CHAPTER_LIKE_TITLE_RE.test(parsed.title)) continue;
      entries.push(parsed);
    }
  }

  if (entries.length < 2) return [];
  const normalized = entries
    .map((entry) => ({
      ...entry,
      pageStart: Math.min(entry.pageStart, totalPages),
    }))
    .filter((entry) => entry.pageStart > 0);

  if (normalized.length < 2) return [];
  return buildChapterRangesFromStarts(normalized, totalPages);
}

export async function extractChapterRangesFromToc(
  file,
  { maxScanPages = 24 } = {}
) {
  const pdfjsLib = await loadPdfRuntime();
  const { getDocument } = pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = Number(pdf?.numPages) || 0;

  if (!totalPages) {
    return {
      chapters: [],
      totalPages: 0,
      source: null,
      error: "PDF total page count is unavailable.",
    };
  }

  const fromOutline = await extractChapterRangesFromOutline(pdf, totalPages);
  if (fromOutline.length >= 2) {
    return {
      chapters: fromOutline,
      totalPages,
      source: "outline",
      error: "",
    };
  }

  const fromTocPages = await extractChapterRangesFromFrontTocPages(pdf, totalPages, maxScanPages);
  if (fromTocPages.length >= 2) {
    return {
      chapters: fromTocPages,
      totalPages,
      source: "toc_pages",
      error: "",
    };
  }

  return {
    chapters: [],
    totalPages,
    source: null,
    error: "목차에서 챕터 범위를 찾지 못했습니다. 직접 입력 형식(예: 1:1-12)을 사용해주세요.",
  };
}

// 썸네일 생성 속도를 위해 기본 스케일을 낮게 설정하고 WebP로 저장합니다.
export async function generatePdfThumbnail(file, { scale = 0.2, quality = 1.0 } = {}) {
  const pdfjsLib = await loadPdfRuntime();
  const { getDocument } = pdfjsLib;
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

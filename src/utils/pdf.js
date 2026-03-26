let pdfRuntimePromise = null;

const pdfDocumentCache = new WeakMap();
const pdfPageTextCache = new WeakMap();
const pdfOcrTextCache = new WeakMap();
const ocrWorkerCache = new Map();

const OCR_WORKER_IDLE_MS = 30000;
const OCR_PROGRESS_INTERVAL_MS = 250;
const DEFAULT_OCR_MAX_PIXELS = 2200000;

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

async function loadPdfDocument(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error("PDF file is unavailable.");
  }

  let cached = pdfDocumentCache.get(file);
  if (!cached) {
    cached = (async () => {
      const pdfjsLib = await loadPdfRuntime();
      const { getDocument } = pdfjsLib;
      const data = await file.arrayBuffer();
      const pdf = await getDocument({ data }).promise;
      return { pdfjsLib, pdf };
    })();
    pdfDocumentCache.set(file, cached);
    cached.catch(() => {
      pdfDocumentCache.delete(file);
    });
  }
  return cached;
}

function getPerFileCache(store, file) {
  let cache = store.get(file);
  if (!cache) {
    cache = new Map();
    store.set(file, cache);
  }
  return cache;
}

function normalizeExtractedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createOcrProgressReporter(onOcrProgress) {
  const callback = typeof onOcrProgress === "function" ? onOcrProgress : null;
  if (!callback) {
    return {
      notify: () => {},
      handleLogger: () => {},
      flush: () => {},
    };
  }

  let lastMessage = "";
  let lastEmitAt = 0;
  let pendingMessage = "";
  let timerId = null;

  const emit = (message, { force = false } = {}) => {
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return;
    if (!force && nextMessage === lastMessage) return;

    if (force) {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingMessage = "";
      lastEmitAt = Date.now();
      lastMessage = nextMessage;
      callback(nextMessage);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastEmitAt;
    if (!lastEmitAt || elapsed >= OCR_PROGRESS_INTERVAL_MS) {
      lastEmitAt = now;
      lastMessage = nextMessage;
      pendingMessage = "";
      callback(nextMessage);
      return;
    }

    pendingMessage = nextMessage;
    if (timerId) return;
    timerId = setTimeout(() => {
      timerId = null;
      if (!pendingMessage || pendingMessage === lastMessage) {
        pendingMessage = "";
        return;
      }
      lastEmitAt = Date.now();
      lastMessage = pendingMessage;
      callback(pendingMessage);
      pendingMessage = "";
    }, OCR_PROGRESS_INTERVAL_MS - elapsed);
  };

  return {
    notify: (message) => emit(message, { force: true }),
    handleLogger: (info) => {
      if (!info || typeof info.progress !== "number") return;
      const pct = Math.round(info.progress * 100);
      emit(`OCR ${info.status || "processing"}... ${pct}%`);
    },
    flush: () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (pendingMessage && pendingMessage !== lastMessage) {
        lastEmitAt = Date.now();
        lastMessage = pendingMessage;
        callback(pendingMessage);
      }
      pendingMessage = "";
    },
  };
}

function scheduleOcrWorkerCleanup(langKey, entry) {
  const cleanupToken = entry.activityToken;
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  entry.idleTimer = setTimeout(async () => {
    if (entry.progressLogger) return;
    if (entry.activityToken !== cleanupToken) return;
    if (ocrWorkerCache.get(langKey) !== entry) return;

    ocrWorkerCache.delete(langKey);
    try {
      const worker = await entry.workerPromise;
      await worker.terminate();
    } catch {
      // Worker cleanup is best-effort only.
    }
  }, OCR_WORKER_IDLE_MS);
}

function getOcrWorkerEntry(lang) {
  const langKey = String(lang || "eng");
  let entry = ocrWorkerCache.get(langKey);
  if (!entry) {
    entry = {
      workerPromise: null,
      queue: Promise.resolve(),
      progressLogger: null,
      idleTimer: null,
      activityToken: 0,
    };
    entry.workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker(langKey, 1, {
        logger: (info) => {
          if (typeof entry.progressLogger === "function") {
            entry.progressLogger(info);
          }
        },
      });
    })();
    entry.workerPromise.catch(() => {
      if (ocrWorkerCache.get(langKey) === entry) {
        ocrWorkerCache.delete(langKey);
      }
    });
    ocrWorkerCache.set(langKey, entry);
  }
  return entry;
}

async function runWithOcrWorker(lang, progressLogger, task) {
  const langKey = String(lang || "eng");
  const entry = getOcrWorkerEntry(langKey);
  entry.activityToken += 1;
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }

  const run = entry.queue.catch(() => {}).then(async () => {
    const worker = await entry.workerPromise;
    entry.progressLogger = progressLogger;
    try {
      return await task(worker);
    } finally {
      entry.progressLogger = null;
      scheduleOcrWorkerCleanup(langKey, entry);
    }
  });

  entry.queue = run.catch(() => {});
  return run;
}

// 확장된 목차 헤더 패턴 (다국어 지원)
const TOC_HEADER_RE = /(?:table\s+of\s+contents|contents|toc|\uBAA9\uCC28|\uCC28\uB840|\u76EE\u6B21|\u76EE\u9304|\u518A\u9996|\u7B2C\d+\u7AE0|\u7AE0\u8282)/i;
const TOC_HEADER_LINE_RE = /^\s*(?:table\s+of\s+contents|contents?|toc|\uBAA9\uCC28|\uCC28\uB840|\u76EE\u6B21|\u76EE\u9304|\u518A\u9996)\s*$/i;

// 확장된 챕터 제목 패턴 (다양한 형식 지원)
const CHAPTER_LIKE_TITLE_RE =
  /(?:^|\s)(?:chapter|chap\.?|ch\.?|part|unit|section|sec\.?|lecture|lec\.?|lesson|module|topic)\s*[0-9ivxlcdm]+(?:\.[0-9]+)?(?:\s*[-:]\s*)?|(?:^|\s)(?:\uC81C\s*)?\d+(?:\.\d+)*\s*(?:\uC7A5|\uC808|\uBD80|\uC11C|\uC810|\uAC8C|\uC2DC|\uC5D0|\uC5D0\uC11C)|\u7B2C\d+\u7AE0|\u7B2C\d+\u8282|(?:^|\s)\d+(?:\.\d+){1,3}|^(?:\d{1,3}|[ivxlcdm]{1,8})(?:[.)]|\s*[-:]\s*|\s+)/i;

// 섹션/부록 등 목차 항목이 아닌 단어 패턴
const SECTION_WORD_STOP_RE =
  /\b(?:section|sec\.?|appendix|appendices|reference|references|bibliography|index|preface|foreword|acknowledgements|abstract|summary|glossary)\b|\uBD80\uB85D|\uCC38\uACE0\uBB38\uD5CC|\uCC3E\uC544\uBCF4\uAE30|\uC11C\uBB38|\uC5D0\uD50C\uB9AC\uC2A4|\uC778\uB371\uC2A4|\uC5B4\uB514\uC11C|\uC57D\uC5B4|\uC57D\uC5B4\uB4E4|\uC57D\uC5B4\uC0AC\uC804|\uC57D\uC5B4\uC0AC\uC804\uB4E4/i;

function sanitizeTocTitle(raw) {
  return String(raw || "")
    .replace(/[\u00a0\t]/g, " ")
    .replace(/[\u2024\u2025\u2026\u00b7\u30fb\u318d\u2022]{2,}/g, " ")
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
    normalized.match(/(?:chapter|chap\.?|ch\.?|part|unit)\s*([0-9]{1,3})/i) ||
    normalized.match(/(?:\uC81C\s*)?([0-9]{1,3})\s*(?:\uC7A5|\uC808)/) ||
    normalized.match(/^([0-9]{1,3})(?:[.)]|\s+-|\s+)/);
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
  if (TOC_HEADER_LINE_RE.test(title)) return false;
  if (SECTION_WORD_STOP_RE.test(title)) return false;
  if (CHAPTER_LIKE_TITLE_RE.test(title)) return true;
  return /^(?:\d{1,3}|[ivxlcdm]{1,8})(?:[.)]|\s+-|\s+)[A-Za-z\uAC00-\uD7A3]/i.test(title);
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

// 확장된 페이지 번호 패턴 (다양한 형식 지원)
const TOC_PAGE_NUMBER_RE = /(?:p\.?\s*|pp\.?\s*|page\s*|쪽\s*|\u30DA\u30FC\u30B8\s*)?(\d{1,4})\s*$/i;
const TOC_LEADER_RE = /[.\u2024\u2025\u2026\u00b7\u30fb\u2022_-]{2,}/;

// 목차 항목 패턴 (점선, 공백, 탭 등 다양한 구분자)
const TOC_ITEM_SEPARATOR_RE = /[.\u2024\u2025\u2026\u00b7\u30fb\u2022_-]{2,}|\s{3,}|\t+/;

function normalizeParsedTocTitle(rawTitle) {
  return sanitizeTocTitle(
    String(rawTitle || "")
      .replace(/\(\s*(?:p|pp|page)\.?\s*\)$/i, "")
      .replace(/\b(?:p|pp|page)\.?\s*$/i, "")
      .replace(/(?:[.\u2024\u2025\u2026\u00b7\u30fb\u2022_-]{2,}|[:\-\u2013\u2014]+)\s*$/g, " ")
  );
}

function parseTocLine(line, { allowLooseTitle = false } = {}) {
  const raw = String(line || "").replace(/\s+/g, " ").trim();
  if (!raw || TOC_HEADER_LINE_RE.test(raw)) return null;

  const pageMatch = raw.match(TOC_PAGE_NUMBER_RE);
  if (!pageMatch) return null;

  const listedPage = Number.parseInt(pageMatch[1], 10);
  if (!Number.isFinite(listedPage) || listedPage <= 0) return null;

  const rawTitle = raw.slice(0, pageMatch.index).trim();
  const title = normalizeParsedTocTitle(rawTitle);
  if (!title || title.length < 2) return null;
  if (!/[A-Za-z0-9\uAC00-\uD7A3]/.test(title)) return null;
  if (TOC_HEADER_LINE_RE.test(title)) return null;

  const chapterLike = isLikelyChapterTitle(title);
  const hasLeaderDots = TOC_LEADER_RE.test(raw);

  if (!allowLooseTitle && !chapterLike) return null;
  if (allowLooseTitle && !chapterLike && !hasLeaderDots) {
    const tokens = title.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
  }

  const confidence = (chapterLike ? 2 : 0) + (hasLeaderDots ? 1 : 0);
  return {
    title,
    pageStart: listedPage,
    chapterLike,
    hasLeaderDots,
    confidence,
  };
}

function countTocKeywordHits(text) {
  const raw = String(text || "");
  if (!raw) return 0;

  let hits = 0;
  const lower = raw.toLowerCase();
  
  // 영어 목차 키워드
  if (lower.includes("table of contents")) hits += 3;
  if (lower.includes("contents")) hits += 2;
  if (lower.includes("toc")) hits += 1;
  
  const englishMatches = lower.match(/\bcontents?\b/g);
  if (englishMatches) hits += Math.min(3, englishMatches.length);

  // 한국어 목차 키워드
  const koreanMatches = raw.match(/\uBAA9\uCC28|\uCC28\uB840/g);
  if (koreanMatches) hits += Math.min(4, koreanMatches.length * 2);

  // 일본어 목차 키워드
  const japaneseMatches = raw.match(/\u76EE\u6B21|\u76EE\u9304|\u518A\u9996/g);
  if (japaneseMatches) hits += Math.min(3, japaneseMatches.length * 2);

  // 중국어 목차 키워드
  const chineseMatches = raw.match(/\u76EE\u5F55|\u518A\u9996|\u7B2C\d+\u7AE0/g);
  if (chineseMatches) hits += Math.min(3, chineseMatches.length * 2);

  // 챕터/파트 관련 키워드
  const chapterKeywords = lower.match(/\b(chapter|chap|ch|part|unit|section|sec)\b\.?\s*\d+/g);
  if (chapterKeywords) hits += Math.min(3, chapterKeywords.length);

  return hits;
}

function analyzeTocPage(lines, pageText) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const keywordHits = countTocKeywordHits(pageText);
  let headerLineHits = 0;
  let parsedLineCount = 0;
  let chapterLikeCount = 0;
  let leaderLineCount = 0;
  let totalConfidence = 0;
  const parsedLooseEntries = [];

  for (const line of safeLines) {
    if (TOC_HEADER_LINE_RE.test(String(line || ""))) headerLineHits += 1;
    const parsedLoose = parseTocLine(line, { allowLooseTitle: true });
    if (!parsedLoose) continue;
    parsedLooseEntries.push(parsedLoose);
    parsedLineCount += 1;
    if (parsedLoose.chapterLike) chapterLikeCount += 1;
    if (parsedLoose.hasLeaderDots) leaderLineCount += 1;
    totalConfidence += parsedLoose.confidence || 0;
  }

  // 향상된 점수 계산 시스템
  let score = 0;
  
  // 키워드 점수 (최대 8점)
  score += Math.min(8, keywordHits * 1.5);
  
  // 헤더 라인 점수 (최대 6점)
  score += Math.min(6, headerLineHits * 3);
  
  // 파싱된 라인 수 점수 (최대 10점)
  if (parsedLineCount > 0) {
    score += Math.min(10, parsedLineCount * 2);
  }
  
  // 챕터 라이크 항목 점수 (최대 8점)
  score += Math.min(8, chapterLikeCount * 2);
  
  // 리더 도트 점수 (최대 4점)
  if (leaderLineCount >= 2) {
    score += Math.min(4, leaderLineCount);
  }
  
  // 평균 신뢰도 점수 (최대 5점)
  if (parsedLineCount > 0) {
    const avgConfidence = totalConfidence / parsedLineCount;
    score += Math.min(5, avgConfidence * 1.5);
  }
  
  // 페이지 번호 패턴 점수 (연속적인 페이지 번호 감지)
  const pageNumbers = parsedLooseEntries.map(e => e.pageStart).sort((a, b) => a - b);
  let sequentialScore = 0;
  if (pageNumbers.length >= 3) {
    let sequentialCount = 1;
    for (let i = 1; i < pageNumbers.length; i++) {
      if (pageNumbers[i] === pageNumbers[i-1] + 1 || 
          pageNumbers[i] > pageNumbers[i-1]) {
        sequentialCount++;
      }
    }
    if (sequentialCount >= 3) {
      sequentialScore = Math.min(4, (sequentialCount / pageNumbers.length) * 4);
    }
  }
  score += sequentialScore;

  // 목차 페이지 여부 결정 (더 정교한 휴리스틱)
  const looksTocPage =
    score >= 12 ||  // 총점 기준
    (keywordHits >= 3 && parsedLineCount >= 3) ||  // 키워드와 항목 수 기준
    (chapterLikeCount >= 4 && parsedLineCount >= 4) ||  // 챕터 항목 기준
    (leaderLineCount >= 4 && parsedLineCount >= 3) ||  // 리더 도트 기준
    (keywordHits >= 2 && chapterLikeCount >= 3 && parsedLineCount >= 3);  // 복합 기준

  return {
    signals: {
      score: Math.round(score * 10) / 10,  // 소수점 첫째 자리까지
      keywordHits,
      headerLineHits,
      parsedLineCount,
      chapterLikeCount,
      leaderLineCount,
      sequentialScore: Math.round(sequentialScore * 10) / 10,
      looksTocPage,
    },
    parsedLooseEntries,
  };
}

export async function extractPdfText(file, pageLimit = 30, maxLength = 12000, options = {}) {
  const { pdfjsLib, pdf } = await loadPdfDocument(file);
  const {
    includeLayout = false,
    useOcr = false,
    ocrLang = "kor+eng",
    ocrScale = 2,
    ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS,
    ocrPageOrder = "sequential",
    maxOcrPages = 0,
    onOcrProgress,
  } = options || {};
  const progressReporter = createOcrProgressReporter(onOcrProgress);
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, pageLimit);

  const chunks = [];
  const layoutPages = includeLayout ? [] : null;
  let pagesUsed = 0;
  let currentLength = 0;

  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    try {
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
    } finally {
      if (typeof page.cleanup === "function") page.cleanup();
    }
  }

  const normalized = normalizeExtractedText(chunks.join("\n")).slice(0, maxLength);
  if (normalized || !useOcr) {
    return {
      text: normalized,
      pagesUsed,
      totalPages,
      layout: includeLayout ? { pages: layoutPages } : null,
      ocrUsed: false,
    };
  }

  progressReporter.notify("\uD14D\uC2A4\uD2B8\uAC00 \uC5C6\uC5B4 OCR\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4...");
  const ocrEntries = [];
  let ocrLength = 0;
  const ocrPageQueue = resolveOcrPageQueue(
    Array.from({ length: pagesToRead }, (_, index) => index + 1),
    { ocrPageOrder, maxOcrPages }
  );
  try {
    for (let idx = 0; idx < ocrPageQueue.length; idx += 1) {
      if (ocrLength >= maxLength) break;
      const pageNumber = ocrPageQueue[idx];
      progressReporter.notify(
        `OCR \uC9C4\uD589 \uC911... (${idx + 1}/${ocrPageQueue.length}\uD398\uC774\uC9C0)`
      );
      const text = await recognizePdfPage(file, pdf, pageNumber, {
        ocrLang,
        ocrScale,
        ocrMaxPixels,
        progressReporter,
      });
      if (text) {
        ocrEntries.push({ pageNumber, text });
        ocrLength += text.length + 1;
      }
    }
  } finally {
    progressReporter.flush();
  }

  const ocrNormalized = normalizeExtractedText(
    ocrEntries
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .map((entry) => entry.text)
      .join("\n")
  ).slice(0, maxLength);
  return {
    text: ocrNormalized,
    pagesUsed,
    totalPages,
    layout: includeLayout ? { pages: layoutPages } : null,
    ocrUsed: true,
  };
}

function resolveOcrRenderScale(page, requestedScale = 2, maxPixels = DEFAULT_OCR_MAX_PIXELS) {
  const parsedScale = Number(requestedScale);
  let scale = Number.isFinite(parsedScale) && parsedScale > 0 ? parsedScale : 2;
  const viewport = page.getViewport({ scale: 1 });
  const pageArea = Number(viewport?.width || 0) * Number(viewport?.height || 0);

  if (Number.isFinite(maxPixels) && maxPixels > 0 && pageArea > 0) {
    scale = Math.min(scale, Math.sqrt(maxPixels / pageArea));
  }

  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.max(1, Number(scale.toFixed(2)));
}

async function renderPageToCanvas(page, scale = 2, { maxPixels = DEFAULT_OCR_MAX_PIXELS } = {}) {
  const resolvedScale = resolveOcrRenderScale(page, scale, maxPixels);
  const viewport = page.getViewport({ scale: resolvedScale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context unavailable");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function getCachedPageText(file, pdf, pageNumber) {
  const cache = getPerFileCache(pdfPageTextCache, file);
  if (cache.has(pageNumber)) return cache.get(pageNumber);

  const page = await pdf.getPage(pageNumber);
  try {
    const text = await extractPageTextWithAttempts(page);
    cache.set(pageNumber, text);
    return text;
  } finally {
    if (typeof page.cleanup === "function") page.cleanup();
  }
}

function buildOcrPageCacheKey(
  pageNumber,
  { ocrLang = "kor+eng", ocrScale = 2, ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS } = {}
) {
  const parsedScale = Number(ocrScale);
  const scaleKey =
    Number.isFinite(parsedScale) && parsedScale > 0 ? parsedScale.toFixed(2) : "2.00";
  const pixelKey =
    Number.isFinite(ocrMaxPixels) && ocrMaxPixels > 0 ? Math.round(ocrMaxPixels) : "none";
  return `${pageNumber}:${ocrLang}:${scaleKey}:${pixelKey}`;
}

function buildSpreadOcrPageOrder(pageNumbers) {
  const normalized = Array.isArray(pageNumbers) ? pageNumbers : [];
  if (normalized.length <= 2) return [...normalized];

  const ordered = [];
  const seen = new Set();
  const pushIndex = (index) => {
    if (index < 0 || index >= normalized.length) return;
    const pageNumber = normalized[index];
    if (seen.has(pageNumber)) return;
    seen.add(pageNumber);
    ordered.push(pageNumber);
  };

  const lastIndex = normalized.length - 1;
  const middleIndex = Math.floor(lastIndex / 2);
  pushIndex(0);
  pushIndex(middleIndex);
  pushIndex(lastIndex);

  for (let offset = 1; ordered.length < normalized.length; offset += 1) {
    pushIndex(offset);
    pushIndex(middleIndex - offset);
    pushIndex(middleIndex + offset);
    pushIndex(lastIndex - offset);
  }

  return ordered;
}

function resolveOcrPageQueue(pageNumbers, { ocrPageOrder = "sequential", maxOcrPages = 0 } = {}) {
  const normalized = Array.isArray(pageNumbers) ? pageNumbers : [];
  const ordered =
    String(ocrPageOrder || "sequential").toLowerCase() === "spread"
      ? buildSpreadOcrPageOrder(normalized)
      : [...normalized];
  const parsedMax = Number.parseInt(maxOcrPages, 10);
  if (Number.isFinite(parsedMax) && parsedMax > 0) {
    return ordered.slice(0, parsedMax);
  }
  return ordered;
}

async function recognizePdfPage(
  file,
  pdf,
  pageNumber,
  {
    ocrLang = "kor+eng",
    ocrScale = 2,
    ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS,
    progressReporter,
  } = {}
) {
  const cache = getPerFileCache(pdfOcrTextCache, file);
  const cacheKey = buildOcrPageCacheKey(pageNumber, {
    ocrLang,
    ocrScale,
    ocrMaxPixels,
  });
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const text = await runWithOcrWorker(ocrLang, progressReporter?.handleLogger, async (worker) => {
    const page = await pdf.getPage(pageNumber);
    let canvas = null;
    try {
      canvas = await renderPageToCanvas(page, ocrScale, { maxPixels: ocrMaxPixels });
      const result = await worker.recognize(canvas);
      return normalizeExtractedText(result?.data?.text || "");
    } finally {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      if (typeof page.cleanup === "function") page.cleanup();
    }
  });

  cache.set(cacheKey, text);
  return text;
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
  const { pdf } = await loadPdfDocument(file);
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
    ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS,
    onOcrProgress,
  } = resolvedOptions;
  const progressReporter = createOcrProgressReporter(onOcrProgress);
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
    const pageText = await getCachedPageText(file, pdf, pageNumber);
    if (pageText) {
      chunks.push(pageText);
      pagesUsed.push(pageNumber);
      currentLength += pageText.length + 1;
    }
    if (currentLength >= resolvedMaxLength) break;
  }

  const normalized = normalizeExtractedText(chunks.join("\n")).slice(0, resolvedMaxLength);
  if (normalized || !useOcr || normalizedPages.length === 0) {
    return {
      text: normalized,
      pagesUsed,
      totalPages,
      ocrUsed: false,
    };
  }

  progressReporter.notify(
    "\uC120\uD0DD\uD55C \uD398\uC774\uC9C0\uC5D0\uC11C \uD14D\uC2A4\uD2B8\uAC00 \uC5C6\uC5B4 OCR\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4..."
  );
  const ocrChunks = [];
  const ocrPagesUsed = [];
  let ocrLength = 0;
  try {
    for (let idx = 0; idx < normalizedPages.length; idx += 1) {
      if (ocrLength >= resolvedMaxLength) break;
      const pageNumber = normalizedPages[idx];
      progressReporter.notify(
        `OCR \uC9C4\uD589 \uC911... (${idx + 1}/${normalizedPages.length}\uD398\uC774\uC9C0)`
      );
      const text = await recognizePdfPage(file, pdf, pageNumber, {
        ocrLang,
        ocrScale,
        ocrMaxPixels,
        progressReporter,
      });
      if (text) {
        ocrChunks.push(text);
        ocrPagesUsed.push(pageNumber);
        ocrLength += text.length + 1;
      }
    }
  } finally {
    progressReporter.flush();
  }

  const ocrNormalized = normalizeExtractedText(ocrChunks.join("\n")).slice(0, resolvedMaxLength);
  return {
    text: ocrNormalized,
    pagesUsed: ocrPagesUsed,
    totalPages,
    ocrUsed: true,
  };
}

export async function extractPdfPageTexts(file, pageNumbers, options = {}) {
  const { pdf } = await loadPdfDocument(file);
  const {
    useOcr = false,
    ocrLang = "kor+eng",
    ocrScale = 2,
    ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS,
    onOcrProgress,
    maxCharsPerPage = 6000,
  } = options || {};
  const progressReporter = createOcrProgressReporter(onOcrProgress);
  const totalPages = pdf.numPages;
  const normalizedPages = Array.from(
    new Set(
      (pageNumbers || [])
        .map((page) => Number.parseInt(page, 10))
        .filter((page) => Number.isFinite(page) && page > 0 && page <= totalPages)
    )
  ).sort((a, b) => a - b);

  const pages = [];
  const pageEntries = new Map();
  const missingPages = [];
  for (const pageNumber of normalizedPages) {
    const text = await getCachedPageText(file, pdf, pageNumber);
    const normalized = normalizeExtractedText(text).slice(0, maxCharsPerPage);
    const entry = {
      pageNumber,
      text: normalized,
      ocrUsed: false,
    };
    pages.push(entry);
    pageEntries.set(pageNumber, entry);
    if (!normalized) missingPages.push(pageNumber);
  }

  if (useOcr && missingPages.length > 0) {
    progressReporter.notify("\uD398\uC774\uC9C0\uBCC4 OCR\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4...");

    try {
      for (let idx = 0; idx < missingPages.length; idx += 1) {
        const pageNumber = missingPages[idx];
        progressReporter.notify(
          `OCR \uC9C4\uD589 \uC911... (${idx + 1}/${missingPages.length}\uD398\uC774\uC9C0)`
        );
        const text = (
          await recognizePdfPage(file, pdf, pageNumber, {
            ocrLang,
            ocrScale,
            ocrMaxPixels,
            progressReporter,
          })
        ).slice(0, maxCharsPerPage);

        const target = pageEntries.get(pageNumber);
        if (target && text) {
          target.text = text;
          target.ocrUsed = true;
        }
      }
    } finally {
      progressReporter.flush();
    }
  }

  return {
    pages: pages.sort((a, b) => a.pageNumber - b.pageNumber),
    totalPages,
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
    ocrMaxPixels = DEFAULT_OCR_MAX_PIXELS,
    ocrPageOrder = "sequential",
    maxOcrPagesPerRange = 0,
    onOcrProgress,
  } = {}
) {
  const { pdf } = await loadPdfDocument(file);
  const progressReporter = createOcrProgressReporter(onOcrProgress);
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

  const chapters = [];
  for (const range of normalizedRanges) {
    const chunks = [];
    const pagesUsed = [];
    let currentLength = 0;
    for (const pageNumber of range.pages) {
      if (currentLength >= maxLengthPerRange) break;
      const pageText = await getCachedPageText(file, pdf, pageNumber);
      if (!pageText) continue;
      chunks.push(pageText);
      pagesUsed.push(pageNumber);
      currentLength += pageText.length + 1;
    }
    chapters.push({
      ...range,
      text: normalizeExtractedText(chunks.join("\n")).slice(0, maxLengthPerRange),
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

  progressReporter.notify(
    "\uC120\uD0DD \uCC55\uD130 \uD14D\uC2A4\uD2B8\uAC00 \uC5C6\uC5B4 OCR\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4..."
  );

  try {
    for (let chapterIdx = 0; chapterIdx < chapters.length; chapterIdx += 1) {
      const chapter = chapters[chapterIdx];
      if (chapter.text || chapter.pages.length === 0) continue;
      const ocrPageQueue = resolveOcrPageQueue(chapter.pages, {
        ocrPageOrder,
        maxOcrPages: maxOcrPagesPerRange,
      });
      const ocrEntries = [];
      let currentLength = 0;
      for (let idx = 0; idx < ocrPageQueue.length; idx += 1) {
        if (currentLength >= maxLengthPerRange) break;
        const pageNumber = ocrPageQueue[idx];
        progressReporter.notify(
          `OCR \uC9C4\uD589 \uC911... (${chapter.chapterNumber}\uCC55\uD130 ${idx + 1}/${ocrPageQueue.length}\uD398\uC774\uC9C0)`
        );
        const text = await recognizePdfPage(file, pdf, pageNumber, {
          ocrLang,
          ocrScale,
          ocrMaxPixels,
          progressReporter,
        });
        if (!text) continue;
        ocrEntries.push({ pageNumber, text });
        currentLength += text.length + 1;
      }
      const orderedEntries = ocrEntries.sort((left, right) => left.pageNumber - right.pageNumber);
      chapters[chapterIdx] = {
        ...chapter,
        text: normalizeExtractedText(orderedEntries.map((entry) => entry.text).join("\n")).slice(
          0,
          maxLengthPerRange
        ),
        pagesUsed: orderedEntries.map((entry) => entry.pageNumber),
        ocrUsed: true,
      };
    }
  } finally {
    progressReporter.flush();
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
    const pageAnalysis = analyzeTocPage(lines, pageText);
    const pageSignals = pageAnalysis.signals;

    if (pageSignals.keywordHits > 0 || TOC_HEADER_RE.test(pageText)) {
      tocWindowUntil = Math.max(tocWindowUntil, pageNumber + 6);
    } else if (pageSignals.looksTocPage) {
      tocWindowUntil = Math.max(tocWindowUntil, pageNumber + 2);
    }

    const inTocWindow = pageNumber <= tocWindowUntil || pageSignals.looksTocPage;
    const allowLooseTitle = inTocWindow || pageSignals.keywordHits > 0;

    for (const parsed of pageAnalysis.parsedLooseEntries) {
      if (!allowLooseTitle && !parsed.chapterLike) continue;
      if (!inTocWindow && !parsed.chapterLike) continue;
      if (!parsed.chapterLike && !pageSignals.looksTocPage) continue;

      entries.push({
        title: parsed.title,
        pageStart: parsed.pageStart,
        confidence:
          (parsed.confidence || 0) +
          (inTocWindow ? 1 : 0) +
          (pageSignals.keywordHits > 0 ? 2 : 0) +
          (pageSignals.looksTocPage ? 1 : 0),
      });
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

  const highConfidence = normalized.filter((entry) => (entry.confidence || 0) >= 4);
  const selected = highConfidence.length >= 2 ? highConfidence : normalized;
  return buildChapterRangesFromStarts(selected, totalPages);
}

export async function extractChapterRangesFromToc(
  file,
  { maxScanPages = 24 } = {}
) {
  const { pdf } = await loadPdfDocument(file);
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
    error:
      "\uBAA9\uCC28\uC5D0\uC11C \uCC55\uD130 \uBC94\uC704\uB97C \uCC3E\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC9C1\uC811 \uC785\uB825 \uD615\uC2DD(\uC608: 1:1-12)\uC744 \uC0AC\uC6A9\uD574\uC8FC\uC138\uC694.",
  };
}

// Lower default scale for faster thumbnail generation and save as WebP.
export async function generatePdfThumbnail(file, { scale = 0.2, quality = 1.0 } = {}) {
  const { pdf } = await loadPdfDocument(file);
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


const ocrWorkerCache = new Map();

const OCR_WORKER_IDLE_MS = 30000;
const OCR_PROGRESS_INTERVAL_MS = 250;
const DEFAULT_IMAGE_OCR_MAX_PIXELS = 2600000;
const DEFAULT_IMAGE_OCR_MAX_EDGE = 2200;

function normalizeExtractedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function createOcrProgressReporter(onProgress) {
  const callback = typeof onProgress === "function" ? onProgress : null;
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

function isSupportedImageMimeType(type) {
  return String(type || "").toLowerCase().startsWith("image/");
}

export function isTutorImageFile(file) {
  return Boolean(file && typeof file === "object" && isSupportedImageMimeType(file.type));
}

function resolveRenderDimensions(width, height, { maxPixels, maxEdge } = {}) {
  const safeWidth = Math.max(1, Math.round(Number(width) || 0));
  const safeHeight = Math.max(1, Math.round(Number(height) || 0));
  let scale = 1;

  const normalizedMaxEdge = Number(maxEdge);
  if (Number.isFinite(normalizedMaxEdge) && normalizedMaxEdge > 0) {
    scale = Math.min(scale, normalizedMaxEdge / Math.max(safeWidth, safeHeight));
  }

  const normalizedMaxPixels = Number(maxPixels);
  const area = safeWidth * safeHeight;
  if (Number.isFinite(normalizedMaxPixels) && normalizedMaxPixels > 0 && area > 0) {
    scale = Math.min(scale, Math.sqrt(normalizedMaxPixels / area));
  }

  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  const targetWidth = Math.max(1, Math.round(safeWidth * scale));
  const targetHeight = Math.max(1, Math.round(safeHeight * scale));

  return {
    width: targetWidth,
    height: targetHeight,
    originalWidth: safeWidth,
    originalHeight: safeHeight,
  };
}

async function loadImageElement(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image could not be loaded."));
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function renderImageToCanvas(file, { maxPixels, maxEdge } = {}) {
  const image = await loadImageElement(file);
  const dimensions = resolveRenderDimensions(image.naturalWidth, image.naturalHeight, {
    maxPixels,
    maxEdge,
  });
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("Canvas context unavailable.");
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
  return {
    canvas,
    width: dimensions.width,
    height: dimensions.height,
    originalWidth: dimensions.originalWidth,
    originalHeight: dimensions.originalHeight,
  };
}

function normalizeVisionMimeType(type) {
  const normalized = String(type || "").toLowerCase();
  if (normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp") {
    return normalized;
  }
  return "image/png";
}

export async function buildVisionImageDataUrl(
  file,
  {
    maxPixels = 3000000,
    maxEdge = 2048,
    mimeType = "",
    quality = 0.92,
  } = {}
) {
  if (!isTutorImageFile(file)) {
    throw new Error("Only image files can be attached to the tutor.");
  }

  let rendered = null;
  try {
    rendered = await renderImageToCanvas(file, { maxPixels, maxEdge });
    return rendered.canvas.toDataURL(normalizeVisionMimeType(mimeType || file.type), quality);
  } finally {
    if (rendered?.canvas) {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  }
}

export async function extractImageText(
  file,
  {
    ocrLang = "kor+eng",
    maxLength = 16000,
    maxPixels = DEFAULT_IMAGE_OCR_MAX_PIXELS,
    maxEdge = DEFAULT_IMAGE_OCR_MAX_EDGE,
    onProgress,
  } = {}
) {
  if (!isTutorImageFile(file)) {
    throw new Error("Only image files can be attached to the tutor.");
  }

  const progressReporter = createOcrProgressReporter(onProgress);
  progressReporter.notify("Preparing screenshot...");

  let rendered = null;
  try {
    rendered = await renderImageToCanvas(file, { maxPixels, maxEdge });
    progressReporter.notify("Reading screenshot text...");

    const text = await runWithOcrWorker(ocrLang, progressReporter.handleLogger, async (worker) => {
      const result = await worker.recognize(rendered.canvas);
      return normalizeExtractedText(result?.data?.text || "");
    });

    return {
      text: String(text || "").slice(0, maxLength),
      width: rendered.width,
      height: rendered.height,
      originalWidth: rendered.originalWidth,
      originalHeight: rendered.originalHeight,
      ocrUsed: true,
    };
  } finally {
    progressReporter.flush();
    if (rendered?.canvas) {
      rendered.canvas.width = 0;
      rendered.canvas.height = 0;
    }
  }
}

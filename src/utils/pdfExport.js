let exportRuntimePromise = null;
let richExportRuntimePromise = null;

async function loadExportRuntime() {
  if (!exportRuntimePromise) {
    exportRuntimePromise = (async () => {
      const [html2canvasModule, jsPdfModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const html2canvas = html2canvasModule?.default || html2canvasModule;
      const jsPDF = jsPdfModule?.default || jsPdfModule?.jsPDF || jsPdfModule;
      return { html2canvas, jsPDF };
    })();
  }
  return exportRuntimePromise;
}

async function loadRichExportRuntime() {
  if (!richExportRuntimePromise) {
    richExportRuntimePromise = (async () => {
      const [reactModule, reactDomClientModule, summaryCardModule] = await Promise.all([
        import("react"),
        import("react-dom/client"),
        import("../components/SummaryCard.jsx"),
      ]);
      const React = reactModule?.default || reactModule;
      const SummaryCard = summaryCardModule?.default || summaryCardModule;
      return {
        React,
        SummaryCard,
        createRoot: reactDomClientModule.createRoot,
      };
    })();
  }
  return richExportRuntimePromise;
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function waitForExportPages(host, selector, timeoutMs = 3000) {
  const startedAt = Date.now();

  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {
      // Ignore font readiness failures and continue with best-effort rendering.
    }
  }

  while (Date.now() - startedAt < timeoutMs) {
    const pages = Array.from(host.querySelectorAll(selector));
    if (pages.length > 0) {
      await waitForNextPaint();
      return pages;
    }
    await waitForNextPaint();
  }

  return [];
}

async function saveBlobAsFile(blob, filename) {
  if (!blob) throw new Error("File blob is unavailable.");

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof File === "function"
  ) {
    try {
      const file = new File([blob], filename, { type: blob.type || "application/pdf" });
      const canShare =
        typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
      if (canShare) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (typeof window !== "undefined") {
      const userAgent = typeof navigator !== "undefined" ? String(navigator.userAgent || "") : "";
      const isNativeWebView =
        /WebView|wv\)|; wv\)/i.test(userAgent) ||
        Boolean(window?.Capacitor?.isNativePlatform?.());
      if (isNativeWebView) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function savePdfDocument(pdf, filename) {
  if (!pdf) throw new Error("PDF document is unavailable.");
  const blob = pdf.output("blob");
  await saveBlobAsFile(blob, filename);
}

function ensurePdfFilename(filename) {
  const normalized = String(filename || "").trim() || "document.pdf";
  return /\.pdf$/i.test(normalized) ? normalized : `${normalized}.pdf`;
}

function wrapCanvasText(ctx, text, maxWidth) {
  const source = String(text || "");
  if (!source) return [""];

  const lines = [];
  let current = "";

  for (const char of source) {
    const next = `${current}${char}`;
    if (current && ctx.measureText(next).width > maxWidth) {
      lines.push(current.trimEnd());
      current = /\s/.test(char) ? "" : char;
      continue;
    }
    current = next;
  }

  if (current) {
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [""];
}

export async function createTextPdfFile(
  content,
  { filename = "document.pdf", title = "", background = "#ffffff" } = {}
) {
  const normalized = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error("No text to export.");
  }
  if (typeof document === "undefined") {
    throw new Error("PDF export requires a browser environment.");
  }

  const { jsPDF } = await loadExportRuntime();
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const canvasWidth = 1240;
  const canvasHeight = 1754;
  const marginX = 88;
  const marginTop = 96;
  const marginBottom = 96;
  const maxTextWidth = canvasWidth - marginX * 2;
  const bodyFontSize = 24;
  const bodyLineHeight = 40;
  const paragraphGap = 18;
  const blankLineGap = 24;
  const titleFontSize = 34;
  const titleGap = 34;
  const pages = [];

  const createPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context is unavailable.");
    }
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.textBaseline = "top";
    ctx.fillStyle = "#0f172a";
    ctx.font = `${bodyFontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    return { canvas, ctx, y: marginTop };
  };

  let page = createPage();
  const maxY = canvasHeight - marginBottom;

  const pushNewPage = () => {
    pages.push(page.canvas);
    page = createPage();
  };

  const ensureSpace = (heightNeeded) => {
    if (page.y + heightNeeded <= maxY) return;
    pushNewPage();
  };

  if (title) {
    page.ctx.font = `700 ${titleFontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    const titleLines = wrapCanvasText(page.ctx, title, maxTextWidth);
    titleLines.forEach((line) => {
      ensureSpace(titleFontSize + 10);
      page.ctx.fillText(line, marginX, page.y);
      page.y += titleFontSize + 10;
    });
    page.y += titleGap;
    page.ctx.font = `${bodyFontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  }

  normalized.split("\n").forEach((paragraph) => {
    const line = String(paragraph || "").trimEnd();
    if (!line.trim()) {
      ensureSpace(blankLineGap);
      page.y += blankLineGap;
      return;
    }

    const wrappedLines = wrapCanvasText(page.ctx, line, maxTextWidth);
    wrappedLines.forEach((wrappedLine) => {
      ensureSpace(bodyLineHeight);
      page.ctx.fillText(wrappedLine || " ", marginX, page.y);
      page.y += bodyLineHeight;
    });
    page.y += paragraphGap;
  });

  pages.push(page.canvas);

  pages.forEach((canvas, index) => {
    const imgData = canvas.toDataURL("image/png");
    if (index > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
  });

  const blob = pdf.output("blob");
  return {
    file: new File([blob], ensurePdfFilename(filename), {
      type: "application/pdf",
      lastModified: Date.now(),
    }),
    pageCount: pages.length,
  };
}

export async function createRichTextPdfFile(
  content,
  { filename = "document.pdf", title = "", background = "#ffffff" } = {}
) {
  const normalized = String(content || "").replace(/\r\n/g, "\n").trim();
  const normalizedTitle = String(title || "").trim();
  if (!normalized) {
    throw new Error("No text to export.");
  }
  if (typeof document === "undefined") {
    throw new Error("PDF export requires a browser environment.");
  }

  const { html2canvas, jsPDF } = await loadExportRuntime();
  const { React, SummaryCard, createRoot } = await loadRichExportRuntime();
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-32000px";
  host.style.top = "0";
  host.style.width = "0";
  host.style.height = "0";
  host.style.pointerEvents = "none";
  host.style.opacity = "1";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const root = createRoot(host);
  const richContent = normalizedTitle ? `# ${normalizedTitle}\n\n${normalized}` : normalized;

  try {
    root.render(React.createElement(SummaryCard, { summary: richContent, renderExportPages: true }));

    const pages = await waitForExportPages(host, ".summary-export-page");
    if (pages.length === 0) {
      throw new Error("Rich export pages did not render.");
    }

    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: background,
        useCORS: true,
        windowWidth: page.scrollWidth || page.clientWidth || 794,
        windowHeight: page.scrollHeight || page.clientHeight || 1123,
      });
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) {
        pdf.addPage();
      }
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
    }

    const blob = pdf.output("blob");
    return {
      file: new File([blob], ensurePdfFilename(filename), {
        type: "application/pdf",
        lastModified: Date.now(),
      }),
      pageCount: pages.length,
    };
  } finally {
    try {
      root.unmount();
    } catch {
      // Ignore unmount errors during cleanup.
    }
    host.remove();
  }
}

export async function exportElementToPdf(element, { filename = "summary.pdf", margin = 10 } = {}) {
  if (!element) throw new Error("Element not found.");

  const { html2canvas, jsPDF } = await loadExportRuntime();
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: null,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = margin;

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  await savePdfDocument(pdf, filename);
}

export async function exportPagedElementToPdf(
  container,
  { filename = "mock-exam.pdf", margin = 0, pageSelector = ".mock-exam-page", background = "#ffffff" } = {}
) {
  if (!container) throw new Error("Element not found.");

  const { html2canvas, jsPDF } = await loadExportRuntime();
  const pages = Array.from(container.querySelectorAll(pageSelector));
  if (pages.length === 0) {
    return exportElementToPdf(container, { filename, margin });
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < pages.length; i += 1) {
    const canvas = await html2canvas(pages[i], {
      scale: 2,
      backgroundColor: background,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const scale = Math.min(
      (pageWidth - margin * 2) / canvas.width,
      (pageHeight - margin * 2) / canvas.height
    );
    const imgWidth = canvas.width * scale;
    const imgHeight = canvas.height * scale;
    const x = (pageWidth - imgWidth) / 2;
    const y = (pageHeight - imgHeight) / 2;

    if (i > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
  }

  await savePdfDocument(pdf, filename);
}

export async function exportMockAnswerSheetToPdf(
  { title = "모의고사 답지", entries = [], filename = "mock-exam-answers.pdf" } = {}
) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) {
    throw new Error("답지 데이터가 없습니다.");
  }

  const { jsPDF } = await loadExportRuntime();
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 5;
  const bottomLimit = pageHeight - margin;
  let y = margin;

  const ensureSpace = (lineCount = 1) => {
    if (y + Math.max(1, lineCount) * lineHeight <= bottomLimit) return;
    pdf.addPage();
    y = margin;
  };

  const drawTextBlock = (text, { bold = false, size = 10, gapAfter = 1 } = {}) => {
    const normalized = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return;
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(normalized, maxWidth);
    ensureSpace(lines.length + gapAfter);
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight + gapAfter;
  };

  drawTextBlock(title, { bold: true, size: 15, gapAfter: 2 });
  drawTextBlock(`생성 시각: ${new Date().toLocaleString("ko-KR")}`, { size: 9, gapAfter: 3 });

  list.forEach((entry, idx) => {
    const number = Number.isFinite(entry?.number) ? entry.number : idx + 1;
    const answerText = String(entry?.answer || "-").trim() || "-";
    drawTextBlock(`${number}번 정답: ${answerText}`, { bold: true, size: 11, gapAfter: 1 });
    if (entry?.explanation) {
      drawTextBlock(`해설: ${entry.explanation}`, { size: 10, gapAfter: 1 });
    }
    if (entry?.evidence) {
      drawTextBlock(`근거: ${entry.evidence}`, { size: 9, gapAfter: 2 });
    } else {
      y += 1;
    }
  });

  await savePdfDocument(pdf, filename);
}

export function exportTextFile(content, { filename = "summary.txt" } = {}) {
  const normalized = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new Error("No text to export.");
  }

  // Prefix BOM so UTF-8 text is opened correctly in Windows editors.
  const blob = new Blob([`\uFEFF${normalized}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

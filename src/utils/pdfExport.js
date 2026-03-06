let exportRuntimePromise = null;

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

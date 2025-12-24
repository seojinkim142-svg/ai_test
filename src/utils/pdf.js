import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Ensure the worker bundle is correctly referenced in production builds.
GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractPdfText(file, pageLimit = 30, maxLength = 12000) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, pageLimit);

  const chunks = [];

  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str).join(" ");
    chunks.push(strings);
  }

  const normalized = chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return {
    text: normalized,
    pagesUsed: pagesToRead,
    totalPages,
  };
}

export async function generatePdfThumbnail(file, { scale = 0.4 } = {}) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

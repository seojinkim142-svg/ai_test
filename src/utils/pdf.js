import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Ensure the worker bundle is correctly referenced in production builds.
GlobalWorkerOptions.workerSrc = workerSrc;

export async function extractPdfText(file, pageLimit = 30, maxLength = 12000) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, pageLimit);

  const chunks = [];
  const layoutPages = [];

  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pageLayout = {
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      text: "",
      items: [],
    };

    let pageText = "";
    for (const item of content.items) {
      const str = item.str.trim();
      if (!str) continue;

      const withSpace = pageText ? " " : "";
      const start = pageText.length + withSpace.length;
      pageText += withSpace + str;
      const end = pageText.length;

      const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = transformed[4];
      const y = transformed[5]; // baseline after viewport transform (top-left origin)
      const scaleX = Math.hypot(transformed[0], transformed[1]);
      const scaleY = Math.hypot(transformed[2], transformed[3]);
      const widthPx = scaleX * item.width; // advance width with transform applied
      const heightPx = scaleY * (item.height || Math.abs(transformed[3])); // ascent-ish height
      const topY = y - heightPx;
      const norm = {
        x: Math.min(1, Math.max(0, x / viewport.width)),
        y: Math.min(1, Math.max(0, topY / viewport.height)),
        width: Math.min(1, widthPx / viewport.width),
        height: Math.min(1, heightPx / viewport.height),
      };

      pageLayout.items.push({
        text: str,
        start,
        end,
        rect: norm,
      });
    }

    pageLayout.text = pageText;
    layoutPages.push(pageLayout);
    chunks.push(pageText);
  }

  const normalized = chunks.join("\n").replace(/\s+/g, " ").trim().slice(0, maxLength);
  return {
    text: normalized,
    pagesUsed: pagesToRead,
    totalPages,
    layout: {
      pages: layoutPages,
    },
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

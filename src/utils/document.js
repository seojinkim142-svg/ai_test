import { strFromU8, unzipSync } from "fflate";
import { extractPdfText, generatePdfThumbnail } from "./pdf";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PDF_MIME = "application/pdf";

const DOC_KIND_PDF = "pdf";
const DOC_KIND_DOCX = "docx";
const DOC_KIND_PPTX = "pptx";

export const SUPPORTED_DOCUMENT_KINDS = [DOC_KIND_PDF, DOC_KIND_DOCX, DOC_KIND_PPTX];
export const SUPPORTED_UPLOAD_ACCEPT = [
  ".pdf",
  ".docx",
  ".pptx",
  PDF_MIME,
  DOCX_MIME,
  PPTX_MIME,
].join(",");

function getLowerFileName(fileOrName) {
  if (!fileOrName) return "";
  if (typeof fileOrName === "string") return fileOrName.trim().toLowerCase();
  return String(fileOrName.name || "").trim().toLowerCase();
}

function getLowerMimeType(fileOrType) {
  if (!fileOrType) return "";
  if (typeof fileOrType === "string") return fileOrType.trim().toLowerCase();
  return String(fileOrType.type || "").trim().toLowerCase();
}

function getExtension(fileOrName) {
  const name = getLowerFileName(fileOrName);
  if (!name) return "";
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === name.length - 1) return "";
  return name.slice(dotIndex + 1);
}

export function detectSupportedDocumentKind(file) {
  const mime = getLowerMimeType(file);
  const ext = getExtension(file);
  if (mime.includes("pdf") || ext === DOC_KIND_PDF) return DOC_KIND_PDF;
  if (mime.includes("wordprocessingml.document") || ext === DOC_KIND_DOCX) return DOC_KIND_DOCX;
  if (mime.includes("presentationml.presentation") || ext === DOC_KIND_PPTX) return DOC_KIND_PPTX;
  return "";
}

export function isSupportedUploadFile(file) {
  return SUPPORTED_DOCUMENT_KINDS.includes(detectSupportedDocumentKind(file));
}

export function isPdfDocumentKind(kind) {
  return String(kind || "").toLowerCase() === DOC_KIND_PDF;
}

export function normalizeSupportedDocumentFile(inputFile) {
  if (!(inputFile instanceof File)) return inputFile;
  const kind = detectSupportedDocumentKind(inputFile);
  if (!kind) return inputFile;
  const targetType = kind === DOC_KIND_DOCX ? DOCX_MIME : kind === DOC_KIND_PPTX ? PPTX_MIME : PDF_MIME;
  if (getLowerMimeType(inputFile) === targetType) return inputFile;
  return new File([inputFile], inputFile.name, {
    type: targetType,
    lastModified: inputFile.lastModified || Date.now(),
  });
}

function decodeXmlEntities(input) {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number.parseInt(code, 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const value = Number.parseInt(hex, 16);
      return Number.isFinite(value) ? String.fromCodePoint(value) : "";
    });
}

function normalizeExtractedText(input) {
  return String(input || "")
    .replace(/_x000D_/gi, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function readZipEntries(file) {
  return file.arrayBuffer().then((buffer) => unzipSync(new Uint8Array(buffer)));
}

function readEntryAsText(entries, path) {
  const payload = entries?.[path];
  if (!payload) return "";
  try {
    return strFromU8(payload);
  } catch {
    return "";
  }
}

function sortByTrailingNumber(paths) {
  return [...paths].sort((left, right) => {
    const l = Number.parseInt(String(left).match(/(\d+)\.xml$/i)?.[1] || "0", 10);
    const r = Number.parseInt(String(right).match(/(\d+)\.xml$/i)?.[1] || "0", 10);
    return l - r;
  });
}

function extractDocxTextFromXml(xml) {
  const pieces = [];
  const tokenRe =
    /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab(?:\s+[^>]*)?\/>|<(?:w:br|w:cr)(?:\s+[^>]*)?\/>|<\/w:p>/gi;
  let match = tokenRe.exec(xml);
  while (match) {
    const token = match[0] || "";
    if (match[1] != null) {
      pieces.push(decodeXmlEntities(match[1]));
    } else if (/w:tab/i.test(token)) {
      pieces.push("\t");
    } else {
      pieces.push("\n");
    }
    match = tokenRe.exec(xml);
  }
  return normalizeExtractedText(pieces.join(""));
}

function extractPptxTextFromXml(xml) {
  const pieces = [];
  const tokenRe = /<a:t(?:\s+[^>]*)?>([\s\S]*?)<\/a:t>|<a:br(?:\s+[^>]*)?\/>|<\/a:p>/gi;
  let match = tokenRe.exec(xml);
  while (match) {
    if (match[1] != null) {
      pieces.push(decodeXmlEntities(match[1]));
    } else {
      pieces.push("\n");
    }
    match = tokenRe.exec(xml);
  }
  return normalizeExtractedText(pieces.join(""));
}

async function extractDocxText(file, { maxLength = 12000 } = {}) {
  const entries = await readZipEntries(file);
  const primary = readEntryAsText(entries, "word/document.xml");
  const extras = sortByTrailingNumber(
    Object.keys(entries || {}).filter((entryPath) =>
      /^word\/(?:header|footer|footnotes|endnotes)\d*\.xml$/i.test(entryPath)
    )
  )
    .map((entryPath) => readEntryAsText(entries, entryPath))
    .filter(Boolean);

  const mergedXml = [primary, ...extras].filter(Boolean).join("\n");
  if (!mergedXml) {
    return { text: "", pagesUsed: 0, totalPages: 0, ocrUsed: false };
  }
  const text = extractDocxTextFromXml(mergedXml).slice(0, maxLength);
  return { text, pagesUsed: text ? 1 : 0, totalPages: text ? 1 : 0, ocrUsed: false };
}

async function extractPptxText(file, { maxLength = 12000 } = {}) {
  const entries = await readZipEntries(file);
  const slidePaths = sortByTrailingNumber(
    Object.keys(entries || {}).filter((entryPath) => /^ppt\/slides\/slide\d+\.xml$/i.test(entryPath))
  );
  if (!slidePaths.length) {
    return { text: "", pagesUsed: 0, totalPages: 0, ocrUsed: false };
  }

  const sections = [];
  let usedSlides = 0;
  for (const slidePath of slidePaths) {
    if (sections.join("\n\n").length >= maxLength) break;
    const slideIndex = Number.parseInt(String(slidePath).match(/slide(\d+)\.xml$/i)?.[1] || "0", 10);
    const slideXml = readEntryAsText(entries, slidePath);
    const slideText = extractPptxTextFromXml(slideXml);
    if (!slideText) continue;
    usedSlides += 1;
    const slideLabel = Number.isFinite(slideIndex) && slideIndex > 0 ? slideIndex : usedSlides;
    sections.push(`[Slide ${slideLabel}]`);
    sections.push(slideText);
  }

  const text = normalizeExtractedText(sections.join("\n")).slice(0, maxLength);
  return { text, pagesUsed: usedSlides, totalPages: slidePaths.length, ocrUsed: false };
}

export async function extractDocumentText(file, options = {}) {
  const kind = detectSupportedDocumentKind(file);
  const pageLimit = Number(options?.pageLimit || 30);
  const maxLength = Number(options?.maxLength || 12000);

  if (kind === DOC_KIND_PDF) {
    return extractPdfText(file, pageLimit, maxLength, options);
  }
  if (kind === DOC_KIND_DOCX) {
    return extractDocxText(file, { maxLength });
  }
  if (kind === DOC_KIND_PPTX) {
    return extractPptxText(file, { maxLength });
  }
  throw new Error("Unsupported file type. Only PDF, DOCX, and PPTX are supported.");
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildOfficeThumbnail(file, { accent = "#10b981", badge = "DOC" } = {}) {
  const rawName = String(file?.name || "document").trim();
  const name = rawName.length > 28 ? `${rawName.slice(0, 25)}...` : rawName;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#0f172a" /><stop offset="100%" stop-color="#1e293b" />',
    "</linearGradient></defs>",
    '<rect x="0" y="0" width="640" height="360" fill="url(#bg)" />',
    `<rect x="36" y="36" width="220" height="288" rx="20" fill="${escapeXml(accent)}" opacity="0.15" />`,
    `<text x="146" y="190" font-size="56" text-anchor="middle" font-weight="700" fill="${escapeXml(
      accent
    )}" font-family="Arial, sans-serif">${escapeXml(badge)}</text>`,
    '<text x="286" y="132" font-size="22" fill="#e2e8f0" font-family="Arial, sans-serif">Uploaded Document</text>',
    `<text x="286" y="182" font-size="28" fill="#f8fafc" font-family="Arial, sans-serif" font-weight="600">${escapeXml(
      name
    )}</text>`,
    '<text x="286" y="226" font-size="16" fill="#94a3b8" font-family="Arial, sans-serif">Text extraction is ready</text>',
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export async function generateDocumentThumbnail(file, options = {}) {
  const kind = detectSupportedDocumentKind(file);
  if (kind === DOC_KIND_PDF) {
    return generatePdfThumbnail(file, options);
  }
  if (kind === DOC_KIND_DOCX) {
    return buildOfficeThumbnail(file, { accent: "#22c55e", badge: "DOCX" });
  }
  if (kind === DOC_KIND_PPTX) {
    return buildOfficeThumbnail(file, { accent: "#f97316", badge: "PPTX" });
  }
  return buildOfficeThumbnail(file, { accent: "#38bdf8", badge: "FILE" });
}

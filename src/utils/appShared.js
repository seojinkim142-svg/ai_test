const FOLDER_AGGREGATE_DOC_PREFIX = "folder::";
const FOLDER_AGGREGATE_PLACEHOLDER_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CHAPTER_RANGE_STORAGE_PREFIX = "zeusian:chapter-ranges:v1";
export const FOLDER_AGGREGATE_MAX_LENGTH = 60000;
export const FOLDER_AGGREGATE_MAX_LENGTH_PER_FILE = 14000;

export function buildStoragePathCandidates(rawPath) {
  const source = String(rawPath || "").trim();
  if (!source) return [];

  const seen = new Set();
  const candidates = [];
  const addCandidate = (value) => {
    const normalized = String(value || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(source);

  if (/%[0-9A-Fa-f]{2}/.test(source)) {
    try {
      addCandidate(decodeURIComponent(source));
    } catch {
      // Ignore malformed escape sequences.
    }
  }

  try {
    const decoded = decodeURI(source);
    addCandidate(decoded);
    addCandidate(encodeURI(decoded));
  } catch {
    // Ignore malformed URI sequences.
  }

  addCandidate(encodeURI(source));
  return candidates;
}

export function isSafeStoragePathForReuse(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) return false;
  if (value.includes("%")) return false;
  return /^[\x20-\x7E]+$/.test(value);
}

export function buildFolderAggregateDocId(folderId) {
  const normalizedFolderId = String(folderId || "").trim();
  if (!normalizedFolderId) return "";
  return `${FOLDER_AGGREGATE_DOC_PREFIX}${normalizedFolderId}`;
}

export function isFolderAggregateDocId(value) {
  return String(value || "").startsWith(FOLDER_AGGREGATE_DOC_PREFIX);
}

export function parseFolderAggregateDocId(value) {
  if (!isFolderAggregateDocId(value)) return "";
  return String(value || "").slice(FOLDER_AGGREGATE_DOC_PREFIX.length).trim();
}

export function buildFolderAggregateSignature(folderName, items = []) {
  const itemKeys = (Array.isArray(items) ? items : [])
    .map((item) => {
      const key =
        item?.id ||
        item?.path ||
        item?.remotePath ||
        [item?.name || "", item?.size || 0, item?.hash || ""].join(":");
      return String(key || "").trim();
    })
    .filter(Boolean)
    .sort();
  return [String(folderName || "").trim(), ...itemKeys].join("::");
}

export function createFolderAggregatePlaceholderFile(folderName) {
  const safeName = String(folderName || "folder").trim() || "folder";
  return new File([`Folder aggregate placeholder: ${safeName}`], `${safeName}-combined.docx`, {
    type: FOLDER_AGGREGATE_PLACEHOLDER_MIME,
    lastModified: Date.now(),
  });
}

export function buildFolderAggregateSourceText({
  folderName = "",
  sections = [],
  totalFiles = 0,
  includedFiles = 0,
  truncated = false,
} = {}) {
  const normalizedSections = (Array.isArray(sections) ? sections : []).filter(
    (section) => String(section?.text || "").trim().length > 0
  );
  const title = String(folderName || "폴더").trim() || "폴더";
  const lines = [
    `# ${title} 통합 문서`,
    "",
    `이 문서는 폴더에 담긴 관련 자료 ${includedFiles || 0}개를 하나의 학습 문서처럼 합친 텍스트입니다.`,
  ];

  if (Number(totalFiles) > Number(includedFiles || 0)) {
    lines.push(`일부 파일은 텍스트가 비어 있거나 추출되지 않아 제외되었습니다. 전체 파일 수: ${totalFiles}개.`);
  }
  if (truncated) {
    lines.push("문서 길이 제한으로 일부 내용은 생략되었습니다.");
  }

  lines.push("", "## 포함 파일");
  normalizedSections.forEach((section, index) => {
    lines.push(`- ${index + 1}. ${String(section.name || `문서 ${index + 1}`).trim()}`);
  });

  normalizedSections.forEach((section, index) => {
    const sectionName = String(section.name || `문서 ${index + 1}`).trim();
    lines.push("", `## 자료 ${index + 1}. ${sectionName}`, String(section.text || "").trim());
  });

  return lines.join("\n").trim();
}

function escapeXml(input) {
  return String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildFolderAggregateThumbnail(folderName) {
  const safeName = String(folderName || "Folder").trim().slice(0, 28) || "Folder";
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
    '<stop offset="0%" stop-color="#052e16" />',
    '<stop offset="100%" stop-color="#0f172a" />',
    "</linearGradient></defs>",
    '<rect x="0" y="0" width="640" height="360" fill="url(#bg)" />',
    '<rect x="42" y="48" width="556" height="264" rx="28" fill="#ecfdf5" opacity="0.12" />',
    '<rect x="72" y="82" width="180" height="42" rx="14" fill="#34d399" opacity="0.85" />',
    '<text x="162" y="109" font-size="22" text-anchor="middle" font-weight="700" fill="#022c22" font-family="Arial, sans-serif">FOLDER</text>',
    `<text x="72" y="174" font-size="34" font-weight="700" fill="#f0fdf4" font-family="Arial, sans-serif">${escapeXml(
      safeName
    )}</text>`,
    '<text x="72" y="220" font-size="20" fill="#bbf7d0" font-family="Arial, sans-serif">Folder summary PDF</text>',
    '<text x="72" y="258" font-size="18" fill="#d1fae5" font-family="Arial, sans-serif">Built from saved file summaries</text>',
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapePdfText(input) {
  return String(input || "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function createPlaceholderPdfFile(fileName, lines = []) {
  const safeLines = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const renderedLines = safeLines.length > 0 ? safeLines : ["Folder summary preview"];
  const content = [
    "BT",
    "/F1 18 Tf",
    "72 780 Td",
    ...renderedLines.flatMap((line, index) =>
      index === 0 ? [`(${escapePdfText(line)}) Tj`] : ["0 -26 Td", `(${escapePdfText(line)}) Tj`]
    ),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new File([pdf], String(fileName || "folder-summary.pdf").trim() || "folder-summary.pdf", {
    type: "application/pdf",
    lastModified: Date.now(),
  });
}

export function createLocalEntityId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildChapterRangeStorageKey({ userId, scopeId, docId }) {
  const normalizedDocId = String(docId || "").trim();
  if (!normalizedDocId) return "";
  const normalizedUserId = String(userId || "guest").trim() || "guest";
  const normalizedScopeId = String(scopeId || "default").trim() || "default";
  return `${CHAPTER_RANGE_STORAGE_PREFIX}:${normalizedUserId}:${normalizedScopeId}:${normalizedDocId}`;
}

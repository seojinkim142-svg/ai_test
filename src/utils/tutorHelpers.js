export function buildTutorPageCandidates(prompt, totalPages) {
  const text = String(prompt || "");
  const maxPages = Number.parseInt(totalPages, 10);
  if (!text || !Number.isFinite(maxPages) || maxPages <= 0) return [];

  const pages = new Set();
  const addPage = (page) => {
    const parsed = Number.parseInt(page, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed < 1 || parsed > maxPages) return;
    pages.add(parsed);
  };
  const addRange = (start, end, cap = 18) => {
    const parsedStart = Number.parseInt(start, 10);
    const parsedEnd = Number.parseInt(end, 10);
    if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) return;
    const lo = Math.max(1, Math.min(parsedStart, parsedEnd));
    const hi = Math.min(maxPages, Math.max(parsedStart, parsedEnd));
    let count = 0;
    for (let page = lo; page <= hi; page += 1) {
      addPage(page);
      count += 1;
      if (count >= cap) break;
    }
  };
  const addWindow = (center, before = 1, after = 2) => {
    const parsed = Number.parseInt(center, 10);
    if (!Number.isFinite(parsed)) return;
    for (let page = parsed - before; page <= parsed + after; page += 1) {
      addPage(page);
    }
  };

  const pageRangeRe = /(\d{1,4})\s*(?:-|~|to|부터)\s*(\d{1,4})\s*(?:p|page|페이지|쪽)?/gi;
  for (const match of text.matchAll(pageRangeRe)) {
    addRange(match[1], match[2]);
  }

  const pageFromRe = /(\d{1,4})\s*(?:p|page|페이지|쪽)\s*(?:부터|이후)?/gi;
  for (const match of text.matchAll(pageFromRe)) {
    const base = Number.parseInt(match[1], 10);
    if (!Number.isFinite(base)) continue;
    addRange(base, Math.min(maxPages, base + 10), 12);
  }

  const pageSuffixRe = /(\d{1,4})\s*(?:p|page|페이지|쪽)/gi;
  for (const match of text.matchAll(pageSuffixRe)) {
    addWindow(match[1], 1, 2);
  }

  const pagePrefixRe = /(?:p|page|페이지|쪽)\s*(\d{1,4})/gi;
  for (const match of text.matchAll(pagePrefixRe)) {
    addWindow(match[1], 1, 2);
  }

  return [...pages].sort((a, b) => a - b).slice(0, 24);
}

function escapeRegex(source) {
  return String(source || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractTutorSectionCandidates(prompt) {
  const text = String(prompt || "");
  if (!text) return [];
  const found = text.match(/\b\d+(?:\.\d+){1,3}\b/g) || [];
  const unique = [];
  const seen = new Set();
  for (const token of found) {
    const normalized = String(token || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
    if (unique.length >= 4) break;
  }
  return unique;
}

export function extractTutorProblemTokenCandidates(prompt) {
  const text = String(prompt || "");
  if (!text) return [];

  const found = [];
  const add = (value) => {
    const token = String(value || "").trim();
    if (!token) return;
    if (!found.includes(token)) found.push(token);
  };

  const patterns = [
    /(?:문제|question|q\.?)\s*(\d{1,3}(?:\.\d{1,3})?)/gi,
    /(\d{1,3}(?:\.\d{1,3})?)\s*번\s*(?:문제|question)?/gi,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      add(match?.[1]);
      if (found.length >= 4) return found;
    }
  }
  return found;
}

function incrementSectionToken(sectionToken) {
  const parts = String(sectionToken || "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  if (!parts.length || parts.some((value) => !Number.isFinite(value) || value < 0)) return "";
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

function buildTutorSectionBoundaryPatterns(sectionToken) {
  const token = String(sectionToken || "").trim();
  if (!token) return [];
  const patterns = [];

  const nextSibling = incrementSectionToken(token);
  if (nextSibling) {
    patterns.push(new RegExp(`(?:^|[^0-9])${escapeRegex(nextSibling)}(?:[^0-9]|$)`, "i"));
  }

  const parts = token.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length >= 2 && Number.isFinite(parts[0])) {
    const nextMajor = parts[0] + 1;
    patterns.push(
      new RegExp(
        [
          `\\b${nextMajor}\\.\\d+\\b`,
          `\\bchapter\\s*${nextMajor}\\b`,
          `\\bchap\\.?\\s*${nextMajor}\\b`,
          `\\bch\\.?\\s*${nextMajor}\\b`,
          `\\bsection\\s*${nextMajor}\\b`,
          `\\bsec\\.?\\s*${nextMajor}\\b`,
          `제\\s*${nextMajor}\\s*장`,
          `${nextMajor}\\s*장`,
        ].join("|"),
        "i"
      )
    );
  }

  return patterns;
}

export function detectTutorSectionPageRange(pageEntries, sectionToken) {
  const pages = Array.isArray(pageEntries) ? pageEntries : [];
  const token = String(sectionToken || "").trim();
  if (!pages.length || !token) return null;

  const targetRe = new RegExp(`(?:^|[^0-9])${escapeRegex(token)}(?:[^0-9]|$)`, "i");
  const startIndex = pages.findIndex((entry) => targetRe.test(String(entry?.text || "")));
  if (startIndex < 0) return null;

  const boundaryPatterns = buildTutorSectionBoundaryPatterns(token);
  let endIndex = pages.length - 1;
  for (let idx = startIndex + 1; idx < pages.length; idx += 1) {
    const text = String(pages[idx]?.text || "");
    if (!text) continue;
    if (boundaryPatterns.some((pattern) => pattern.test(text))) {
      endIndex = Math.max(startIndex, idx - 1);
      break;
    }
  }

  const startPage = Number.parseInt(pages[startIndex]?.pageNumber, 10);
  const endPage = Number.parseInt(pages[endIndex]?.pageNumber, 10);
  if (!Number.isFinite(startPage) || !Number.isFinite(endPage)) return null;
  return {
    section: token,
    startPage,
    endPage: Math.max(startPage, endPage),
  };
}

function extractTutorEvidenceEntries(rawEvidenceText) {
  const source = String(rawEvidenceText || "");
  if (!source) return [];
  const entries = [];
  const re = /\[p\.(\d+)\]\s*\n([\s\S]*?)(?=\n\s*\[p\.\d+\]\s*\n|$)/gi;
  for (const match of source.matchAll(re)) {
    const pageNumber = Number.parseInt(match?.[1], 10);
    const text = String(match?.[2] || "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(pageNumber) || !text) continue;
    entries.push({ pageNumber, text });
  }
  return entries;
}

function buildTutorForcedFallbackAnswer(question, rawEvidenceText) {
  const entries = extractTutorEvidenceEntries(rawEvidenceText);
  if (!entries.length) {
    return "답변 생성이 불안정해 문서 본문 근거를 바로 만들지 못했습니다. 같은 질문을 다시 보내주시면 즉시 재시도하겠습니다.";
  }

  const terms = String(question || "")
    .toLowerCase()
    .match(/[0-9a-z\uAC00-\uD7A3.]+/g);
  const keywords = (terms || []).filter((token) => token.length >= 2).slice(0, 12);

  const scored = entries
    .map((entry, index) => {
      const lower = entry.text.toLowerCase();
      let score = 0;
      for (const token of keywords) {
        if (lower.includes(token)) score += token.includes(".") ? 3 : 1;
      }
      return { ...entry, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored.slice(0, Math.min(3, scored.length));
  const lines = [
    "모델 응답이 비어 문서 본문 근거 기준으로 핵심 내용을 먼저 정리합니다.",
  ];
  for (const item of selected) {
    const snippet = item.text.length > 280 ? `${item.text.slice(0, 280)}...` : item.text;
    lines.push(`- p.${item.pageNumber}: ${snippet}`);
  }
  lines.push("원하시면 위 근거 페이지를 기준으로 질문하신 항목을 단계별로 이어서 자세히 설명하겠습니다.");
  return lines.join("\n");
}

export function resolveTutorReplyText(rawReply, { question, rawEvidenceText }) {
  const reply = String(rawReply || "").trim();
  const invalidPatterns = [
    /\uBAA8\uB378(?:\uC774)?\s*\uBE48\s*\uC751\uB2F5/iu,
    /\uAC19\uC740\s*\uC9C8\uBB38\uC744\s*\uD55C\s*\uBC88\s*\uB354/iu,
    /\uC9C8\uBB38\uC744\s*\uC870\uAE08\s*\uB354\s*\uAD6C\uCCB4/iu,
    /\uC9C0\uAE08\uC740\s*\uB2F5\uBCC0\uC744\s*\uC0DD\uC131\uD558\uC9C0\s*\uBABB/iu,
    /\uC694\uCCAD\s*\uAD6C\uAC04.*\uB2E4\uC2DC\s*\uC77D/iu,
  ];
  if (!reply || invalidPatterns.some((pattern) => pattern.test(reply))) {
    return buildTutorForcedFallbackAnswer(question, rawEvidenceText);
  }
  return reply;
}

function parseNormalizedChapterNumberSelectionInput(rawInput, chapters) {
  const available = Array.isArray(chapters) ? chapters : [];
  const chapterNumbers = available
    .map((chapter) => Number.parseInt(chapter?.chapterNumber, 10))
    .filter((num) => Number.isFinite(num) && num > 0);
  const chapterNumberSet = new Set(chapterNumbers);
  if (!chapterNumbers.length) {
    return {
      chapterNumbers: [],
      normalizedInput: "",
      error: "설정된 범위에서 사용할 수 있는 챕터가 없습니다.",
    };
  }

  const cleaned = String(rawInput || "").replace(/\s+/g, "");
  if (!cleaned) {
    return { chapterNumbers, normalizedInput: "", error: "" };
  }
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(cleaned)) {
    return {
      chapterNumbers: [],
      normalizedInput: "",
      error: "챕터 범위는 n, n-m, 1,3,5 같은 형식으로 입력해주세요.",
    };
  }

  const selected = new Set();
  const normalizedInput = cleaned;
  const tokens = cleaned.split(",").filter(Boolean);
  for (const token of tokens) {
    if (token.includes("-")) {
      const [startRaw, endRaw] = token.split("-");
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start >= end) {
        return {
          chapterNumbers: [],
          normalizedInput: "",
          error: "챕터 범위는 작은 수부터 입력해주세요. 예: 3-5, 1,3,5",
        };
      }
      for (let chapterNumber = start; chapterNumber <= end; chapterNumber += 1) {
        selected.add(chapterNumber);
      }
      continue;
    }

    const chapterNumber = Number.parseInt(token, 10);
    if (!Number.isFinite(chapterNumber) || chapterNumber <= 0) {
      return {
        chapterNumbers: [],
        normalizedInput: "",
        error: "챕터 번호를 다시 확인해주세요.",
      };
    }
    selected.add(chapterNumber);
  }

  const filtered = [...selected]
    .filter((num) => chapterNumberSet.has(num))
    .sort((left, right) => left - right);
  if (!filtered.length) {
    return {
      chapterNumbers: [],
      normalizedInput,
      error: `설정된 챕터 범위에 해당하는 번호가 없습니다. 사용 가능: ${chapterNumbers.join(", ")}`,
    };
  }
  return { chapterNumbers: filtered, normalizedInput, error: "" };
}

export function parseChapterNumberSelectionInput(rawInput, chapters) {
  return parseNormalizedChapterNumberSelectionInput(rawInput, chapters);
}

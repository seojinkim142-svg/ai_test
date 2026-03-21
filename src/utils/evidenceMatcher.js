import { normalizeQuestionKey } from "./questionDedupe";

const EVIDENCE_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "there",
  "their",
  "have",
  "will",
  "were",
  "what",
  "when",
  "where",
  "which",
  "about",
  "after",
  "before",
  "because",
  "while",
  "then",
  "than",
  "quiz",
  "question",
  "answer",
  "summary",
  "page",
  "chapter",
  "document",
  "problem",
  "explanation",
  "evidence",
  "보기",
  "문제",
  "정답",
  "해설",
  "요약",
  "근거",
  "페이지",
  "챕터",
  "다음",
  "아래",
  "위의",
  "대한",
  "관련",
  "설명",
  "무엇",
  "어떤",
  "하는",
  "한다",
  "에서",
  "이다",
  "있다",
  "없다",
]);

function normalizeEvidenceText(value) {
  return String(value || "")
    .replace(/조건부\s*확률/gi, " conditional probability ")
    .replace(/합사건/gi, " union event ")
    .replace(/교집합/gi, " intersection ")
    .replace(/독립\s*사건/gi, " independent event ")
    .replace(/기댓값/gi, " expectation ")
    .replace(/분산/gi, " variance ")
    .replace(/P\s*\(([^)]*)\)/gi, (full, inner) => {
      const compact = String(inner || "")
        .replace(/[^0-9A-Za-z\uAC00-\uD7A3]+/g, "")
        .toLowerCase();
      return compact ? ` ${full} probability formula_${compact} ` : ` ${full} probability `;
    })
    .replace(/E\s*\[([^\]]*)\]/gi, (full, inner) => {
      const compact = String(inner || "")
        .replace(/[^0-9A-Za-z\uAC00-\uD7A3]+/g, "")
        .toLowerCase();
      return compact ? ` ${full} expectation expr_${compact} ` : ` ${full} expectation `;
    })
    .replace(/Var\s*\(([^)]*)\)/gi, (full, inner) => {
      const compact = String(inner || "")
        .replace(/[^0-9A-Za-z\uAC00-\uD7A3]+/g, "")
        .toLowerCase();
      return compact ? ` ${full} variance expr_${compact} ` : ` ${full} variance `;
    })
    .replace(/Cov\s*\(([^)]*)\)/gi, (full, inner) => {
      const compact = String(inner || "")
        .replace(/[^0-9A-Za-z\uAC00-\uD7A3]+/g, "")
        .toLowerCase();
      return compact ? ` ${full} covariance expr_${compact} ` : ` ${full} covariance `;
    })
    .replace(/\r\n/g, "\n")
    .replace(/[`#>*_[\]-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEvidenceTokens(value, limit = 12) {
  const normalized = normalizeEvidenceText(value);
  if (!normalized) return [];

  const rawTokens = normalized
    .split(/[^0-9A-Za-z\uAC00-\uD7A3]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const scored = [];
  const seen = new Set();
  for (const token of rawTokens) {
    if (token.length < 2) continue;
    if (EVIDENCE_STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    scored.push({
      token,
      score: token.length >= 8 ? 5 : token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2,
    });
  }

  return scored
    .sort((left, right) => right.score - left.score || right.token.length - left.token.length)
    .slice(0, limit)
    .map((item) => item.token);
}

function buildSentenceCandidates(text) {
  const normalized = normalizeEvidenceText(text);
  if (!normalized) return [];

  const rawParts = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (rawParts.length > 0) return rawParts;

  const chunks = [];
  for (let cursor = 0; cursor < normalized.length; cursor += 220) {
    chunks.push(normalized.slice(cursor, cursor + 220).trim());
  }
  return chunks.filter(Boolean);
}

function scoreSentence(sentence, tokens, normalizedQueryKey) {
  const sentenceKey = normalizeQuestionKey(sentence);
  if (!sentenceKey) return 0;

  let score = 0;
  if (normalizedQueryKey && sentenceKey.includes(normalizedQueryKey.slice(0, 120))) {
    score += 30;
  }
  for (const token of tokens) {
    if (!token) continue;
    if (sentenceKey.includes(token)) {
      score += token.length >= 6 ? 6 : token.length >= 4 ? 4 : 2;
    }
  }
  return score;
}

function pickEvidenceSnippet(pageText, queryText, maxChars = 220) {
  const normalizedPageText = normalizeEvidenceText(pageText);
  if (!normalizedPageText) return "";
  if (normalizedPageText.length <= maxChars) return normalizedPageText;

  const tokens = extractEvidenceTokens(queryText, 8);
  const normalizedQueryKey = normalizeQuestionKey(queryText);
  const parts = buildSentenceCandidates(normalizedPageText);
  const scored = parts
    .map((sentence, index) => ({
      sentence,
      index,
      score: scoreSentence(sentence, tokens, normalizedQueryKey),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const best = scored[0]?.sentence || normalizedPageText.slice(0, maxChars).trim();
  if (best.length <= maxChars) return best;
  return `${best.slice(0, maxChars).trim()}...`;
}

function scorePageText(queryText, pageText) {
  const normalizedQueryKey = normalizeQuestionKey(queryText);
  const normalizedPageKey = normalizeQuestionKey(pageText);
  if (!normalizedQueryKey || !normalizedPageKey) return 0;

  let score = 0;
  if (normalizedPageKey.includes(normalizedQueryKey.slice(0, 120))) {
    score += 50;
  }

  const tokens = extractEvidenceTokens(queryText, 12);
  let tokenHits = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (normalizedPageKey.includes(token)) {
      tokenHits += 1;
      score += token.length >= 6 ? 7 : token.length >= 4 ? 5 : 3;
    }
  }

  if (tokenHits >= 3) score += tokenHits * 4;
  if (tokenHits >= 5) score += 10;
  return score;
}

export function findEvidenceMatches(queryText, pageEntries, { limit = 3, minScore = 12 } = {}) {
  const normalizedQuery = normalizeEvidenceText(queryText);
  if (!normalizedQuery) return [];

  const entries = Array.isArray(pageEntries) ? pageEntries : [];
  return entries
    .map((entry) => {
      const pageNumber = Number.parseInt(entry?.pageNumber, 10);
      const text = normalizeEvidenceText(entry?.text);
      if (!Number.isFinite(pageNumber) || !text) return null;

      const score = scorePageText(normalizedQuery, text);
      if (score < minScore) return null;

      return {
        pageNumber,
        score,
        snippet: pickEvidenceSnippet(text, normalizedQuery),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber)
    .slice(0, limit);
}

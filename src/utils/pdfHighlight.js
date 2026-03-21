const HIGHLIGHT_STOP_WORDS = new Set([
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
  "question",
  "answer",
  "evidence",
  "page",
  "statement",
  "prompt",
  "explanation",
  "문제",
  "정답",
  "해설",
  "근거",
  "페이지",
  "문항",
  "보기",
]);

function normalizeHighlightText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[^0-9a-z\uac00-\ud7a3]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHighlightTokens(value, limit = 10) {
  const normalized = normalizeHighlightText(value);
  if (!normalized) return [];

  const rawTokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

  const seen = new Set();
  const weighted = [];
  for (const token of rawTokens) {
    if (token.length < 2) continue;
    if (HIGHLIGHT_STOP_WORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    weighted.push({
      token,
      score: token.length >= 8 ? 5 : token.length >= 6 ? 4 : token.length >= 4 ? 3 : 2,
    });
  }

  return weighted
    .sort((left, right) => right.score - left.score || right.token.length - left.token.length)
    .slice(0, limit)
    .map((item) => item.token);
}

function scoreWindowText(windowText, queryText, tokens) {
  if (!windowText) return 0;

  let score = 0;
  if (queryText && windowText.includes(queryText)) {
    score += 80;
  } else if (queryText && queryText.includes(windowText) && windowText.length >= 12) {
    score += 28;
  }

  let hits = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (!windowText.includes(token)) continue;
    hits += 1;
    score += token.length >= 8 ? 8 : token.length >= 6 ? 6 : 4;
  }

  if (hits >= 2) score += hits * 3;
  if (hits >= 4) score += 6;
  return score;
}

function mergeRects(rects) {
  const sorted = (Array.isArray(rects) ? rects : [])
    .filter(Boolean)
    .sort((left, right) => left.y - right.y || left.x - right.x);
  if (!sorted.length) return [];

  const merged = [];
  for (const rect of sorted) {
    const current = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(current);
      continue;
    }

    const currentMidY = current.y + current.height / 2;
    const lastMidY = last.y + last.height / 2;
    const sameLine =
      Math.abs(currentMidY - lastMidY) <= Math.max(last.height, current.height) * 1.15;
    const gap = current.x - (last.x + last.width);
    if (sameLine && gap <= 0.028) {
      const nextRight = Math.max(last.x + last.width, current.x + current.width);
      const nextBottom = Math.max(last.y + last.height, current.y + current.height);
      last.x = Math.min(last.x, current.x);
      last.y = Math.min(last.y, current.y);
      last.width = nextRight - last.x;
      last.height = nextBottom - last.y;
      continue;
    }

    merged.push(current);
  }

  return merged.map((rect) => ({
    x: Math.max(0, rect.x - 0.004),
    y: Math.max(0, rect.y - 0.003),
    width: Math.min(1, rect.width + 0.008),
    height: Math.min(1, Math.max(0.014, rect.height + 0.006)),
  }));
}

export function findHighlightRects(layoutPage, hintText, { maxWindowItems = 18, minScore = 12 } = {}) {
  const items = Array.isArray(layoutPage?.items)
    ? layoutPage.items
        .map((item) => ({
          ...item,
          normalized: normalizeHighlightText(item?.text),
        }))
        .filter((item) => item.normalized)
    : [];
  if (!items.length) return [];

  const normalizedHint = normalizeHighlightText(hintText);
  if (!normalizedHint) return [];

  const tokens = extractHighlightTokens(normalizedHint, 10);
  let best = null;

  for (let start = 0; start < items.length; start += 1) {
    let windowText = "";
    for (let end = start; end < items.length && end < start + maxWindowItems; end += 1) {
      windowText = windowText ? `${windowText} ${items[end].normalized}` : items[end].normalized;
      const score = scoreWindowText(windowText, normalizedHint, tokens);
      if (score < minScore) continue;

      if (
        !best ||
        score > best.score ||
        (score === best.score && end - start < best.end - best.start)
      ) {
        best = { start, end, score };
      }
    }
  }

  if (!best) return [];

  const rects = items.slice(best.start, best.end + 1).map((item) => item.rect).filter(Boolean);
  return mergeRects(rects);
}

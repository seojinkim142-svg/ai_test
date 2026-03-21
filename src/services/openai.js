import { Capacitor } from "@capacitor/core";
import { MODEL } from "../constants";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DIRECT_OPENAI_BASE_RE = /^https:\/\/api\.openai\.com(?:$|\/)/i;

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function resolveOpenAiBaseUrl() {
  const explicitBase = trimTrailingSlash(import.meta.env.VITE_OPENAI_BASE_URL);
  if (explicitBase) return explicitBase;

  const publicAppOrigin = trimTrailingSlash(resolvePublicAppOrigin());
  if (Capacitor.isNativePlatform() && publicAppOrigin) {
    return `${publicAppOrigin}/api/openai`;
  }

  // Keep the default on same-origin proxy path so production web/app can use server-side key.
  return "/api/openai";
}

const OPENAI_BASE_URL = resolveOpenAiBaseUrl();
const IS_DIRECT_OPENAI_BASE = DIRECT_OPENAI_BASE_RE.test(OPENAI_BASE_URL);
const USES_DEV_PROXY = import.meta.env.DEV && OPENAI_BASE_URL.startsWith("/api/openai");
const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const USES_RELATIVE_BASE = OPENAI_BASE_URL.startsWith("/");
const CHAT_URL = `${OPENAI_BASE_URL}/v1/chat/completions`;
const TUTOR_FALLBACK_MODELS = [
  MODEL,
  import.meta.env.VITE_OPENAI_TUTOR_MODEL || "",
  "gpt-4.1-mini",
  "gpt-4o-mini",
]
  .map((name) => String(name || "").trim())
  .filter(Boolean)
  .filter((name, index, arr) => arr.indexOf(name) === index);

function buildAvoidReuseBlock(items, { title = "Do not reuse these prompts", maxItems = 40, maxLength = 120 } = {}) {
  const normalized = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const raw = String(item || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return;
    const key = raw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(raw.slice(0, maxLength));
  });
  if (!normalized.length) return "";
  const lines = normalized.slice(0, maxItems).map((item, index) => `${index + 1}. ${item}`);
  return `
[${title}]
${lines.join("\n")}
  `.trim();
}

const LOW_VALUE_STUDY_PROMPT_PATTERNS = [
  /(교재|이\s*책|본서|강의노트|강의\s*자료).*(대상|독자|수강생|출신|전공자|비전공자)/i,
  /(교재|이\s*책|본서|강의노트|강의\s*자료).*(연습문제|부록|사이버|온라인|동영상|예제\s*코드|sage\s*코드|코드|자료).*(포함|제공|수록|없|않)/i,
  /(저자|출판사|출판|발행|copyright|acknowledg|reference|bibliograph|isbn|email)/i,
  /(목차|차례|chapter|절|구성).*(소개|설명|나열|순서)/i,
];

function isLowValueStudyPrompt(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  return LOW_VALUE_STUDY_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function toSortedUniquePages(pages) {
  return [
    ...new Set(
      (Array.isArray(pages) ? pages : [])
        .map((page) => Number.parseInt(page, 10))
        .filter((page) => Number.isFinite(page) && page > 0)
    ),
  ].sort((a, b) => a - b);
}

function extractEvidencePagesFromText(value) {
  const pages = [];
  const source = String(value || "");
  for (const match of source.matchAll(/(?:p\.?\s*|page\s*|페이지\s*|쪽\s*)(\d{1,4})/gi)) {
    const pageNumber = Number.parseInt(match?.[1], 10);
    if (Number.isFinite(pageNumber) && pageNumber > 0) {
      pages.push(pageNumber);
    }
  }
  return toSortedUniquePages(pages);
}

function normalizeEvidenceText(value, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeEvidenceFields(item) {
  const evidenceObject =
    item?.evidence && typeof item.evidence === "object" && !Array.isArray(item.evidence)
      ? item.evidence
      : null;
  const rawEvidenceText = typeof item?.evidence === "string" ? item.evidence : "";
  const evidencePages = toSortedUniquePages([
    ...(Array.isArray(item?.evidencePages) ? item.evidencePages : []),
    ...(Array.isArray(evidenceObject?.pages) ? evidenceObject.pages : []),
    ...extractEvidencePagesFromText(item?.evidenceLabel),
    ...extractEvidencePagesFromText(item?.evidenceSnippet),
    ...extractEvidencePagesFromText(rawEvidenceText),
    ...extractEvidencePagesFromText(evidenceObject?.label),
    ...extractEvidencePagesFromText(evidenceObject?.snippet),
  ]);
  const evidenceSnippet = normalizeEvidenceText(
    item?.evidenceSnippet || evidenceObject?.snippet || rawEvidenceText
  );
  const evidenceLabel = normalizeEvidenceText(
    item?.evidenceLabel || evidenceObject?.label || (evidencePages.length ? `p.${evidencePages.join(", ")}` : ""),
    120
  );
  const evidenceText = normalizeEvidenceText(
    rawEvidenceText || [evidenceLabel, evidenceSnippet].filter(Boolean).join(" - "),
    220
  );

  return {
    evidencePages,
    evidenceSnippet,
    evidenceLabel,
    evidence: evidenceText,
  };
}

function normalizeGeneratedItem(item) {
  return {
    ...item,
    ...normalizeEvidenceFields(item),
  };
}

function buildQuizPrompt(extractedText, { multipleChoiceCount, shortAnswerCount, avoidQuestions = [] }) {
  const avoidBlock = buildAvoidReuseBlock(avoidQuestions, { title: "Do not reuse these previously asked questions" });
  return `
You are a professor creating quiz questions from lecture material.

[Rules]
- Use document facts only as context; do not ask verbatim recall questions.
- Questions must test understanding, comparison, application, misconception checks, or interpretation.
- Avoid pure memorization prompts (raw URLs, names, single numbers).
- If the document contains page tags like [p.12], first choose 1-2 tagged evidence passages and then write the question from that evidence only.
- evidencePages must use only page numbers that actually appear in the provided page tags.
- evidenceSnippet should be a short Korean source phrase copied or lightly normalized from the document so it can be highlighted later.

[Output format]
- Multiple-choice: ${multipleChoiceCount} questions, 4 options each.
- Short-answer: ${shortAnswerCount} questions (calculation/explanation style).
- Include answerIndex and explanation for multiple-choice.
- Include answer and explanation for short-answer.
- Include evidencePages, evidenceSnippet, and evidenceLabel for every item.
- Return JSON only.

[JSON schema]
{
  "multipleChoice": [
    {
      "question": "...",
      "choices": ["...","...","...","..."],
      "answerIndex": 1,
      "explanation": "...",
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 정의 문단"
    }
  ],
  "shortAnswer": [
    {
      "question": "...",
      "answer": "...",
      "explanation": "...",
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 계산 예시"
    }
  ]
}

[Language]
- Write all question/explanation text in Korean.
${avoidBlock ? `\n\n${avoidBlock}` : ""}

[Document]
${extractedText}
  `.trim();
}
function buildHardQuizPrompt(extractedText, count, { avoidQuestions = [] } = {}) {
  const avoidBlock = buildAvoidReuseBlock(avoidQuestions, { title: "Do not reuse these previously asked questions" });
  return `
You are creating high-difficulty mock exam items from the document.

[Rules]
- Ban rote-memory/direct-recall items.
- Require reasoning, application, and concept-level discrimination.
- Include plausible distractors but keep one clear correct answer.
- If the document contains page tags like [p.12], select the supporting tagged evidence first and write the question from that evidence only.
- evidencePages must reference only visible tagged pages.
- evidenceSnippet should be a short source phrase copied or lightly normalized from the document.
- Never ask textbook/preface metadata:
  target audience, whether exercises/cyber materials/code are included,
  author/publisher info, TOC/chapter-structure trivia.

[Output format]
- ${count} multiple-choice questions, 4 options each.
- Include answerIndex and explanation.
- Include evidencePages, evidenceSnippet, and evidenceLabel.
- Return JSON only.

[JSON schema]
{
  "items": [
    {
      "question": "...",
      "choices": ["...","...","...","..."],
      "answerIndex": 1,
      "explanation": "...",
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 핵심 조건"
    }
  ]
}

[Language]
- Write all question/explanation text in Korean.
${avoidBlock ? `\n\n${avoidBlock}` : ""}

[Document]
${extractedText}
  `.trim();
}
function buildOxPrompt(contextText, highlightText = "", avoidStatements = []) {
  const avoidBlock = buildAvoidReuseBlock(avoidStatements, { title: "Do not reuse these previously asked statements" });
  return `
You create O/X (true/false) quiz items from PDF content.
Follow all rules and return JSON only.

[Input]
- PDF summary/body excerpt
${highlightText ? `- Highlight sentences:\n${highlightText}` : ""}
${avoidBlock ? `- ${avoidBlock.replace(/\n/g, "\n  ")}` : ""}

[Rules]
1. Maximum 10 items.
2. Format: true/false.
3. Base every item on explicit or strongly implied document content.
4. Keep each statement under 80 chars when possible.
5. Include at least 4 false items when feasible.
6. Use concrete details (numbers/conditions/directions) to improve discrimination.
7. Avoid duplicates.
8. If the document contains page tags like [p.12], choose the evidence first and cite only those visible pages.
9. evidence should briefly cite source clue/location when available.
10. Include evidencePages and evidenceSnippet for every item.
11. evidenceSnippet should be a short source phrase copied or lightly normalized from the document.
12. Exclude low-value metadata/trivia items:
   textbook target audience, supplement/material availability,
   author/publisher/contact, TOC/chapter structure.

[JSON schema]
{
  "items": [
    {
      "statement": "...",
      "answer": true,
      "explanation": "...",
      "evidence": "p.12 정의 문단",
      "evidencePages": [12],
      "evidenceSnippet": "..."
    }
  ]
}

[Language]
- Write statement/explanation/evidence in Korean.

[Document]
${contextText}
  `.trim();
}
function buildSummaryPrompt(extractedText) {
  return `
You are a teaching assistant who writes a detailed Korean markdown summary.

[Pre-check]
- First decide whether the text actually contains learning content.
- If it is mostly cover/TOC/meta/instructions/questions with little explanatory prose, do not summarize.
- In that case, return a short notice (1-2 sentences) saying this is not a learning-content page.
- Do not mention this pre-check process inside normal summaries.

[Summary requirements]
1. Overall overview (2-3 sentences): main topic and learning goals.
2. Section-by-section concept summary with clear explanations.
3. Math formatting (strict):
   - Inline math: $...$
   - Block math: $$...$$ on separate lines
   - Explain variables/symbols right after formulas when useful.
4. Include a separate "Key formulas" section when formulas are important.
5. Compare related concepts when relevant.
6. Add glossary-style term notes (Korean with English term if needed).
7. Use lists/tables where they improve readability.
8. Emphasize key ideas with markdown.
9. Keep it sufficiently detailed for study (long-form when source is long).

[Math style]
- Use LaTeX commands for operators/symbols.
- Avoid malformed delimiters and placeholder tokens.

[Output]
- Markdown only.
- Language: Korean.

[Document]
${extractedText}
  `.trim();
}
function buildFlashcardsContext(extractedText, count) {
  const trimmed = (extractedText || "").trim();
  if (!trimmed) return "";
  const chunked = chunkText(trimmed, {
    maxChunks: Math.min(8, Math.max(3, count)),
    maxChunkLength: 1400,
  });
  return chunked || limitText(trimmed, 6000);
}

function buildFlashcardsPrompt(contextText, count) {
  return `
You generate study flashcards from a PDF.

[Flashcard rules]
- Create ${count} cards in Korean.
- Focus on key concepts/definitions/principles/terms.
- Remove duplicates or near-duplicates.
- front: question/term, back: concise answer/explanation, hint: only if needed (optional).
- Do not repeat identical meaning.
- If the source is English, translate to Korean.

[Output format (JSON)]
{
  "cards": [
    { "front": "...", "back": "...", "hint": "" }
  ]
}

[Document]
${contextText}
  `.trim();
}

function buildTutorSystemPrompt() {
  return `
You are an AI tutor helping the user study with their PDF.
- Answer in Korean using polite speech by default.
- If the user explicitly asks for a different tone (e.g., casual, formal, concise), follow that tone.
- Be friendly and concise.
- Treat provided document excerpts as the primary source.
- If the input contains page-tagged raw text like [p.123], prioritize those passages and reason from them directly.
- Do not rely on pre-made summaries unless the raw evidence itself is missing.
- If the user greets or sends a short social message, respond warmly and ask what topic they want to learn.
- If the exact requested page/section is missing, do NOT refuse outright. Give a best-effort explanation using:
  1) related content found in the document context, and
  2) clearly labeled general/domain explanation.
- Never pretend to quote exact page/section text if it is not visible in the provided context.
- If uncertainty exists, state uncertainty briefly and then continue with a useful explanation.
- For page/section-specific questions, end with one short follow-up request for the exact text or screenshot to verify details.
- Always return a non-empty answer. If evidence is weak, still provide a best-effort explanation.
- When using formulas, always format math with LaTeX delimiters:
  - inline math: $...$
  - display math: $$...$$
- Prefer canonical LaTeX symbols (\\sum, \\frac, \\sqrt, \\le, \\ge) instead of plain ASCII where possible.
  `.trim();
}

const TUTOR_SEARCH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "what",
  "how",
  "why",
  "when",
  "where",
  "which",
  "about",
  "please",
  "could",
  "would",
  "should",
  "there",
  "their",
  "these",
  "those",
  "into",
  "onto",
  "have",
  "has",
  "had",
  "are",
  "is",
  "was",
  "were",
  "you",
  "your",
  "explain",
  "question",
  "problem",
  "page",
]);

function normalizeTutorSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^0-9a-z\uAC00-\uD7A3.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTutorQuery(question, messages = []) {
  const current = String(question || "").trim();
  const recentUsers = (messages || [])
    .filter((msg) => msg && msg.role === "user" && msg.content)
    .slice(-3)
    .map((msg) => String(msg.content).trim())
    .filter(Boolean)
    .join(" ");
  return `${recentUsers} ${current}`.trim();
}

function extractTutorSearchTerms(query) {
  const source = String(query || "");
  if (!source) return [];

  const sectionTokens = source.match(/\b\d+(?:\.\d+){1,4}\b/g) || [];
  const pageTokens = [];
  const pageRe = /(\d{1,4})\s*(?:p|page|\uD398\uC774\uC9C0|\uCABD)/gi;
  for (const match of source.matchAll(pageRe)) {
    const pageNo = String(match?.[1] || "").trim();
    if (!pageNo) continue;
    pageTokens.push(pageNo, `p${pageNo}`, `page${pageNo}`, `${pageNo}p`);
  }

  const normalized = normalizeTutorSearchText(source);
  const wordTokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2 || /^\d+$/.test(token))
    .filter((token) => !TUTOR_SEARCH_STOPWORDS.has(token));

  const deduped = [];
  const seen = new Set();
  for (const token of [...sectionTokens, ...pageTokens, ...wordTokens]) {
    const key = normalizeTutorSearchText(token);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(token);
    if (deduped.length >= 24) break;
  }
  return deduped;
}

function splitTutorParagraphs(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blockParts = normalized
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 30);

  // Most extracted PDF text is already flattened into one long line.
  // In that case, split into sentence-based windows so keyword matching can
  // isolate the relevant region instead of always truncating from the start.
  if (blockParts.length >= 2) return blockParts;

  const flat = normalized.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  const sentences = flat
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (sentences.length >= 4) {
    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      if (!current) {
        current = sentence;
        continue;
      }
      const merged = `${current} ${sentence}`.trim();
      if (merged.length <= 950) {
        current = merged;
        continue;
      }
      if (current.length >= 30) chunks.push(current);
      current = sentence;
    }
    if (current.length >= 30) chunks.push(current);
    if (chunks.length) return chunks;
  }

  const chunks = [];
  const chunkSize = 950;
  const overlap = 180;
  let cursor = 0;
  while (cursor < flat.length) {
    const chunk = flat.slice(cursor, cursor + chunkSize).trim();
    if (chunk.length >= 30) chunks.push(chunk);
    if (cursor + chunkSize >= flat.length) break;
    cursor += Math.max(120, chunkSize - overlap);
  }
  return chunks;
}

function scoreTutorParagraph(paragraph, terms) {
  const raw = String(paragraph || "");
  if (!raw || !Array.isArray(terms) || !terms.length) return 0;

  const rawLower = raw.toLowerCase();
  const normalized = normalizeTutorSearchText(raw);
  let score = 0;
  let hits = 0;

  for (const term of terms) {
    const normalizedTerm = normalizeTutorSearchText(term);
    if (!normalizedTerm) continue;

    let matched = false;
    if (term.includes(".")) {
      matched = rawLower.includes(String(term).toLowerCase());
    } else if (/^\d{1,4}$/.test(normalizedTerm)) {
      matched = rawLower.includes(normalizedTerm);
    } else {
      matched = normalized.includes(normalizedTerm);
    }

    if (!matched) continue;

    hits += 1;
    if (term.includes(".")) {
      score += 8;
    } else if (/^\d{1,4}$/.test(normalizedTerm)) {
      score += 3;
    } else if (normalizedTerm.length >= 7) {
      score += 4;
    } else if (normalizedTerm.length >= 4) {
      score += 3;
    } else {
      score += 2;
    }
  }

  if (hits >= 2) score += 2;
  if (hits >= 4) score += 2;

  return score;
}

function buildTutorContext(extractedText, { question = "", messages = [] } = {}) {
  const trimmed = String(extractedText || "").trim();
  if (!trimmed) return "";

  const maxChars = 16000;
  if (trimmed.length <= maxChars) return trimmed;

  const query = collectTutorQuery(question, messages);
  const terms = extractTutorSearchTerms(query);
  const paragraphs = splitTutorParagraphs(trimmed);

  let relatedContext = "";
  if (terms.length && paragraphs.length) {
    const scored = paragraphs
      .map((text, index) => ({ text, index, score: scoreTutorParagraph(text, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 8);

    if (scored.length) {
      const indices = new Set();
      for (const item of scored) {
        indices.add(item.index);
        if (item.index > 0) indices.add(item.index - 1);
        if (item.index < paragraphs.length - 1) indices.add(item.index + 1);
      }
      const ordered = [...indices].sort((a, b) => a - b);
      relatedContext = ordered.map((idx) => paragraphs[idx]).join("\n\n");
    }
  }

  if (!relatedContext) {
    const head = trimmed.slice(0, 8000);
    const tail = trimmed.slice(-8000);
    return `${head}\n\n[...]\n\n${tail}`;
  }

  const related = limitText(relatedContext, 9800);
  const head = trimmed.slice(0, 2600);
  const tail = trimmed.slice(-2600);
  const merged = [
    `[Relevant excerpts matched to the question]\n${related}`,
    `[Document beginning]\n${head}`,
    `[Document ending]\n${tail}`,
  ].join("\n\n[...]\n\n");

  return merged.length <= maxChars ? merged : merged.slice(0, maxChars);
}

function sanitizeJson(content) {
  if (!content) return "";
  const cleaned = content.replace(/```[\s\S]*?```/g, (match) =>
    match.replace(/```json|```/gi, "").trim()
  );
  return cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function stripSummaryPreface(content) {
  const text = String(content || "");
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let idx = 0;
  while (idx < lines.length && lines[idx].trim() === "") idx += 1;
  if (idx >= lines.length) return text;
  const prefaceRe = /^\s*\[?\s*\uC0AC\uC804\s*\uD310\uB2E8\s*\]?\s*/; // "pre-check"
  if (!prefaceRe.test(lines[idx])) return text;

  lines.splice(idx, 1);
  while (idx < lines.length && lines[idx].trim() === "") lines.splice(idx, 1);

  if (idx < lines.length) {
    const line = lines[idx].trim();
    const looksLikeHeading = /^(?:#{1,6}\s|[-*]\s|\d+[.)]\s)/;
    const prefaceSentenceRe = /\uC694\uC57D.*(?:\uD569\uB2C8\uB2E4|\uD558\uACA0)/;
    if (!looksLikeHeading.test(line) && prefaceSentenceRe.test(line)) {
      lines.splice(idx, 1);
      while (idx < lines.length && lines[idx].trim() === "") lines.splice(idx, 1);
    }
  }

  return lines.join("\n").trim();
}

function sanitizeMarkdown(content) {
  const cleaned = String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
  return stripSummaryPreface(cleaned);
}

const CHAPTER_MIN_DISTANCE = 350;
const CHAPTER_MIN_CHARS = 500;
const MAX_CHAPTER_COUNT = 10;
const MAX_CHAPTER_MODEL_CHARS = 2800;
const MAX_TOTAL_CHAPTER_MODEL_CHARS = 22000;
const VISUAL_HINT_RE = /(?:figure|fig\.?|table|chart|graph|plot|diagram|illustration)/i;
const CHAPTER_PATTERNS = [
  /\bchapter\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bchap\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bch\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\uC81C\s*\d{1,2}\s*\uC7A5[^.!?\n]{0,90}/g,
  /\b\d{1,2}\s*\uC7A5[^.!?\n]{0,90}/g,
];

function normalizeSummarySource(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanChapterTitle(raw, fallback = "Chapter") {
  const cleaned = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-:|]+/, "")
    .replace(/[\s\-:|]+$/, "")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= 90) return cleaned;
  return `${cleaned.slice(0, 90).trim()}...`;
}

function isLikelyDenseTocEntry(anchors, index) {
  const anchor = anchors[index];
  if (!anchor || anchor.index > 4500) return false;
  const prev = anchors[index - 1];
  const next = anchors[index + 1];
  const densePrev = prev ? anchor.index - prev.index < 180 : false;
  const denseNext = next ? next.index - anchor.index < 180 : false;
  return (densePrev || denseNext) && anchor.title.length <= 70;
}

function collectChapterAnchors(text) {
  const anchors = [];
  for (const pattern of CHAPTER_PATTERNS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      const title = cleanChapterTitle(match[0]);
      if (title.length >= 4) {
        anchors.push({
          index: match.index,
          title,
        });
      }
      match = pattern.exec(text);
    }
  }

  anchors.sort((left, right) => left.index - right.index);
  const deduped = [];
  for (const anchor of anchors) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(anchor.index - prev.index) < 100) {
      if (anchor.title.length > prev.title.length) {
        deduped[deduped.length - 1] = anchor;
      }
      continue;
    }
    deduped.push(anchor);
  }

  const withoutDenseToc = deduped.filter((_, index) => !isLikelyDenseTocEntry(deduped, index));
  const spaced = [];
  for (const anchor of withoutDenseToc) {
    const prev = spaced[spaced.length - 1];
    if (prev && anchor.index - prev.index < CHAPTER_MIN_DISTANCE) continue;
    spaced.push(anchor);
  }
  return spaced;
}

function shrinkWithTail(text, maxChars) {
  const normalized = normalizeSummarySource(text);
  if (normalized.length <= maxChars) return normalized;
  const head = Math.max(0, Math.floor(maxChars * 0.75));
  const tail = Math.max(0, maxChars - head - 5);
  return `${normalized.slice(0, head)} ... ${normalized.slice(-tail)}`.trim();
}

function extractVisualHints(sectionText, maxHints = 4) {
  const normalized = normalizeSummarySource(sectionText);
  if (!normalized) return [];

  const hints = [];
  const seen = new Set();
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const sentence of sentences) {
    if (!VISUAL_HINT_RE.test(sentence)) continue;
    const hint = cleanChapterTitle(sentence, "").slice(0, 180);
    if (!hint) continue;
    const key = hint.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(hint);
    if (hints.length >= maxHints) return hints;
  }

  const fallbackMatches = normalized.match(
    /(figure|fig\.?|table|chart|graph|plot|diagram|illustration|\uADF8\uB9BC\s*\d+|\uD45C\s*\d+|\uB3C4\uD45C\s*\d+|\uADF8\uB798\uD504|\uB3C4\uC2DD)[^.!?\n]{0,90}/gi
  );
  for (const raw of fallbackMatches || []) {
    const hint = cleanChapterTitle(raw, "").slice(0, 140);
    if (!hint) continue;
    const key = hint.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(hint);
    if (hints.length >= maxHints) break;
  }
  return hints;
}

function splitByChapterAnchors(normalizedText) {
  const anchors = collectChapterAnchors(normalizedText);
  if (anchors.length < 2) return [];

  const sections = [];
  if (anchors[0].index > CHAPTER_MIN_CHARS) {
    const preface = normalizedText.slice(0, anchors[0].index).trim();
    if (preface.length >= CHAPTER_MIN_CHARS) {
      sections.push({ title: "Introduction", text: preface });
    }
  }

  for (let idx = 0; idx < anchors.length; idx += 1) {
    const start = anchors[idx].index;
    const end = idx + 1 < anchors.length ? anchors[idx + 1].index : normalizedText.length;
    const chapterText = normalizedText.slice(start, end).trim();
    if (chapterText.length < CHAPTER_MIN_CHARS) continue;
    sections.push({ title: anchors[idx].title, text: chapterText });
  }
  return sections;
}

function splitIntoVirtualChapters(normalizedText) {
  const targetCount = Math.max(2, Math.min(6, Math.ceil(normalizedText.length / 4500)));
  const chunkSize = Math.ceil(normalizedText.length / targetCount);
  const sections = [];
  let start = 0;

  while (start < normalizedText.length) {
    let end = Math.min(normalizedText.length, start + chunkSize);
    if (end < normalizedText.length) {
      const punctuationBreak = normalizedText.lastIndexOf(". ", end);
      if (punctuationBreak > start + Math.floor(chunkSize * 0.55)) {
        end = punctuationBreak + 1;
      }
    }
    const chunk = normalizedText.slice(start, end).trim();
    if (chunk.length >= 300) {
      sections.push({
        title: `Section ${sections.length + 1}`,
        text: chunk,
      });
    }
    start = end;
  }

  if (!sections.length && normalizedText) {
    sections.push({ title: "Document", text: normalizedText });
  }
  return sections;
}

function normalizeManualChapterSections(chapterSections) {
  const list = Array.isArray(chapterSections) ? chapterSections : [];
  return list
    .map((section, index) => {
      const chapterNumber = Number.parseInt(section?.chapterNumber, 10);
      const normalizedChapterNumber = Number.isFinite(chapterNumber) ? chapterNumber : index + 1;
      const parsedPagePerChunk = Number.parseInt(
        section?.pagePerChunk ?? section?.pagesPerChunk ?? null,
        10
      );
      const parsedPageStart = Number.parseInt(section?.pageStart, 10);
      const parsedPageEnd = Number.parseInt(section?.pageEnd, 10);
      const derivedPagePerChunk =
        Number.isFinite(parsedPageStart) &&
        Number.isFinite(parsedPageEnd) &&
        parsedPageStart > 0 &&
        parsedPageEnd >= parsedPageStart
          ? parsedPageEnd - parsedPageStart + 1
          : 1;
      const pagePerChunk =
        Number.isFinite(parsedPagePerChunk) && parsedPagePerChunk > 0
          ? parsedPagePerChunk
          : derivedPagePerChunk;
      const defaultChapterTitle = `Chapter ${normalizedChapterNumber}`;
      const chapterTitle = cleanChapterTitle(
        section?.chapterTitle || section?.title || defaultChapterTitle,
        defaultChapterTitle
      );
      const text = normalizeSummarySource(section?.text || "");
      const visualHints = Array.isArray(section?.visualHints)
        ? section.visualHints
            .map((hint) => cleanChapterTitle(hint, ""))
            .filter(Boolean)
            .slice(0, 5)
        : extractVisualHints(text, 5);
      if (!text) return null;
      return {
        id: String(section?.id || `manual_${normalizedChapterNumber}`),
        chapterNumber: normalizedChapterNumber,
        chapterTitle,
        pagePerChunk,
        text,
        visualHints,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

function buildChapterSummaryInput(extractedText, { scope, chapterSections } = {}) {
  const manualSections = normalizeManualChapterSections(chapterSections);
  if (manualSections.length > 0) {
    return {
      scope: scope || "Custom chapter ranges",
      mode: "manual",
      chapters: manualSections.map((section, index) => ({
        ...section,
        id: section.id || `ch_${index + 1}`,
        text: shrinkWithTail(section.text, Math.max(800, Number(section.pagePerChunk || 1) * 800)),
      })),
    };
  }

  const normalizedText = normalizeSummarySource(extractedText);
  if (!normalizedText) {
    return { scope: scope || "Full document", mode: "empty", chapters: [] };
  }

  const anchoredSections = splitByChapterAnchors(normalizedText);
  const mode = anchoredSections.length >= 2 ? "detected" : "virtual";
  const sections = mode === "detected" ? anchoredSections : splitIntoVirtualChapters(normalizedText);

  let limited = sections;
  if (sections.length > MAX_CHAPTER_COUNT) {
    const kept = sections.slice(0, MAX_CHAPTER_COUNT - 1);
    const remained = sections.slice(MAX_CHAPTER_COUNT - 1);
    kept.push({
      title: `Merged sections (${remained.length} chapters)`,
      text: remained.map((section) => `${section.title} ${section.text}`).join(" "),
    });
    limited = kept;
  }

  const perChapterBudget = Math.max(
    900,
    Math.floor(MAX_TOTAL_CHAPTER_MODEL_CHARS / Math.max(1, limited.length))
  );
  const chapterTextLimit = Math.min(MAX_CHAPTER_MODEL_CHARS, perChapterBudget);

  const chapters = limited.map((section, index) => ({
    id: `ch_${index + 1}`,
    chapterNumber: index + 1,
    chapterTitle: cleanChapterTitle(section.title, `Chapter ${index + 1}`),
    text: shrinkWithTail(section.text, chapterTextLimit),
    visualHints: extractVisualHints(section.text, 5),
  }));

  return {
    scope: scope || "Full document",
    mode,
    chapters,
  };
}

function sanitizeSummaryLine(value, maxChars = 220) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trim()}...`;
}

function looksLikeMojibake(value) {
  const text = String(value || "");
  if (!text) return false;
  if (text.includes("\uFFFD")) return true;
  if (/[?][\u3131-\uD79D]|[\u3131-\uD79D][?]/.test(text)) return true;
  if (/[\u3131-\uD79D]/.test(text) && /[\u3400-\u9FFF]/.test(text)) return true;
  return false;
}

function sanitizeChapterHeading(value, fallback, maxChars = 100) {
  const cleaned = sanitizeSummaryLine(value, maxChars)
    .replace(/^\s*\d+\s*[^:]{0,20}:\s*/i, "")
    .trim();
  if (!cleaned || looksLikeMojibake(cleaned)) return fallback;
  return cleaned;
}

function normalizeSummaryPointEntry(entry) {
  if (!entry) return null;

  if (typeof entry === "string") {
    const cleaned = sanitizeSummaryLine(entry, 220);
    if (!cleaned || isMetaSummaryLine(cleaned) || looksLikeMojibake(cleaned)) return null;

    const colonMatch = cleaned.match(/^(.{2,100}?)[\s]*:\s*(.+)$/);
    if (colonMatch) {
      return {
        point: sanitizeSummaryLine(colonMatch[1], 110),
        explanation: sanitizeSummaryLine(colonMatch[2], 220),
        example: "",
      };
    }

    const dashMatch = cleaned.match(/^(.{2,100}?)\s+-\s+(.+)$/);
    if (dashMatch) {
      return {
        point: sanitizeSummaryLine(dashMatch[1], 110),
        explanation: sanitizeSummaryLine(dashMatch[2], 220),
        example: "",
      };
    }

    return {
      point: cleaned,
      explanation: "Review the definition, conditions, and implications of this point.",
      example: "",
    };
  }

  if (typeof entry !== "object") return null;
  let point = sanitizeSummaryLine(
    entry?.point || entry?.topic || entry?.title || entry?.term || "",
    110
  );
  let explanation = sanitizeSummaryLine(
    entry?.explanation || entry?.detail || entry?.why || entry?.meaning || entry?.context || "",
    220
  );
  let example = sanitizeSummaryLine(entry?.example || entry?.case || entry?.note || "", 140);

  if (looksLikeMojibake(point)) point = "";
  if (looksLikeMojibake(explanation)) explanation = "";
  if (looksLikeMojibake(example)) example = "";

  if (!point && !explanation) return null;
  if (isMetaSummaryLine(point) || isMetaSummaryLine(explanation)) return null;

  return {
    point: point || explanation,
    explanation:
      explanation || "Review the definition, conditions, and implications of this point.",
    example,
  };
}

const SUMMARY_META_LINE_PATTERNS = [
  /(?:chapter\s*title|chapter\s*heading).*(?:not|couldn'?t|unable).*(?:find|detect)/i,
  /length[-\s]based.*(?:split|segment|chunk|summar)/i,
  /(?:virtual|auto(?:matically)?)\s*(?:chapter|segment|split)/i,
  /\uCC55\uD130\s*\uC81C\uBAA9.*(?:\uCC3E\uC9C0|\uD0D0\uC9C0|\uC778\uC2DD).*(?:\uBABB|\uC2E4\uD328)/i,
  /\uAE38\uC774\s*\uAE30\uC900.*(?:\uB098\uB204|\uBD84\uD560|\uCABC)/i,
];

function isMetaSummaryLine(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  return SUMMARY_META_LINE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function normalizeImportance(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  return "medium";
}

function formatChapterSummaryMarkdown(parsed, summaryInput) {
  const parsedChapters = Array.isArray(parsed?.chapters) ? parsed.chapters : [];
  const chapterById = new Map(
    parsedChapters
      .map((chapter) => [String(chapter?.id || "").trim(), chapter])
      .filter(([id]) => Boolean(id))
  );
  const markdown = [];

  const overviewFromModel = Array.isArray(parsed?.overview)
    ? parsed.overview.map((line) => sanitizeSummaryLine(line, 220)).filter(Boolean).slice(0, 4)
    : [];
  const overview = overviewFromModel.filter((line) => !isMetaSummaryLine(line));
  if (!overview.length) {
    const fallbackOverview = parsedChapters
      .flatMap((chapter) => (Array.isArray(chapter?.summaryPoints) ? chapter.summaryPoints : []))
      .map((entry) => normalizeSummaryPointEntry(entry))
      .filter(Boolean)
      .map((item) => sanitizeSummaryLine(`${item.point}: ${item.explanation}`, 220))
      .filter((line) => line && !isMetaSummaryLine(line))
      .slice(0, 2);
    if (fallbackOverview.length) {
      overview.push(...fallbackOverview);
    } else if (summaryInput.chapters[0]?.text) {
      const sourceLine = sanitizeSummaryLine(summaryInput.chapters[0].text, 180);
      if (sourceLine) overview.push(sourceLine);
    }
  }

  markdown.push("## Overall Overview");
  if (overview.length) {
    for (const point of overview) markdown.push("- " + point);
  } else {
    markdown.push("- There was not enough reliable evidence to create an overview.");
  }
  markdown.push("");

  for (let idx = 0; idx < summaryInput.chapters.length; idx += 1) {
    const sourceChapter = summaryInput.chapters[idx];
    const candidate =
      chapterById.get(sourceChapter.id) ||
      parsedChapters.find((chapter) => Number(chapter?.chapterNumber) === sourceChapter.chapterNumber) ||
      parsedChapters[idx] ||
      {};

    const headingTitle = sanitizeChapterHeading(
      candidate?.chapterTitle || candidate?.title || sourceChapter.chapterTitle,
      "Chapter " + sourceChapter.chapterNumber,
      100
    );

    markdown.push("## " + headingTitle);
    markdown.push("### Key Summary");

    const summaryPoints = Array.isArray(candidate?.summaryPoints)
      ? candidate.summaryPoints.map((entry) => normalizeSummaryPointEntry(entry)).filter(Boolean).slice(0, 6)
      : [];
    if (summaryPoints.length) {
      for (const point of summaryPoints) {
        const pointTitle = looksLikeMojibake(point?.point)
          ? "Key point"
          : sanitizeSummaryLine(point?.point, 110) || "Key point";
        const explanation = looksLikeMojibake(point?.explanation)
          ? "Review the definition, conditions, and implications of this point."
          : sanitizeSummaryLine(point?.explanation, 220) ||
            "Review the definition, conditions, and implications of this point.";
        const example = looksLikeMojibake(point?.example)
          ? ""
          : sanitizeSummaryLine(point?.example, 140);
        markdown.push(
          "- **" + pointTitle + "**: " + explanation + (example ? " (e.g., " + example + ")" : "")
        );
      }
    } else {
      const fallbackPoint = sanitizeSummaryLine(sourceChapter.text, 110);
      markdown.push(
        "- **" + (fallbackPoint || "Key point") + "**: Review the definition, conditions, and implications of this point."
      );
    }

    const keyTerms = Array.isArray(candidate?.keyTerms) ? candidate.keyTerms.slice(0, 6) : [];
    markdown.push("### Key Terms");
    if (keyTerms.length) {
      for (const term of keyTerms) {
        if (typeof term === "string") {
          const simpleTerm = sanitizeSummaryLine(term, 180);
          if (simpleTerm && !looksLikeMojibake(simpleTerm)) markdown.push("- " + simpleTerm);
          continue;
        }
        const termName = sanitizeSummaryLine(term?.term || term?.name || "", 70);
        const definition = sanitizeSummaryLine(term?.definition || term?.description || "", 180);
        if (looksLikeMojibake(termName) || looksLikeMojibake(definition)) continue;
        if (!termName && !definition) continue;
        markdown.push(
          definition ? "- **" + (termName || "term") + "**: " + definition : "- **" + termName + "**"
        );
      }
    } else {
      markdown.push("- No key terms were confidently identified for this chapter.");
    }

    markdown.push("### Visual Priority");
    const visuals = Array.isArray(candidate?.visuals) ? candidate.visuals.slice(0, 5) : [];
    const renderedVisuals = [];
    for (const visual of visuals) {
      const item = sanitizeSummaryLine(visual?.item || visual?.name || visual?.title || "", 110);
      const reason = sanitizeSummaryLine(visual?.reason || "", 170);
      const insight = sanitizeSummaryLine(visual?.insight || visual?.takeaway || "", 150);
      if (looksLikeMojibake(item) || looksLikeMojibake(reason) || looksLikeMojibake(insight)) continue;
      if (!item && !reason && !insight) continue;
      const details = [];
      if (reason) details.push(reason);
      if (insight) details.push("insight: " + insight);
      renderedVisuals.push(
        "- **" + normalizeImportance(visual?.importance) + "** " + (item || "visual asset") +
          (details.length ? " - " + details.join(" | ") : "")
      );
    }

    if (renderedVisuals.length) {
      markdown.push(...renderedVisuals);
    } else if (sourceChapter.visualHints.length) {
      let renderedHintCount = 0;
      for (const hint of sourceChapter.visualHints.slice(0, 3)) {
        const hintLine = sanitizeSummaryLine(hint, 170);
        if (!hintLine || looksLikeMojibake(hintLine)) continue;
        markdown.push("- **review needed** " + hintLine);
        renderedHintCount += 1;
      }
      if (!renderedHintCount) {
        markdown.push("- No strong evidence for critical visuals was found.");
      }
    } else {
      markdown.push("- No strong evidence for critical visuals was found.");
    }

    markdown.push("### Sample Question Solving");
    const sampleQuestionSolving = Array.isArray(candidate?.sampleQuestionSolving)
      ? candidate.sampleQuestionSolving.slice(0, 2)
      : [];
    if (sampleQuestionSolving.length) {
      for (const sample of sampleQuestionSolving) {
        const question = sanitizeSummaryLine(
          sample?.question || sample?.problem || sample?.prompt || "",
          170
        );
        const steps = Array.isArray(sample?.steps)
          ? sample.steps.map((step) => sanitizeSummaryLine(step, 140)).filter(Boolean).slice(0, 4)
          : Array.isArray(sample?.approach)
            ? sample.approach.map((step) => sanitizeSummaryLine(step, 140)).filter(Boolean).slice(0, 4)
            : [];
        const answer = sanitizeSummaryLine(sample?.answer || sample?.result || "", 130);
        const insight = sanitizeSummaryLine(sample?.insight || sample?.checkpoint || "", 160);

        markdown.push("- **Question**: " + (question || "Representative chapter question"));
        if (steps.length) markdown.push("- **Solving**: " + steps.join(" -> "));
        if (answer) markdown.push("- **Answer**: " + answer);
        if (insight) markdown.push("- **Insight**: " + insight);
      }
    } else {
      markdown.push("- No reliable sample solving flow was generated from this chapter.");
    }

    markdown.push("");
  }

  return markdown.join("\n").trim();
}

async function generateChapterSummary(extractedText, { scope, chapterSections } = {}) {
  const summaryInput = buildChapterSummaryInput(extractedText, { scope, chapterSections });
  if (!summaryInput.chapters.length) return "";

  const payload = {
    scope: summaryInput.scope,
    mode: summaryInput.mode,
    chapters: summaryInput.chapters,
  };

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You summarize academic PDFs in Korean. Return JSON only. Use only provided chapter data. For visuals, estimate importance as high|medium|low only when supported by chapter text or visual hints.",
        },
        {
          role: "user",
          content: `
Analyze the chapter input and return Korean JSON with this schema:
{
  "overview": ["..."],
  "chapters": [
    {
      "id": "ch_1",
      "chapterNumber": 1,
      "chapterTitle": "...",
      "summaryPoints": [
        { "point": "...", "explanation": "...", "example": "..." }
      ],
      "keyTerms": [{ "term": "...", "definition": "..." }],
      "visuals": [
        { "item": "...", "importance": "high|medium|low", "reason": "...", "insight": "..." }
      ],
      "sampleQuestionSolving": [
        {
          "question": "...",
          "steps": ["...", "..."],
          "answer": "...",
          "insight": "..."
        }
      ]
    }
  ]
}

Rules:
- Output language: Korean.
- Include 3-6 summary points per chapter.
- Every summary point must include BOTH:
  - "point": concise concept/topic line
  - "explanation": why it matters, definition/condition/result in 1-2 sentences
- Optionally add "example" when useful.
- Do not return summaryPoints as plain strings.
- Provide keyTerms, visuals, and sampleQuestionSolving for each chapter when evidence exists.
- sampleQuestionSolving should include 1-2 representative problems with short step-by-step solving.
- Render mathematical expressions using LaTeX delimiters: inline $...$, block $$...$$.
- Never place $$...$$ inside a sentence. Use $...$ for inline formulas only.
- Do not output escaped dollars (\\$) or placeholder tokens like @@MATH0@@.
- Use \\cdot for multiplication when needed.
- Use LaTeX commands for symbols/operators (e.g., \\sqrt{n}, \\to, \\infty, \\frac{a}{b}).
- If no reliable visual evidence, return "visuals": [].
- If no reliable sample solving evidence, return "sampleQuestionSolving": [].
- Do not mention chapter detection/splitting logic or model processing notes (e.g., missing chapter titles, length-based split, virtual chapters).
- Keep overview focused on lecture topic and learning goals only.
- Preserve chapter ids exactly as input.
- Return strict JSON only.

Input:
${JSON.stringify(payload)}
          `.trim(),
        },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "chapter summary JSON");
  return formatChapterSummaryMarkdown(parsed, summaryInput);
}

function parseJsonSafe(content, context = "response") {
  const trimmed = content?.trim() || "";
  if (!trimmed) throw new Error(`Empty ${context} from OpenAI`);
  const maybeJson =
    trimmed.match(/\{[\s\S]*\}/)?.[0] ||
    trimmed.match(/\[[\s\S]*\]/)?.[0] ||
    trimmed;
  try {
    return JSON.parse(maybeJson);
  } catch (err) {
    const snippet = trimmed.slice(0, 300);
    throw new Error(`Failed to parse ${context}: ${err.message}. Raw: ${snippet}`);
  }
}

function limitText(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function isQuizWorthyParagraph(p) {
  return (
    p.length >= 30 &&
    !/lecture|winter|stanford|credits?|author|instructor|contact|office hours|acknowledg|reference|bibliograph|copyright|email/i.test(
      p
    )
  );
}

function chunkText(text, { maxChunks = 5, maxChunkLength = 1400 } = {}) {
  if (!text) return "";
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p && isQuizWorthyParagraph(p));

  const chunks = [];
  for (const p of paragraphs) {
    if (chunks.length >= maxChunks) break;
    const trimmed = p.slice(0, maxChunkLength);
    chunks.push(trimmed);
  }
  return chunks.join("\n\n");
}

function fallbackOxItems(extractedText) {
  const clean = (extractedText || "").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);
  if (!sentences.length) {
    return [
      {
        statement: "Use evidence from the PDF text before deciding O/X.",
        answer: true,
        explanation: "Without textual evidence, the statement cannot be trusted.",
        evidence: "",
        evidencePages: [],
        evidenceSnippet: "",
      },
    ];
  }

  return sentences.map((s, idx) => ({
    statement: `Judge O/X using text evidence: ${s}`,
    answer: idx % 2 === 0, // true/false alternation
    explanation: "Compare the statement with nearby context in the provided text.",
    evidence: "",
    evidencePages: [],
    evidenceSnippet: "",
  }));
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(response) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && !Number.isNaN(Number(retryAfter))) {
    return Number(retryAfter);
  }

  const resetEpoch = response.headers.get("x-ratelimit-reset-requests");
  if (resetEpoch && !Number.isNaN(Number(resetEpoch))) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Number(resetEpoch) - now;
    if (diff > 0) return diff;
  }

  return null;
}

async function postChatRequest(body, { retries = 1 } = {}) {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY || "").trim();

  if (IS_NATIVE_PLATFORM && USES_RELATIVE_BASE) {
    throw new Error(
      "모바일 앱에서는 API 절대 경로가 필요합니다. `VITE_PUBLIC_APP_ORIGIN` 또는 `VITE_OPENAI_BASE_URL`을 설정한 뒤 APK를 다시 빌드해주세요."
    );
  }

  if ((IS_DIRECT_OPENAI_BASE || USES_DEV_PROXY) && !apiKey) {
    throw new Error(
      "OpenAI API key is missing. Add `VITE_OPENAI_API_KEY` to your `.env` and restart the dev server."
    );
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`OpenAI request failed: ${err.message || err}`);
  }

  if (response.status === 429) {
    let hint = "Rate limit hit. Please wait and retry.";
    let waitSeconds = parseRetryAfterSeconds(response);

    try {
      const json = await response.json();
      hint = json?.error?.message || hint;
    } catch {
      // ignore json parse error
    }

    if (retries > 0) {
      const delay = (waitSeconds ?? 10) * 1000;
      await sleep(delay);
      return postChatRequest(body, { retries: retries - 1 });
    }

    throw new Error(waitSeconds ? `${hint} (retry in ${waitSeconds}s)` : hint);
  }

  if (!response.ok) {
    const rawBody = await response.text();
    let message = rawBody;

    try {
      const json = JSON.parse(rawBody);
      message = json?.error?.message || JSON.stringify(json);
    } catch {
      // Body was not JSON; keep raw text
    }

    throw new Error(`OpenAI API error: ${response.status} ${message}`);
  }

  return response.json();
}
export async function generateQuiz(
  extractedText,
  { multipleChoiceCount = 4, shortAnswerCount = 1, avoidQuestions = [] } = {}
) {
  const mcCount = Math.max(0, Math.min(5, Number(multipleChoiceCount) || 0));
  const saCount = Math.max(0, Math.min(5, Number(shortAnswerCount) || 0));
  const prompt = buildQuizPrompt(extractedText, {
    multipleChoiceCount: mcCount,
    shortAnswerCount: saCount,
    avoidQuestions,
  });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Generate ${mcCount} Korean multiple-choice items (4 options each) plus ${saCount} Korean short-answer (calculation/explanation) items from the user's text only. Each question must assess understanding/apply/disambiguate/misconception check, not verbatim recall. Avoid asking for raw facts/URLs/names/numbers. Exclude textbook/preface metadata questions (target audience, whether exercises/cyber materials/code are included, author/publisher/contact, TOC/chapter structure). Respond with JSON only using the provided schema. shortAnswer must be an array with ${saCount} items (empty if 0).`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 1, // gpt-5-mini default temperature
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "quiz JSON");
  const multipleChoice = (Array.isArray(parsed?.multipleChoice) ? parsed.multipleChoice : [])
    .map(normalizeGeneratedItem)
    .filter((item) => !isLowValueStudyPrompt(String(item?.question || item?.prompt || "").trim()));
  const shortAnswer = (Array.isArray(parsed?.shortAnswer) ? parsed.shortAnswer : [])
    .map(normalizeGeneratedItem)
    .filter((item) => !isLowValueStudyPrompt(String(item?.question || item?.prompt || "").trim()));
  return {
    ...parsed,
    multipleChoice,
    shortAnswer,
  };
}

export async function generateHardQuiz(extractedText, { count = 3, avoidQuestions = [] } = {}) {
  const prompt = buildHardQuizPrompt(extractedText, count, { avoidQuestions });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate high-difficulty Korean multiple-choice questions from the user's text only. Each item must test reasoning/application, not verbatim recall. Exclude textbook/preface metadata questions (target audience, whether exercises/cyber materials/code are included, author/publisher/contact, TOC/chapter structure). Output JSON only with the provided schema.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "hard quiz JSON");
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map(normalizeGeneratedItem)
    .filter((item) => !isLowValueStudyPrompt(String(item?.question || item?.prompt || "").trim()));
  return { items };
}

export async function generateOxQuiz(extractedText, { avoidStatements = [] } = {}) {
  const hasPageTaggedContext = /\[p\.\d+\]/i.test(String(extractedText || ""));
  const chunked = hasPageTaggedContext
    ? limitText(extractedText, 12000)
    : chunkText(extractedText, { maxChunks: 5, maxChunkLength: 1400 });
  let summaryForOx = "";
  if (!hasPageTaggedContext) {
    try {
      summaryForOx = await generateSummary(extractedText, { chapterized: false });
    } catch {
      // Fallback to chunked context when summary generation fails.
    }
  }

  let highlightText = "";
  if (!hasPageTaggedContext) {
    try {
      const hl = await generateHighlights(extractedText);
      const hs = Array.isArray(hl?.highlights) ? hl.highlights : [];
      if (hs.length > 0) {
        highlightText = hs
          .map((h, idx) => `${idx + 1}. ${h.sentence}${h.reason ? ` (reason: ${h.reason})` : ""}`)
          .join("\n");
      }
    } catch {
      // Skip highlight enrichment when highlight generation fails.
    }
  }

  const contextForOx = summaryForOx && summaryForOx.length >= 60 ? summaryForOx : chunked;
  if (!contextForOx || contextForOx.length < 60) {
    return {
      items: [],
      debug: true,
      reason: "Not enough clean context was available to generate reliable O/X items from the document text.",
    };
  }

  const prompt = buildOxPrompt(contextForOx, highlightText, avoidStatements);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate 10 Korean true/false (O/X) quiz statements strictly from the user's text. All statements, explanations, and evidence must be in Korean (translate/rephrase even if the source is English). Ensure at least 4 are false; if not possible, generate as many as possible but prefer false items. Each statement <=80 chars, explanation/evidence <=150 chars, no duplication, and every explanation cites the PDF as evidence where possible (e.g., p.3 definition paragraph, section 2.1 second sentence; if unavailable, evidence may be empty). Exclude low-value textbook metadata/trivia (target audience, whether exercises/cyber materials/code are included, author/publisher/contact, TOC/chapter structure).",
        },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  try {
    const parsed = parseJsonSafe(sanitized, "O/X JSON");
    const items = (Array.isArray(parsed?.items) ? parsed.items : [])
      .map(normalizeGeneratedItem)
      .filter((item) => !isLowValueStudyPrompt(String(item?.statement || item?.question || item?.prompt || "").trim()));
    if (items.length > 0) {
      return {
        ...parsed,
        items,
      };
    }
  } catch {
    // fallthrough to fallback
  }

  return {
    items: fallbackOxItems(extractedText),
    debug: true,
    reason: "O/X generation failed; fallback items returned",
  };
}

export async function generateSummary(
  extractedText,
  { scope, chapterized = true, chapterSections = null } = {}
) {
  const normalized = String(extractedText || "").trim();
  const hasManualChapters = Array.isArray(chapterSections) && chapterSections.length > 0;
  if (!normalized && !hasManualChapters) {
    throw new Error("No text available for summary. Load the PDF and extract text first.");
  }

  if (chapterized) {
    try {
      const chapterSummary = await generateChapterSummary(normalized, { scope, chapterSections });
      if (chapterSummary) return chapterSummary;
    } catch {
      // fallback to legacy summary
    }
  }

  if (!normalized) {
    throw new Error("Summary source text is empty.");
  }

  const prompt = buildSummaryPrompt(extractedText);
  const scopeGuard = scope
    ? {
        role: "system",
        content: `Prioritize evidence from the requested scope (${scope}). If you add outside context, label it as supplemental.`,
      }
    : null;

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Produce a detailed Korean markdown summary of the user's academic text. Follow their instructions for sections, subsections, bold emphasis, LaTeX math, tables/lists, and sufficient length (long-form; do not shorten to a few lines).",
        },
        ...(scopeGuard ? [scopeGuard] : []),
        { role: "user", content: prompt },
      ],
      temperature: 1,
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}
export async function generateFlashcards(extractedText, { count = 8 } = {}) {
  const contextText = buildFlashcardsContext(extractedText, count);
  if (!contextText) {
    throw new Error("No text available for flashcards. Extract PDF text first.");
  }
  const prompt = buildFlashcardsPrompt(contextText, count);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Create Korean flashcards strictly from the user's text. Return JSON only with an array of {front, back, hint}. Keep front/back concise, avoid duplicates, and translate to Korean if needed.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return parseJsonSafe(sanitized, "flashcards JSON");
}

function looksLikeTutorCoverageRefusal(content) {
  const text = String(content || "").trim();
  if (!text) return false;
  const patterns = [
    /missing.*(?:section|page|text)/i,
    /not.*included/i,
    /cannot.*explain/i,
    /paste.*(?:text|section)/i,
    /choose.*option/i,
    /need.*(?:text|excerpt|section)/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function extractTutorMessageText(message) {
  if (!message) return "";

  if (typeof message.content === "string") {
    const trimmed = message.content.trim();
    if (trimmed) return trimmed;
  }

  if (message.content != null) {
    const parts = collectTutorTextParts(message.content, []);
    const joined = parts.join("\n").trim();
    if (joined) return joined;
  }

  if (typeof message.refusal === "string" && message.refusal.trim()) {
    return message.refusal.trim();
  }

  return "";
}

function extractTutorCompletionText(data) {
  const direct = extractTutorMessageText(data?.choices?.[0]?.message);
  if (direct) return direct;

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = collectTutorTextParts(output, []);
  return parts.join("\n").trim();
}

function buildTutorRetrySnippet(contextText, question) {
  const terms = extractTutorSearchTerms(question).slice(0, 10);
  const paragraphs = splitTutorParagraphs(contextText);
  if (!terms.length || !paragraphs.length) return limitText(contextText, 3500);

  const scored = paragraphs
    .map((text, index) => ({ text, index, score: scoreTutorParagraph(text, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5)
    .map((item) => item.text);
  if (!scored.length) return limitText(contextText, 3500);
  return limitText(scored.join("\n\n"), 4500);
}

function collectTutorTextParts(value, parts = []) {
  if (value == null) return parts;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) parts.push(trimmed);
    return parts;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTutorTextParts(item, parts);
    return parts;
  }
  if (typeof value === "object") {
    if ("text" in value) collectTutorTextParts(value.text, parts);
    if ("output_text" in value) collectTutorTextParts(value.output_text, parts);
    if ("content" in value) collectTutorTextParts(value.content, parts);
    if ("value" in value) collectTutorTextParts(value.value, parts);
    if ("refusal" in value) collectTutorTextParts(value.refusal, parts);
  }
  return parts;
}

function extractTutorEvidenceBlocks(contextText) {
  const source = String(contextText || "");
  if (!source) return [];
  const blocks = [];
  const re = /\[p\.(\d+)\]\s*\n([\s\S]*?)(?=\n\s*\[p\.\d+\]\s*\n|$)/gi;
  for (const match of source.matchAll(re)) {
    const pageNumber = Number.parseInt(match?.[1], 10);
    const text = String(match?.[2] || "").trim();
    if (!Number.isFinite(pageNumber) || !text) continue;
    blocks.push({ pageNumber, text });
  }
  return blocks;
}

function pickTutorEvidenceSnippet(text, terms, maxChars = 320) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= maxChars) return compact;

  const queryTerms = Array.isArray(terms) ? terms : [];
  const lower = compact.toLowerCase();
  let bestIndex = -1;
  let bestTermLength = 0;

  for (const term of queryTerms) {
    const normalizedTerm = String(term || "").trim().toLowerCase();
    if (!normalizedTerm) continue;
    const idx = lower.indexOf(normalizedTerm);
    if (idx < 0) continue;
    if (bestIndex < 0 || idx < bestIndex || (idx === bestIndex && normalizedTerm.length > bestTermLength)) {
      bestIndex = idx;
      bestTermLength = normalizedTerm.length;
    }
  }

  if (bestIndex < 0) {
    return `${compact.slice(0, maxChars).trim()}...`;
  }

  const radius = Math.floor(maxChars / 2);
  let start = Math.max(0, bestIndex - radius);
  let end = Math.min(compact.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < compact.length ? "..." : "";
  return `${prefix}${compact.slice(start, end).trim()}${suffix}`;
}

function buildTutorEvidenceFallback({ question, contextText, reason = "" }) {
  const source = String(contextText || "").trim();
  if (!source) {
    return "Could not generate an answer. Reload the document text and retry the same question.";
  }

  const terms = extractTutorSearchTerms(question).slice(0, 10);
  const evidenceBlocks = extractTutorEvidenceBlocks(source);
  const scoredBlocks =
    evidenceBlocks.length > 0
      ? evidenceBlocks.map((block, index) => ({
          ...block,
          index,
          score: scoreTutorParagraph(block.text, terms),
        }))
      : splitTutorParagraphs(source).map((text, index) => ({
          pageNumber: null,
          text,
          index,
          score: scoreTutorParagraph(text, terms),
        }));

  const matched = scoredBlocks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);
  const selected = matched.length > 0 ? matched : scoredBlocks.slice(0, 2);

  if (!selected.length) {
    return "Could not generate an answer. Text recognition may be incomplete; reopen the PDF and try again.";
  }

  const lines = ["The model returned empty output. Here is a quick evidence-first summary from the document:"];
  for (const item of selected) {
    const label = Number.isFinite(item.pageNumber) ? `p.${item.pageNumber}` : "document evidence";
    const snippet = pickTutorEvidenceSnippet(item.text, terms, 320);
    lines.push(`- ${label}: ${snippet}`);
  }
  lines.push("I can now explain your exact question step-by-step from this evidence.");
  if (reason) {
    lines.push(`(debug: model response failed: ${String(reason).slice(0, 140)})`);
  }
  return lines.join("\n");
}

function isTutorTokenLimitParamError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("max_completion_tokens") ||
    message.includes("max_tokens") ||
    (message.includes("unknown parameter") && message.includes("token"))
  );
}

async function requestTutorCompletion({
  model,
  context,
  question,
  history = [],
  extraSystem = "",
  maxTokens = 900,
}) {
  const messages = [{ role: "system", content: buildTutorSystemPrompt() }];
  const guard = String(extraSystem || "").trim();
  if (guard) {
    messages.push({ role: "system", content: guard });
  }
  messages.push({ role: "system", content: `Document content:\n${context}` });
  messages.push(...(Array.isArray(history) ? history : []));
  messages.push({ role: "user", content: question });

  const basePayload = {
    model,
    messages,
    temperature: 0.2,
  };
  let data = null;
  let lastError = null;

  try {
    data = await postChatRequest(
      {
        ...basePayload,
        max_completion_tokens: maxTokens,
      },
      { retries: 0 }
    );
  } catch (err) {
    lastError = err;
    if (isTutorTokenLimitParamError(err)) {
      try {
        data = await postChatRequest(
          {
            ...basePayload,
            max_tokens: maxTokens,
          },
          { retries: 0 }
        );
      } catch (fallbackErr) {
        lastError = fallbackErr;
      }
    }
  }

  if (!data && lastError) {
    throw lastError;
  }
  if (!data) {
    throw new Error("Tutor completion failed: empty API response");
  }

  return {
    content: extractTutorCompletionText(data),
    finishReason: data?.choices?.[0]?.finish_reason || "",
    raw: data,
  };
}

export async function generateTutorReply({ question, extractedText, messages = [] }) {
  const contextText = buildTutorContext(extractedText, { question, messages });
  if (!contextText) {
    throw new Error("Tutor context is empty. Reload PDF text before asking questions.");
  }

  const history = (messages || [])
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && msg.content)
    .map((msg) => ({ role: msg.role, content: String(msg.content) }));

  const strategies = [
    {
      context: contextText,
      history,
      extraSystem: "",
      maxTokens: 1000,
      rejectCoverageRefusal: true,
    },
    {
      context: limitText(contextText, 12000),
      history,
      extraSystem:
        "Do not ask the user to paste text, choose an option, or say the section is missing. Answer now using available evidence plus clearly-labeled supplemental explanation.",
      maxTokens: 1000,
      rejectCoverageRefusal: false,
    },
    {
      context: buildTutorRetrySnippet(contextText, question),
      history: [],
      extraSystem:
        "Answer immediately in Korean with 4-7 concise bullet points and one short concluding sentence. Do not output empty text.",
      maxTokens: 1000,
      rejectCoverageRefusal: false,
    },
  ];

  let lastFinishReason = "";
  let lastErrorMessage = "";
  for (const strategy of strategies) {
    for (const model of TUTOR_FALLBACK_MODELS) {
      try {
        const result = await requestTutorCompletion({
          model,
          context: strategy.context,
          question,
          history: strategy.history,
          extraSystem: strategy.extraSystem,
          maxTokens: strategy.maxTokens,
        });
        const content = String(result?.content || "").trim();
        lastFinishReason = String(result?.finishReason || lastFinishReason || "");
        if (!content) continue;
        if (strategy.rejectCoverageRefusal && looksLikeTutorCoverageRefusal(content)) continue;
        return content;
      } catch (err) {
        lastErrorMessage = String(err?.message || lastErrorMessage || "");
      }
    }
  }

  const reason = lastErrorMessage || (lastFinishReason ? `finish_reason: ${lastFinishReason}` : "");
  return buildTutorEvidenceFallback({ question, contextText, reason });
}
export async function generateHighlights(extractedText) {
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Select up to 5 verbatim Korean sentences from the user's text that best support the summary. Respond with JSON only.",
        },
        {
          role: "user",
          content: `
Extract up to 5 key evidence sentences from the document text that best support the summary.
- Include a short reason for each sentence.
- Format: { "highlights": [ { "sentence": "...", "reason": "..." } ] }

Document text:
${extractedText}
        `.trim(),
        },
      ],
      temperature: 1,
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return parseJsonSafe(sanitized, "highlights JSON");
}

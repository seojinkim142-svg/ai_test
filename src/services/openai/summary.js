import { MODEL } from "../../constants";
import {
  getOutputLanguageLabel,
  normalizeEvidenceText,
  parseJsonSafe,
  sanitizeJson,
  sanitizeMarkdown,
  limitText,
  postChatRequest,
} from "./base.js";
import { extractQuestionStyleBlocks } from "./quiz.js";

// ─── Summary 프롬프트 빌더 ────────────────────────────────────────────────────

export function buildSummaryPrompt(extractedText, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const hasPageTags = /\[p\.\d+\]/.test(String(extractedText || ""));
  const anchorRule = hasPageTags
    ? "- Source text contains [p.N] markers. Append [p.N] after every verbatim quote, factual claim, and formula. Do NOT fabricate page numbers."
    : "- No page markers detected. Omit page anchors but still extract verbatim quotes.";

  return `
You are an expert academic analyst. Apply the following 5-stage pipeline to produce a ${outputLanguageLabel} markdown summary.

[Content check]
- If the text is almost entirely cover page, table of contents, or publisher metadata with no substantive content, return a 1-2 sentence notice only.
- Otherwise always produce a full analysis — do not refuse.

━━━ STAGE 1 · SCOPE ━━━
Identify the document's overall subject in 1 sentence. Map the full structure:
- Chapters / major sections / sub-sections present in the document.

━━━ STAGE 2 · EXTRACT ━━━
For every section:
- Decompose its structure (what argument does it make?).
- Extract 1–3 verbatim quotes (원문 그대로) that are the core evidence for that argument.
- Record page anchor [p.N] immediately after each quote where available.
- Do NOT summarize from memory or general knowledge — only use what is literally present.

━━━ STAGE 3 · LEDGER ━━━
Classify each piece of evidence:
- **[T1]** Direct full-text quote with page anchor → highest confidence
- **[T2]** Paraphrase or metadata-only (no direct quote) → state claim with caution
- **[T3]** Cross-reference to another section/source cited in the text → flag as indirect

━━━ STAGE 4 · DRAFT ━━━
Structure the output in the following sections:

## 개요
1-sentence SCOPE statement + 2-sentence overview of learning goals.

## [Chapter / Section Title]  ← one H2 per major section identified in SCOPE
### [Sub-section title]  ← H3 for sub-sections; omit if none

**핵심 내용** (Core Findings — T1 evidence only):
- Key finding with **bold** terms. "verbatim quote" [p.N] [T1]
- (3–5 points per section)

**보조 증거** (Weak-evidence — T2):
- Claims supported only by paraphrase or abstract-level information. [T2]
- Omit this block if all evidence is T1.

**미해결 쟁점** (Unresolved conflicts):
- Contradictions, ambiguities, or conflicting claims found in the document. Omit if none.

**커버리지 공백** (Coverage gaps):
- Topics the document mentions but does not explain in depth. Omit if none.

**타 섹션 연관** [T3]:
- Explicit cross-references or logical connections to other sections. Omit if none.

## 핵심 공식  ← only when formulas are present
Formula with variable definitions. [T1 anchor]

## 주요 용어  ← only when 3+ distinct technical terms exist
**Term** — definition. (English in parentheses if helpful)

━━━ STAGE 5 · COMMIT ━━━
- Every node in this summary must trace back to a T1 or T2 source.
- Never assert facts as T1 unless a verbatim quote with a page anchor supports it.
- Clearly mark T2 claims so the reader knows confidence is limited.

[Math formatting — strict]
- Inline math: $...$  Block math: $$...$$ on its own line.
- Define every variable immediately after the formula.
- Use LaTeX commands for all operators; no plain-text substitutes.

[Citation rules]
${anchorRule}
- Verbatim quotes must use the exact source wording, enclosed in "quotation marks".
- Skip citations for headings and pure connective sentences.

[Anti-hallucination — No Fabrication]
- If evidence extraction fails for a claim, write "근거를 찾을 수 없음" explicitly — do NOT assert it as fact.
- Never fabricate page numbers, quotes, or data not present in the source.
- Unverified paraphrases must be marked [T2]; cross-references must be marked [T3].

[Language matching]
- Output language: ${outputLanguageLabel}.
- Technical and domain-specific terms: write in ${outputLanguageLabel} with original English in parentheses where helpful.
  e.g. "**능동 수송 (Active Transport)**"
- Keep the primary language consistent throughout; never mix languages mid-sentence.

[Output]
- Markdown only. No preamble or meta-commentary.
- Language: ${outputLanguageLabel}.

[Document]
${extractedText}
  `.trim();
}

export function looksLikeSummaryRefusal(content) {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return (
    /학습\s*내용이\s*아닌/.test(normalized) ||
    /요약을\s*생성하지\s*않/.test(normalized) ||
    /학습\s*콘텐츠가\s*아니/.test(normalized) ||
    /not a learning-content page/i.test(normalized)
  );
}

function looksLikeProblemPageContent(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return false;
  if (extractQuestionStyleBlocks(normalized, { maxBlocks: 4, maxChars: 1800 }).length >= 2) {
    return true;
  }
  return /(?:객관식|주관식|단답형|OX|정답|해설|보기|선지|문제\s*\d+|다음\s*중|옳은\s*것|옳지\s*않은\s*것)/i.test(
    normalized
  );
}

export function buildProblemPageSummaryPrompt(extractedText, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are a senior teaching assistant writing a ${outputLanguageLabel} markdown study summary for a problem-heavy page.

[Goal]
The source is mostly exercises, mock-test items, answer choices, or short explanations.
Do not refuse — infer what concepts the learner must know to solve these problems well, and teach those concepts.

[Required sections — render all headings in ${outputLanguageLabel}]
## Page type  (2-3 sentences: what kind of problem page this is and what it tests)
## Core concepts  (bullet points: every concept the problems require, explained clearly)
## Common solving criteria  (bullets: calculations, comparisons, condition checks, and interpretations that recur)
## Frequent traps  (bullets: distractor patterns, concept confusions, unit/condition mistakes)
## Last-minute checklist  (brief: formulas, terms, and checkpoints to verify before the exam)

[Length guideline]
- 3-5 bullet points per section minimum.
- If a concept requires a formula, include it with variable definitions.

[Writing rules]
- Teach each concept — do not just list it. Add a one-line explanation for every bullet.
- Use **bold** for key terms.
- Use LaTeX for math: inline $...$, block $$...$$ on its own line.
- Do not say "no learning content" unless the text is truly only cover/TOC/publisher metadata.

[Output]
- Markdown only. No preamble.
- Language: ${outputLanguageLabel}.

[Document]
${extractedText}
  `.trim();
}

async function generateProblemPageSummary(extractedText, { scope, outputLanguage = "ko" } = {}) {
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
            "Produce a markdown study summary for problem-heavy academic pages in the requested output language. Focus on the concepts, traps, and solving criteria the page is testing.",
        },
        ...(scopeGuard ? [scopeGuard] : []),
        { role: "user", content: buildProblemPageSummaryPrompt(extractedText, outputLanguage) },
      ],
      temperature: 1,
    },
    { retries: 1 }
  );
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}

// ─── ExamCram 빌더 ──────────────────────────────────────────────────────────

function formatExamCramAnswer(value, fallback = "-") {
  const normalized = normalizeEvidenceText(value, 120);
  return normalized || fallback;
}

function formatExamCramQuizBlock(quizItems = []) {
  const list = Array.isArray(quizItems) ? quizItems : [];
  if (!list.length) return "";
  return list
    .slice(0, 12)
    .map((item, index) => {
      const prompt = normalizeEvidenceText(item?.prompt || item?.question, 150);
      const answer = formatExamCramAnswer(item?.answerText || item?.answer || item?.correctAnswerText);
      const explanation = normalizeEvidenceText(item?.explanation, 180);
      const evidence = normalizeEvidenceText(item?.evidenceLabel || item?.evidenceSnippet, 120);
      return [
        `${index + 1}. 문제: ${prompt || "-"}`,
        `- 정답: ${answer}`,
        explanation ? `- 포인트: ${explanation}` : "",
        evidence ? `- 근거: ${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function formatExamCramOxBlock(oxItems = []) {
  const list = Array.isArray(oxItems) ? oxItems : [];
  if (!list.length) return "";
  return list
    .slice(0, 10)
    .map((item, index) => {
      const statement = normalizeEvidenceText(item?.statement || item?.question || item?.prompt, 140);
      const answer = item?.answer === true ? "O" : item?.answer === false ? "X" : "-";
      const explanation = normalizeEvidenceText(item?.explanation, 180);
      const evidence = normalizeEvidenceText(item?.evidenceLabel || item?.evidenceSnippet, 120);
      return [
        `${index + 1}. 문장: ${statement || "-"}`,
        `- 정답: ${answer}`,
        explanation ? `- 포인트: ${explanation}` : "",
        evidence ? `- 근거: ${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function formatExamCramReviewNoteBlock(reviewNotes = []) {
  const list = Array.isArray(reviewNotes) ? reviewNotes : [];
  if (!list.length) return "";
  return list
    .slice(0, 10)
    .map((item, index) => {
      const prompt = normalizeEvidenceText(item?.prompt, 150);
      const answer = formatExamCramAnswer(item?.correctAnswerText);
      const explanation = normalizeEvidenceText(item?.explanation, 180);
      const wrongCount = Math.max(1, Number.parseInt(item?.wrongCount, 10) || 1);
      const previousAnswer = normalizeEvidenceText(item?.userAnswerText, 100);
      const evidence = normalizeEvidenceText(item?.evidenceLabel || item?.evidenceSnippet, 120);
      return [
        `${index + 1}. 오답 포인트: ${prompt || "-"}`,
        `- 정답: ${answer}`,
        `- 누적 오답: ${wrongCount}회`,
        previousAnswer ? `- 이전 제출 답안: ${previousAnswer}` : "",
        explanation ? `- 해설: ${explanation}` : "",
        evidence ? `- 근거: ${evidence}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function buildExamCramPrompt({
  summaryText = "",
  oxItems = [],
  quizItems = [],
  reviewNotes = [],
  scopeLabel = "",
  outputLanguage = "ko",
} = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const sections = [];
  const summaryBlock = limitText(String(summaryText || "").trim(), 7000);
  const oxBlock = formatExamCramOxBlock(oxItems);
  const quizBlock = formatExamCramQuizBlock(quizItems);
  const reviewNoteBlock = formatExamCramReviewNoteBlock(reviewNotes);

  if (scopeLabel) {
    sections.push(`[선택 범위]\n${String(scopeLabel || "").trim()}`);
  }
  if (summaryBlock) {
    sections.push(`[현재 요약]\n${summaryBlock}`);
  }
  if (oxBlock) {
    sections.push(`[현재 O/X]\n${oxBlock}`);
  }
  if (quizBlock) {
    sections.push(`[현재 퀴즈]\n${quizBlock}`);
  }
  if (reviewNoteBlock) {
    sections.push(`[오답노트]\n${reviewNoteBlock}`);
  }

  return `
You create a last-minute ${outputLanguageLabel} exam cram sheet from study artifacts.

[Goal]
- Build a dense, practical guide that answers: "What should I read right before the exam?"

[Rules]
- Use only the provided study artifacts.
- Merge overlapping points from summary, quiz, O/X, and wrong answers.
- Treat wrong answers as warning signals, but do not make the output an error log only.
- Prioritize high-yield concepts, distinctions, formulas, definitions, exceptions, traps, and likely exam pivots.
- When quizzes or O/X reveal a misconception, rewrite it as a compact caution point.
- Keep it concise enough to scan in 5-10 minutes, but dense enough to be useful.
- Write in ${outputLanguageLabel} markdown.
- Use headings and bullets, not long paragraphs.
- If formulas or symbols matter, preserve them with LaTeX-friendly markdown.
- End with a very short final checklist.

[Preferred structure — render all headings in ${outputLanguageLabel}]
## Must-know before the exam  (key facts, rules, formulas — highest yield)
## Concepts to distinguish  (pairs or groups that are commonly confused)
## Frequent traps  (misconceptions revealed by quiz/O/X wrong answers)
## Final 1-minute checklist  (3-5 items to verify in the last minute)

[Study artifacts]
${sections.join("\n\n")}
  `.trim();
}

// ─── Chapter Summary 헬퍼 ─────────────────────────────────────────────────────

const CHAPTER_MIN_DISTANCE = 350;
const CHAPTER_MIN_CHARS = 500;
const MAX_CHAPTER_COUNT = 10;
const MAX_CHAPTER_MODEL_CHARS = 2800;
const MAX_TOTAL_CHAPTER_MODEL_CHARS = 22000;
export const MAX_LEGACY_SUMMARY_SOURCE_CHARS = 22000;
const VISUAL_HINT_RE = /(?:figure|fig\.?|table|chart|graph|plot|diagram|illustration)/i;
const CHAPTER_PATTERNS = [
  /\bchapter\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bchap\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bch\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\uC81C\s*\d{1,2}\s*\uC7A5[^.!?\n]{0,90}/g,
  /\b\d{1,2}\s*\uC7A5[^.!?\n]{0,90}/g,
];

export function normalizeSummarySource(text) {
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
        anchors.push({ index: match.index, title });
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

export function shrinkWithTail(text, maxChars) {
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
      sections.push({ title: `Section ${sections.length + 1}`, text: chunk });
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

export function buildChapterSummaryInput(extractedText, { scope, chapterSections } = {}) {
  const manualSections = normalizeManualChapterSections(chapterSections);
  if (manualSections.length > 0) {
    const perChapterBudget = Math.max(
      500,
      Math.floor(MAX_TOTAL_CHAPTER_MODEL_CHARS / Math.max(1, manualSections.length))
    );
    const chapterTextLimit = Math.min(MAX_CHAPTER_MODEL_CHARS, perChapterBudget);
    return {
      scope: scope || "Custom chapter ranges",
      mode: "manual",
      chapters: manualSections.map((section, index) => ({
        ...section,
        id: section.id || `ch_${index + 1}`,
        text: shrinkWithTail(section.text, chapterTextLimit),
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

  return { scope: scope || "Full document", mode, chapters };
}

// ─── formatChapterSummaryMarkdown ─────────────────────────────────────────────

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

    const sections = Array.isArray(candidate?.sections) ? candidate.sections.slice(0, 8) : [];
    if (sections.length) {
      for (const sec of sections) {
        const secTitle = sanitizeSummaryLine(sec?.sectionTitle || "", 80);
        if (secTitle && !looksLikeMojibake(secTitle)) markdown.push("### " + secTitle);

        const keySummary = sanitizeSummaryLine(sec?.keySummary || "", 240);
        if (keySummary && !looksLikeMojibake(keySummary)) {
          markdown.push("**핵심 주장**: " + keySummary);
          markdown.push("");
        }

        const coreFindings = Array.isArray(sec?.coreFindings) ? sec.coreFindings.slice(0, 5) : [];
        if (coreFindings.length) {
          markdown.push("**핵심 근거 [T1]**:");
          for (const f of coreFindings) {
            const point = sanitizeSummaryLine(f?.point || "", 180);
            const quote = sanitizeSummaryLine(f?.quote || "", 280);
            const anchor = sanitizeSummaryLine(f?.anchor || "", 20);
            if (!point && !quote) continue;
            if (looksLikeMojibake(point) || looksLikeMojibake(quote)) continue;
            if (point) markdown.push("- **" + point + "**");
            if (quote) markdown.push('  > "' + quote + '"' + (anchor ? " " + anchor : ""));
          }
          markdown.push("");
        }

        const weakEvidence = Array.isArray(sec?.weakEvidence) ? sec.weakEvidence.slice(0, 3) : [];
        if (weakEvidence.length) {
          markdown.push("**보조 증거 [T2]** *(직접 인용 없음, 신뢰도 제한)*:");
          for (const w of weakEvidence) {
            const claim = sanitizeSummaryLine(w?.claim || (typeof w === "string" ? w : ""), 220);
            if (claim && !looksLikeMojibake(claim)) markdown.push("- " + claim);
          }
          markdown.push("");
        }

        const conflicts = Array.isArray(sec?.unresolvedConflicts) ? sec.unresolvedConflicts.slice(0, 3) : [];
        if (conflicts.length) {
          markdown.push("**미해결 쟁점**:");
          for (const c of conflicts) {
            const line = sanitizeSummaryLine(c, 220);
            if (line && !looksLikeMojibake(line)) markdown.push("- " + line);
          }
          markdown.push("");
        }

        const gaps = Array.isArray(sec?.coverageGaps) ? sec.coverageGaps.slice(0, 3) : [];
        if (gaps.length) {
          markdown.push("**커버리지 공백**:");
          for (const g of gaps) {
            const line = sanitizeSummaryLine(g, 220);
            if (line && !looksLikeMojibake(line)) markdown.push("- " + line);
          }
          markdown.push("");
        }

        const crossRefs = Array.isArray(sec?.crossReferences) ? sec.crossReferences.slice(0, 3) : [];
        if (crossRefs.length) {
          markdown.push("**타 섹션 연관 [T3]**:");
          for (const ref of crossRefs) {
            const line = sanitizeSummaryLine(ref, 220);
            if (line && !looksLikeMojibake(line)) markdown.push("- " + line);
          }
          markdown.push("");
        }
      }
    }

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

async function generateChapterSummary(extractedText, { scope, chapterSections, outputLanguage = "ko", hasPageTags = false } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const summaryInput = buildChapterSummaryInput(extractedText, { scope, chapterSections });
  if (!summaryInput.chapters.length) return "";

  const payload = {
    scope: summaryInput.scope,
    mode: summaryInput.mode,
    chapters: summaryInput.chapters,
  };

  const citationRule = hasPageTags
    ? `- Source text contains [p.N] page markers. Append [p.N] after every "quote", "explanation", and formula. Only use page numbers visible in the source. Do NOT fabricate.`
    : `- No page markers detected. Omit anchors but still extract verbatim quotes.`;

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `You are an expert academic analyst applying a 5-stage evidence pipeline (SCOPE→EXTRACT→LEDGER→DRAFT→COMMIT) to summarize PDFs in ${outputLanguageLabel}. Return strict JSON only. Never assert facts without tracing them to the source text.`,
        },
        {
          role: "user",
          content: `
Apply the 5-stage pipeline and return ${outputLanguageLabel} JSON with this schema:

{
  "overview": ["1-sentence SCOPE + learning goals..."],
  "chapters": [
    {
      "id": "ch_1",
      "chapterNumber": 1,
      "chapterTitle": "...",
      "sections": [
        {
          "sectionTitle": "...",
          "keySummary": "core argument of this section (1-2 sentences)",
          "coreFindings": [
            { "point": "...", "quote": "verbatim from source", "anchor": "[p.N]", "tier": "T1" }
          ],
          "weakEvidence": [
            { "claim": "...", "tier": "T2" }
          ],
          "unresolvedConflicts": ["contradiction or ambiguity found in the text..."],
          "coverageGaps": ["topic mentioned but not explained in depth..."],
          "crossReferences": ["→ Chapter X / Section Y 와 연관: 이유 [T3]"]
        }
      ],
      "summaryPoints": [
        { "point": "...", "explanation": "...", "example": "..." }
      ],
      "keyTerms": [{ "term": "...", "definition": "..." }],
      "visuals": [
        { "item": "...", "importance": "high|medium|low", "reason": "...", "insight": "..." }
      ],
      "sampleQuestionSolving": [
        { "question": "...", "steps": ["...", "..."], "answer": "...", "insight": "..." }
      ]
    }
  ]
}

Pipeline rules:
- **SCOPE**: Map the document structure (chapters → sections). Use this as the skeleton.
- **EXTRACT**: For each section, extract verbatim quotes from the source. Do NOT summarize from general knowledge — only from the provided text.
- **LEDGER**: Classify every piece of evidence:
  · T1 — direct verbatim quote with page anchor (highest confidence)
  · T2 — paraphrase or abstract-level claim without direct quote
  · T3 — cross-reference to another section/source cited in the text
- **DRAFT**: Populate sections fields:
  · "coreFindings": T1 evidence only. Each entry must have a verbatim "quote".
  · "weakEvidence": T2 claims. Include only when direct quote is unavailable.
  · "unresolvedConflicts": contradictions or ambiguities in the document. Empty array if none.
  · "coverageGaps": topics mentioned but underexplained. Empty array if none.
  · "crossReferences": T3 cross-references. Empty array if none.
- **COMMIT**: Every summaryPoint and keyTerm must trace back to T1 or T2. Mark confidence tier.
- Output language: ${outputLanguageLabel}.
- Include 3-6 summaryPoints per chapter; every point needs "point" + "explanation".
- sampleQuestionSolving: 1-2 problems with step-by-step solving (omit if no evidence).
- Math: inline $...$, block $$...$$ on its own line. LaTeX only, no plain-text math.
- If no visual evidence: "visuals": []. If no sample solving: "sampleQuestionSolving": [].
- Do not mention chapter detection/splitting logic.
- Preserve chapter ids exactly as input.
${citationRule}
- Return strict JSON only.

Input:
${JSON.stringify(payload)}
          `.trim(),
        },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "chapter summary JSON");
  return formatChapterSummaryMarkdown(parsed, summaryInput);
}

// ─── Summary Generate exports ──────────────────────────────────────────────

export async function generateSummary(
  extractedText,
  { scope, chapterized = true, chapterSections = null, outputLanguage = "ko", pageTaggedText = null } = {}
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const normalizedPageTagged = String(pageTaggedText || "").trim();
  const normalized = normalizeSummarySource(extractedText);
  const hasManualChapters = Array.isArray(chapterSections) && chapterSections.length > 0;
  if (!normalized && !hasManualChapters) {
    throw new Error("No text available for summary. Load the PDF and extract text first.");
  }

  const chapterSourceText = normalizedPageTagged || normalized;

  if (chapterized) {
    try {
      const chapterSummary = await generateChapterSummary(chapterSourceText, { scope, chapterSections, outputLanguage, hasPageTags: Boolean(normalizedPageTagged) });
      if (chapterSummary) return chapterSummary;
    } catch {
      // fallback to legacy summary
    }
  }

  if (!normalized) {
    throw new Error("Summary source text is empty.");
  }

  const legacySource = normalizedPageTagged || normalized;
  const summaryContext = shrinkWithTail(legacySource, MAX_LEGACY_SUMMARY_SOURCE_CHARS);
  const prompt = buildSummaryPrompt(summaryContext, outputLanguage);
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
            `Produce a detailed ${outputLanguageLabel} markdown summary of the user's academic text. Follow their instructions for sections, subsections, bold emphasis, LaTeX math, tables/lists, and sufficient length (long-form; do not shorten to a few lines).`,
        },
        ...(scopeGuard ? [scopeGuard] : []),
        { role: "user", content: prompt },
      ],
      temperature: 1,
    },
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeMarkdown(content);
  if (looksLikeSummaryRefusal(sanitized) && looksLikeProblemPageContent(summaryContext)) {
    return generateProblemPageSummary(summaryContext, { scope, outputLanguage });
  }
  return sanitized;
}

export async function generateMindMap(summaryText, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const trimmed = String(summaryText || "").trim();
  if (!trimmed) throw new Error("No summary text available for mindmap generation.");

  const prompt = `
Analyze the following study summary and generate a mindmap as a JSON array of nodes.

━━━ NODE SCHEMA (every node must include all 6 fields) ━━━
{
  "id": "string",           // unique ID — "1" for root, then "2","3",... in creation order
  "parentId": "string|null", // null ONLY for root; otherwise parent's id
  "label": "string",        // card header, max 7 words, in ${outputLanguageLabel}
  "content": "string",      // markdown body — use bullets, **bold**, tables, $LaTeX$, [p.N] citations
  "color": "string|null",   // one of: "blue-200","green-200","yellow-200","red-200","sky-200","pink-200","purple-200" — or null
  "type": "string"          // one of: "root","source","start","next","branch","sub","leaf","question"
}

━━━ REQUIRED STRUCTURE ━━━
• id "1" — ROOT (parentId:null, type:"root", color:null): document title as label, one-sentence thesis as content
• type "start" (color:"sky-200"): label="시작점", content = learning objectives + recommended reading order (bullets)
• type "next"  (color:"green-200"): label="다음 단계", content = 3-5 concrete post-study actions
• type "source" (color:"purple-200"): label="출처", content = document title + page range citations [p.N]
• type "branch" (4–6 nodes, each with a distinct color): one per major section/chapter
  └─ type "sub" (2–4 per branch, color:null): key concept nodes under each branch
     └─ type "leaf" (2–3 per sub, color:null): atomic facts, MUST cite [p.N] when evidence exists
     └─ type "question" (1 per branch, color:null): label="핵심 질문", content=1-2 comprehension questions

━━━ CONTENT RULES ━━━
① ATOMICITY: one concept per node. If content gets long, split into child nodes.
② TRACEABILITY: every factual leaf MUST end with [p.N]. If no evidence → write "근거를 찾을 수 없음".
③ ANTI-HALLUCINATION: never fabricate page numbers or assert unverified facts.
④ LATEX: use $formula$ inline or $$formula$$ block for math/science content.
⑤ TABLES: use markdown table syntax for comparison data within a node's content.
⑥ LANGUAGE: output in ${outputLanguageLabel}. Technical terms: ${outputLanguageLabel}(English) e.g. "세포 호흡 (Cellular Respiration)".
⑦ COLORING: assign colors semantically — blue for core theory, green for methods, yellow for results, red for warnings/conflicts, sky for navigation, purple for sources.

━━━ TOTAL NODE COUNT ━━━
Generate 20–35 nodes total. Start/next/source + 4-6 branches + 2-4 subs per branch + 2-3 leaves per sub + 1 question per branch.

Return ONLY a valid JSON array. No markdown fences, no explanation, no trailing text.

[Summary]
${trimmed}
  `.trim();

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert knowledge architect. Generate a structured mindmap as a JSON array of nodes following the exact schema provided. Output ONLY valid JSON — no markdown code fences, no explanation. All text in ${outputLanguageLabel} unless schema says otherwise.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 4000,
    },
    { retries: 1 }
  );

  const raw = String(data.choices?.[0]?.message?.content || "").trim();
  const cleaned = sanitizeJson(raw);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return JSON.stringify(parsed);
  } catch {
    // fallback: return raw as legacy markdown string
  }
  return raw;
}

export async function generateExamCramSheet({
  summaryText = "",
  oxItems = [],
  quizItems = [],
  reviewNotes = [],
  scopeLabel = "",
  outputLanguage = "ko",
} = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const hasSources =
    Boolean(String(summaryText || "").trim()) ||
    (Array.isArray(oxItems) && oxItems.length > 0) ||
    (Array.isArray(quizItems) && quizItems.length > 0) ||
    (Array.isArray(reviewNotes) && reviewNotes.length > 0);
  if (!hasSources) {
    throw new Error("No study artifacts available for exam cram guide.");
  }

  const prompt = buildExamCramPrompt({
    summaryText,
    oxItems,
    quizItems,
    reviewNotes,
    scopeLabel,
    outputLanguage,
  });
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `Create a ${outputLanguageLabel} markdown exam cram sheet from the provided study artifacts only. Keep it high-yield, compact, and immediately useful before an exam.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 1,
    },
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}

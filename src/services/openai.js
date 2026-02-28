import { MODEL } from "../constants";

// Dev: force Vite proxy (/api/openai) for CORS; Prod: api.openai.com or VITE_OPENAI_BASE_URL
const OPENAI_BASE_URL = import.meta.env.DEV
  ? "/api/openai"
  : import.meta.env.VITE_OPENAI_BASE_URL || "https://api.openai.com";
const CHAT_URL = `${OPENAI_BASE_URL}/v1/chat/completions`;
const RESPONSES_URL = `${OPENAI_BASE_URL}/v1/responses`;

function buildQuizPrompt(extractedText, { multipleChoiceCount, shortAnswerCount }) {
  return `
당신은 대학 강의 자료를 기반으로 퀴즈를 출제하는 교수입니다.

[출제 원칙]
- 문서에 나온 사실은 문제의 '전제'로만 사용하고, 사실 자체를 그대로 묻지 않는다.
- 정답이 한 문장/단어 그대로 나오지 않게 이해/구분/적용/오해 판별/의미 해석을 요구한다.
- URL/숫자/이름 같은 암기형 문제는 금지.

[출력 형식]
- 객관식 ${multipleChoiceCount}문항(각 4지선다) + 주관식 ${shortAnswerCount}문항(계산/서술형)
- 객관식: answerIndex, explanation 포함
- 주관식: answer(단답/수식/값)와 explanation 포함
- 모든 내용은 한국어, JSON만 출력

[반환 포맷(JSON)]
{
  "multipleChoice": [
    { "question": "...", "choices": ["...","...","...","..."], "answerIndex": 1, "explanation": "..." }
  ],
  "shortAnswer": [
    { "question": "...", "answer": "...", "explanation": "..." }
  ]
}

[문서 본문]
${extractedText}
  `.trim();
}

function buildHardQuizPrompt(extractedText, count) {
  return `
당신은 대학원 수준의 고난도 모의고사를 출제하는 교수입니다.

[출제 원칙]
- 단순 암기형/사실 회상형 문제 금지
- 개념 간 비교/적용/추론/오해 판별을 요구
- 정답은 한 줄 베껴쓰기 형태가 아니어야 함
- 헷갈리기 쉬운 선택지를 포함하되, 정답은 명확하게

[출력 형식]
- ${count}문항, 4지선다
- 각 문항에 answerIndex와 explanation 포함
- 모든 내용은 한국어, JSON만 출력

[반환 포맷(JSON)]
{
  "items": [
    { "question": "...", "choices": ["...","...","...","..."], "answerIndex": 1, "explanation": "..." }
  ]
}

[문서 본문]
${extractedText}
  `.trim();
}

function buildOxPrompt(contextText, highlightText = "") {
  return `
당신은 업로드된 PDF를 검토하고 이해하는 보조 AI입니다.
아래 규칙에 따라 O/X 퀴즈를 생성하세요. 모든 문장/설명/근거는 한국어로 작성하고, JSON 형식으로만 출력합니다.

[입력]
- PDF 요약 혹은 본문 일부 (instruction 문구 제외)
${highlightText ? `- 강조 문장:\n${highlightText}` : ""}

[목표]
- PDF의 핵심 개념/정의/원리/공식/조건/결과 기반으로 O/X 퀴즈 작성

[문제 생성 규칙]
1. 문제 수: 최대 10문항
2. 형태: O/X (참/거짓)
3. 모든 문제는 PDF에서 명시/함축된 내용을 근거로 하며, 과도한 추측/창작 금지
4. 문장 길이: 80자 이하
5. 최소 4개는 거짓(false) 포함 (가능한 경우)
6. 숫자/조건/방향 등 구체적 근거를 포함해 혼동을 유도
7. 중복 내용 없이 다채롭게
8. evidence는 가능하면 출처/위치나 문장 일부를 간단히 기재 (없으면 빈 문자열 허용)

[출력 형식(JSON)]
{
  "items": [
    { "statement": "...", "answer": true, "explanation": "...", "evidence": "..." }
  ]
}

[본문/요약]
${contextText}
  `.trim();
}

function buildSummaryPrompt(extractedText) {
  return `
당신은 대학 강의 자료를 한국어로 상세 요약하는 조교입니다. 아래 지침에 따라 길고 구조적인 마크다운 요약을 작성하세요.

[사전 판단]
아래 본문이 실제 강의의 학습 내용을 포함하는지 먼저 판단하세요.

- 다음에 해당하면 요약하지 마세요:
  · 표지, 목차, 안내 페이지
  · 질문, 의견, 메타 설명
  · 그래프/표/이미지 중심으로 설명 문장이 거의 없는 경우

- 이 경우:
  → 요약을 수행하지 말고,
    “학습 내용을 포함하지 않은 페이지임”을 한두 문장으로만 설명하세요.

- 설명 문단이 명확히 존재하는 경우에만 요약을 진행하세요.
-이 내용을 요약문에 명시하지 마세요.
[요약 지침]
1. 전체 개요 (2~3문장)
   - 강의 주제와 학습 목표를 명확히 설명

2. 주요 섹션/개념 정리
   - 섹션 제목과 핵심 내용
   - 핵심 개념 설명(2~3문장)
   - 예시/적용/주의사항이 있으면 포함

3. **수식 표기 규칙 (필수 준수):**
   - 인라인 수식: $...$ 형식 (예: $n^2$, $O(n \\log n)$)
   - 독립 수식: $$...$$ 형식으로 별도 줄에 배치
   - 독립 수식 앞뒤로 반드시 빈 줄 추가
   - 변수/기호 설명은 수식 바로 다음에 bullet point로 명시
   - "수식/공식 (모든 수식 LaTeX 표기)" 같은 안내 문구는 출력하지 말고 수식만 LaTeX로 표기

4. **주요 수식 모음 섹션** (별도로 분리):
   모든 중요 수식을 한 곳에 정리하고 각 기호의 의미를 명시

5. 개념 간 관계/비교/차이도 함께 요약
   - 알고리즘 성능 비교는 표나 번호 목록으로 정리

6. 용어 정리:
   - 새 용어 등장 시 영어 원어 병기
   - 간단한 한 줄 정의 추가

7. 목록/표 활용해 가독성 향상
   - 복잡한 비교는 표 형식 권장
   - 단계별 설명은 번호 목록 사용

8. 강조 표시:
   - 핵심 개념: **굵게**
   - 코드: \`\`\`언어명 형식
   - 주의사항: > 인용구 형식

9. 분량: 본문이 길다면 2000~4000자 정도의 충분한 요약

출력은 마크다운 형식으로 작성하세요.

본문:
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
You are an AI tutor that teaches from the user's PDF content.
- Answer in Korean using polite speech by default.
- If the user explicitly asks for a different tone (e.g., casual, formal, concise), follow that tone.
- Be friendly and concise.
- Base answers strictly on the provided document content.
- If the user greets or sends a short social message, respond warmly and ask what topic they want to learn.
- Do not mention the document, file name, or whether something is in/out of the document unless the user explicitly asks about coverage.
- If key info is missing, say you need more details and ask a brief follow-up question.
  `.trim();
}

function buildTutorContext(extractedText) {
  const trimmed = (extractedText || "").trim();
  if (!trimmed) return "";
  const maxChars = 16000;
  if (trimmed.length <= maxChars) return trimmed;
  const head = trimmed.slice(0, 8000);
  const tail = trimmed.slice(-8000);
  return `${head}\n\n[...]\n\n${tail}`;
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
  const prefaceRe = /^\s*\[?\s*\uC0AC\uC804\s*\uD310\uB2E8\s*\]?\s*/; // "사전 판단"
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
const VISUAL_HINT_RE =
  /(?:figure|fig\.?|table|chart|graph|plot|diagram|illustration|그림\s*\d|도표\s*\d|표\s*\d|그래프|도식)/i;
const CHAPTER_PATTERNS = [
  /\bchapter\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bchap\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /\bch\.\s*(\d{1,2}|[ivxlcdm]+)\b[^.!?\n]{0,90}/gi,
  /제\s*\d{1,2}\s*장[^.!?\n]{0,90}/g,
  /\b\d{1,2}\s*장[^.!?\n]{0,90}/g,
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
    /(figure|fig\.?|table|chart|graph|plot|diagram|illustration|그림\s*\d+|도표\s*\d+|표\s*\d+|그래프|도식)[^.!?\n]{0,90}/gi
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
      sections.push({ title: "도입", text: preface });
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
        title: `구간 ${sections.length + 1}`,
        text: chunk,
      });
    }
    start = end;
  }

  if (!sections.length && normalizedText) {
    sections.push({ title: "전체", text: normalizedText });
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
      scope: scope || "사용자 지정 챕터",
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
    return { scope: scope || "전체 문서", mode: "empty", chapters: [] };
  }

  const anchoredSections = splitByChapterAnchors(normalizedText);
  const mode = anchoredSections.length >= 2 ? "detected" : "virtual";
  const sections = mode === "detected" ? anchoredSections : splitIntoVirtualChapters(normalizedText);

  let limited = sections;
  if (sections.length > MAX_CHAPTER_COUNT) {
    const kept = sections.slice(0, MAX_CHAPTER_COUNT - 1);
    const remained = sections.slice(MAX_CHAPTER_COUNT - 1);
    kept.push({
      title: `${remained[0]?.title || "후반부"} 외 ${remained.length}개 챕터`,
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
    scope: scope || "전체 문서",
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

const SUMMARY_META_LINE_PATTERNS = [
  /챕터\s*제목.*(?:찾지\s*못|탐지\s*못|인식\s*못)/i,
  /문서를\s*길이\s*기준.*(?:나눠|분할|쪼개)/i,
  /길이\s*기준.*(?:요약|분할)/i,
  /(?:chapter\s*title|chapter\s*heading).*(?:not|couldn'?t|unable).*(?:find|detect)/i,
  /length[-\s]based.*(?:split|segment|chunk|summar)/i,
  /(?:virtual|auto(?:matically)?)\s*(?:chapter|segment|split)/i,
];

function isMetaSummaryLine(value) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return false;
  return SUMMARY_META_LINE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function normalizeImportance(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "high") return "높음";
  if (normalized === "low") return "낮음";
  return "중간";
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
      .map((line) => sanitizeSummaryLine(line, 220))
      .filter((line) => line && !isMetaSummaryLine(line))
      .slice(0, 2);
    if (fallbackOverview.length) {
      overview.push(...fallbackOverview);
    } else if (summaryInput.chapters[0]?.text) {
      const sourceLine = sanitizeSummaryLine(summaryInput.chapters[0].text, 180);
      if (sourceLine) overview.push(sourceLine);
    }
  }

  markdown.push("## 전체 개요");
  if (overview.length) {
    for (const point of overview) markdown.push("- " + point);
  } else {
    markdown.push("- 핵심 개요를 생성할 근거가 충분하지 않았습니다.");
  }
  markdown.push("");

  for (let idx = 0; idx < summaryInput.chapters.length; idx += 1) {
    const sourceChapter = summaryInput.chapters[idx];
    const candidate =
      chapterById.get(sourceChapter.id) ||
      parsedChapters.find((chapter) => Number(chapter?.chapterNumber) === sourceChapter.chapterNumber) ||
      parsedChapters[idx] ||
      {};

    const chapterTitle = sanitizeSummaryLine(
      candidate?.chapterTitle || candidate?.title || sourceChapter.chapterTitle,
      100
    );
    const cleanedChapterTitle = String(chapterTitle || "")
      .replace(/^\s*\d+\s*[^:]{0,20}:\s*/i, "")
      .trim();
    const headingTitle = cleanedChapterTitle || ("Chapter " + sourceChapter.chapterNumber);

    markdown.push("## " + headingTitle);
    markdown.push("### Key Summary");

    const summaryPoints = Array.isArray(candidate?.summaryPoints)
      ? candidate.summaryPoints
          .map((line) => sanitizeSummaryLine(line, 220))
          .filter((line) => line && !isMetaSummaryLine(line))
          .slice(0, 6)
      : [];
    if (summaryPoints.length) {
      for (const point of summaryPoints) markdown.push("- " + point);
    } else {
      markdown.push("- " + sanitizeSummaryLine(sourceChapter.text, 220));
    }

    const keyTerms = Array.isArray(candidate?.keyTerms) ? candidate.keyTerms.slice(0, 6) : [];
    markdown.push("### Key Terms");
    if (keyTerms.length) {
      for (const term of keyTerms) {
        if (typeof term === "string") {
          const simpleTerm = sanitizeSummaryLine(term, 180);
          if (simpleTerm) markdown.push("- " + simpleTerm);
          continue;
        }
        const termName = sanitizeSummaryLine(term?.term || term?.name || "", 70);
        const definition = sanitizeSummaryLine(term?.definition || term?.description || "", 180);
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
      for (const hint of sourceChapter.visualHints.slice(0, 3)) {
        markdown.push("- **review needed** " + sanitizeSummaryLine(hint, 170));
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
      "summaryPoints": ["..."],
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
- Keep each summary point concise and concrete.
- Include 3-6 summary points per chapter.
- Provide keyTerms, visuals, and sampleQuestionSolving for each chapter when evidence exists.
- sampleQuestionSolving should include 1-2 representative problems with short step-by-step solving.
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
      { statement: "본문에서 문장을 찾지 못했습니다.", answer: true, explanation: "PDF 텍스트가 비어 있습니다." },
    ];
  }

  return sentences.map((s, idx) => ({
    statement: `임의 문장: ${s}`,
    answer: idx % 2 === 0, // true/false 번갈아
    explanation: "임의로 선택한 문장입니다. 실제 정답 여부는 보장되지 않습니다.",
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
  if (!apiKey) {
    throw new Error("환경 변수 VITE_OPENAI_API_KEY가 .env에 설정되어야 합니다.");
  }

  let response;
  try {
    response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`OpenAI 요청 실패: ${err.message || err}`);
  }

  if (response.status === 429) {
    let hint = "요청 횟수가 초과되었습니다. 잠시 후 다시 시도해 주세요.";
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

    throw new Error(waitSeconds ? `${hint} (대기 ${waitSeconds}초)` : hint);
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

async function postResponseRequest(body) {
  const apiKey = (import.meta.env.VITE_OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("환경 변수 VITE_OPENAI_API_KEY가 .env에 설정되어야 합니다.");
  }

  let response;
  try {
    response = await fetch(RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`OpenAI 요청 실패: ${err.message || err}`);
  }

  if (!response.ok) {
    const rawBody = await response.text();
    let message = rawBody;
    try {
      const json = JSON.parse(rawBody);
      message = json?.error?.message || JSON.stringify(json);
    } catch {
      // keep raw text
    }
    throw new Error(`OpenAI Responses API error: ${response.status} ${message}`);
  }

  return response.json();
}

export async function generateQuiz(
  extractedText,
  { multipleChoiceCount = 4, shortAnswerCount = 1 } = {}
) {
  const mcCount = Math.max(0, Math.min(5, Number(multipleChoiceCount) || 0));
  const saCount = Math.max(0, Math.min(5, Number(shortAnswerCount) || 0));
  const prompt = buildQuizPrompt(extractedText, {
    multipleChoiceCount: mcCount,
    shortAnswerCount: saCount,
  });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Generate ${mcCount} Korean multiple-choice items (4 options each) plus ${saCount} Korean short-answer (calculation/explanation) items from the user's text only. Each question must assess understanding/apply/disambiguate/misconception check, not verbatim recall. Avoid asking for raw facts/URLs/names/numbers. Respond with JSON only using the provided schema. shortAnswer must be an array with ${saCount} items (empty if 0).`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 1, // gpt-5-mini default temperature
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return parseJsonSafe(sanitized, "quiz JSON");
}

export async function generateHardQuiz(extractedText, { count = 3 } = {}) {
  const prompt = buildHardQuizPrompt(extractedText, count);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate high-difficulty Korean multiple-choice questions from the user's text only. Each item must test reasoning/application, not verbatim recall. Output JSON only with the provided schema.",
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
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return { items };
}

export async function generateOxQuiz(extractedText) {
  const chunked = chunkText(extractedText, { maxChunks: 5, maxChunkLength: 1400 });
  let summaryForOx = "";
  try {
    summaryForOx = await generateSummary(extractedText, { chapterized: false });
  } catch {
    // 요약 실패 시 chunked로 진행
  }

  let highlightText = "";
  try {
    const hl = await generateHighlights(extractedText);
    const hs = Array.isArray(hl?.highlights) ? hl.highlights : [];
    if (hs.length > 0) {
      highlightText = hs
        .map((h, idx) => `${idx + 1}. ${h.sentence}${h.reason ? ` (근거: ${h.reason})` : ""}`)
        .join("\n");
    }
  } catch {
    // 하이라이트 생성 실패 시 스킵
  }

  const contextForOx = summaryForOx && summaryForOx.length >= 60 ? summaryForOx : chunked;
  if (!contextForOx || contextForOx.length < 60) {
    return {
      items: [],
      debug: true,
      reason: "퀴즈를 생성하기에 텍스트가 부족합니다.",
    };
  }

  const prompt = buildOxPrompt(contextForOx, highlightText);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate 10 Korean true/false (O/X) quiz statements strictly from the user's text. All statements, explanations, and evidence must be in Korean (translate/rephrase even if the source is English). Ensure at least 4 are false; if not possible, generate as many as possible but prefer false items. Each statement <=80 chars, explanation/evidence <=150 chars, no duplication, and every explanation cites the PDF as evidence where possible (e.g., p.3 정의 문단, 2.1절 두 번째 문장; if unavailable, evidence may be empty). Exclude metadata like titles/authors/credits/emails/references.",
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
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      return parsed;
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
    throw new Error("먼저 PDF 텍스트를 준비해주세요.");
  }

  if (chapterized) {
    try {
      const chapterSummary = await generateChapterSummary(normalized, {
        scope,
        chapterSections,
      });
      if (chapterSummary) return chapterSummary;
    } catch {
      // fallback to legacy summary
    }
  }

  if (!normalized) {
    throw new Error("사용자 지정 챕터 텍스트를 요약할 수 없습니다.");
  }

  const prompt = buildSummaryPrompt(extractedText);
  const scopeGuard = scope
    ? {
        role: "system",
        content: `요약 범위는 ${scope}에 포함된 본문만입니다. 다른 페이지/문서 내용이나 일반 지식은 사용하지 말고, 본문에 없는 내용은 추측하지 말고 생략하세요.`,
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
      temperature: 1, // gpt-5-mini default temperature
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}

export async function generateFlashcards(extractedText, { count = 8 } = {}) {
  const contextText = buildFlashcardsContext(extractedText, count);
  if (!contextText) {
    throw new Error("먼저 PDF 텍스트를 준비해주세요.");
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

export async function generateTutorReply({ question, extractedText, messages = [] }) {
  const contextText = buildTutorContext(extractedText);
  if (!contextText) {
    throw new Error("먼저 PDF 텍스트를 준비해주세요.");
  }

  const history = (messages || [])
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && msg.content)
    .map((msg) => ({ role: msg.role, content: String(msg.content) }));

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        { role: "system", content: buildTutorSystemPrompt() },
        { role: "system", content: `Document content:\n${contextText}` },
        ...history,
        { role: "user", content: question },
      ],
      max_completion_tokens: 800,
    },
    { retries: 0 }
  );

  let content = data.choices?.[0]?.message?.content?.trim() || "";
  if (!content) {
    const retryContext = contextText.length > 8000 ? contextText.slice(0, 8000) : contextText;
    const retry = await postChatRequest(
      {
        model: MODEL,
        messages: [
          { role: "system", content: buildTutorSystemPrompt() },
          { role: "system", content: `Document content:\n${retryContext}` },
          ...history,
          { role: "user", content: question },
        ],
        max_completion_tokens: 800,
      },
      { retries: 0 }
    );
    content = retry.choices?.[0]?.message?.content?.trim() || "";
  }
  if (!content) {
    return "죄송합니다. 지금은 답변을 생성하지 못했습니다. 질문을 조금 더 구체적으로 다시 알려주실 수 있을까요?";
  }
  return content;
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
아래 본문에서 요약에 근거가 되는 중요한 문장(최대 5개)을 뽑아 JSON으로만 답해주세요.
- 문장은 반드시 본문에 있는 그대로 사용 (의역/번역 금지)
- 포맷: { "highlights": [ { "sentence": "...", "reason": "..." } ] }

본문:
${extractedText}
        `.trim(),
        },
      ],
      temperature: 1, // gpt-5-mini default temperature
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return parseJsonSafe(sanitized, "highlights JSON");
}

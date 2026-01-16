import { MODEL } from "../constants";

// Dev: Vite proxy (/api/openai) for CORS; Prod: api.openai.com or VITE_OPENAI_BASE_URL
const OPENAI_BASE_URL =
  import.meta.env.VITE_OPENAI_BASE_URL || (import.meta.env.DEV ? "/api/openai" : "https://api.openai.com");
const CHAT_URL = `${OPENAI_BASE_URL}/v1/chat/completions`;
const RESPONSES_URL = `${OPENAI_BASE_URL}/v1/responses`;

function buildQuizPrompt(extractedText) {
  return `
당신은 대학 강의 자료를 기반으로 퀴즈를 출제하는 교수입니다.

[출제 원칙]
- 문서에 나온 사실은 문제의 '전제'로만 사용하고, 사실 자체를 그대로 묻지 않는다.
- 정답이 한 문장/단어 그대로 나오지 않게 이해/구분/적용/오해 판별/의미 해석을 요구한다.
- URL/숫자/이름 같은 암기형 문제는 금지.

[출력 형식]
- 객관식 4문항(각 4지선다) + 주관식 1문항(계산/서술형)
- 객관식: answerIndex, explanation 포함
- 주관식: answer(단답/수식/값)와 explanation 포함
- 모든 내용은 한국어, JSON만 출력

[반환 포맷(JSON)]
{
  "multipleChoice": [
    { "question": "...", "choices": ["...","...","...","..."], "answerIndex": 1, "explanation": "..." }
  ],
  "shortAnswer": { "question": "...", "answer": "...", "explanation": "..." }
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

[요약 지침]
1. 전체 개요(2~3문장): 강의 주제와 목표를 명확히

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

function sanitizeMarkdown(content) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
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

export async function generateQuiz(extractedText) {
  const prompt = buildQuizPrompt(extractedText);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate 4 Korean multiple-choice items (4 options each) plus 1 Korean short-answer (calculation/explanation) item from the user's text only. Each question must assess understanding/apply/disambiguate/misconception check, not verbatim recall. Avoid asking for raw facts/URLs/names/numbers. Respond with JSON only using the provided schema.",
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
    summaryForOx = await generateSummary(extractedText);
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

export async function generateSummary(extractedText) {
  const prompt = buildSummaryPrompt(extractedText);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Produce a detailed Korean markdown summary of the user's academic text. Follow their instructions for sections, subsections, bold emphasis, LaTeX math, tables/lists, and sufficient length (long-form; do not shorten to a few lines).",
        },
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

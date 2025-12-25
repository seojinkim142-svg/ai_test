import { MODEL } from "../constants";

const CHAT_URL = "https://api.openai.com/v1/chat/completions";

function buildQuizPrompt(extractedText) {
  return `
당신은 대학 강의 PDF에서 한국어 문제 세트를 만드는 출제자입니다. 아래 지침에 맞춰 문제를 만들어주세요.

요구사항:
- multipleChoice: 4문항, 보기 4개, 하나의 정답, 해설 포함
- shortAnswer: 1문항, 계산/서술형 정답
- 모든 문항/보기/해설은 PDF 본문에만 근거
- JSON 외 다른 출력 금지

반환 형식(JSON):
{
  "multipleChoice": [
    { "question": "...", "choices": ["...","...","...","..."], "answerIndex": 1, "explanation": "..." }
  ],
  "shortAnswer": { "question": "...", "answer": "..." }
}

PDF 텍스트:
${extractedText}
  `.trim();
}

function buildOxPrompt(extractedText) {
  return `
당신은 학습용 O/X 카드 퀴즈를 만듭니다. 아래 PDF 본문을 읽고 “참/거짓” 문장 5개를 한국어로 만들어 주세요. 각 문장은 반드시 본문 내용에서만 근거를 가져야 합니다.

요구사항:
- statement: 한 문장 참/거짓 진술
- answer: true/false
- explanation: 근거 한 줄
- JSON 외 내용 금지

반환 형식(JSON):
{
  "items": [
    { "statement": "...", "answer": true, "explanation": "..." }
  ]
}

본문:
${extractedText}
  `.trim();
}

function buildSummaryPrompt(extractedText) {
  return `
당신은 대학 강의 노트를 긴 형태의 한국어 마크다운으로 정리하는 조교입니다. 아래 형식을 지켜 길고 자세하게 요약하세요.

요약 지침
1. 전체 개요(2-3문장): 강의 주제와 목표를 명확히
2. 주요 섹션별 정리
   - 섹션 제목을 그대로 사용
   - 핵심 개념 설명(2-3문장), 필요한 수식은 LaTeX 표기
   - 예시/사용처/한계가 있으면 포함
3. 수식/공식 표현: 모든 수식은 LaTeX, 기호 의미를 간단히 설명
4. 개념 관계: “왜 중요한가”, “언제/어디서 쓰는가”를 이어서 설명
5. 용어 처리: 한영 병기, 처음 나온 용어는 설명 추가
6. 표/목록: 비교나 단계가 있으면 표나 번호 목록 사용
7. 강조: 핵심 키워드는 **굵게**, 필요한 경우 코드블록(\`\`\`) 활용
8. 분량: 본문이 길면 2000~4000자 정도로 충분히 길게

출력 형식: 마크다운 헤딩(#, ##, ###)과 굵게 강조를 포함한 긴 요약문.

본문:
${extractedText}
  `.trim();
}

function sanitizeJson(content) {
  return content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "");
}

function sanitizeMarkdown(content) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(response) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && !Number.isNaN(Number(retryAfter))) {
    return Number(retryAfter);
  }

  // OpenAI는 x-ratelimit-reset-requests(초 단위 epoch) 헤더를 줄 수 있음
  const resetEpoch = response.headers.get("x-ratelimit-reset-requests");
  if (resetEpoch && !Number.isNaN(Number(resetEpoch))) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Number(resetEpoch) - now;
    if (diff > 0) return diff;
  }

  return null;
}

async function postChatRequest(body, { retries = 1 } = {}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("환경 변수 VITE_OPENAI_API_KEY를 .env 파일에 설정해 주세요.");
  }

  const response = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    let hint = "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.";
    let waitSeconds = parseRetryAfterSeconds(response);

    try {
      const json = await response.json();
      hint = json?.error?.message || hint;
    } catch {
      // JSON 파싱 실패 시 기본 힌트로 안내
    }

    if (retries > 0) {
      // 헤더에 시간이 없으면 10초 기본 대기
      const delay = (waitSeconds ?? 10) * 1000;
      await sleep(delay);
      return postChatRequest(body, { retries: retries - 1 });
    }

    throw new Error(waitSeconds ? `${hint} (약 ${waitSeconds}초 후 재시도)` : hint);
  }

  if (!response.ok) {
    try {
      const json = await response.json();
      const message = json?.error?.message || JSON.stringify(json);
      throw new Error(`OpenAI API 오류: ${response.status} ${message}`);
    } catch {
      const details = await response.text();
      throw new Error(`OpenAI API 오류: ${response.status} ${details}`);
    }
  }

  return response.json();
}

export async function generateQuiz(extractedText) {
  const prompt = buildQuizPrompt(extractedText);

  const data = await postChatRequest({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "Generate 5 Korean quiz items (4 MCQ + 1 calculation short answer) strictly from the user's text. Respond with JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
  });

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return JSON.parse(sanitized);
}

export async function generateOxQuiz(extractedText) {
  const prompt = buildOxPrompt(extractedText);

  const data = await postChatRequest({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "Generate 5 Korean true/false quiz statements strictly from the user's text. Respond with JSON only.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
  });

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return JSON.parse(sanitized);
}

export async function generateSummary(extractedText) {
  const prompt = buildSummaryPrompt(extractedText);

  const data = await postChatRequest({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Produce a detailed Korean markdown summary of the user's academic text. Follow their instructions for sections, subsections, bold emphasis, LaTeX math, tables/lists, and sufficient length (long-form; do not shorten to a few lines).",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.3,
  });

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}

export async function generateHighlights(extractedText) {
  const data = await postChatRequest({
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
아래 본문에서 요약의 근거가 되는 중요 문장(최대 5개)을 **원문 그대로** 뽑아 JSON으로만 응답하세요.
- 문장은 반드시 본문에 있는 그대로 사용 (생략/재구성 금지)
- 이유는 짧게 한 줄로
- 형식: { "highlights": [ { "sentence": "...", "reason": "..." } ] }

본문:
${extractedText}
        `.trim(),
      },
    ],
    temperature: 0.2,
  });

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return JSON.parse(sanitized);
}

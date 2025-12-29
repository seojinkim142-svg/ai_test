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
- 문서에 명시된 사실(용어, 정의, 전제 조건 등)은 문제의 ‘전제’로만 사용하고, 그 사실 자체를 그대로 묻는 문제는 금지.
- 정답이 문서의 한 문장이나 한 단어 그대로가 되지 않도록, 항상 이해/구분/적용/오해 판별/의미 해석을 요구.
- URL/숫자/이름을 그대로 묻는 암기성 문제 금지.

[출력 형식]
- 객관식 4문항(각 4지선다) + 주관식 1문항(계산/서술형)
- 모든 문항은 이해/적용/오해 판별을 요구하도록 서술
- 객관식: answerIndex, explanation 포함
- 주관식: answer는 단답/수식/값, explanation 포함
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

function buildOxPrompt(contextText, highlightText = "") {
  return `
?�는 ?�로?�된 PDF�??�확???�고 ?�해?�는 ?�습 보조 AI?�다.
?�래 규칙???�라 O/X ?�즈�??�성?�라. 모든 문장�??�설?� ?�국?�로 ?�성?�고, JSON ?�의 ?�스?�는 출력?��? 마라.
?�롬?�트???�힌 지�?문구???�식 문구�?문제�??�용?��? 말고, ?�직 본문/?�약/근거 문장 ?�용�??�용?�라.

[?�력]
- PDF ?�약 ?�는 본문 ?��? (instruction 문구 ?�외)

[목표]
- PDF???�심 개념, ?�의, ?�리, 공식, 조건, 결과�?기반?�로 ?�습??O/X ?�즈 ?�성

[문제 ?�성 규칙]
1. 문제 ?? �?10문제
2. ?�형: O/X (�?거짓)
3. 모든 문제??PDF??명시?�으�??�장?�거??명확???�도 가?�한 ?�용�??�용 (추측/?��?지??금�?)
4. 문장?� ?�정?�으�? 80???�내
5. 최소 4개는 거짓(false) 진술???�함
6. ?�자/조건/방향??바꾼 ?�정 문제�??��? ?�함
7. 중복 ?��? ?�이 ?�로 ?�른 ?�용 ?�용
8. ?�설?� 150???�내�? ?�PDF???�르면…�? ?�본문에????���??�명?�다?�처??근거�?명시
9. evidence ?�드?�는 가?�하�?근거 ?�이지/??문장??짧게 ?�을 �?(?�으�?�?문자??
10. 강의 ?�목, ?�?�명, ?�레?? ?�메?? 감사 문구, 참고문헌 목록?� ?�습 개념???�니므�?문제�?만들지 말고 ?�전???�외?�라.
11. ?�업로드??PDF??같�? ?�내 문구??메�? ?�스?��? 문제�?만들지 �?�?

[출력 ?�식(JSON�?]
{
  "items": [
    { "statement": "...", "answer": true, "explanation": "...", "evidence": "..." }
  ]
}

?�약/본문:
${contextText}
${highlightText ? `\n\n[?�약 근거 문장]\n${highlightText}` : ""}
  `.trim();
}


function buildSummaryPrompt(extractedText) {

  return `

?�신?� ?�??강의 ?�트�?�??�태???�국??마크?�운?�로 ?�리?�는 조교?�니?? ?�래 ?�식??지�?길고 ?�세?�게 ?�약?�세??



?�약 지�?
1. ?�체 개요(2-3문장): 강의 주제?� 목표�?명확??
2. 주요 ?�션�??�리

   - ?�션 ?�목??그�?�??�용

   - ?�심 개념 ?�명(2-3문장), ?�요???�식?� LaTeX ?�기

   - ?�시/?�용�??�계가 ?�으�??�함

3. ?�식/공식 ?�현: 모든 ?�식?� LaTeX, 기호 ?��?�?간단???�명

4. 개념 관�? ?�왜 중요?��??? ?�언???�디???�는가?��? ?�어???�명

5. ?�어 처리: ?�영 병기, 처음 ?�온 ?�어???�명 추�?

6. ??목록: 비교???�계가 ?�으�??�나 번호 목록 ?�용

7. 강조: ?�심 ?�워?�는 **굵게**, ?�요??경우 코드블록(\`\`\`) ?�용

8. 분량: 본문??길면 2000~4000???�도�?충분??길게



출력 ?�식: 마크?�운 ?�딩(#, ##, ###)�?굵게 강조�??�함??�??�약�?



본문:

${extractedText}

  `.trim();

}



function sanitizeJson(content) {
  if (!content) return "";
  // ?�거: ?�러 개의 fenced code block???�을 ?�도 JSON 블록�?깔끔??추출
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
      { statement: "No sentences found in text.", answer: true, explanation: "PDF text is empty." },
    ];
  }

  return sentences.map((s, idx) => (({
    statement: "Fallback sentence: " + s,
    answer: idx % 2 === 0, // true/false alternate
    explanation: "Auto-generated fallback item; correctness not guaranteed.",
  })));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function parseRetryAfterSeconds(response) {

  const retryAfter = response.headers.get("retry-after");

  if (retryAfter && !Number.isNaN(Number(retryAfter))) {

    return Number(retryAfter);

  }



  // OpenAI??x-ratelimit-reset-requests(�??�위 epoch) ?�더�?�????�음

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
      // JSON ?? ?? ? ?? ??? ??
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
    throw new Error(`OpenAI ?? ??: ${err.message || err}`);
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

export async function generateOxQuiz(extractedText) {
  const chunked = chunkText(extractedText, { maxChunks: 5, maxChunkLength: 1400 });
  let summaryForOx = "";
  try {
    summaryForOx = await generateSummary(extractedText);
  } catch {
    // ?�약 ?�패 ??chunked�??�용
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
    // ?�이?�이???�성 ?�패 ??추�? 컨텍?�트 ?�이 진행
  }

  const contextForOx = summaryForOx && summaryForOx.length >= 60 ? summaryForOx : chunked;
  if (!contextForOx || contextForOx.length < 60) {
    return {
      items: [],
      debug: true,
      reason: "?�즈�??�성?????�는 ?�습 본문??부족합?�다.",
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
            "Generate 10 Korean true/false (O/X) quiz statements strictly from the user's text. All statements, explanations, and evidence must be in Korean (translate/rephrase even if the source is English). Ensure at least 4 are false; if not possible, generate as many as possible but prefer false items. Each statement <=80 chars, explanation/evidence <=150 chars, no duplication, and every explanation cites the PDF as evidence where possible (e.g., p.3 ?�의 문단, 2.1????번째 문장; if unavailable, evidence may be empty). Exclude metadata like titles/authors/credits/emails/references.",
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
  } catch (err) {
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
?�래 본문?�서 ?�약??근거가 ?�는 중요 문장(최�? 5�???**?�문 그�?�?* 뽑아 JSON?�로�??�답?�세??
- 문장?� 반드??본문???�는 그�?�??�용 (?�략/?�구??금�?)
- ?�유??짧게 ??줄로
- ?�식: { "highlights": [ { "sentence": "...", "reason": "..." } ] }

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

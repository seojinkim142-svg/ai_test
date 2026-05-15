import { Capacitor } from "@capacitor/core";
import { MODEL } from "../constants";
import { resolvePublicAppOrigin } from "../utils/appOrigin";

const DIRECT_DEEPSEEK_BASE_RE = /^https:\/\/api\.deepseek\.com(?:$|\/)/i;
const DIRECT_OPENAI_BASE_RE = /^https:\/\/api\.openai\.com(?:$|\/)/i;

function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function isAppProxyBaseUrl(value) {
  const normalized = trimTrailingSlash(value);
  if (!normalized) return false;
  if (normalized === "/api/openai") return true;

  try {
    return new URL(normalized).pathname === "/api/openai";
  } catch {
    return false;
  }
}

function sanitizeAiBaseUrl(value) {
  const normalized = trimTrailingSlash(value);
  if (!normalized) return "";
  if (DIRECT_DEEPSEEK_BASE_RE.test(normalized) || DIRECT_OPENAI_BASE_RE.test(normalized)) {
    return "";
  }
  return normalized;
}

function resolveDeepSeekBaseUrl() {
  const explicitBase = sanitizeAiBaseUrl(import.meta.env.VITE_DEEPSEEK_BASE_URL || import.meta.env.VITE_OPENAI_BASE_URL);
  if (explicitBase) return explicitBase;

  const publicAppOrigin = trimTrailingSlash(resolvePublicAppOrigin());
  if (Capacitor.isNativePlatform() && publicAppOrigin) {
    return `${publicAppOrigin}/api/openai`;
  }

  // Keep the default on same-origin proxy path so production web/app can use server-side key.
  return "/api/openai";
}

function resolveOpenAiBaseUrl() {
  const explicitBase = sanitizeAiBaseUrl(import.meta.env.VITE_OPENAI_BASE_URL);
  if (explicitBase) return explicitBase;

  const publicAppOrigin = trimTrailingSlash(resolvePublicAppOrigin());
  if (Capacitor.isNativePlatform() && publicAppOrigin) {
    return `${publicAppOrigin}/api/openai`;
  }

  return "/api/openai";
}

function createChatTarget(provider, baseUrl) {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl);
  const usesAppProxy = isAppProxyBaseUrl(normalizedBaseUrl);
  return {
    provider,
    baseUrl: normalizedBaseUrl,
    chatUrl: `${normalizedBaseUrl}/v1/chat/completions`,
    isDirectDeepSeekBase: DIRECT_DEEPSEEK_BASE_RE.test(normalizedBaseUrl),
    isDirectOpenAiBase: DIRECT_OPENAI_BASE_RE.test(normalizedBaseUrl),
    usesAppProxy,
    usesDevProxy: import.meta.env.DEV && usesAppProxy,
    usesRelativeBase: normalizedBaseUrl.startsWith("/"),
  };
}

const DEEPSEEK_BASE_URL = resolveDeepSeekBaseUrl();
const OPENAI_BASE_URL = resolveOpenAiBaseUrl();
const DEFAULT_CHAT_TARGET = createChatTarget("deepseek", DEEPSEEK_BASE_URL);
const OPENAI_CHAT_TARGET = createChatTarget("openai", OPENAI_BASE_URL);
const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const TUTOR_FALLBACK_MODELS = [
  MODEL,
  import.meta.env.VITE_DEEPSEEK_TUTOR_MODEL || import.meta.env.VITE_OPENAI_TUTOR_MODEL || "",
  "deepseek-chat",
  "deepseek-reasoner",
]
  .map((name) => String(name || "").trim())
  .filter(Boolean)
  .filter((name, index, arr) => arr.indexOf(name) === index);
const TUTOR_VISION_MODELS = [
  import.meta.env.VITE_OPENAI_TUTOR_VISION_MODEL || import.meta.env.VITE_OPENAI_VISION_MODEL || "",
  "gpt-4.1-mini",
  "gpt-4o-mini",
]
  .map((name) => String(name || "").trim())
  .filter(Boolean)
  .filter((name, index, arr) => arr.indexOf(name) === index);

const OUTPUT_LANGUAGE_SPECS = {
  en: {
    code: "en",
    label: "English",
  },
  zh: {
    code: "zh",
    label: "Chinese",
  },
  ja: {
    code: "ja",
    label: "Japanese",
  },
  hi: {
    code: "hi",
    label: "Hindi",
  },
  ko: {
    code: "ko",
    label: "Korean",
  },
};

function resolveOutputLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return OUTPUT_LANGUAGE_SPECS[normalized] || OUTPUT_LANGUAGE_SPECS.ko;
}

function getOutputLanguageLabel(value) {
  return resolveOutputLanguage(value).label;
}

const OUTPUT_LANGUAGE_TUTOR_FALLBACK_COPY = {
  en: {
    empty: "The model returned an empty response. Here is a quick evidence-first summary from the document:",
    evidenceLabel: "document evidence",
    closing: "I can explain your exact question step by step from this evidence.",
    noSource: "Could not generate an answer. Reload the document text and retry the same question.",
    noEvidence:
      "Could not generate an answer. Text recognition may be incomplete; reopen the PDF and try again.",
    debugPrefix: "debug",
  },
  zh: {
    empty: "模型返回了空响应。下面先给出基于文档证据的简要整理：",
    evidenceLabel: "文档证据",
    closing: "我现在可以基于这些证据按步骤解释你的具体问题。",
    noSource: "无法生成答案。请重新加载文档文本后再试一次相同的问题。",
    noEvidence: "无法生成答案。文本识别可能不完整，请重新打开 PDF 后再试。",
    debugPrefix: "调试",
  },
  ja: {
    empty: "モデルの応答が空でした。まず文書の根拠ベースで簡潔に整理します:",
    evidenceLabel: "文書の根拠",
    closing: "この根拠をもとに、質問を順番に説明できます。",
    noSource: "回答を生成できませんでした。文書テキストを再読み込みして同じ質問をもう一度試してください。",
    noEvidence: "回答を生成できませんでした。テキスト認識が不完全な可能性があります。PDF を開き直して再試行してください。",
    debugPrefix: "debug",
  },
  hi: {
    empty: "मॉडल ने खाली उत्तर लौटाया। पहले दस्तावेज़ के प्रमाण पर आधारित एक त्वरित सारांश दिया जा रहा है:",
    evidenceLabel: "दस्तावेज़ प्रमाण",
    closing: "अब मैं इन्हीं प्रमाणों के आधार पर आपके प्रश्न को चरणबद्ध समझा सकता हूँ।",
    noSource: "उत्तर तैयार नहीं हो सका। दस्तावेज़ का टेक्स्ट फिर से लोड करके वही प्रश्न दोबारा पूछें।",
    noEvidence:
      "उत्तर तैयार नहीं हो सका। टेक्स्ट पहचान अधूरी हो सकती है। PDF फिर से खोलकर दोबारा प्रयास करें।",
    debugPrefix: "debug",
  },
  ko: {
    empty: "모델이 빈 응답을 반환했습니다. 먼저 문서 근거 중심으로 빠르게 정리합니다:",
    evidenceLabel: "문서 근거",
    closing: "이 근거를 바탕으로 질문 내용을 단계별로 바로 설명할 수 있습니다.",
    noSource: "답변을 생성하지 못했습니다. 문서 텍스트를 다시 불러온 뒤 같은 질문으로 다시 시도해 주세요.",
    noEvidence: "답변을 생성하지 못했습니다. 텍스트 인식이 불완전할 수 있으니 PDF를 다시 열고 재시도해 주세요.",
    debugPrefix: "debug",
  },
};

function getTutorFallbackCopy(outputLanguage) {
  const normalized = resolveOutputLanguage(outputLanguage).code;
  return OUTPUT_LANGUAGE_TUTOR_FALLBACK_COPY[normalized] || OUTPUT_LANGUAGE_TUTOR_FALLBACK_COPY.ko;
}

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

function normalizeAdditionalRequest(value, maxLength = 500) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
}

function buildAdditionalRequestBlock(value, { title = "Additional user request", maxLength = 500 } = {}) {
  const normalized = normalizeAdditionalRequest(value, maxLength);
  if (!normalized) return "";
  return `
[${title}]
- Follow this request only if it can be satisfied using the provided document.
- Keep all output-schema and formatting rules unchanged.
${normalized}
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

const ESSAY_STYLE_SHORT_ANSWER_RE =
  /(설명하(?:세요|시오|라)?|서술하(?:세요|시오|라)?|논하(?:세요|시오|라)?|기술하(?:세요|시오|라)?|비교하(?:세요|시오|라)?|정리하(?:세요|시오|라)?|풀이하(?:세요|시오|라)?|이유를|근거를|어떻게|왜\b)/;

function isConciseShortAnswerValue(value) {
  const answer = String(value || "").trim();
  if (!answer) return false;
  if (answer.length > 28) return false;
  if (/\r|\n/.test(answer)) return false;
  if (/[.!?]$/.test(answer)) return false;
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  if (wordCount > 4) return false;
  if (/(합니다|하십시오|하세요|이다|입니다|있다|없다|된다|해야)/.test(answer)) return false;
  return true;
}

function isObjectiveShortAnswerItem(item) {
  const question = String(item?.question || item?.prompt || "").trim();
  if (!question) return false;
  if (ESSAY_STYLE_SHORT_ANSWER_RE.test(question)) return false;
  return isConciseShortAnswerValue(item?.answer);
}

function normalizeStyleList(items, { maxItems = 6, maxLength = 120 } = {}) {
  const result = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = String(item || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.slice(0, maxItems);
}

function summarizeQuestionStyleSourceBlock(block, maxLength = 150) {
  const normalized = String(block || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

const QUESTION_STYLE_STEM_RE =
  /(?:\uBB38\uC81C\s*\d+|question\s*\d+|q\.\s*\d+|\uB2E4\uC74C\s*(?:\uC911|\uBCF4\uAE30|\uC790\uB8CC|\uAE00)|\uC62E\uC740\s*\uAC83|\uC62E\uC9C0\s*\uC54A\uC740\s*\uAC83|\uC54C\uB9DE\uC740\s*\uAC83|\uACE0\uB978\s*\uAC83|\uACE0\uB974\uC2DC\uC624|\uBB3C\uC74C\uC5D0\s*\uB2F5|\uBE48\uCE78|\uC11C\uC220\uD615|which of the following|true or false|fill in the blank|\?)/i;
const QUESTION_STYLE_CHOICE_RE = /(?:^|\n|\s)(?:①|②|③|④|⑤|[1-5][.)]|[A-E][.)]|[\u3131-\u314e][.)])/;

function looksLikeQuestionStyleBlock(block) {
  const text = String(block || "").trim();
  if (text.length < 24) return false;
  const choiceMatches =
    text.match(/(?:^|\n|\s)(?:①|②|③|④|⑤|[1-5][.)]|[A-E][.)]|[\u3131-\u314e][.)])/g) || [];
  return QUESTION_STYLE_STEM_RE.test(text) || choiceMatches.length >= 2 || QUESTION_STYLE_CHOICE_RE.test(text);
}

function extractQuestionStyleBlocks(text, { maxBlocks = 10, maxChars = 5200 } = {}) {
  const source = String(text || "").replace(/\r/g, "").trim();
  if (!source) return [];

  const deduped = [];
  const seen = new Set();
  const pushBlock = (value) => {
    const normalized = String(value || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!looksLikeQuestionStyleBlock(normalized)) return false;
    const compact = normalized.replace(/\s+/g, " ").trim();
    if (!compact) return false;
    const key = compact.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    deduped.push(limitText(normalized, 700));
    return true;
  };

  const paragraphBlocks = source
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  paragraphBlocks.forEach((block) => {
    if (deduped.length < maxBlocks) pushBlock(block);
  });

  if (deduped.length < maxBlocks) {
    const lines = source
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (let index = 0; index < lines.length && deduped.length < maxBlocks; index += 1) {
      const window = lines.slice(index, index + 6).join("\n");
      if (!window) continue;
      if (!pushBlock(window)) continue;
      index += 2;
    }
  }

  const selected = [];
  let totalChars = 0;
  for (const block of deduped) {
    const nextLength = totalChars + block.length + 2;
    if (selected.length >= maxBlocks || nextLength > maxChars) break;
    selected.push(block);
    totalChars = nextLength;
  }
  return selected;
}

function normalizeQuestionStyleProfile(profile, { sourceBlocks = [] } = {}) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;

  const normalized = {
    detected: Boolean(profile?.detected),
    summary: normalizeEvidenceText(
      profile?.summary || profile?.styleSummary || profile?.toneSummary || "",
      260
    ),
    stemPatterns: normalizeStyleList(profile?.stemPatterns || profile?.questionPatterns || profile?.promptPatterns),
    choicePatterns: normalizeStyleList(
      profile?.choicePatterns || profile?.optionPatterns || profile?.distractorPatterns
    ),
    reasoningPatterns: normalizeStyleList(
      profile?.reasoningPatterns || profile?.focusPatterns || profile?.thinkingPatterns
    ),
    trapPatterns: normalizeStyleList(profile?.trapPatterns || profile?.misdirectionPatterns),
    answerRules: normalizeStyleList(profile?.answerRules || profile?.gradingRules || profile?.formatRules),
    avoidPatterns: normalizeStyleList(profile?.avoidPatterns || profile?.dontPatterns || profile?.doNotDo),
    sampleStems: normalizeStyleList(
      profile?.sampleStems || profile?.sampleQuestions || profile?.exampleStems,
      {
        maxItems: 4,
        maxLength: 140,
      }
    ),
    sourceExampleCount: Math.max(0, Array.isArray(sourceBlocks) ? sourceBlocks.length : 0),
    sourceExamplePreviews: normalizeStyleList(
      (Array.isArray(sourceBlocks) ? sourceBlocks : []).map((block) =>
        summarizeQuestionStyleSourceBlock(block, 150)
      ),
      {
        maxItems: 4,
        maxLength: 150,
      }
    ),
  };

  const hasUsefulContent =
    normalized.detected ||
    normalized.summary ||
    normalized.stemPatterns.length > 0 ||
    normalized.choicePatterns.length > 0 ||
    normalized.reasoningPatterns.length > 0 ||
    normalized.trapPatterns.length > 0 ||
    normalized.answerRules.length > 0 ||
    normalized.sampleStems.length > 0 ||
    normalized.sourceExampleCount > 0 ||
    normalized.sourceExamplePreviews.length > 0;

  if (!hasUsefulContent) return null;
  if (!normalized.detected) {
    normalized.detected =
      normalized.stemPatterns.length > 0 ||
      normalized.choicePatterns.length > 0 ||
      normalized.reasoningPatterns.length > 0 ||
      normalized.trapPatterns.length > 0 ||
      normalized.sampleStems.length > 0;
  }
  return normalized;
}

function formatQuestionStyleProfile(profile) {
  if (!profile) return "";
  if (!profile.detected) {
    const fallbackLines = ["[분석 결과]"];
    if (Number(profile.sourceExampleCount || 0) > 0) {
      fallbackLines.push(
        `- 예시 문제로 보이는 블록은 ${Number(profile.sourceExampleCount || 0)}개 감지됐지만, 안정적인 스타일 프로필로 확정하기엔 근거가 약했습니다.`
      );
    } else {
      fallbackLines.push("- 문서 안에서 예시 문제를 충분히 감지하지 못했습니다.");
    }
    if (profile.sourceExamplePreviews.length) {
      fallbackLines.push("");
      fallbackLines.push("[실제 추출 미리보기]");
      profile.sourceExamplePreviews.forEach((preview, index) => {
        fallbackLines.push(`${index + 1}. ${preview}`);
      });
    }
    return fallbackLines.join("\n");
  }

  const sections = [];
  sections.push("[분석 결과]");
  sections.push(
    `- 감지된 예시 문제 블록 수: ${Number(profile.sourceExampleCount || 0)}개`
  );
  if (profile.summary) sections.push(`- 한줄 요약: ${profile.summary}`);
  if (profile.stemPatterns.length) sections.push(`- 발문 패턴: ${profile.stemPatterns.join(" | ")}`);
  if (profile.choicePatterns.length) {
    sections.push(`- 선지/보기 패턴: ${profile.choicePatterns.join(" | ")}`);
  }
  if (profile.reasoningPatterns.length) {
    sections.push(`- 주로 묻는 사고: ${profile.reasoningPatterns.join(" | ")}`);
  }
  if (profile.trapPatterns.length) {
    sections.push(`- 자주 나오는 함정: ${profile.trapPatterns.join(" | ")}`);
  }
  if (profile.answerRules.length) sections.push(`- 정답 형식 규칙: ${profile.answerRules.join(" | ")}`);
  if (profile.avoidPatterns.length) {
    sections.push(`- 피해야 할 엇나간 스타일: ${profile.avoidPatterns.join(" | ")}`);
  }
  if (profile.sampleStems.length) {
    sections.push("");
    sections.push("[모델이 잡은 대표 발문]");
    profile.sampleStems.forEach((stem, index) => {
      sections.push(`${index + 1}. ${stem}`);
    });
  }
  if (profile.sourceExamplePreviews.length) {
    sections.push("");
    sections.push("[실제 추출 미리보기]");
    profile.sourceExamplePreviews.forEach((preview, index) => {
      sections.push(`${index + 1}. ${preview}`);
    });
  }
  return sections.join("\n");
}

function buildQuestionStyleProfilePrompt(blocks, { scopeLabel = "" } = {}) {
  const joinedBlocks = (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => `[Example ${index + 1}]\n${block}`)
    .join("\n\n");

  return `
You analyze document-native question style from example questions only.

[Goal]
- Infer how this document tends to ask questions so later generated questions can match that style.
- Focus on the question "feel": stem wording, distractor design, reasoning depth, trap style, and answer-format expectations.

[Rules]
- Use only the example question blocks below.
- If the blocks do not clearly look like real document questions, return "detected": false.
- Do not copy long examples into the summary.
- Keep every list item short and reusable as generation guidance.
- All field values must be written in Korean.

[Output JSON]
{
  "detected": true,
  "summary": "...",
  "stemPatterns": ["..."],
  "choicePatterns": ["..."],
  "reasoningPatterns": ["..."],
  "trapPatterns": ["..."],
  "answerRules": ["..."],
  "avoidPatterns": ["..."],
  "sampleStems": ["..."]
}

[Style guidance]
- "stemPatterns": how the prompt is phrased.
- "choicePatterns": how choices or distractors are written, if any.
- "reasoningPatterns": what kind of thinking is usually tested.
- "trapPatterns": recurring misconception or contrast patterns.
- "answerRules": constraints on answer shape, precision, or notation.
- "avoidPatterns": styles that would feel unlike the document.
- "sampleStems": 1-line stem excerpts, tone only, not for verbatim reuse.

${scopeLabel ? `[Selected chapter range]\n${scopeLabel}\n\n` : ""}[Example question blocks]
${joinedBlocks}
  `.trim();
}

function buildQuizPrompt(
  extractedText,
  {
    multipleChoiceCount,
    shortAnswerCount,
    avoidQuestions = [],
    scopeLabel = "",
    questionStyleProfile = "",
    additionalRequest = "",
    outputLanguage = "ko",
    difficulty = null,
  }
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const avoidBlock = buildAvoidReuseBlock(avoidQuestions, {
    title: "Do not reuse these previously asked questions",
    maxItems: 16,
    maxLength: 90,
  });
  const additionalRequestBlock = buildAdditionalRequestBlock(additionalRequest, {
    title: "Additional quiz request",
  });

  const difficultyDefinitions = `
[Difficulty definitions]
하 (Basic)
- Tests recognition of key terms, definitions, or simple facts stated in the document.
- Stem pattern: "what is", "which of these is", "which term describes".
- Distractors: definitions from the wrong concept, or a true fact that does not answer the question.
- A student who read the section once should answer correctly.

중 (Intermediate)
- Tests understanding of relationships between concepts, or application to a standard scenario.
- Stem pattern: "why", "how", "which condition", "what would happen if".
- Requires understanding "why", not just "what".
- Distractors: partially correct statements missing one key condition, or correct ideas in the wrong context.

상 (Advanced)
- Tests synthesis, multi-step reasoning, edge cases, or application to a combined/modified scenario.
- Stem pattern: compound conditions, negation, exception-finding, synthesis across sections.
- At least two distractors must be genuinely tempting to someone who partially understands the concept.
- Distractors: real concepts combined in a way that fails under one specific condition; reversal of cause/effect; valid-seeming exceptions that collapse under scrutiny.`;

  const difficultyBlock = difficulty
    ? `${difficultyDefinitions}

[Active difficulty]
${difficulty}
Generate ALL questions at this difficulty level only. Set the difficulty field to "${difficulty}" on every item.

`
    : `${difficultyDefinitions}

[Difficulty distribution — no active difficulty set]
Distribute questions across all three levels. Aim for roughly 25% 하, 50% 중, 25% 상.
Assign the appropriate difficulty field to each item based on how it fits the definitions above.

`;

  return `
You are a professor creating quiz questions from lecture material.
${difficultyBlock}
[Rules]
- Use only the selected chapter range shown below. Do not create questions from outside that range.
- If a candidate question depends on content not explicitly present in the selected range, do not generate it.
- Do not ask verbatim recall — always rephrase and shift the angle of asking.
- Questions must test understanding, comparison, application, misconception checks, or interpretation.
- If a document question style profile is provided, match that style closely: stem shape, distractor style, reasoning grain, and trap pattern.
- Use the style profile only for "how to ask"; use the selected document text for "what to ask".
- Do not copy any sample stem verbatim, and reject any item that feels unlike the document's native question style.
- Avoid pure memorization prompts (raw URLs, names, single numbers).
- Each question must have exactly one unambiguously correct answer.
- If the document contains page tags like [p.12], first choose 1-2 tagged evidence passages and then write the question from that evidence only.
- evidencePages must use only page numbers that actually appear in the provided page tags.
- If the tagged evidence does not support the question, omit that item instead of using outside knowledge or other pages.
- Never guess missing page numbers, and never assign a broad page range when the exact supporting page is unclear.
- evidenceSnippet should be a short source phrase copied or lightly normalized from the document so it can be highlighted later.
- Short-answer items must have one exact, short answer only: a number, formula, term, concept name, or short phrase.
- Do not generate essay-style prompts such as "설명하라", "서술하라", "논하라", "기술하라", or questions that require long prose.
- The short-answer answer field must be concise and directly gradable, not a sentence.
- If an additional user request is provided, follow it only when it stays grounded in the document and still satisfies every rule above.

[Output format]
- Multiple-choice: ${multipleChoiceCount} questions, 4 options each.
- Short-answer: ${shortAnswerCount} questions with a single exact answer.
- Include answerIndex, explanation, and choiceExplanations for multiple-choice.
- choiceExplanations is an array of short strings (one per choice) explaining why each option is correct or incorrect.
- Include a difficulty field on every item ("하", "중", or "상").
- Include answer and explanation for short-answer.
- Include evidencePages, evidenceSnippet, and evidenceLabel for every item.
- Return JSON only.

[JSON schema]
{
  "multipleChoice": [
    {
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answerIndex": 1,
      "difficulty": "중",
      "explanation": "...",
      "choiceExplanations": [
        "Why option A is wrong",
        "Why option B is correct",
        "Why option C is wrong",
        "Why option D is wrong"
      ],
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 정의 문단"
    }
  ],
  "shortAnswer": [
    {
      "question": "...",
      "answer": "...",
      "difficulty": "중",
      "explanation": "...",
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 계산 예시"
    }
  ]
}

[Language]
- Write all question/explanation/choiceExplanations text in ${outputLanguageLabel}.
${avoidBlock ? `\n\n${avoidBlock}` : ""}
${questionStyleProfile ? `\n\n[Document question style profile]\n${questionStyleProfile}` : ""}
${additionalRequestBlock ? `\n\n${additionalRequestBlock}` : ""}
${scopeLabel ? `\n\n[Selected chapter range]\n${scopeLabel}` : ""}

[Document]
${extractedText}
  `.trim();
}
function buildHardQuizPrompt(
  extractedText,
  count,
  { avoidQuestions = [], questionStyleProfile = "", scopeLabel = "", additionalRequest = "", outputLanguage = "ko" } = {}
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const avoidBlock = buildAvoidReuseBlock(avoidQuestions, { title: "Do not reuse these previously asked questions" });
  const additionalRequestBlock = buildAdditionalRequestBlock(additionalRequest, {
    title: "Additional mock-exam request",
  });
  return `
You are a senior professor writing high-stakes exam items that separate students who truly understand the material from those who merely memorized it.

[High-difficulty definition]
Every item must require at least one of:
- Multi-step reasoning: applying two or more concepts in sequence to reach the answer.
- Modified scenario: a familiar concept applied to a slightly different condition than the document describes.
- Condition identification: finding which specific condition causes a general rule to break or an exception to apply.
- Synthesis: integrating ideas from different parts of the document to resolve a conflict or edge case.
Items that can be answered by a student who read only one sentence are not acceptable at this level.

[Distractor rules]
- At least two distractors must be genuinely tempting to a student who partially understands the concept.
- Use: correct idea in the wrong context; true statement that does not answer the question; reversal of cause and effect; valid-seeming exception that collapses under the specific condition in the stem.
- Each question must have exactly one unambiguously correct answer.

[Rules]
- Do not ask verbatim recall — always rephrase and shift the angle.
- If a document question style profile is provided, keep the native tone and trap design while raising only the difficulty.
- Never copy sample stems verbatim; use the style profile only as a template.
- If the document contains page tags like [p.12], select supporting evidence from those tags first and write the question only from that evidence.
- evidencePages: only page numbers that actually appear in the document's page tags.
- If tagged evidence does not support the question, omit the item — do not guess pages.
- evidenceSnippet: a short phrase copied or lightly normalized from the document.
- Never ask textbook/preface metadata: target audience, supplement availability, author/publisher info, TOC/chapter structure.
- If an additional user request is provided, follow it only when it stays grounded in the document and does not break these rules.

[Output format]
- ${count} multiple-choice questions, 4 options each.
- Include answerIndex, explanation, and choiceExplanations on every item.
- choiceExplanations: one sentence per choice explaining why it is correct or incorrect.
- Include evidencePages, evidenceSnippet, and evidenceLabel.
- Return JSON only.

[JSON schema]
{
  "items": [
    {
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answerIndex": 1,
      "explanation": "...",
      "choiceExplanations": [
        "Why option A is wrong",
        "Why option B is correct",
        "Why option C is wrong",
        "Why option D is wrong"
      ],
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 핵심 조건"
    }
  ]
}

[Language]
- Write all question/explanation/choiceExplanations text in ${outputLanguageLabel}.
${avoidBlock ? `\n\n${avoidBlock}` : ""}
${questionStyleProfile ? `\n\n[Document question style profile]\n${questionStyleProfile}` : ""}
${additionalRequestBlock ? `\n\n${additionalRequestBlock}` : ""}
${scopeLabel ? `\n\n[Selected chapter range]\n${scopeLabel}` : ""}

[Document]
${extractedText}
  `.trim();
}
function buildOxPrompt(
  contextText,
  highlightText = "",
  avoidStatements = [],
  scopeLabel = "",
  additionalRequest = "",
  outputLanguage = "ko"
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const avoidBlock = buildAvoidReuseBlock(avoidStatements, { title: "Do not reuse these previously asked statements" });
  const additionalRequestBlock = buildAdditionalRequestBlock(additionalRequest, {
    title: "Additional mock-exam request",
  });
  return `
You create O/X (true/false) quiz items from PDF content.
Follow all rules and return JSON only.

[Input]
- Selected chapter range: ${scopeLabel || "current document scope only"}
- PDF summary/body excerpt
${highlightText ? `- Highlight sentences:\n${highlightText}` : ""}
${avoidBlock ? `- ${avoidBlock.replace(/\n/g, "\n  ")}` : ""}

[Rules]
0. Use only the selected chapter range above. Do not use content outside that range.
0-1. If a statement cannot be supported by an explicit sentence inside the selected range, do not generate it.
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
12. If the tagged evidence does not support the statement, omit that item instead of using outside knowledge or other pages.
12-1. Never guess missing page numbers, and never assign a broad page range when the exact supporting page is unclear.
13. Exclude low-value metadata/trivia items:
   textbook target audience, supplement/material availability,
   author/publisher/contact, TOC/chapter structure.
14. If an additional user request is provided, follow it only when it stays grounded in the document and does not break the O/X format.

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
- Write statement/explanation/evidence in ${outputLanguageLabel}.
${additionalRequestBlock ? `\n\n${additionalRequestBlock}` : ""}

[Document]
${contextText}
  `.trim();
}
function buildSummaryPrompt(extractedText, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are a senior teaching assistant writing a study-grade ${outputLanguageLabel} markdown summary from lecture material.

[Content check]
- If the text is almost entirely cover page, table of contents, or publisher metadata with no substantive learning content, return only a 1-2 sentence notice stating that.
- Otherwise always produce a full summary — do not refuse.

[Structure — use this heading hierarchy]
## 개요
2-3 sentences: what this section covers and what the student should understand after reading.

## [Section or topic name]  ← one H2 per major topic found in the document
- Explain each concept in 3-5 bullet points or a short paragraph.
- Use H3 (###) for sub-concepts when a topic has meaningfully distinct parts.
- If two or more terms in this section are commonly confused or explicitly contrasted in the document, include a comparison (table or side-by-side bullets).

## 핵심 공식  ← include only when the source contains formulas
List every important formula with variable definitions immediately after.

## 주요 용어
Term — definition (original English term in parentheses if helpful).

[Length guideline]
- Short source (< ~500 words): concise, 1-2 paragraphs per section.
- Medium source (~500-2000 words): 3-5 bullet points per concept, cover all sections.
- Long source (> ~2000 words): comprehensive; do not skip sections or merge unrelated topics.

[Writing rules]
- Do not reproduce sentences verbatim from the source — rephrase and teach.
- Emphasize key ideas with **bold**.
- Use tables when comparing 3 or more items with shared attributes.
- Use numbered lists only for steps or ranked sequences; use bullet lists otherwise.

[Math formatting — strict]
- Inline math: $...$
- Block math: $$...$$ on its own line
- Define every variable/symbol immediately after the formula.
- Use LaTeX commands for all operators and symbols; no plain-text substitutes.

[Output]
- Markdown only. No preamble, no meta-commentary about the summary itself.
- Language: ${outputLanguageLabel}.

[Document]
${extractedText}
  `.trim();
}

function looksLikeSummaryRefusal(content) {
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

function buildProblemPageSummaryPrompt(extractedText, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are a teaching assistant who writes a ${outputLanguageLabel} markdown study summary for problem-heavy pages.

[Goal]
- The source may be mostly exercises, mock-test items, answer choices, or short explanations.
- Do not refuse the summary.
- Infer what concepts the learner must know to solve these problems well.

[Output]
- Markdown only.
- Language: ${outputLanguageLabel}.

[Required sections]
1. ## 페이지 성격
   - 이 페이지가 어떤 유형의 문제 페이지인지 2-3문장으로 설명
2. ## 핵심 개념 정리
   - 문제들이 공통으로 요구하는 개념을 항목별로 설명
3. ## 자주 요구하는 판단
   - 계산, 비교, 해석, 조건 판별 등 자주 필요한 사고를 정리
4. ## 자주 틀리는 함정
   - 선지 함정, 개념 혼동, 단위/조건 실수 등을 정리
5. ## 빠르게 점검할 것
   - 시험 전에 확인할 공식, 용어, 체크포인트를 간단히 정리

[Rules]
- Render the section headings in the requested output language.
- Preferred heading meanings: Page type, Core concepts, Common solving criteria, Frequent traps, Last-minute checklist.
- Provided text only.
- If the page includes answer choices or short answer blanks, use them as evidence for what is being tested.
- Avoid saying there is "no learning content" unless the text is truly only cover/TOC/publisher metadata.
- Keep the summary useful for studying, not just page classification.

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

function buildExamCramPrompt({
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

[Preferred structure]
## 시험 직전 이것만
## 꼭 구분할 개념
## 헷갈리기 쉬운 함정
## 마지막 1분 체크리스트

[Study artifacts]
${sections.join("\n\n")}
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

function buildFlashcardsPrompt(contextText, count, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You generate study flashcards from a PDF.

[Flashcard rules]
- Create ${count} cards in ${outputLanguageLabel}.
- Focus on key concepts/definitions/principles/terms.
- Remove duplicates or near-duplicates.
- front: question/term, back: concise answer/explanation, hint: only if needed (optional).
- Do not repeat identical meaning.
- If the source is written in another language, translate it to ${outputLanguageLabel}.

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

function buildTutorSystemPrompt(outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are an AI tutor helping the user study with their PDF.
- Answer in ${outputLanguageLabel} using polite speech by default.
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
const MAX_LEGACY_SUMMARY_SOURCE_CHARS = 22000;
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

async function generateChapterSummary(extractedText, { scope, chapterSections, outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
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
            `You summarize academic PDFs in ${outputLanguageLabel}. Return JSON only. Use only provided chapter data. For visuals, estimate importance as high|medium|low only when supported by chapter text or visual hints.`,
        },
        {
          role: "user",
          content: `
Analyze the chapter input and return ${outputLanguageLabel} JSON with this schema:
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
- Output language: ${outputLanguageLabel}.
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
    { retries: 1 }
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

function fallbackOxItems(extractedText, outputLanguage = "ko") {
  const clean = (extractedText || "").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);
  const outputLanguageCode = resolveOutputLanguage(outputLanguage).code;
  const fallbackCopy = {
    en: {
      judge: "Judge O/X using text evidence:",
      emptyStatement: "Use evidence from the PDF text before deciding O/X.",
      emptyExplanation: "Without textual evidence, the statement cannot be trusted.",
      sentenceExplanation: "Compare the statement with nearby context in the provided text.",
    },
    zh: {
      judge: "请根据文本证据判断 O/X：",
      emptyStatement: "请先依据 PDF 文本证据再判断 O/X。",
      emptyExplanation: "如果没有文本证据，这个陈述就不能被信任。",
      sentenceExplanation: "请把该陈述与附近上下文进行对照后再判断。",
    },
    ja: {
      judge: "本文の根拠を使って O/X を判断してください:",
      emptyStatement: "まず PDF 本文の根拠を確認してから O/X を判断してください。",
      emptyExplanation: "本文の根拠がない場合、その記述は信頼できません。",
      sentenceExplanation: "提示された記述を周辺文脈と照らして判断してください。",
    },
    hi: {
      judge: "टेक्स्ट प्रमाण के आधार पर O/X तय करें:",
      emptyStatement: "O/X तय करने से पहले PDF टेक्स्ट के प्रमाण की जाँच करें।",
      emptyExplanation: "यदि टेक्स्ट प्रमाण नहीं है, तो इस कथन पर भरोसा नहीं किया जा सकता।",
      sentenceExplanation: "दिए गए कथन की तुलना आसपास के संदर्भ से करें।",
    },
    ko: {
      judge: "텍스트 근거로 O/X를 판단하세요:",
      emptyStatement: "PDF 텍스트 근거를 먼저 확인한 뒤 O/X를 판단하세요.",
      emptyExplanation: "텍스트 근거가 없으면 이 진술은 신뢰할 수 없습니다.",
      sentenceExplanation: "제공된 진술을 주변 문맥과 비교해 판단하세요.",
    },
  }[outputLanguageCode] || {
    judge: "텍스트 근거로 O/X를 판단하세요:",
    emptyStatement: "PDF 텍스트 근거를 먼저 확인한 뒤 O/X를 판단하세요.",
    emptyExplanation: "텍스트 근거가 없으면 이 진술은 신뢰할 수 없습니다.",
    sentenceExplanation: "제공된 진술을 주변 문맥과 비교해 판단하세요.",
  };
  if (!sentences.length) {
    return [
      {
        statement: fallbackCopy.emptyStatement,
        answer: true,
        explanation: fallbackCopy.emptyExplanation,
        evidence: "",
        evidencePages: [],
        evidenceSnippet: "",
      },
    ];
  }

  return sentences.map((s, idx) => ({
    statement: `${fallbackCopy.judge} ${s}`,
    answer: idx % 2 === 0, // true/false alternation
    explanation: fallbackCopy.sentenceExplanation,
    evidence: "",
    evidencePages: [],
    evidenceSnippet: "",
  }));
}
// Simple in-memory cache for quiz generation
const quizCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const questionStyleProfileCache = new Map();

function getCacheKey(text, options) {
  const hash = btoa(encodeURIComponent(text + JSON.stringify(options)));
  return `quiz_${hash}`;
}

function getCachedResult(key) {
  const entry = quizCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    quizCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedResult(key, result) {
  quizCache.set(key, {
    result,
    timestamp: Date.now()
  });
}

function getCachedQuestionStyleProfile(key) {
  const entry = questionStyleProfileCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    questionStyleProfileCache.delete(key);
    return undefined;
  }
  return entry.result;
}

function setCachedQuestionStyleProfile(key, result) {
  questionStyleProfileCache.set(key, {
    result,
    timestamp: Date.now(),
  });
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

function resolveChatTarget(provider = "deepseek") {
  return String(provider || "").trim().toLowerCase() === "openai"
    ? OPENAI_CHAT_TARGET
    : DEFAULT_CHAT_TARGET;
}

function isRetryableStatus(status) {
  const normalized = Number(status);
  return normalized === 408 || normalized === 409 || normalized === 425 || normalized === 429 || (normalized >= 500 && normalized <= 599);
}

function getFallbackProvider(provider, attemptedProviders = []) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const attempted = new Set(
    (Array.isArray(attemptedProviders) ? attemptedProviders : []).map((entry) =>
      String(entry || "").trim().toLowerCase()
    )
  );

  if (normalizedProvider !== "deepseek" || attempted.has("openai")) return null;
  return "openai";
}

async function postChatRequest(
  body,
  { retries = 1, provider = "deepseek", attemptedProviders = [] } = {}
) {
  const target = resolveChatTarget(provider);
  const nextAttemptedProviders = [...attemptedProviders, target.provider];

  if (IS_NATIVE_PLATFORM && target.usesRelativeBase) {
    throw new Error(
      `Mobile builds need an absolute API base URL. Set \`VITE_PUBLIC_APP_ORIGIN\` or \`${
        target.provider === "openai" ? "VITE_OPENAI_BASE_URL" : "VITE_DEEPSEEK_BASE_URL"
      }\` and rebuild the app.`
    );
  }

  if (!target.usesAppProxy && !target.baseUrl) {
    throw new Error("AI service is temporarily unavailable. Please try again later.");
  }

  const headers = {
    "Content-Type": "application/json",
  };
  const requestBody = target.usesAppProxy ? { ...(body || {}), provider: target.provider } : body;

  let response;
  try {
    response = await fetch(target.chatUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    if (retries > 0) {
      await sleep(1200);
      return postChatRequest(body, {
        retries: retries - 1,
        provider: target.provider,
        attemptedProviders: nextAttemptedProviders,
      });
    }

    const fallbackProvider = getFallbackProvider(target.provider, nextAttemptedProviders);
    if (fallbackProvider) {
      return postChatRequest(body, {
        retries: 0,
        provider: fallbackProvider,
        attemptedProviders: nextAttemptedProviders,
      });
    }

    throw new Error("AI service request failed. Please try again.");
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
      return postChatRequest(body, {
        retries: retries - 1,
        provider: target.provider,
        attemptedProviders: nextAttemptedProviders,
      });
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

    if (isRetryableStatus(response.status) && retries > 0) {
      const delay = Math.min(3000, 1200 * (2 - Math.min(retries, 1)));
      await sleep(delay);
      return postChatRequest(body, {
        retries: retries - 1,
        provider: target.provider,
        attemptedProviders: nextAttemptedProviders,
      });
    }

    if (response.status >= 500) {
      const fallbackProvider = getFallbackProvider(target.provider, nextAttemptedProviders);
      if (fallbackProvider) {
        return postChatRequest(body, {
          retries: 0,
          provider: fallbackProvider,
          attemptedProviders: nextAttemptedProviders,
        });
      }
    }

    const sanitizedMessage = String(message || "").trim();
    if (response.status >= 500) {
      throw new Error("AI service is temporarily unavailable. Please try again later.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("AI service is temporarily unavailable. Please try again later.");
    }
    if (response.status === 400 || response.status === 404) {
      throw new Error("AI request could not be completed. Please try again.");
    }
    throw new Error(
      sanitizedMessage
        ? `AI request could not be completed. ${sanitizedMessage}`
        : "AI request could not be completed. Please try again."
    );
  }

  return response.json();
}

async function deriveQuestionStyleProfile(extractedText, { scopeLabel = "" } = {}) {
  const blocks = extractQuestionStyleBlocks(extractedText, {
    maxBlocks: 10,
    maxChars: 5200,
  });
  if (!blocks.length) return null;

  const cacheKey = getCacheKey(blocks.join("\n\n"), {
    type: "question-style-profile",
    version: "v2",
    scopeLabel,
  });
  const cached = getCachedQuestionStyleProfile(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const data = await postChatRequest(
      {
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Infer a reusable question-style profile from the user's example questions only. Return JSON only.",
          },
          {
            role: "user",
            content: buildQuestionStyleProfilePrompt(blocks, { scopeLabel }),
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      { retries: 0 }
    );

    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const sanitized = sanitizeJson(content);
    const parsed = parseJsonSafe(sanitized, "question style profile JSON");
    const normalized = normalizeQuestionStyleProfile(parsed, { sourceBlocks: blocks });
    setCachedQuestionStyleProfile(cacheKey, normalized);
    return normalized;
  } catch {
    setCachedQuestionStyleProfile(cacheKey, null);
    return null;
  }
}

export async function generateQuestionStyleProfile(extractedText, { scopeLabel = "" } = {}) {
  const profile = await deriveQuestionStyleProfile(extractedText, { scopeLabel });
  return formatQuestionStyleProfile(profile);
}

export async function generateQuiz(
  extractedText,
  {
    multipleChoiceCount = 4,
    shortAnswerCount = 1,
    avoidQuestions = [],
    scopeLabel = "",
    questionStyleProfile = "",
    additionalRequest = "",
    outputLanguage = "ko",
    difficulty = null,
  } = {}
) {
  const mcCount = Math.max(0, Math.min(10, Number(multipleChoiceCount) || 0));
  const saCount = Math.max(0, Math.min(10, Number(shortAnswerCount) || 0));
  const normalizedDifficulty = ["하", "중", "상"].includes(difficulty) ? difficulty : null;
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const normalizedAdditionalRequest = normalizeAdditionalRequest(additionalRequest);

  // 캐싱 키 생성
  const cacheKey = getCacheKey(extractedText, {
    version: "quiz-style-v5",
    type: "quiz",
    mcCount,
    saCount,
    avoidQuestions,
    scopeLabel,
    additionalRequest: normalizedAdditionalRequest,
    outputLanguage,
    difficulty: normalizedDifficulty,
  });

  // 캐시 확인
  const cached = getCachedResult(cacheKey);
  if (cached) {
    console.log("Quiz cache hit");
    return cached;
  }

  const resolvedQuestionStyleProfile =
    String(questionStyleProfile || "").trim() ||
    formatQuestionStyleProfile(await deriveQuestionStyleProfile(extractedText, { scopeLabel }));
  const prompt = buildQuizPrompt(extractedText, {
    multipleChoiceCount: mcCount,
    shortAnswerCount: saCount,
    avoidQuestions,
    scopeLabel,
    questionStyleProfile: resolvedQuestionStyleProfile,
    additionalRequest: normalizedAdditionalRequest,
    outputLanguage,
    difficulty: normalizedDifficulty,
  });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Generate ${mcCount} ${outputLanguageLabel} multiple-choice items (4 options each) plus ${saCount} ${outputLanguageLabel} short-answer items from the user's text only.${normalizedDifficulty ? ` ALL items must be at difficulty level "${normalizedDifficulty}" as defined in the user message — do not mix difficulty levels.` : " Distribute difficulty across 하/중/상 levels (roughly 25%/50%/25%) and set the difficulty field on every item."} Each question must assess understanding/apply/disambiguate/misconception check, not verbatim recall. If a document question style profile is provided, the output must feel like that document's own problem style rather than a generic AI quiz style. Match the original stem tone, distractor logic, and reasoning grain without copying sample stems. Avoid asking for raw facts/URLs/names/numbers. Short-answer items must have one exact, short answer only, such as a number, formula, term, concept name, or short phrase. Do not generate essay-style prompts like 설명하라, 서술하라, 논하라, or 기술하라. The shortAnswer answer field must be directly gradable and must not be a sentence. Exclude textbook/preface metadata questions (target audience, whether exercises/cyber materials/code are included, author/publisher/contact, TOC/chapter structure). Before returning, reject any item whose tone or structure feels mismatched with the detected document question style. Respond with JSON only using the provided schema. shortAnswer must be an array with ${saCount} items (empty if 0).`,
        },
        { role: "user", content: prompt },
      ],
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
    .filter((item) => !isLowValueStudyPrompt(String(item?.question || item?.prompt || "").trim()))
    .filter(isObjectiveShortAnswerItem);
  
  const result = {
    ...parsed,
    multipleChoice,
    shortAnswer,
    questionStyleProfile: resolvedQuestionStyleProfile,
  };
  
  // 캐시 저장
  setCachedResult(cacheKey, result);
  return result;
}

export async function generateHardQuiz(
  extractedText,
  {
    count = 3,
    avoidQuestions = [],
    scopeLabel = "",
    questionStyleProfile = "",
    additionalRequest = "",
    outputLanguage = "ko",
  } = {}
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const resolvedQuestionStyleProfile =
    String(questionStyleProfile || "").trim() ||
    formatQuestionStyleProfile(await deriveQuestionStyleProfile(extractedText, { scopeLabel }));
  const normalizedAdditionalRequest = normalizeAdditionalRequest(additionalRequest);
  const prompt = buildHardQuizPrompt(extractedText, count, {
    avoidQuestions,
    questionStyleProfile: resolvedQuestionStyleProfile,
    scopeLabel,
    additionalRequest: normalizedAdditionalRequest,
    outputLanguage,
  });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `Generate high-difficulty ${outputLanguageLabel} multiple-choice questions from the user's text only. Every item must require multi-step reasoning, scenario modification, condition identification, or cross-concept synthesis — single-sentence lookup items are not acceptable. At least two distractors per item must be genuinely tempting to a student who partially understands the concept. Each question must have exactly one unambiguously correct answer. If a document question style profile is provided, keep the document's native phrasing, distractor shape, and misconception pattern instead of falling back to a generic AI exam tone. Include choiceExplanations (one sentence per choice) on every item. Exclude textbook/preface metadata questions. Output JSON only with the provided schema.`,
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

export async function generateOxQuiz(
  extractedText,
  {
    avoidStatements = [],
    count = 10,
    skipEnrichment = false,
    scopeLabel = "",
    additionalRequest = "",
    outputLanguage = "ko",
  } = {}
) {
  const oxCount = Math.max(1, Math.min(12, Number(count) || 0));
  const minFalseCount = Math.max(1, Math.min(4, Math.floor(oxCount / 2)));
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const normalizedAdditionalRequest = normalizeAdditionalRequest(additionalRequest);
  const hasPageTaggedContext = /\[p\.\d+\]/i.test(String(extractedText || ""));
  const chunked = hasPageTaggedContext
    ? limitText(extractedText, 12000)
    : chunkText(extractedText, { maxChunks: 5, maxChunkLength: 1400 });
  let summaryForOx = "";
  if (!hasPageTaggedContext && !skipEnrichment) {
    try {
      summaryForOx = await generateSummary(extractedText, { chapterized: false, outputLanguage });
    } catch {
      // Fallback to chunked context when summary generation fails.
    }
  }

  let highlightText = "";
  if (!hasPageTaggedContext && !skipEnrichment) {
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

  const contextForOx =
    !skipEnrichment && summaryForOx && summaryForOx.length >= 60 ? summaryForOx : chunked;
  if (!contextForOx || contextForOx.length < 60) {
    return {
      items: [],
      debug: true,
      reason: "Not enough clean context was available to generate reliable O/X items from the document text.",
    };
  }

  const prompt = buildOxPrompt(
    contextForOx,
    highlightText,
    avoidStatements,
    scopeLabel,
    normalizedAdditionalRequest,
    outputLanguage
  );

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `Generate ${oxCount} ${outputLanguageLabel} true/false (O/X) quiz statements strictly from the user's text. All statements, explanations, and evidence must be in ${outputLanguageLabel} (translate/rephrase even if the source is another language). Ensure at least ${minFalseCount} are false; if not possible, generate as many as possible but prefer false items. Each statement <=80 chars, explanation/evidence <=150 chars, no duplication, and every explanation cites the PDF as evidence where possible (e.g., p.3 definition paragraph, section 2.1 second sentence; if unavailable, evidence may be empty). Exclude low-value textbook metadata/trivia (target audience, whether exercises/cyber materials/code are included, author/publisher/contact, TOC/chapter structure).`,
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
      .filter((item) => !isLowValueStudyPrompt(String(item?.statement || item?.question || item?.prompt || "").trim()))
      .slice(0, oxCount);
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
    items: fallbackOxItems(extractedText, outputLanguage),
    debug: true,
    reason: "O/X generation failed; fallback items returned",
  };
}

export async function generateSummary(
  extractedText,
  { scope, chapterized = true, chapterSections = null, outputLanguage = "ko" } = {}
) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const normalized = normalizeSummarySource(extractedText);
  const hasManualChapters = Array.isArray(chapterSections) && chapterSections.length > 0;
  if (!normalized && !hasManualChapters) {
    throw new Error("No text available for summary. Load the PDF and extract text first.");
  }

  if (chapterized) {
    try {
      const chapterSummary = await generateChapterSummary(normalized, { scope, chapterSections, outputLanguage });
      if (chapterSummary) return chapterSummary;
    } catch {
      // fallback to legacy summary
    }
  }

  if (!normalized) {
    throw new Error("Summary source text is empty.");
  }

  const summaryContext = shrinkWithTail(normalized, MAX_LEGACY_SUMMARY_SOURCE_CHARS);
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
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  return sanitizeMarkdown(content);
}

export async function generateFlashcards(extractedText, { count = 8, outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const contextText = buildFlashcardsContext(extractedText, count);
  if (!contextText) {
    throw new Error("No text available for flashcards. Extract PDF text first.");
  }
  const prompt = buildFlashcardsPrompt(contextText, count, outputLanguage);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            `Create ${outputLanguageLabel} flashcards strictly from the user's text. Return JSON only with an array of {front, back, hint}. Keep front/back concise, avoid duplicates, and translate to ${outputLanguageLabel} if needed.`,
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
  const re = /\[(p\.\d+|img(?:\.\d+)?)\]\s*\n([\s\S]*?)(?=\n\s*\[(?:p\.\d+|img(?:\.\d+)?)\]\s*\n|$)/gi;
  for (const match of source.matchAll(re)) {
    const label = String(match?.[1] || "").trim().toLowerCase();
    const pageNumber = Number.parseInt(label.match(/^p\.(\d+)$/i)?.[1] || "", 10);
    const text = String(match?.[2] || "").trim();
    if (!label || !text) continue;
    blocks.push({ label, pageNumber, text });
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

function buildTutorEvidenceFallback({ question, contextText, reason = "", outputLanguage = "ko" }) {
  const source = String(contextText || "").trim();
  const copy = getTutorFallbackCopy(outputLanguage);
  if (!source) {
    return copy.noSource;
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
    return copy.noEvidence;
  }

  const lines = [copy.empty];
  for (const item of selected) {
    const label = Number.isFinite(item.pageNumber)
      ? `p.${item.pageNumber}`
      : /^img(?:\.\d+)?$/i.test(String(item.label || ""))
        ? "screenshot"
        : copy.evidenceLabel;
    const snippet = pickTutorEvidenceSnippet(item.text, terms, 320);
    lines.push(`- ${label}: ${snippet}`);
  }
  lines.push(copy.closing);
  if (reason) {
    lines.push(`(${copy.debugPrefix}: ${String(reason).slice(0, 140)})`);
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
  outputLanguage = "ko",
}) {
  const messages = [{ role: "system", content: buildTutorSystemPrompt(outputLanguage) }];
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

async function requestTutorVisionCompletion({
  model,
  context,
  question,
  history = [],
  extraSystem = "",
  maxTokens = 900,
  outputLanguage = "ko",
  imageAttachment = null,
}) {
  const imageUrl = String(imageAttachment?.dataUrl || "").trim();
  if (!imageUrl) {
    throw new Error("Tutor vision request is missing an image.");
  }

  const messages = [{ role: "system", content: buildTutorSystemPrompt(outputLanguage) }];
  const guard = String(extraSystem || "").trim();
  if (guard) {
    messages.push({ role: "system", content: guard });
  }
  if (context) {
    messages.push({ role: "system", content: `Document content:\n${context}` });
  }
  messages.push(...(Array.isArray(history) ? history : []));
  messages.push({
    role: "user",
    content: [
      { type: "text", text: question },
      {
        type: "image_url",
        image_url: {
          url: imageUrl,
          detail: "high",
        },
      },
    ],
  });

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
      { retries: 0, provider: "openai" }
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
          { retries: 0, provider: "openai" }
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
    throw new Error("Tutor vision completion failed: empty API response");
  }

  return {
    content: extractTutorCompletionText(data),
    finishReason: data?.choices?.[0]?.finish_reason || "",
    raw: data,
  };
}

export async function generateTutorReply({
  question,
  extractedText,
  messages = [],
  outputLanguage = "ko",
  imageAttachment = null,
}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const contextText = buildTutorContext(extractedText, { question, messages });
  if (!contextText) {
    throw new Error("Tutor context is empty. Reload PDF text before asking questions.");
  }

  const hasImageAttachment = Boolean(String(imageAttachment?.dataUrl || "").trim());
  const history = (messages || [])
    .filter((msg) => msg && (msg.role === "user" || msg.role === "assistant") && msg.content)
    .map((msg) => ({ role: msg.role, content: String(msg.content) }));

  if (hasImageAttachment) {
    const visionStrategies = [
      {
        context: limitText(contextText, 16000),
        history,
        extraSystem:
          `Analyze the attached screenshot first, then use the supplied OCR/document evidence to make the explanation more reliable. Answer in ${outputLanguageLabel}.`,
        maxTokens: 1000,
        rejectCoverageRefusal: true,
        outputLanguage,
      },
      {
        context: buildTutorRetrySnippet(contextText, question),
        history: [],
        extraSystem:
          `Focus on the attached screenshot and answer immediately in ${outputLanguageLabel}. If any part is hard to read, say what is uncertain briefly and continue with the clearest explanation possible.`,
        maxTokens: 1000,
        rejectCoverageRefusal: false,
        outputLanguage,
      },
    ];

    let lastVisionFinishReason = "";
    let lastVisionErrorMessage = "";
    for (const strategy of visionStrategies) {
      for (const model of TUTOR_VISION_MODELS) {
        try {
          const result = await requestTutorVisionCompletion({
            model,
            context: strategy.context,
            question,
            history: strategy.history,
            extraSystem: strategy.extraSystem,
            maxTokens: strategy.maxTokens,
            outputLanguage: strategy.outputLanguage,
            imageAttachment,
          });
          const content = String(result?.content || "").trim();
          lastVisionFinishReason = String(result?.finishReason || lastVisionFinishReason || "");
          if (!content) continue;
          if (strategy.rejectCoverageRefusal && looksLikeTutorCoverageRefusal(content)) continue;
          return content;
        } catch (err) {
          lastVisionErrorMessage = String(err?.message || lastVisionErrorMessage || "");
        }
      }
    }
    if (lastVisionErrorMessage || lastVisionFinishReason) {
      // Fall through to the text-only tutor path using OCR/document evidence.
    }
  }

  const strategies = [
    {
      context: contextText,
      history,
      extraSystem: "",
      maxTokens: 1000,
      rejectCoverageRefusal: true,
      outputLanguage,
    },
    {
      context: limitText(contextText, 12000),
      history,
      extraSystem:
        "Do not ask the user to paste text, choose an option, or say the section is missing. Answer now using available evidence plus clearly-labeled supplemental explanation.",
      maxTokens: 1000,
      rejectCoverageRefusal: false,
      outputLanguage,
    },
    {
      context: buildTutorRetrySnippet(contextText, question),
      history: [],
      extraSystem:
        `Answer immediately in ${outputLanguageLabel} with 4-7 concise bullet points and one short concluding sentence. Do not output empty text.`,
      maxTokens: 1000,
      rejectCoverageRefusal: false,
      outputLanguage,
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
          outputLanguage: strategy.outputLanguage,
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
  return buildTutorEvidenceFallback({ question, contextText, reason, outputLanguage });
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

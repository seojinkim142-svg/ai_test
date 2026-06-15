import { MODEL } from "../../constants";
import {
  getOutputLanguageLabel,
  resolveOutputLanguage,
  buildAvoidReuseBlock,
  buildAdditionalRequestBlock,
  normalizeAdditionalRequest,
  normalizeGeneratedItem,
  isLowValueStudyPrompt,
  isObjectiveShortAnswerItem,
  limitText,
  chunkText,
  parseJsonSafe,
  sanitizeJson,
  getCacheKey,
  getCachedResult,
  setCachedResult,
  getCachedQuestionStyleProfile,
  setCachedQuestionStyleProfile,
  postChatRequest,
  normalizeEvidenceText,
  toSortedUniquePages,
} from "./base.js";

// ─── 퀴즈 스타일 분석 ──────────────────────────────────────────────────────────

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

export function extractQuestionStyleBlocks(text, { maxBlocks = 10, maxChars = 5200 } = {}) {
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

export function normalizeQuestionStyleProfile(profile, { sourceBlocks = [] } = {}) {
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
      { maxItems: 4, maxLength: 140 }
    ),
    sourceExampleCount: Math.max(0, Array.isArray(sourceBlocks) ? sourceBlocks.length : 0),
    sourceExamplePreviews: normalizeStyleList(
      (Array.isArray(sourceBlocks) ? sourceBlocks : []).map((block) =>
        summarizeQuestionStyleSourceBlock(block, 150)
      ),
      { maxItems: 4, maxLength: 150 }
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

export function formatQuestionStyleProfile(profile) {
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
  sections.push(`- 감지된 예시 문제 블록 수: ${Number(profile.sourceExampleCount || 0)}개`);
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
- Write all field values in the same language as the example question blocks (detect automatically).

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

// ─── Quiz 프롬프트 빌더 ───────────────────────────────────────────────────────

export function buildQuizPrompt(
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
- evidencePages must use only page numbers that actually appear in the provided page tags. If no page tags exist, use an empty array for evidencePages and an empty string for evidenceSnippet — do not guess or invent page numbers.
- If the tagged evidence does not support the question, omit that item instead of using outside knowledge or other pages.
- Never guess missing page numbers, and never assign a broad page range when the exact supporting page is unclear.
- evidenceSnippet should be a short source phrase copied or lightly normalized from the document so it can be highlighted later.
- Short-answer items must have one exact, short answer only: a number, formula, term, concept name, or short phrase.
- Short-answer difficulty guideline: 하 = direct term or definition lookup; 중 = applying a concept to a given condition or deriving a value; 상 = multi-step derivation, identifying an exception, or synthesizing two concepts.
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

export function buildHardQuizPrompt(
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
- evidencePages: only page numbers that actually appear in the document's page tags. If no page tags exist, use an empty array — do not guess or invent page numbers.
- If tagged evidence does not support the question, omit the item — do not guess pages.
- evidenceSnippet: a short phrase copied or lightly normalized from the document. If no page tags exist, use an empty string.
- Never ask textbook/preface metadata: target audience, supplement availability, author/publisher info, TOC/chapter structure.
- If an additional user request is provided, follow it only when it stays grounded in the document and does not break these rules.

[Output format]
- ${count} multiple-choice questions, 4 options each.
- Include answerIndex, explanation, and choiceExplanations on every item.
- choiceExplanations: one sentence per choice explaining why it is correct or incorrect.
- Set difficulty to "상" on every item.
- Include evidencePages, evidenceSnippet, and evidenceLabel. If no page tags exist in the document, use an empty array for evidencePages and an empty string for evidenceSnippet.
- Return JSON only.

[JSON schema]
{
  "items": [
    {
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answerIndex": 1,
      "difficulty": "상",
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

export function buildOxPrompt(
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
    title: "Additional O/X request",
  });
  return `
You are a professor writing O/X (true/false) quiz items to test whether students can distinguish correct from plausible-but-wrong claims about the document.

[What makes a good O/X item]
- The statement must be checkable against a specific sentence or passage in the document.
- True items: state a fact precisely as the document describes it, including any conditions or qualifiers.
- False items: introduce a specific, targeted error — wrong number, reversed relationship, swapped term, or missing condition. Do NOT use obviously absurd false statements.
- Each item must have exactly one clearly correct answer.
- Prefer concrete details (numbers, conditions, named concepts) over vague generalizations.
- Keep each statement under 80 characters when possible.

[Rules]
- Use only the selected chapter range. Do not use content outside that range.
- If a statement cannot be directly supported by the document, omit it.
- Generate up to 10 items; include at least 4 false items when the source supports it.
- Avoid near-duplicate statements that test the same fact.
- Exclude low-value metadata: author/publisher info, textbook target audience, TOC/chapter structure, supplement availability.
- If the document contains page tags like [p.12], select the supporting passage first and cite only those visible page numbers.
- If no page tags exist, use an empty array for evidencePages and an empty string for evidenceSnippet — do not guess page numbers.
- If tagged evidence does not support the statement, omit the item.
- If an additional user request is provided, follow it only when it stays grounded in the document and does not break the O/X format.
${highlightText ? `- Prioritize generating items from the following highlighted sentences:\n${highlightText}` : ""}

[Output format]
- Return JSON only.
- Include explanation on every item: for false items, state what the correct version is.
- Include evidencePages, evidenceSnippet, and evidenceLabel on every item.

[JSON schema]
{
  "items": [
    {
      "statement": "...",
      "answer": true,
      "explanation": "...",
      "evidencePages": [12],
      "evidenceSnippet": "...",
      "evidenceLabel": "p.12 정의 문단"
    }
  ]
}

[Language]
- Write all statement/explanation text in ${outputLanguageLabel}.
${avoidBlock ? `\n\n${avoidBlock}` : ""}
${additionalRequestBlock ? `\n\n${additionalRequestBlock}` : ""}
${scopeLabel ? `\n\n[Selected chapter range]\n${scopeLabel}` : ""}

[Document]
${contextText}
  `.trim();
}

export function fallbackOxItems(extractedText, outputLanguage = "ko") {
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
    answer: idx % 2 === 0,
    explanation: fallbackCopy.sentenceExplanation,
    evidence: "",
    evidencePages: [],
    evidenceSnippet: "",
  }));
}

// ─── deriveQuestionStyleProfile (내부) ───────────────────────────────────────

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

// ─── Quiz Generate exports ─────────────────────────────────────────────────

export async function generateQuestionStyleProfile(extractedText, { scopeLabel = "" } = {}) {
  const profile = await deriveQuestionStyleProfile(extractedText, { scopeLabel });
  return formatQuestionStyleProfile(profile);
}

function interleaveDifficulty(items, fixedDifficulty) {
  if (fixedDifficulty || items.length <= 1) return items;
  const buckets = { 하: [], 중: [], 상: [] };
  const rest = [];
  items.forEach((item) => {
    const d = item.difficulty;
    if (buckets[d]) buckets[d].push(item);
    else rest.push(item);
  });
  const order = ["하", "중", "상"];
  const result = [];
  let maxLen = Math.max(...order.map((d) => buckets[d].length));
  for (let i = 0; i < maxLen; i++) {
    for (const d of order) {
      if (buckets[d][i] !== undefined) result.push(buckets[d][i]);
    }
  }
  return [...result, ...rest];
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

  const cacheKey = getCacheKey(extractedText, {
    version: "quiz-style-v6",
    type: "quiz",
    mcCount,
    saCount,
    avoidQuestions,
    scopeLabel,
    additionalRequest: normalizedAdditionalRequest,
    outputLanguage,
    difficulty: normalizedDifficulty,
  });

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
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "quiz JSON");
  const multipleChoice = interleaveDifficulty(
    (Array.isArray(parsed?.multipleChoice) ? parsed.multipleChoice : [])
      .map(normalizeGeneratedItem)
      .filter((item) => !isLowValueStudyPrompt(String(item?.question || item?.prompt || "").trim())),
    normalizedDifficulty
  );
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

  setCachedResult(cacheKey, result);
  return result;
}

const DIAGNOSTIC_DIFFICULTY_PLAN = ["하", "중", "중", "상"];

function buildDiagnosticQuizPrompt(extractedText, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);

  return `
You are a professor creating a short diagnostic quiz from lecture material.

[Difficulty definitions]
하 (Basic)
- Tests recognition of key terms, definitions, or simple facts stated in the document.

중 (Intermediate)
- Tests understanding of relationships between concepts, or application to a standard scenario.

상 (Advanced)
- Tests synthesis, multi-step reasoning, edge cases, or application to a combined/modified scenario.

[Rules]
- Generate exactly ${DIAGNOSTIC_DIFFICULTY_PLAN.length} multiple-choice questions (4 options each), one per difficulty level in this exact order: ${DIAGNOSTIC_DIFFICULTY_PLAN.join(", ")}.
- Each question must cover a different topic/concept from the document so the result reflects overall understanding, not a single section.
- Each question must have exactly one unambiguously correct answer.
- Do not ask verbatim recall — always rephrase and shift the angle of asking.
- Avoid pure memorization prompts (raw URLs, names, single numbers).
- For each question, include a short "topic" label (2-6 words) naming the concept being tested.
- Include answerIndex, explanation, and difficulty ("하", "중", or "상" matching the order above).

[Output format]
- Return JSON only.

[JSON schema]
{
  "items": [
    {
      "question": "...",
      "choices": ["...", "...", "...", "..."],
      "answerIndex": 1,
      "difficulty": "하",
      "topic": "...",
      "explanation": "..."
    }
  ]
}

[Language]
- Write all question/topic/explanation text in ${outputLanguageLabel}.

[Document]
${extractedText}
  `.trim();
}

export async function generateDiagnosticQuiz(extractedText, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);

  const cacheKey = getCacheKey(extractedText, {
    version: "diagnostic-v1",
    type: "diagnostic",
    outputLanguage,
  });

  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  const prompt = buildDiagnosticQuizPrompt(extractedText, { outputLanguage });

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Generate exactly ${DIAGNOSTIC_DIFFICULTY_PLAN.length} ${outputLanguageLabel} multiple-choice diagnostic questions (4 options each) from the user's text only, one per difficulty level in order ${DIAGNOSTIC_DIFFICULTY_PLAN.join(", ")}. Each question must test a different topic and include a short topic label. Respond with JSON only using the provided schema.`,
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    },
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "diagnostic quiz JSON");
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .map(normalizeGeneratedItem)
    .filter((item) => !isLowValueStudyPrompt(String(item?.question || "").trim()))
    .slice(0, DIAGNOSTIC_DIFFICULTY_PLAN.length);

  const result = { items };
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
    { retries: 1 }
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
      const { generateSummary } = await import("./summary.js");
      summaryForOx = await generateSummary(extractedText, { chapterized: false, outputLanguage });
    } catch {
      // Fallback to chunked context
    }
  }

  let highlightText = "";
  if (!hasPageTaggedContext && !skipEnrichment) {
    try {
      const { generateHighlights } = await import("./docs.js");
      const hl = await generateHighlights(extractedText);
      const hs = Array.isArray(hl?.highlights) ? hl.highlights : [];
      if (hs.length > 0) {
        highlightText = hs
          .map((h, idx) => `${idx + 1}. ${h.sentence}${h.reason ? ` (reason: ${h.reason})` : ""}`)
          .join("\n");
      }
    } catch {
      // Skip highlight enrichment
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
            `Generate ${oxCount} ${outputLanguageLabel} true/false (O/X) quiz items from the user's text only. At least ${minFalseCount} items must be false; false items must introduce a specific targeted error (wrong number, reversed relationship, swapped term, or missing condition) — not an obviously absurd claim. True items must state facts precisely as the document describes them, including any conditions or qualifiers. Each statement ≤80 characters. Include explanation on every item; for false items the explanation must state the correct version. Include evidencePages (empty array if no page tags exist) and evidenceSnippet on every item. Exclude author/publisher info, TOC structure, and textbook metadata. Output JSON only using the provided schema.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      response_format: { type: "json_object" },
    },
    { retries: 1 }
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
      return { ...parsed, items };
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

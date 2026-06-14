import { MODEL } from "../../constants";
import {
  getOutputLanguageLabel,
  getTutorFallbackCopy,
  TUTOR_FALLBACK_MODELS,
  TUTOR_VISION_MODELS,
  limitText,
  postChatRequest,
} from "./base.js";

// ─── Tutor 시스템 프롬프트 ─────────────────────────────────────────────────────

export function buildTutorSystemPrompt(outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are an AI tutor helping the user deeply understand their study material.
- Answer in ${outputLanguageLabel}. Use a clear, approachable tone by default; adjust if the user explicitly asks for a different style (casual, formal, concise).
- Treat provided document excerpts as the primary source. If the input contains page-tagged raw text like [p.123], prioritize those passages and reason from them directly.
- Do not rely on pre-made summaries unless the raw evidence itself is missing.
- When explaining a concept, go beyond restating the document: teach it. Use step-by-step reasoning, concrete examples, or analogies when they clarify the idea.
- If the user greets or sends a short social message, respond warmly and ask what topic they want to study.
- If the exact requested page/section is missing, do NOT refuse. Provide a best-effort explanation using: (1) related content found in the document context, and (2) clearly labeled general/domain knowledge as a supplement.
- Never pretend to quote text that is not visible in the provided context.
- State uncertainty briefly when it exists, then continue with a useful explanation.
- Only ask a follow-up question when it would genuinely help clarify an ambiguous request — do not append a follow-up to every response.
- Always return a non-empty answer. If evidence is weak, still explain as best you can.
- Format math with LaTeX delimiters:
  - inline: $...$
  - display: $$...$$
- Prefer canonical LaTeX symbols (\\sum, \\frac, \\sqrt, \\le, \\ge) over plain ASCII.
  `.trim();
}

// ─── Tutor 검색어/컨텍스트 빌더 ──────────────────────────────────────────────

const TUTOR_SEARCH_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "this", "that", "what", "how", "why",
  "when", "where", "which", "about", "please", "could", "would", "should",
  "there", "their", "these", "those", "into", "onto", "have", "has", "had",
  "are", "is", "was", "were", "you", "your", "explain", "question", "problem", "page",
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

export function buildTutorContext(extractedText, { question = "", messages = [] } = {}) {
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

// ─── Tutor 헬퍼 ──────────────────────────────────────────────────────────────

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

// ─── requestTutorCompletion ────────────────────────────────────────────────────

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

  const basePayload = { model, messages, temperature: 0.2 };
  let data = null;
  let lastError = null;

  try {
    data = await postChatRequest(
      { ...basePayload, max_completion_tokens: maxTokens },
      { retries: 0 }
    );
  } catch (err) {
    lastError = err;
    if (isTutorTokenLimitParamError(err)) {
      try {
        data = await postChatRequest(
          { ...basePayload, max_tokens: maxTokens },
          { retries: 0 }
        );
      } catch (fallbackErr) {
        lastError = fallbackErr;
      }
    }
  }

  if (!data && lastError) throw lastError;
  if (!data) throw new Error("Tutor completion failed: empty API response");

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
        image_url: { url: imageUrl, detail: "high" },
      },
    ],
  });

  const basePayload = { model, messages, temperature: 0.2 };
  let data = null;
  let lastError = null;

  try {
    data = await postChatRequest(
      { ...basePayload, max_completion_tokens: maxTokens },
      { retries: 0, provider: "openai" }
    );
  } catch (err) {
    lastError = err;
    if (isTutorTokenLimitParamError(err)) {
      try {
        data = await postChatRequest(
          { ...basePayload, max_tokens: maxTokens },
          { retries: 0, provider: "openai" }
        );
      } catch (fallbackErr) {
        lastError = fallbackErr;
      }
    }
  }

  if (!data && lastError) throw lastError;
  if (!data) throw new Error("Tutor vision completion failed: empty API response");

  return {
    content: extractTutorCompletionText(data),
    finishReason: data?.choices?.[0]?.finish_reason || "",
    raw: data,
  };
}

// ─── generateTutorReply export ────────────────────────────────────────────────

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
      // Fall through to the text-only tutor path
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

import { Capacitor } from "@capacitor/core";
import { MODEL } from "../../constants";
import { resolvePublicAppOrigin } from "../../utils/appOrigin";
import { getAccessToken } from "../supabase";

// ─── URL / Provider 설정 ──────────────────────────────────────────────────────

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
export const DEFAULT_CHAT_TARGET = createChatTarget("deepseek", DEEPSEEK_BASE_URL);
export const OPENAI_CHAT_TARGET = createChatTarget("openai", OPENAI_BASE_URL);
export const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
export const TUTOR_FALLBACK_MODELS = [
  MODEL,
  import.meta.env.VITE_DEEPSEEK_TUTOR_MODEL || import.meta.env.VITE_OPENAI_TUTOR_MODEL || "",
  "deepseek-chat",
  "deepseek-reasoner",
]
  .map((name) => String(name || "").trim())
  .filter(Boolean)
  .filter((name, index, arr) => arr.indexOf(name) === index);
export const TUTOR_VISION_MODELS = [
  import.meta.env.VITE_OPENAI_TUTOR_VISION_MODEL || import.meta.env.VITE_OPENAI_VISION_MODEL || "",
  "gpt-4.1-mini",
  "gpt-4o-mini",
]
  .map((name) => String(name || "").trim())
  .filter(Boolean)
  .filter((name, index, arr) => arr.indexOf(name) === index);

// ─── 언어 유틸 ───────────────────────────────────────────────────────────────

const OUTPUT_LANGUAGE_SPECS = {
  en: { code: "en", label: "English" },
  zh: { code: "zh", label: "Chinese" },
  ja: { code: "ja", label: "Japanese" },
  hi: { code: "hi", label: "Hindi" },
  ko: { code: "ko", label: "Korean" },
};

export function resolveOutputLanguage(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return OUTPUT_LANGUAGE_SPECS[normalized] || OUTPUT_LANGUAGE_SPECS.ko;
}

export function getOutputLanguageLabel(value) {
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

export function getTutorFallbackCopy(outputLanguage) {
  const normalized = resolveOutputLanguage(outputLanguage).code;
  return OUTPUT_LANGUAGE_TUTOR_FALLBACK_COPY[normalized] || OUTPUT_LANGUAGE_TUTOR_FALLBACK_COPY.ko;
}

// ─── 프롬프트 빌더 유틸 ───────────────────────────────────────────────────────

export function buildAvoidReuseBlock(items, { title = "Do not reuse these prompts", maxItems = 40, maxLength = 120 } = {}) {
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

export function normalizeAdditionalRequest(value, maxLength = 500) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, maxLength);
}

export function buildAdditionalRequestBlock(value, { title = "Additional user request", maxLength = 500 } = {}) {
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

export function isLowValueStudyPrompt(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  return LOW_VALUE_STUDY_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function toSortedUniquePages(pages) {
  return [
    ...new Set(
      (Array.isArray(pages) ? pages : [])
        .map((page) => Number.parseInt(page, 10))
        .filter((page) => Number.isFinite(page) && page > 0)
    ),
  ].sort((a, b) => a - b);
}

export function extractEvidencePagesFromText(value) {
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

export function normalizeEvidenceText(value, maxLength = 180) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeEvidenceFields(item) {
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

export function normalizeGeneratedItem(item) {
  return {
    ...item,
    ...normalizeEvidenceFields(item),
  };
}

// ─── localStorage 기반 영속 캐시 (24시간 TTL) ────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간
const CACHE_PREFIX = "ai_cache_v1_";
const CACHE_MAX_ITEM_BYTES = 100 * 1024; // 100KB

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash.toString(36);
}

export function getCacheKey(text, options) {
  const raw = text + JSON.stringify(options);
  return `${CACHE_PREFIX}${djb2Hash(raw)}`;
}

export function getCachedResult(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

export function setCachedResult(key, result) {
  try {
    const serialized = JSON.stringify({ result, timestamp: Date.now() });
    if (serialized.length > CACHE_MAX_ITEM_BYTES) return; // 100KB 초과 시 skip
    localStorage.setItem(key, serialized);
  } catch {
    // localStorage 용량 초과 등 무시
  }
}

export function getCachedQuestionStyleProfile(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry.result;
  } catch {
    return undefined;
  }
}

export function setCachedQuestionStyleProfile(key, result) {
  try {
    const serialized = JSON.stringify({ result, timestamp: Date.now() });
    if (serialized.length > CACHE_MAX_ITEM_BYTES) return;
    localStorage.setItem(key, serialized);
  } catch {
    // ignore
  }
}

// ─── HTTP 레이어 ──────────────────────────────────────────────────────────────

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

export async function postChatRequest(
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

  if (target.usesAppProxy) {
    try {
      const accessToken = await getAccessToken();
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }
    } catch {
      // 토큰 취득 실패 시 무시
    }
  }

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

// ─── 공용 유틸 ───────────────────────────────────────────────────────────────

export function parseJsonSafe(content, context = "response") {
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

export function limitText(text, maxChars) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function isQuizWorthyParagraph(p) {
  return (
    p.length >= 30 &&
    !/lecture|winter|stanford|credits?|author|instructor|contact|office hours|acknowledg|reference|bibliograph|copyright|email/i.test(
      p
    )
  );
}

export function chunkText(text, { maxChunks = 5, maxChunkLength = 1400 } = {}) {
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

export function sanitizeJson(content) {
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

export function sanitizeMarkdown(content) {
  const cleaned = String(content || "").replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
  return stripSummaryPreface(cleaned);
}

function stripSummaryPreface(content) {
  const text = String(content || "");
  if (!text) return "";
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let idx = 0;
  while (idx < lines.length && lines[idx].trim() === "") idx += 1;
  if (idx >= lines.length) return text;
  const prefaceRe = /^\s*\[?\s*\uC0AC\uC804\s*\uD310\uB2E8\s*\]?\s*/;
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

// ─── Short answer 검사 ────────────────────────────────────────────────────────

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

export function isObjectiveShortAnswerItem(item) {
  const question = String(item?.question || item?.prompt || "").trim();
  if (!question) return false;
  if (ESSAY_STYLE_SHORT_ANSWER_RE.test(question)) return false;
  return isConciseShortAnswerValue(item?.answer);
}

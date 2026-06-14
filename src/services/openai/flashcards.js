import { MODEL } from "../../constants";
import {
  getOutputLanguageLabel,
  limitText,
  chunkText,
  parseJsonSafe,
  sanitizeJson,
  postChatRequest,
} from "./base.js";

// ─── Flashcards 빌더 ──────────────────────────────────────────────────────────

export function buildFlashcardsContext(extractedText, count) {
  const trimmed = (extractedText || "").trim();
  if (!trimmed) return "";
  const chunked = chunkText(trimmed, {
    maxChunks: Math.min(8, Math.max(3, count)),
    maxChunkLength: 1400,
  });
  return chunked || limitText(trimmed, 6000);
}

export function buildFlashcardsPrompt(contextText, count, outputLanguage = "ko") {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  return `
You are a study coach creating high-quality flashcards that help students memorize key facts with exact, word-for-word recall.

[What makes a good flashcard]
- front: a focused question or cue that can be long or short — include enough context so the question is unambiguous. Ask "What is X?", "Why does X happen?", "What condition causes X?", "What is the formula for X?", or "What is the difference between X and Y?".
- back: a SHORT, exact answer the student can memorize verbatim. Must be one of: a single term or word, a formula or equation, a number or value, a brief definition (one phrase, not a sentence), or a short enumeration (e.g. "A, B, C"). NEVER write a full sentence or paragraph on the back.
- hint: include only when the concept has a common misconception or a memorable trick worth flagging. Leave empty string otherwise.

[Card selection rules]
- Create exactly ${count} cards.
- Focus on: key concepts, definitions, mechanisms, conditions, formulas, and distinctions that are likely to appear in exams.
- Exclude: author/publisher info, TOC entries, page numbers, and any content that is purely administrative or structural.
- Do not generate two cards that test the same underlying fact, even if phrased differently.
- If the source contains formulas, include at least one card per important formula with the formula/equation as the back.
- Translate all text to ${outputLanguageLabel} regardless of the source language.

[Back field examples — good vs bad]
Good backs: "H₂O", "광합성", "F = ma", "1865년", "산화·환원", "포도당 + 산소 → 이산화탄소 + 물"
Bad backs: "물은 수소 2개와 산소 1개로 이루어진 화합물이다.", "이 공식은 힘이 질량과 가속도의 곱과 같다는 것을 나타낸다."

[Output format]
- Return JSON only.

[JSON schema]
{
  "cards": [
    { "front": "...", "back": "...", "hint": "" }
  ]
}

[Document]
${contextText}
  `.trim();
}

// ─── Flashcards 청크 유틸 ────────────────────────────────────────────────────

function splitTextIntoChunks(text, chunkSize, overlap = 300) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      const boundary = newline > start + chunkSize * 0.5 ? newline : end;
      end = boundary;
    }
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    const overlapStart = text.lastIndexOf("\n", end - overlap);
    start = overlapStart > start ? overlapStart : end;
  }
  return chunks.filter(Boolean);
}

function recoverCardsFromTruncatedJson(raw) {
  try {
    const lastBrace = raw.lastIndexOf("}");
    if (lastBrace === -1) return [];
    const recovered = raw.slice(0, lastBrace + 1) + "]}";
    const cardsStart = recovered.indexOf('"cards"');
    if (cardsStart === -1) return [];
    const arrStart = recovered.indexOf("[", cardsStart);
    if (arrStart === -1) return [];
    const partial = '{"cards":' + recovered.slice(arrStart);
    const parsed = JSON.parse(partial);
    return Array.isArray(parsed?.cards) ? parsed.cards : [];
  } catch {
    return [];
  }
}

// ─── Flashcards Generate exports ──────────────────────────────────────────────

export async function generateVocabularyFlashcards(extractedText, { outputLanguage = "ko", topicStructure = null, onProgress } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const CHUNK_SIZE = 20000;
  const fullText = String(extractedText || "").trim();
  if (!fullText) {
    throw new Error("No text available. Extract PDF text first.");
  }

  const categories = Array.isArray(topicStructure?.topics)
    ? topicStructure.topics.map((t) => String(t.title || "").trim()).filter(Boolean)
    : [];

  const categoryInstruction = categories.length > 0
    ? `\nAlso assign a "category" field to each card — pick the best matching category from this list: ${JSON.stringify(categories)}. If none fits, use empty string "".`
    : `\n"category" field should always be empty string "".`;

  const schemaExample = `{ "cards": [ { "front": "...", "back": "...", "hint": "...", "category": "..." } ] }`;

  const systemPrompt =
    `You are a vocabulary extractor. The user will paste text from a vocabulary list or glossary (단어장). ` +
    `Your job is to extract EVERY SINGLE word-meaning pair found in the text — be completely exhaustive, do not skip or summarize. ` +
    `"front" = the word or term exactly as written (원어 그대로). Must be a real word or phrase, NOT a question or sentence. ` +
    `"back" = the linguistic meaning/translation of that word in ${outputLanguageLabel}. Must be a definition or translation — NEVER a number, score, rank, or O/X flag. ` +
    `"hint" = a short usage example sentence if present in the source, otherwise empty string. ` +
    `SKIP only: quiz questions, fill-in-the-blank exercises, frequency ranks, Oxford/BBC scores, O/X membership flags, page numbers, metadata. ` +
    `SKIP any card where "back" would be just a number, just "O", just "X", or any non-linguistic value. ` +
    `Do NOT invent or generate content not in the source text. Do NOT stop early — output every word you find.` +
    categoryInstruction +
    ` Return JSON only: ${schemaExample}`;

  const chunks = splitTextIntoChunks(fullText, CHUNK_SIZE);
  const allCards = [];
  const seenFronts = new Set();

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ current: i + 1, total: chunks.length });
    const data = await postChatRequest(
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `다음 단어장 텍스트에서 단어-뜻 쌍만 추출해줘 (퀴즈/문제/순위/점수는 제외):\n\n${chunks[i]}` },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
        max_tokens: 16384,
      },
      { retries: 1 }
    );
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const sanitized = sanitizeJson(content);
    let cards = [];
    try {
      const parsed = parseJsonSafe(sanitized, `vocabulary flashcards chunk ${i + 1}`);
      cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
    } catch {
      cards = recoverCardsFromTruncatedJson(sanitized);
    }
    for (const card of cards) {
      const front = String(card?.front || "").trim();
      const back = String(card?.back || "").trim();

      const frontIsQuestion = front.endsWith("?") || front.includes("은?") || front.includes("는?") || front.includes("을?") || front.includes("를?");
      const backIsTrivial = /^[\dO\-X]+$/.test(back) || /^\d[\d,\s]+$/.test(back);

      if (front && back && !frontIsQuestion && !backIsTrivial && !seenFronts.has(front.toLowerCase())) {
        seenFronts.add(front.toLowerCase());
        allCards.push(card);
      }
    }
  }

  return { cards: allCards };
}

export async function generateFlashcards(extractedText, { count = 8, outputLanguage = "ko", isVocabulary = false } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const contextText = buildFlashcardsContext(extractedText, count);
  if (!contextText) {
    throw new Error("No text available for flashcards. Extract PDF text first.");
  }
  const prompt = buildFlashcardsPrompt(contextText, count, outputLanguage);

  const systemContent = isVocabulary
    ? `You are a vocabulary flashcard maker. Extract word-meaning pairs ONLY. ` +
      `"front" = the word or phrase exactly as written. ` +
      `"back" = its meaning or translation in ${outputLanguageLabel} — must be a real linguistic definition, NOT a number, score, rank, or list of words. ` +
      `"hint" = short usage example if available, otherwise empty string. ` +
      `SKIP: quiz questions, frequency ranks, rating scores (★ etc), Oxford/BBC/Naver flags, O/X values, lists of example words. ` +
      `NEVER make the front a question sentence. Return JSON only with the provided schema.`
    : `Create ${outputLanguageLabel} study flashcards from the user's text only. Front must be a focused question or cue (not just a term label) — any length is fine. Back must be a SHORT exact answer the student can memorize verbatim: a single term, formula, number, brief definition phrase, or short enumeration. NEVER write a full sentence on the back. Include hint only for common misconceptions or memorable tricks — empty string otherwise. Exclude metadata (author, publisher, TOC, page numbers). No near-duplicate cards. Translate all text to ${outputLanguageLabel}. Return JSON only with the provided schema.`;

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: prompt },
      ],
      temperature: isVocabulary ? 0.2 : 1,
      response_format: { type: "json_object" },
    },
    { retries: 0 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  return parseJsonSafe(sanitized, "flashcards JSON");
}

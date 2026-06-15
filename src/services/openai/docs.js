import { MODEL } from "../../constants";
import {
  getOutputLanguageLabel,
  limitText,
  parseJsonSafe,
  sanitizeJson,
  postChatRequest,
} from "./base.js";

// ─── 문서 분석 도메인 ─────────────────────────────────────────────────────────

export async function generateHighlights(extractedText) {
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Select up to 5 verbatim sentences from the user's text that are most likely to appear in exam questions or that best capture key testable facts. Respond with JSON only.",
        },
        {
          role: "user",
          content: `
Extract up to 5 key evidence sentences from the document text.
- Choose sentences that contain a testable fact, definition, condition, or formula.
- Include a short reason explaining why each sentence is high-yield.
- Return JSON only: { "highlights": [ { "sentence": "...", "reason": "..." } ] }

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

export async function generateConceptTags(extractedText, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Extract 5-10 core concepts or keywords from the document. Return JSON only: {"tags": ["tag1", "tag2", ...]}`,
        },
        {
          role: "user",
          content: `Extract the most important study concepts from this document. Tags should be short (1-3 words), in ${outputLanguageLabel}.\n\nDocument:\n${limitText(extractedText, 8000)}`,
        },
      ],
      temperature: 0.3,
    },
    { retries: 1 }
  );
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  try {
    const parsed = JSON.parse(sanitized);
    const tags = parsed?.tags;
    if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10);
  } catch {
    // ignore
  }
  return [];
}

export async function generateDocComparison(docs, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const docBlocks = docs
    .map((doc, i) => `### 문서 ${i + 1}: ${doc.name}\n${limitText(doc.text, 5000)}`)
    .join("\n\n---\n\n");
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a study assistant. Compare documents and identify similarities, differences, and key exam points. Answer in ${outputLanguageLabel}.`,
        },
        {
          role: "user",
          content: `Compare the following documents and organize in ${outputLanguageLabel}:\n\n${docBlocks}\n\nStructure your response with:\n1. Common core concepts\n2. Differences / unique content per document\n3. Key exam points`,
        },
      ],
      temperature: 0.5,
    },
    { retries: 1 }
  );
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export async function generateDocAnswer(question, summaryText, { outputLanguage = "ko" } = {}) {
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const trimmed = String(summaryText || "").trim();
  if (!trimmed || !question) throw new Error("질문 또는 요약이 없습니다.");
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a study assistant. Answer questions based ONLY on the provided document summary. Be concise and cite page numbers as [p.N] when available. Respond in ${outputLanguageLabel}.`,
        },
        {
          role: "user",
          content: `## 문서 요약\n${trimmed.slice(0, 6000)}\n\n## 질문\n${question}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 600,
    },
    { retries: 1 }
  );
  return String(data.choices?.[0]?.message?.content || "").trim();
}

export async function generateSemanticSearch(query, docsInfo, { outputLanguage = "ko" } = {}) {
  if (!query || !docsInfo?.length) return [];
  const outputLanguageLabel = getOutputLanguageLabel(outputLanguage);
  const docsText = docsInfo
    .map(
      (doc) =>
        `ID:${doc.id} | 이름:${doc.name}${doc.summary ? ` | 요약:${String(doc.summary).slice(0, 200)}` : ""}${doc.tags?.length ? ` | 태그:${doc.tags.join(",")}` : ""}`
    )
    .join("\n");
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Find the most relevant documents for a search query. Return JSON only: {"results": [{"id": "...", "score": 0.0, "reason": "..."}]}`,
        },
        {
          role: "user",
          content: `Query: "${query}"\n\nDocuments:\n${docsText}\n\nReturn up to 5 most relevant documents. Write reason in ${outputLanguageLabel}.`,
        },
      ],
      temperature: 0.3,
    },
    { retries: 1 }
  );
  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  try {
    const parsed = JSON.parse(sanitized);
    return Array.isArray(parsed?.results) ? parsed.results : [];
  } catch {
    // ignore
  }
  return [];
}

function buildTopicStructurePrompt(analysisText) {
  return `You are a study assistant. Analyze the following document excerpt and extract its main learning topics for exam preparation.

Return JSON only with this exact schema:
{
  "rootTopic": "<overall document subject, 2-5 words in Korean>",
  "topics": [
    {
      "id": "topic-0",
      "title": "<topic name, 2-5 words in Korean>",
      "conceptCount": <integer 2-15, estimated number of key concepts in this topic>,
      "importance": <integer 1-5, where 5 = highest exam importance>,
      "expectedQuestions": <integer 1-20, estimated number of exam questions from this topic>,
      "keyConcepts": ["<key term 1>", "<key term 2>", ...]
    }
  ]
}

Rules:
- Extract 3 to 8 main topics covering the document's major sections.
- importance: 5 = core exam material tested every year, 1 = supplementary background only.
- expectedQuestions: realistic estimate based on topic depth and importance.
- keyConcepts: 2 to 5 short key terms per topic (1-4 words each, Korean preferred).
- All text (rootTopic, title, keyConcepts) must be in Korean.
- Return valid JSON only, no explanation or markdown fences.

[Document excerpt — representative portions of the document]
${analysisText}`;
}

export async function generateTopicStructure(extractedText) {
  const rawText = String(extractedText || "").trim();
  if (!rawText) throw new Error("텍스트가 없습니다.");
  const HEAD_CHARS = 3000;
  const TAIL_CHARS = 2000;
  const analysisText =
    rawText.length <= HEAD_CHARS + TAIL_CHARS
      ? rawText
      : rawText.slice(0, HEAD_CHARS) + "\n\n...\n\n" + rawText.slice(-TAIL_CHARS);

  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Extract a structured topic list from a study document for exam preparation. Return valid JSON only.",
        },
        { role: "user", content: buildTopicStructurePrompt(analysisText) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    },
    { retries: 1 }
  );

  const content = data.choices?.[0]?.message?.content?.trim() || "";
  const sanitized = sanitizeJson(content);
  const parsed = parseJsonSafe(sanitized, "topic structure JSON");

  const rootTopic = String(parsed?.rootTopic || "").trim();
  const topics = Array.isArray(parsed?.topics) ? parsed.topics : [];

  if (!rootTopic || topics.length === 0) throw new Error("주제 구조를 추출하지 못했습니다.");

  return {
    version: 1,
    rootTopic,
    generatedAt: new Date().toISOString(),
    topics: topics.slice(0, 10).map((t, i) => ({
      id: `topic-${i}`,
      title: String(t?.title || "").trim(),
      conceptCount: Math.max(1, Math.min(20, Number(t?.conceptCount) || 3)),
      importance: Math.max(1, Math.min(5, Number(t?.importance) || 3)),
      expectedQuestions: Math.max(1, Math.min(30, Number(t?.expectedQuestions) || 3)),
      keyConcepts: Array.isArray(t?.keyConcepts)
        ? t.keyConcepts
            .map((c) => String(c).trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
    })),
  };
}

export async function explainConcept(concept, topicTitle, contextText) {
  const context = limitText(String(contextText || "").trim(), 3000);
  const data = await postChatRequest(
    {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a concise study assistant. Explain concepts clearly for exam preparation in Korean.",
        },
        {
          role: "user",
          content: `다음 개념을 시험 준비 관점에서 간결하게 설명해줘.

주제: ${topicTitle}
개념: ${concept}
${context ? `\n[문서 참고 내용]\n${context}` : ""}

형식:
- 핵심 정의 1~2문장
- 시험에 자주 나오는 포인트 2~3개 (• 불릿)
- 관련 용어나 비교 개념 (있으면)

모두 한국어로, 간결하게.`,
        },
      ],
      temperature: 0.4,
      max_tokens: 400,
    },
    { retries: 1 }
  );

  return data.choices?.[0]?.message?.content?.trim() || "";
}

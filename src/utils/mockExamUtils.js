import { LETTERS } from "../constants";

function parseAnswerIndexValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) {
    if (parsed >= 0 && parsed <= 3) return parsed;
    if (parsed >= 1 && parsed <= 4) return parsed - 1;
  }

  const upper = raw.toUpperCase();
  if (upper === "A") return 0;
  if (upper === "B") return 1;
  if (upper === "C") return 2;
  if (upper === "D") return 3;
  if (upper === "①") return 0;
  if (upper === "②") return 1;
  if (upper === "③") return 2;
  if (upper === "④") return 3;
  return null;
}

function inferAnswerIndexFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const patterns = [
    /(?:정답|answer)\s*(?:은|는|:)?\s*([1-4])/i,
    /(?:정답|answer)\s*(?:은|는|:)?\s*([A-D])/i,
    /(?:정답|answer)\s*(?:은|는|:)?\s*([①②③④])/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    const parsed = parseAnswerIndexValue(match[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function resolveAnswerIndex({ answerIndex, explanation = "", choices = [] } = {}) {
  const direct = parseAnswerIndexValue(answerIndex);
  if (direct !== null) return direct;

  const fromExplanation = inferAnswerIndexFromText(explanation);
  if (fromExplanation !== null) return fromExplanation;

  const markedChoiceIndex = Array.isArray(choices)
    ? choices.findIndex((choice) => /\((?:정답|answer)\)/i.test(String(choice || "")))
    : -1;
  if (markedChoiceIndex >= 0) return markedChoiceIndex;

  return null;
}

export function resolveShortAnswerText(answer, explanation = "") {
  const normalizedAnswer = String(answer || "").trim();
  if (normalizedAnswer) return normalizedAnswer;
  const normalizedExplanation = String(explanation || "").replace(/\s+/g, " ").trim();
  if (!normalizedExplanation) return "";
  return normalizedExplanation.length <= 120
    ? normalizedExplanation
    : `${normalizedExplanation.slice(0, 117)}...`;
}

function resolveMockExamAnswerText(item) {
  if (!item || typeof item !== "object") return "-";
  if (item.type === "ox") {
    if (item.answer === true) return "O";
    if (item.answer === false) return "X";
    const normalized = String(item.answer || "").trim().toUpperCase();
    return normalized === "O" || normalized === "X" ? normalized : "-";
  }
  if (item.type === "quiz-short") {
    return resolveShortAnswerText(item.answer, item.explanation) || "-";
  }
  const resolvedIndex = resolveAnswerIndex({
    answerIndex: item.answerIndex,
    explanation: item.explanation,
    choices: item.choices,
  });
  return Number.isFinite(resolvedIndex) ? LETTERS[resolvedIndex] || "-" : "-";
}

export function buildMockExamAnswerSheet(items, persistedAnswerSheet = []) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const savedAnswers = Array.isArray(persistedAnswerSheet) ? persistedAnswerSheet : [];

  if (!normalizedItems.length) {
    return savedAnswers.map((entry, idx) => ({
      number: Number.isFinite(entry?.number) ? entry.number : idx + 1,
      type: String(entry?.type || "").trim(),
      answer: String(entry?.answer || "-").trim() || "-",
      explanation: String(entry?.explanation || "").trim(),
      evidence: String(entry?.evidence || "").trim(),
    }));
  }

  return normalizedItems.map((item, idx) => {
    const persisted = savedAnswers[idx] || {};
    const persistedAnswer = String(persisted?.answer || "").trim();
    const fallbackAnswer = resolveMockExamAnswerText(item);
    const answer = persistedAnswer && persistedAnswer !== "-" ? persistedAnswer : fallbackAnswer;

    return {
      number: Number.isFinite(persisted?.number) ? persisted.number : idx + 1,
      type: String(item?.type || persisted?.type || "").trim(),
      answer: answer || "-",
      explanation: String(persisted?.explanation || item?.explanation || "").trim(),
      evidence: String(persisted?.evidence || item?.evidence || "").trim(),
    };
  });
}

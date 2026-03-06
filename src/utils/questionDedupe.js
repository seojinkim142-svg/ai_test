import { pickRandomItems } from "./appStateHelpers";

export function normalizeQuestionKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^0-9a-zA-Z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeQuestionTexts(texts) {
  const result = [];
  const seen = new Set();
  (Array.isArray(texts) ? texts : []).forEach((text) => {
    const raw = String(text || "").trim();
    const key = normalizeQuestionKey(raw);
    if (!raw || !key || seen.has(key)) return;
    seen.add(key);
    result.push(raw);
  });
  return result;
}

export function mergeQuestionHistory(baseTexts, nextTexts, limit = 120) {
  return dedupeQuestionTexts([...(Array.isArray(baseTexts) ? baseTexts : []), ...(Array.isArray(nextTexts) ? nextTexts : [])]).slice(0, limit);
}

export function getQuizPromptText(item) {
  return String(item?.question || item?.prompt || "").trim();
}

export function getOxPromptText(item) {
  return String(item?.statement || item?.prompt || item?.question || "").trim();
}

export function getMockExamPromptText(item) {
  return String(item?.prompt || item?.statement || item?.question || "").trim();
}

export function collectQuestionTextsFromQuizSets(quizSets = []) {
  const texts = [];
  (Array.isArray(quizSets) ? quizSets : []).forEach((set) => {
    const multipleChoice = Array.isArray(set?.questions?.multipleChoice) ? set.questions.multipleChoice : [];
    const shortAnswer = Array.isArray(set?.questions?.shortAnswer) ? set.questions.shortAnswer : [];
    multipleChoice.forEach((item) => {
      const prompt = getQuizPromptText(item);
      if (prompt) texts.push(prompt);
    });
    shortAnswer.forEach((item) => {
      const prompt = getQuizPromptText(item);
      if (prompt) texts.push(prompt);
    });
  });
  return dedupeQuestionTexts(texts);
}

export function collectQuestionTextsFromOxItems(oxItems = []) {
  const texts = [];
  (Array.isArray(oxItems) ? oxItems : []).forEach((item) => {
    const prompt = getOxPromptText(item);
    if (prompt) texts.push(prompt);
  });
  return dedupeQuestionTexts(texts);
}

export function collectQuestionTextsFromMockExams(mockExams = []) {
  const texts = [];
  (Array.isArray(mockExams) ? mockExams : []).forEach((exam) => {
    const items = Array.isArray(exam?.payload?.items) ? exam.payload.items : [];
    items.forEach((item) => {
      const prompt = getMockExamPromptText(item);
      if (prompt) texts.push(prompt);
    });
  });
  return dedupeQuestionTexts(texts);
}

export function createQuestionKeySet(texts = []) {
  const keys = new Set();
  (Array.isArray(texts) ? texts : []).forEach((text) => {
    const key = normalizeQuestionKey(text);
    if (key) keys.add(key);
  });
  return keys;
}

export function pushUniqueByQuestionKey(target, items, getText, seenKeys, limit = Number.POSITIVE_INFINITY) {
  if (!Array.isArray(target) || !Array.isArray(items) || typeof getText !== "function") return;
  for (const item of items) {
    if (target.length >= limit) break;
    const text = String(getText(item) || "").trim();
    const key = normalizeQuestionKey(text);
    if (!text || !key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    target.push(item);
  }
}

export function pickRandomUniqueByQuestionKey(items, count, getText, seenKeys) {
  if (!Array.isArray(items) || count <= 0) return [];
  const shuffled = pickRandomItems(items, items.length);
  const result = [];
  pushUniqueByQuestionKey(result, shuffled, getText, seenKeys, count);
  return result;
}

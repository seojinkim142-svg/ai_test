import { pickRandomItems } from "./appStateHelpers";

const LOW_VALUE_STUDY_PROMPT_PATTERNS = [
  // textbook/preface metadata (audience/target)
  /(교재|이\s*책|본서|강의노트|강의\s*자료).*(대상|독자|수강생|출신|전공자|비전공자)/i,
  // availability of supplementary resources (exercise/cyber/code/etc.)
  /(교재|이\s*책|본서|강의노트|강의\s*자료).*(연습문제|부록|사이버|온라인|동영상|예제\s*코드|sage\s*코드|코드|자료).*(포함|제공|수록|없|않)/i,
  // publication metadata
  /(저자|출판사|출판|발행|copyright|acknowledg|reference|bibliograph|isbn|email)/i,
  // table of contents / structural trivia
  /(목차|차례|chapter|절|구성).*(소개|설명|나열|순서)/i,
];

export function isLowValueStudyPrompt(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  return LOW_VALUE_STUDY_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

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

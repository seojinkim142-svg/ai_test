import { normalizeQuizPayload, toSortedUniquePages } from "./appStateHelpers";

export const REVIEW_NOTE_MOCK_EXAM_LIMIT = 10;
export const EXAM_CRAM_PREVIEW_LIMIT = 8;

export const getReviewNoteRecentTimestamp = (item) =>
  new Date(item?.lastWrongAt || item?.updatedAt || item?.createdAt || 0).getTime() || 0;

export const sortReviewNotesByRecentWrong = (items) =>
  [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const timeDiff = getReviewNoteRecentTimestamp(right) - getReviewNoteRecentTimestamp(left);
    if (timeDiff !== 0) return timeDiff;
    const wrongDiff = Number(right?.wrongCount || 0) - Number(left?.wrongCount || 0);
    if (wrongDiff !== 0) return wrongDiff;
    return String(left?.prompt || "").localeCompare(String(right?.prompt || ""));
  });

export const collectExamCramQuizItems = (quizSets) => {
  const seen = new Set();
  const items = [];
  (Array.isArray(quizSets) ? quizSets : []).forEach((set, setIndex) => {
    const normalizedQuiz = normalizeQuizPayload(set?.questions || set);
    (Array.isArray(normalizedQuiz.multipleChoice) ? normalizedQuiz.multipleChoice : []).forEach(
      (question, questionIndex) => {
        const prompt = String(question?.question || "").trim();
        const questionKey = prompt.toLowerCase().replace(/\s+/g, " ").trim();
        if (!questionKey || seen.has(questionKey)) return;
        seen.add(questionKey);
        const answerIndex = Number.isFinite(question?.answerIndex)
          ? question.answerIndex
          : Number.isFinite(Number(question?.answerIndex))
            ? Number(question.answerIndex)
            : null;
        items.push({
          id: `exam-cram-mc-${setIndex}-${questionIndex}`,
          type: "multiple_choice",
          prompt,
          answerText:
            answerIndex != null && Array.isArray(question?.choices)
              ? String(question.choices[answerIndex] || "").trim()
              : "",
          explanation: String(question?.explanation || "").trim(),
          evidencePages: toSortedUniquePages(question?.evidencePages),
          evidenceLabel: String(question?.evidenceLabel || "").trim(),
          evidenceSnippet: String(question?.evidenceSnippet || "").trim(),
        });
      }
    );
    (Array.isArray(normalizedQuiz.shortAnswer) ? normalizedQuiz.shortAnswer : []).forEach(
      (question, questionIndex) => {
        const prompt = String(question?.question || "").trim();
        const questionKey = prompt.toLowerCase().replace(/\s+/g, " ").trim();
        if (!questionKey || seen.has(questionKey)) return;
        seen.add(questionKey);
        items.push({
          id: `exam-cram-sa-${setIndex}-${questionIndex}`,
          type: "short_answer",
          prompt,
          answerText: String(question?.answer || "").trim(),
          explanation: String(question?.explanation || "").trim(),
          evidencePages: toSortedUniquePages(question?.evidencePages),
          evidenceLabel: String(question?.evidenceLabel || "").trim(),
          evidenceSnippet: String(question?.evidenceSnippet || "").trim(),
        });
      }
    );
  });
  return items;
};

export const mergeQuizWithLegacyOx = (quizPayload, oxPayload) => {
  const normalizedQuiz = normalizeQuizPayload(quizPayload || {});
  const legacyOxItems = Array.isArray(oxPayload?.items) ? oxPayload.items : [];
  if (normalizedQuiz.ox.length > 0 || legacyOxItems.length === 0) {
    return normalizedQuiz;
  }
  return {
    ...normalizedQuiz,
    ox: legacyOxItems,
  };
};

export const createQuizSetState = (
  questions,
  id = `quiz-${Date.now()}-${Math.random().toString(16).slice(2)}`
) => ({
  id,
  questions: normalizeQuizPayload(questions),
  selectedChoices: {},
  revealedChoices: {},
  shortAnswerInput: {},
  shortAnswerResult: {},
  oxSelections: {},
  oxExplanationOpen: {},
});

export const isMissingFeedbackTableError = (error) => {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    (message.includes("could not find the table") && message.includes("user_feedback")) ||
    (message.includes("relation") && message.includes("user_feedback"))
  );
};

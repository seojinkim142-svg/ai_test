// Barrel — re-exports all public API from domain modules

export {
  // base 유틸
  resolveOutputLanguage,
  getOutputLanguageLabel,
  getTutorFallbackCopy,
  buildAvoidReuseBlock,
  normalizeAdditionalRequest,
  buildAdditionalRequestBlock,
  isLowValueStudyPrompt,
  toSortedUniquePages,
  extractEvidencePagesFromText,
  normalizeEvidenceText,
  normalizeEvidenceFields,
  normalizeGeneratedItem,
  isObjectiveShortAnswerItem,
  getCacheKey,
  getCachedResult,
  setCachedResult,
  getCachedQuestionStyleProfile,
  setCachedQuestionStyleProfile,
  postChatRequest,
  parseJsonSafe,
  limitText,
  isQuizWorthyParagraph,
  chunkText,
  sanitizeJson,
  sanitizeMarkdown,
} from "./base.js";

export {
  // quiz 도메인
  extractQuestionStyleBlocks,
  normalizeQuestionStyleProfile,
  formatQuestionStyleProfile,
  buildQuizPrompt,
  buildHardQuizPrompt,
  buildOxPrompt,
  fallbackOxItems,
  generateQuestionStyleProfile,
  generateQuiz,
  generateDiagnosticQuiz,
  generateHardQuiz,
  generateOxQuiz,
} from "./quiz.js";

export {
  // summary 도메인
  buildSummaryPrompt,
  looksLikeSummaryRefusal,
  buildProblemPageSummaryPrompt,
  buildExamCramPrompt,
  normalizeSummarySource,
  shrinkWithTail,
  buildChapterSummaryInput,
  MAX_LEGACY_SUMMARY_SOURCE_CHARS,
  generateSummary,
  generateMindMap,
  generateExamCramSheet,
} from "./summary.js";

export {
  // flashcards 도메인
  buildFlashcardsContext,
  buildFlashcardsPrompt,
  generateVocabularyFlashcards,
  generateFlashcards,
} from "./flashcards.js";

export {
  // tutor 도메인
  buildTutorSystemPrompt,
  buildTutorContext,
  generateTutorReply,
} from "./tutor.js";

export {
  // docs 도메인
  generateHighlights,
  generateConceptTags,
  generateDocComparison,
  generateDocAnswer,
  generateSemanticSearch,
  generateTopicStructure,
  explainConcept,
} from "./docs.js";

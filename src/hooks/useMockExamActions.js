import { useCallback } from "react";
import { AUTH_ENABLED } from "../config/auth";
import {
  saveMockExam,
  deleteMockExam,
} from "../services/supabase";
import { detectSupportedDocumentKind, isPdfDocumentKind } from "../utils/document";
import { isDbId, createLocalEntityId, formatMockExamTitle } from "../utils/appStateHelpers";
import {
  resolveAnswerIndex,
  resolveShortAnswerText,
  buildMockExamAnswerSheet,
} from "../utils/mockExamUtils";
import {
  dedupeQuestionTexts,
  mergeQuestionHistory,
  getOxPromptText,
  getMockExamPromptText,
  collectQuestionTextsFromMockExams,
  createQuestionKeySet,
  isLowValueStudyPrompt,
  pushUniqueByQuestionKey,
  pickRandomUniqueByQuestionKey,
} from "../utils/questionDedupe";
import {
  REVIEW_NOTE_MOCK_EXAM_LIMIT,
  sortReviewNotesByRecentWrong,
} from "../utils/appFeatureHelpers";
import { normalizeQuizPayload } from "../utils/appStateHelpers";
import { exportMockExamCombinedPdf } from "../utils/pdfExport";
import {
  useMockExamStore,
  useUiStore,
} from "../stores";

export function useMockExamActions({
  user,
  selectedFileId,
  extractedText,
  file,
  isLoadingText,
  outputLanguage,
  oxItems,
  quizSets,
  mockExamChapterSelectionInput,
  mockExamPromptAddonInput,
  reviewNotesWithSections,
  examCramQuizItems,
  partialSummary,
  summary,
  questionStyleProfileContent,
  mockExamPrintRef,
  getOpenAiService,
  getEffectiveInstructorEmphasisText,
  resolveQuestionSourceText,
  selectReviewNotesBySection,
  persistExamCramBundle,
}) {
  const {
    mockExams, setMockExams,
    isGeneratingMockExam, setIsGeneratingMockExam,
    setMockExamStatus,
    setMockExamError,
    activeMockExamId, setActiveMockExamId,
    setShowMockExamAnswers,
    isGeneratingExamCram, setIsGeneratingExamCram,
    setExamCramContent,
    setExamCramUpdatedAt,
    setExamCramScopeLabel,
    setExamCramStatus,
    setExamCramError,
  } = useMockExamStore();

  const { setPanelTab } = useUiStore();

  const handleCreateMockExam = useCallback(async () => {
    if (isGeneratingMockExam) return;
    if (AUTH_ENABLED && !user) {
      setMockExamError("먼저 로그인해 주세요.");
      return;
    }
    if (!file || !selectedFileId) {
      setMockExamError("먼저 PDF를 열어 주세요.");
      return;
    }
    if (isLoadingText) {
      setMockExamError("PDF 텍스트 추출이 아직 진행 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    const chapterSelectionRaw = String(mockExamChapterSelectionInput || "").trim();
    const additionalRequest = String(mockExamPromptAddonInput || "").trim();
    const hasChapterScope = Boolean(chapterSelectionRaw);
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    let sourceText = "";
    let scopeLabel = "";
    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "모의고사",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      sourceText = String(scopedSource?.text || "").trim();
      scopeLabel = String(scopedSource?.scopeLabel || "").trim();
    } catch (err) {
      setMockExamError(String(err?.message || "모의고사 텍스트 추출에 실패했습니다."));
      return;
    }
    if (!sourceText) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }
    if (sourceText.length < 80) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }

    setMockExamStatus("모의고사 생성 중...");
    setMockExamError("");
    setIsGeneratingMockExam(true);

    try {
      const ai = await getOpenAiService();
      let oxPool = (Array.isArray(oxItems) ? oxItems : []).filter(
        (item) => !isLowValueStudyPrompt(getOxPromptText(item))
      );
      let quizPool = [];
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidMockQuestionTexts = dedupeQuestionTexts(historicalMockTexts).slice(0, 120);
      const usedMockQuestionKeys = createQuestionKeySet(avoidMockQuestionTexts);

      const shouldGeneratePoolsFromSource = hasChapterScope || isPdfSource;
      if (shouldGeneratePoolsFromSource) {
        if (scopeLabel) {
          setMockExamStatus(`모의고사 생성 중 (${scopeLabel})...`);
        }
        const instructorEmphasisText = getEffectiveInstructorEmphasisText();

        const [oxResult, quizResult] = await Promise.all([
          ai.generateOxQuiz(sourceText, {
            instructorEmphasis: instructorEmphasisText,
            avoidStatements: avoidMockQuestionTexts,
            additionalRequest,
            outputLanguage,
          }),
          ai.generateQuiz(sourceText, {
            multipleChoiceCount: 4,
            shortAnswerCount: 1,
            instructorEmphasis: instructorEmphasisText,
            avoidQuestions: avoidMockQuestionTexts,
            additionalRequest,
            outputLanguage,
          }),
        ]);

        oxPool = (Array.isArray(oxResult?.items) ? oxResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(getOxPromptText(item))
        );
        const normalizedQuiz = normalizeQuizPayload(quizResult);
        const scopedMultipleChoice = Array.isArray(normalizedQuiz?.multipleChoice)
          ? normalizedQuiz.multipleChoice
          : [];
        const scopedShortAnswers = Array.isArray(normalizedQuiz?.shortAnswer) ? normalizedQuiz.shortAnswer : [];

        scopedMultipleChoice.forEach((question) => {
          const prompt = String(question?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const choices = Array.isArray(question?.choices) ? question.choices : [];
          const explanation = String(question?.explanation || "").trim();
          quizPool.push({
            type: "quiz-mc",
            prompt,
            choices,
            answerIndex: resolveAnswerIndex({
              answerIndex: question?.answerIndex,
              explanation,
              choices,
            }),
            explanation,
          });
        });
        scopedShortAnswers.forEach((item) => {
          const prompt = String(item?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const explanation = String(item?.explanation || "").trim();
          quizPool.push({
            type: "quiz-short",
            prompt,
            answer: resolveShortAnswerText(item?.answer, explanation),
            explanation,
          });
        });
      } else {
        quizSets.forEach((set) => {
          const multipleChoice = set.questions?.multipleChoice || [];
          const shortAnswers = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
          multipleChoice.forEach((question) => {
            const prompt = String(question?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const choices = Array.isArray(question?.choices) ? question.choices : [];
            const explanation = String(question?.explanation || "").trim();
            quizPool.push({
              type: "quiz-mc",
              prompt,
              choices,
              answerIndex: resolveAnswerIndex({
                answerIndex: question?.answerIndex,
                explanation,
                choices,
              }),
              explanation,
            });
          });
          shortAnswers.forEach((item) => {
            const prompt = String(item?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const explanation = String(item?.explanation || "").trim();
            quizPool.push({
              type: "quiz-short",
              prompt,
              answer: resolveShortAnswerText(item?.answer, explanation),
              explanation,
            });
          });
        });
      }

      if (oxPool.length < 3) {
        throw new Error("모의고사를 만들려면 O/X 문항이 최소 3개 필요합니다.");
      }
      if (quizPool.length < 4) {
        throw new Error("모의고사를 만들려면 퀴즈 문항이 최소 4개 필요합니다.");
      }

      const pickedOx = pickRandomUniqueByQuestionKey(oxPool, 3, getOxPromptText, usedMockQuestionKeys);
      const pickedQuiz = pickRandomUniqueByQuestionKey(quizPool, 4, getMockExamPromptText, usedMockQuestionKeys);

      if (pickedOx.length < 3) {
        throw new Error("이미 출제된 문항을 제외하느라 O/X 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }
      if (pickedQuiz.length < 4) {
        throw new Error("이미 출제된 문항을 제외하느라 퀴즈 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }

      const mergedAvoidForMock = mergeQuestionHistory(
        avoidMockQuestionTexts,
        [...pickedOx.map((item) => getOxPromptText(item)), ...pickedQuiz.map((item) => getMockExamPromptText(item))],
        160
      );
      avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidForMock);

      const hardCount = Math.max(3, 10 - (pickedOx.length + pickedQuiz.length));
      const hardItems = [];
      const maxHardAttempts = 3;
      for (let attempt = 0; attempt < maxHardAttempts; attempt += 1) {
        if (hardItems.length >= hardCount) break;
        const requestCount = Math.min(10, hardCount + attempt * 2 + 1);
        const hardResult = await ai.generateHardQuiz(sourceText, {
          count: requestCount,
          avoidQuestions: avoidMockQuestionTexts,
          scopeLabel,
          questionStyleProfile: questionStyleProfileContent,
          additionalRequest,
          outputLanguage,
        });
        const rawHardItems = (Array.isArray(hardResult?.items) ? hardResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(String(item?.question || "").trim())
        );
        pushUniqueByQuestionKey(
          hardItems,
          rawHardItems,
          (item) => String(item?.question || "").trim(),
          usedMockQuestionKeys,
          hardCount
        );
        const mergedAvoidWithHard = mergeQuestionHistory(
          avoidMockQuestionTexts,
          hardItems.map((item) => String(item?.question || "").trim()),
          200
        );
        avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidWithHard);
      }

      if (hardItems.length < hardCount) {
        throw new Error("고난도 문항을 충분히 생성하지 못했습니다.");
      }

      const mappedOx = pickedOx.map((item) => ({
        type: "ox",
        prompt: String(item?.statement || "").trim(),
        answer: item?.answer === true ? "O" : "X",
        explanation: String(item?.explanation || "").trim(),
        evidence: String(item?.evidence || "").trim(),
      }));

      const mappedQuiz = pickedQuiz.map((item) => ({ ...item }));

      const mappedHard = hardItems.map((item) => ({
        type: "hard",
        prompt: String(item?.question || "").trim(),
        choices: Array.isArray(item?.choices) ? item.choices : [],
        answerIndex: resolveAnswerIndex({
          answerIndex: item?.answerIndex,
          explanation: String(item?.explanation || "").trim(),
          choices: Array.isArray(item?.choices) ? item.choices : [],
        }),
        explanation: String(item?.explanation || "").trim(),
      }));

      const examItems = [...mappedOx, ...mappedQuiz, ...mappedHard].map((item, idx) => ({
        ...item,
        order: idx + 1,
      }));

      if (examItems.length !== 10) {
        throw new Error("모의고사는 정확히 10문항이어야 합니다.");
      }

      const answerSheet = buildMockExamAnswerSheet(examItems);

      const now = new Date();
      const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      const nextIndex = mockExams.length + 1;
      const title = `${dateStamp} 모의고사 ${nextIndex}`;
      const payload = {
        title,
        items: examItems,
        answerSheet,
        source: {
          oxCount: mappedOx.length,
          quizCount: mappedQuiz.length,
          hardCount: mappedHard.length,
        },
        generatedAt: new Date().toISOString(),
      };

      const saved = user
        ? await saveMockExam({
            userId: user.id,
            docId: selectedFileId,
            docName: file?.name || "",
            title,
            totalQuestions: examItems.length,
            payload,
          })
        : {
            id: createLocalEntityId("mock-exam"),
            doc_id: selectedFileId,
            doc_name: file?.name || "",
            title,
            total_questions: examItems.length,
            payload,
            created_at: new Date().toISOString(),
          };

      setMockExams((prev) => [saved, ...prev]);
      setActiveMockExamId(saved.id);
      setShowMockExamAnswers(true);
      setMockExamStatus(
        scopeLabel
          ? `모의고사와 답지가 저장되었습니다 (${scopeLabel}).`
          : "모의고사와 답지가 저장되었습니다."
      );
    } catch (err) {
      setMockExamError(`모의고사 생성에 실패했습니다: ${err.message}`);
      setMockExamStatus("");
    } finally {
      setIsGeneratingMockExam(false);
    }
  }, [
    extractedText,
    file,
    isGeneratingMockExam,
    isLoadingText,
    oxItems,
    mockExams,
    quizSets,
    mockExamChapterSelectionInput,
    mockExamPromptAddonInput,
    selectedFileId,
    getOpenAiService,
    getEffectiveInstructorEmphasisText,
    outputLanguage,
    resolveQuestionSourceText,
    user,
  ]);

  const handleGenerateExamCram = useCallback(
    async ({ chapterSelectionInput = "" } = {}) => {
      if (isGeneratingExamCram) return;
      if (!selectedFileId) {
        setExamCramError("먼저 문서를 선택해 주세요.");
        setExamCramStatus("");
        return;
      }

      const scoped = selectReviewNotesBySection(reviewNotesWithSections, chapterSelectionInput);
      if (scoped.error) {
        setExamCramError(scoped.error);
        setExamCramStatus("");
        return;
      }

      const summaryText = String(summary || partialSummary || "").trim();
      const quizReferenceItems = examCramQuizItems.slice(0, 12);
      const oxReferenceItems = (Array.isArray(oxItems) ? oxItems : []).slice(0, 10);
      const reviewNoteReferences = sortReviewNotesByRecentWrong(
        scoped.items.filter((item) => item && !item.resolved)
      ).slice(0, 10);
      const hasSources =
        Boolean(summaryText) ||
        quizReferenceItems.length > 0 ||
        oxReferenceItems.length > 0 ||
        reviewNoteReferences.length > 0;

      if (!hasSources) {
        setExamCramError("먼저 요약, 퀴즈, O/X, 오답노트 중 하나를 준비해주세요.");
        setExamCramStatus("");
        return;
      }

      const scopeLabel = scoped.selectedSectionNumbers.length
        ? `섹션 ${scoped.selectedSectionNumbers.join(", ")} 기준`
        : "";

      setIsGeneratingExamCram(true);
      setExamCramError("");
      setExamCramStatus(scopeLabel ? `시험 직전 AI 정리 생성 중... (${scopeLabel})` : "시험 직전 AI 정리 생성 중...");

      try {
        const ai = await getOpenAiService();
        const generated = await ai.generateExamCramSheet({
          summaryText,
          oxItems: oxReferenceItems,
          quizItems: quizReferenceItems,
          reviewNotes: reviewNoteReferences,
          scopeLabel,
          outputLanguage,
        });
        const trimmed = String(generated || "").trim();
        if (!trimmed) {
          throw new Error("AI가 비어 있는 정리를 반환했습니다.");
        }

        const nextUpdatedAt = new Date().toISOString();
        setExamCramContent(trimmed);
        setExamCramUpdatedAt(nextUpdatedAt);
        setExamCramScopeLabel(scopeLabel);
        setExamCramStatus(scopeLabel ? `시험 직전 AI 정리가 준비되었습니다. (${scopeLabel})` : "시험 직전 AI 정리가 준비되었습니다.");
        persistExamCramBundle({
          content: trimmed,
          scopeLabel,
          updatedAt: nextUpdatedAt,
        });
      } catch (err) {
        setExamCramError(`시험 직전 AI 정리 생성에 실패했습니다: ${err.message}`);
        setExamCramStatus("");
      } finally {
        setIsGeneratingExamCram(false);
      }
    },
    [
      examCramQuizItems,
      getOpenAiService,
      isGeneratingExamCram,
      oxItems,
      partialSummary,
      persistExamCramBundle,
      reviewNotesWithSections,
      selectReviewNotesBySection,
      selectedFileId,
      summary,
      outputLanguage,
    ]
  );

  const handleCreateReviewNotesMockExam = useCallback(
    async ({
      chapterSelectionInput = "",
      titlePrefix = "오답노트",
      sourceKind = "review_notes",
      statusLabel = "오답노트",
    } = {}) => {
      if (isGeneratingMockExam) return;

      const notes = Array.isArray(reviewNotesWithSections) ? reviewNotesWithSections : [];
      const scoped = selectReviewNotesBySection(notes, chapterSelectionInput);
      if (scoped.error) {
        setMockExamError(scoped.error);
        setMockExamStatus("");
        return;
      }

      const pendingNotes = sortReviewNotesByRecentWrong(
        scoped.items.filter((item) => item && !item.resolved)
      );

      if (!pendingNotes.length) {
        setMockExamError(
          scoped.selectedSectionNumbers.length > 0
            ? "선택한 섹션에 복습할 최근 오답이 없습니다."
            : "오답노트에 복습할 최근 오답이 없습니다."
        );
        setMockExamStatus("");
        return;
      }

      if (AUTH_ENABLED && !user) {
        setMockExamError("먼저 로그인해 주세요.");
        setMockExamStatus("");
        return;
      }
      if (!selectedFileId) {
        setMockExamError("먼저 문서를 선택해 주세요.");
        setMockExamStatus("");
        return;
      }

      setIsGeneratingMockExam(true);
      setMockExamError("");
      setMockExamStatus(`${statusLabel} 모의고사 생성 중...`);

      try {
        const examItems = pendingNotes.slice(0, REVIEW_NOTE_MOCK_EXAM_LIMIT).map((note, index) => {
          const base = {
            order: index + 1,
            prompt: String(note?.prompt || "").trim(),
            explanation: String(note?.explanation || "").trim(),
            evidencePages: Array.isArray(note?.evidencePages) ? note.evidencePages : [],
            evidenceSnippet: String(note?.evidenceSnippet || "").trim(),
            evidenceLabel: String(note?.evidenceLabel || "").trim(),
            evidence: String(note?.evidenceLabel || note?.evidenceSnippet || "").trim(),
          };

          if (note?.sourceType === "ox") {
            return {
              ...base,
              type: "ox",
              answer: note?.correctAnswerValue === true ? "O" : "X",
            };
          }

          if (note?.sourceType === "quiz_short_answer") {
            return {
              ...base,
              type: "quiz-short",
              answer: String(note?.correctAnswerText || "").trim(),
            };
          }

          return {
            ...base,
            type: "quiz",
            choices: Array.isArray(note?.choices) ? note.choices : [],
            answerIndex: Number.isFinite(note?.answerIndex) ? note.answerIndex : null,
          };
        });

        const answerSheet = buildMockExamAnswerSheet(examItems);
        const now = new Date();
        const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
        const nextIndex = mockExams.length + 1;
        const title = `${dateStamp} ${titlePrefix} 모의고사 ${nextIndex}`;
        const payload = {
          title,
          items: examItems,
          answerSheet,
          source: {
            kind: sourceKind,
            totalReviewNotes: pendingNotes.length,
            sectionNumbers: scoped.selectedSectionNumbers,
            recentOnly: true,
          },
          generatedAt: now.toISOString(),
        };

        const saved = user
          ? await saveMockExam({
              userId: user.id,
              docId: selectedFileId,
              docName: file?.name || "",
              title,
              totalQuestions: examItems.length,
              payload,
            })
          : {
              id: createLocalEntityId("mock-exam"),
              doc_id: selectedFileId,
              doc_name: file?.name || "",
              title,
              total_questions: examItems.length,
              payload,
              created_at: now.toISOString(),
            };

        setMockExams((prev) => [saved, ...prev]);
        setActiveMockExamId(saved.id);
        setShowMockExamAnswers(false);
        setPanelTab("mockExam");
        setMockExamStatus(`${examItems.length}문항 ${statusLabel} 모의고사를 만들었습니다.`);
      } catch (err) {
        setMockExamError(`${statusLabel} 모의고사 생성에 실패했습니다: ${err.message}`);
        setMockExamStatus("");
      } finally {
        setIsGeneratingMockExam(false);
      }
    },
    [
      file?.name,
      isGeneratingMockExam,
      mockExams.length,
      reviewNotesWithSections,
      selectReviewNotesBySection,
      selectedFileId,
      user,
    ]
  );

  const handleDeleteMockExam = useCallback(
    async (examId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setMockExams((prev) => prev.filter((item) => item.id !== examId));
          if (activeMockExamId === examId) {
            setActiveMockExamId(null);
          }
          setMockExamStatus("모의고사를 삭제했습니다. (로컬 모드)");
          return;
        }
        setMockExamError("먼저 로그인해 주세요.");
        return;
      }
      try {
        await deleteMockExam({ userId: user.id, examId });
        setMockExams((prev) => prev.filter((item) => item.id !== examId));
        if (activeMockExamId === examId) {
          setActiveMockExamId(null);
        }
        setMockExamStatus("모의고사를 삭제했습니다.");
      } catch (err) {
        setMockExamError(`모의고사 삭제에 실패했습니다: ${err.message}`);
      }
    },
    [activeMockExamId, user]
  );

  const handleExportMockExam = useCallback(
    async (exam) => {
      if (!exam) {
        setMockExamError("내보낼 모의고사가 선택되지 않았습니다.");
        return;
      }
      if (!mockExamPrintRef.current) {
        setMockExamError("모의고사 출력 영역을 찾을 수 없습니다.");
        return;
      }
      setMockExamError("");
      try {
        const examIndex = mockExams.findIndex((item) => item.id === exam.id);
        const displayTitle = formatMockExamTitle(exam, examIndex >= 0 ? examIndex : 0);
        const safeTitle = (displayTitle || "mock-exam").replace(/[^\w-]+/g, "-");
        const answerSheet = buildMockExamAnswerSheet(
          Array.isArray(exam?.payload?.items) ? exam.payload.items : [],
          exam?.payload?.answerSheet
        );

        await exportMockExamCombinedPdf(mockExamPrintRef.current, {
          title: displayTitle,
          answerEntries: answerSheet,
          filename: `${safeTitle}.pdf`,
          pageSelector: ".mock-exam-page",
        });
        setMockExamStatus("모의고사 문제지+답지 PDF를 저장했습니다.");
      } catch (err) {
        setMockExamError(`PDF 내보내기에 실패했습니다: ${err.message}`);
      }
    },
    [mockExamPrintRef, mockExams]
  );

  return {
    handleCreateMockExam,
    handleGenerateExamCram,
    handleCreateReviewNotesMockExam,
    handleDeleteMockExam,
    handleExportMockExam,
  };
}

import { useCallback } from "react";
import { AUTH_ENABLED } from "../config/auth";
import {
  addFlashcard,
  addFlashcards,
  deleteFlashcard,
  updateFlashcard,
  updateFlashcardSrs,
  deleteFlashcards,
  deleteAllFlashcardsForDeck,
  saveFlashcardScore,
} from "../services/supabase";
import { detectSupportedDocumentKind, isPdfDocumentKind } from "../utils/document";
import { isDbId, createLocalEntityId } from "../utils/appStateHelpers";
import { normalizeFlashcardFront } from "../utils/flashcardUtils";
import { computeNextSrsState } from "../utils/spacedRepetition";
import { writeFreeUsageCountsToHighlights } from "../utils/studyArtifacts";
import {
  useFlashcardStore,
} from "../stores";

export function useFlashcardActions({
  user,
  selectedFileId,
  extractedText,
  file,
  isLoadingText,
  hasReached,
  flashcardChapterSelectionInput,
  flashcardGenerateCount,
  outputLanguage,
  topicStructure,
  activeUploadItem,
  artifacts,
  bumpUsageCountForActiveDoc,
  persistArtifacts,
  resolveQuestionSourceText,
  getOpenAiService,
}) {
  const {
    flashcards, setFlashcards,
    isGeneratingFlashcards, setIsGeneratingFlashcards,
    setFlashcardStatus,
    setFlashcardError,
    setFlashcardScores,
    setVocabQuizScores,
  } = useFlashcardStore();

  const handleAddFlashcard = useCallback(
    async (front, back, hint) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          const deckId = selectedFileId || "default";
          const localCard = {
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front,
            back,
            hint: hint || "",
            created_at: new Date().toISOString(),
          };
          setFlashcardError("");
          setFlashcards((prev) => [localCard, ...prev]);
          setFlashcardStatus("플래시카드를 추가했습니다.");
          return;
        }
        setFlashcardError("먼저 로그인해 주세요.");
        return;
      }
      const deckId = selectedFileId || "default";
      setFlashcardError("");
      setFlashcardStatus("플래시카드를 저장하는 중...");
      try {
        const saved = await addFlashcard({
          userId: user.id,
          deckId,
          front,
          back,
          hint,
        });
        setFlashcards((prev) => [saved, ...prev]);
        setFlashcardStatus("플래시카드를 추가했습니다.");
      } catch (err) {
        setFlashcardError(`플래시카드 저장에 실패했습니다: ${err.message}`);
        setFlashcardStatus("");
      }
    },
    [user, selectedFileId]
  );

  const handleDeleteFlashcard = useCallback(
    async (cardId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setFlashcardError("");
          setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
          setFlashcardStatus("플래시카드를 삭제했습니다.");
          return;
        }
        setFlashcardError("먼저 로그인해 주세요.");
        return;
      }
      setFlashcardError("");
      try {
        if (isDbId(cardId)) {
          await deleteFlashcard({ userId: user.id, cardId });
        }
        setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        setFlashcardStatus("플래시카드를 삭제했습니다.");
      } catch (err) {
        setFlashcardError(`플래시카드 삭제에 실패했습니다: ${err.message}`);
      }
    },
    [user]
  );

  const handleUpdateFlashcard = useCallback(
    async (cardId, front, back, hint) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setFlashcardError("");
          setFlashcards((prev) =>
            prev.map((c) => (c.id === cardId ? { ...c, front, back, hint: hint || "" } : c))
          );
          setFlashcardStatus("플래시카드를 수정했습니다.");
          return;
        }
        setFlashcardError("먼저 로그인해 주세요.");
        return;
      }
      setFlashcardError("");
      try {
        const updated = await updateFlashcard({ userId: user.id, cardId, front, back, hint });
        setFlashcards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
        setFlashcardStatus("플래시카드를 수정했습니다.");
      } catch (err) {
        setFlashcardError(`플래시카드 수정에 실패했습니다: ${err.message}`);
      }
    },
    [user]
  );

  const handleDeduplicateFlashcards = useCallback(async () => {
    // front 기준으로 중복 카드 찾기 (가장 오래된 것 남기고 나머지 삭제)
    const seen = new Map();
    const toDelete = [];
    // created_at 오름차순으로 정렬 (오래된 것 우선)
    const sorted = [...flashcards].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (const card of sorted) {
      const key = normalizeFlashcardFront(card.front);
      if (!key) continue;
      if (seen.has(key)) {
        toDelete.push(card.id);
      } else {
        seen.set(key, card.id);
      }
    }
    if (toDelete.length === 0) {
      setFlashcardStatus("중복 카드가 없습니다.");
      return;
    }
    setFlashcardError("");
    try {
      const dbIds = toDelete.filter((id) => isDbId(id));
      if (user && dbIds.length) {
        await deleteFlashcards({ userId: user.id, cardIds: dbIds });
      }
      setFlashcards((prev) => prev.filter((c) => !toDelete.includes(c.id)));
      setFlashcardStatus(`중복 카드 ${toDelete.length}개를 제거했습니다.`);
    } catch (err) {
      setFlashcardError(`중복 제거에 실패했습니다: ${err.message}`);
    }
  }, [user, flashcards]);

  const handleDeleteAllFlashcards = useCallback(async () => {
    if (!flashcards.length) return;
    setFlashcardError("");
    try {
      if (user && selectedFileId) {
        await deleteAllFlashcardsForDeck({ userId: user.id, deckId: selectedFileId });
      }
      setFlashcards([]);
      setFlashcardStatus("전체 카드를 삭제했습니다.");
    } catch (err) {
      setFlashcardError(`전체 삭제에 실패했습니다: ${err.message}`);
    }
  }, [user, flashcards, selectedFileId]);

  const handleSaveFlashcardScore = useCallback(
    async ({ total, known, unknown, accuracy }) => {
      const deckId = selectedFileId || "default";
      if (!user) return null;
      try {
        const saved = await saveFlashcardScore({ userId: user.id, deckId, total, known, unknown, accuracy });
        if (saved) {
          setFlashcardScores((prev) => [saved, ...prev].slice(0, 50));
          return saved;
        }
        return null;
      } catch {
        // 저장 실패 시 null 반환 (localStorage fallback이 처리)
        return null;
      }
    },
    [user, selectedFileId]
  );

  const handleSaveVocabQuizScore = useCallback(
    async ({ total, score, accuracy, category }) => {
      const deckId = (selectedFileId || "default") + "_vq";
      if (!user) return null;
      try {
        const saved = await saveFlashcardScore({
          userId: user.id, deckId,
          total, known: score, unknown: total - score, accuracy,
        });
        if (saved) {
          const merged = { ...saved, category };
          setVocabQuizScores((prev) => [merged, ...prev].slice(0, 100));
          return merged;
        }
        return null;
      } catch {
        return null;
      }
    },
    [user, selectedFileId]
  );

  const handleUpdateFlashcardSrs = useCallback(
    async (card, result) => {
      if (!card?.id) return;
      const nextState = computeNextSrsState(card, result);
      setFlashcards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...nextState } : c)));
      if (user && isDbId(card.id)) {
        try {
          await updateFlashcardSrs({ userId: user.id, cardId: card.id, srsState: nextState });
        } catch {
          // 저장 실패해도 로컬 상태는 이미 갱신됨
        }
      }
    },
    [user]
  );

  const handleGenerateFlashcards = useCallback(async (options = {}) => {
    const { replaceCardIds = null } = options;
    if (isGeneratingFlashcards) return;
    if (AUTH_ENABLED && !user) {
      setFlashcardError("먼저 로그인해 주세요.");
      return;
    }
    if (!file || !selectedFileId) {
      setFlashcardError("먼저 PDF를 열어 주세요.");
      return;
    }
    if (hasReached("maxFlashcards")) {
      setFlashcardError("무료 플랜에서는 파일당 AI 플래시카드를 1회만 생성할 수 있습니다.");
      return;
    }
    if (isLoadingText) {
      setFlashcardError("PDF 텍스트 추출이 아직 진행 중입니다. 잠시만 기다려 주세요.");
      return;
    }
    const chapterSelectionRaw = String(flashcardChapterSelectionInput || "").trim();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    if (!extractedText && !chapterSelectionRaw && !isPdfSource) {
      setFlashcardError("플래시카드를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }

    setFlashcardError("");
    setIsGeneratingFlashcards(true);
    try {
      const scoped = await resolveQuestionSourceText({
        featureLabel: "플래시카드",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      let sourceText = String(scoped?.text || "").trim();
      const scopeLabel = String(scoped?.scopeLabel || "").trim();
      if (sourceText.length < 80) {
        throw new Error("플래시카드를 생성하기에 추출된 텍스트가 부족합니다.");
      }

      setFlashcardStatus(
        scopeLabel ? `AI 플래시카드 생성 중 (${scopeLabel})...` : "AI 플래시카드 생성 중..."
      );
      const { generateFlashcards } = await getOpenAiService();
      const isVocabFile = Boolean(activeUploadItem?.isVocabulary);
      const result = await generateFlashcards(sourceText, { count: flashcardGenerateCount, outputLanguage, isVocabulary: isVocabFile });
      const rawCards = Array.isArray(result?.cards)
        ? result.cards
        : Array.isArray(result)
          ? result
          : [];
      const cleaned = rawCards
        .map((card) => ({
          front: String(card?.front || "").trim(),
          back: String(card?.back || "").trim(),
          hint: String(card?.hint || "").trim(),
        }))
        .filter((card) => card.front && card.back);
      if (cleaned.length === 0) {
        throw new Error("본문에서 유효한 플래시카드를 생성하지 못했습니다.");
      }
      // 새 카드 생성에 성공한 뒤에만 기존 카드를 제거 (실패 시 카드 손실 방지)
      if (replaceCardIds?.length) {
        const dbIds = replaceCardIds.filter((id) => isDbId(id));
        try {
          if (user && dbIds.length) await deleteFlashcards({ userId: user.id, cardIds: dbIds });
        } catch {
          // 삭제 실패해도 새 카드 생성은 계속 진행
        }
        setFlashcards([]);
      }
      const deckId = selectedFileId || "default";
      const saved = user
        ? await addFlashcards({ userId: user.id, deckId, cards: cleaned })
        : cleaned.map((card) => ({
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front: card.front,
            back: card.back,
            hint: card.hint || "",
            created_at: new Date().toISOString(),
          }));
      if (!saved.length) {
        throw new Error("생성된 플래시카드 저장에 실패했습니다.");
      }
      const nextUsageCounts = bumpUsageCountForActiveDoc("flashcards");
      const nextHighlights = writeFreeUsageCountsToHighlights(artifacts?.highlights, nextUsageCounts);
      setFlashcards((prev) => [...saved, ...prev]);
      setFlashcardStatus(
        scopeLabel
          ? `${saved.length}개의 AI 플래시카드를 생성했습니다 (${scopeLabel}).`
          : `${saved.length}개의 AI 플래시카드를 생성했습니다.`
      );
      persistArtifacts({ highlights: nextHighlights });
    } catch (err) {
      setFlashcardError(`AI 플래시카드 생성에 실패했습니다: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [
    isGeneratingFlashcards,
    user,
    file,
    selectedFileId,
    hasReached,
    isLoadingText,
    extractedText,
    flashcardChapterSelectionInput,
    flashcardGenerateCount,
    getOpenAiService,
    outputLanguage,
    resolveQuestionSourceText,
    artifacts?.highlights,
    bumpUsageCountForActiveDoc,
    persistArtifacts,
  ]);

  const handleGenerateVocabularyFlashcards = useCallback(async (options = {}) => {
    const { replaceCardIds = null } = options;
    if (isGeneratingFlashcards) return;
    if (AUTH_ENABLED && !user) { setFlashcardError("먼저 로그인해 주세요."); return; }
    if (!file || !selectedFileId) { setFlashcardError("먼저 파일을 열어 주세요."); return; }
    if (isLoadingText) { setFlashcardError("텍스트 추출이 아직 진행 중입니다. 잠시만 기다려 주세요."); return; }

    setFlashcardError("");
    setIsGeneratingFlashcards(true);

    try {
      setFlashcardStatus("PDF 페이지 수 확인 중...");
      const { extractPdfPageTexts: getPageTexts } = await import("../utils/pdf.js");

      // 1페이지만 요청해 totalPages 확인
      const { totalPages } = await getPageTexts(file, [1], { maxCharsPerPage: 1 });

      const { generateVocabularyFlashcards } = await getOpenAiService();
      // 재추출 시에는 기존 카드의 단어를 중복으로 취급하지 않음 (전체 교체 대상)
      const seenFronts = new Set(
        replaceCardIds ? [] : flashcards.map((c) => normalizeFlashcardFront(c.front))
      );
      const deckId = selectedFileId || "default";

      const PARALLEL = 3; // 3페이지 동시 병렬 처리
      let savedCards = [];
      let failedBatches = 0;
      let replacedOldCards = !replaceCardIds?.length;

      for (let bi = 1; bi <= totalPages; bi += PARALLEL) {
        const pageNums = Array.from(
          { length: Math.min(PARALLEL, totalPages - bi + 1) },
          (_, i) => bi + i
        );
        const lastPage = pageNums[pageNums.length - 1];
        setFlashcardStatus(`페이지 추출 중... (${bi}–${lastPage} / ${totalPages})`);

        const batchResults = await Promise.all(
          pageNums.map(async (pageNum) => {
            try {
              const { pages } = await getPageTexts(file, [pageNum], { maxCharsPerPage: 20000 });
              const pageText = pages?.[0]?.text || "";
              if (!pageText.trim()) return [];
              const result = await generateVocabularyFlashcards(pageText, { outputLanguage, topicStructure });
              return Array.isArray(result?.cards) ? result.cards : [];
            } catch {
              failedBatches++;
              return [];
            }
          })
        );

        // 병렬 결과를 페이지 순서대로 병합
        const newCards = [];
        for (const cards of batchResults) {
          for (const card of cards) {
            const front = String(card?.front || "").trim();
            const back = String(card?.back || "").trim();
            const normalizedFront = normalizeFlashcardFront(front);
            if (front && back && !seenFronts.has(normalizedFront)) {
              seenFronts.add(normalizedFront);
              newCards.push({
                front,
                back,
                hint: String(card?.hint || "").trim(),
                category: String(card?.category || "").trim() || null,
              });
            }
          }
        }

        if (newCards.length === 0) continue;

        // 첫 배치 추출에 성공한 시점에만 기존 카드를 제거 (실패 시 카드 손실 방지)
        if (!replacedOldCards) {
          const dbIds = replaceCardIds.filter((id) => isDbId(id));
          try {
            if (user && dbIds.length) await deleteFlashcards({ userId: user.id, cardIds: dbIds });
          } catch {
            // 삭제 실패해도 새 카드 추출은 계속 진행
          }
          setFlashcards([]);
          replacedOldCards = true;
        }

        // 중간 저장 (버퍼 없이 바로 저장 — 순서 보장)
        const saved = user
          ? await addFlashcards({ userId: user.id, deckId, cards: newCards })
          : newCards.map((c) => ({ id: createLocalEntityId("flashcard"), deck_id: deckId, ...c, created_at: new Date().toISOString() }));
        savedCards = [...savedCards, ...saved];
        setFlashcards((prev) => [...prev, ...saved]);
      }

      const failNote = failedBatches > 0 ? ` (${failedBatches}개 배치 실패 — 부분 추출됨)` : "";
      setFlashcardStatus(`전체 ${totalPages}페이지에서 단어 추출 완료. 총 ${savedCards.length}개${failNote}`);
    } catch (err) {
      setFlashcardError(`단어 추출에 실패했습니다: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [
    isGeneratingFlashcards,
    user,
    file,
    selectedFileId,
    isLoadingText,
    flashcards,
    getOpenAiService,
    outputLanguage,
    topicStructure,
  ]);

  const handleReextractVocabulary = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    // 새 카드 추출에 성공한 뒤에만 기존 카드를 교체 (실패 시 기존 카드 보존)
    const existingIds = flashcards.map((c) => c.id);
    await handleGenerateVocabularyFlashcards({ replaceCardIds: existingIds });
  }, [isGeneratingFlashcards, flashcards, handleGenerateVocabularyFlashcards]);

  const handleRegenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    // 새 카드 생성에 성공한 뒤에만 기존 카드를 교체 (실패 시 기존 카드 보존)
    const existingIds = flashcards.map((c) => c.id);
    await handleGenerateFlashcards({ replaceCardIds: existingIds });
  }, [isGeneratingFlashcards, flashcards, handleGenerateFlashcards]);

  return {
    handleAddFlashcard,
    handleDeleteFlashcard,
    handleUpdateFlashcard,
    handleDeduplicateFlashcards,
    handleDeleteAllFlashcards,
    handleSaveFlashcardScore,
    handleSaveVocabQuizScore,
    handleUpdateFlashcardSrs,
    handleGenerateFlashcards,
    handleGenerateVocabularyFlashcards,
    handleReextractVocabulary,
    handleRegenerateFlashcards,
  };
}

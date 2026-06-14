import { useCallback, useEffect, useRef } from "react";
import {
  supabase,
  listFlashcards,
  listFlashcardScores,
  addFlashcards,
} from "../services/supabase";
import { isDbId } from "../utils/appStateHelpers";
import { useFlashcardStore, useDocumentStore } from "../stores";

export function useFlashcards({ user, selectedFileId }) {
  const {
    flashcards, setFlashcards,
    setIsLoadingFlashcards,
    setFlashcardScores,
    setVocabQuizScores,
    setFlashcardStatus,
  } = useFlashcardStore();

  const { setError } = useDocumentStore();

  const loadFlashcards = useCallback(
    async (deckId) => {
      if (!supabase || !user) {
        setFlashcards([]);
        setFlashcardScores([]);
        setVocabQuizScores([]);
        return;
      }
      setIsLoadingFlashcards(true);
      try {
        const [list, scores, quizScores] = await Promise.all([
          listFlashcards({ userId: user.id, deckId }),
          listFlashcardScores({ userId: user.id, deckId }).catch(() => []),
          listFlashcardScores({ userId: user.id, deckId: deckId + "_vq" }).catch(() => []),
        ]);
        setFlashcards(list);
        setFlashcardScores(scores);
        setVocabQuizScores(quizScores);
      } catch (err) {
        setError(`플래시카드를 불러오지 못했습니다: ${err.message}`);
      } finally {
        setIsLoadingFlashcards(false);
      }
    },
    [user]
  );

  // 로그인 전 로컬 카드 → Supabase 마이그레이션
  const prevUserRef = useRef(null);
  useEffect(() => {
    const wasLoggedOut = !prevUserRef.current;
    const isNowLoggedIn = Boolean(user);
    prevUserRef.current = user;
    if (!wasLoggedOut || !isNowLoggedIn || !supabase) return;
    const localCards = flashcards.filter((c) => !isDbId(c.id));
    if (localCards.length === 0) return;
    const deckId = selectedFileId || "default";
    (async () => {
      try {
        const saved = await addFlashcards({
          userId: user.id,
          deckId,
          cards: localCards.map(({ front, back, hint }) => ({ front, back, hint: hint || "" })),
        });
        if (saved?.length) {
          setFlashcards((prev) => {
            const localIds = new Set(localCards.map((c) => c.id));
            return [...saved, ...prev.filter((c) => !localIds.has(c.id))];
          });
          setFlashcardStatus(`로그인 후 로컬 카드 ${saved.length}개를 저장했습니다.`);
        }
      } catch {
        // 마이그레이션 실패 시 무시 (로컬 카드는 그대로 유지)
      }
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loadFlashcards };
}

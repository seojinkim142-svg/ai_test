import { useCallback } from "react";
import { supabase, fetchMockExams } from "../services/supabase";
import { buildMockExamAnswerSheet } from "../utils/mockExamUtils";
import { useMockExamStore } from "../stores";

export function useMockExams({ user }) {
  const {
    setMockExams,
    setIsLoadingMockExams,
    setMockExamError,
  } = useMockExamStore();

  const loadMockExams = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setMockExams([]);
        return;
      }
      setIsLoadingMockExams(true);
      try {
        const list = await fetchMockExams({ userId: user.id, docId });
        const normalized = (Array.isArray(list) ? list : []).map((exam) => {
          const payload = exam?.payload || {};
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const answerSheet = buildMockExamAnswerSheet(items, payload?.answerSheet);
          return {
            ...exam,
            payload: {
              ...payload,
              items,
              answerSheet,
            },
          };
        });
        setMockExams(normalized);
      } catch (err) {
        setMockExamError(`모의고사 목록을 불러오지 못했습니다: ${err.message}`);
      } finally {
        setIsLoadingMockExams(false);
      }
    },
    [user]
  );

  return { loadMockExams };
}

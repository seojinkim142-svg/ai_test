import { useState, useRef, useEffect, useCallback } from "react";
import { fetchMindmap, saveMindmap } from "../services/supabase";

export function useMindmap({ summary, userId, docId, outputLanguage, getOpenAiService }) {
  const [mindmapData, setMindmapData] = useState("");
  const [isLoadingMindmap, setIsLoadingMindmap] = useState(false);
  const summarySourceRef = useRef("");
  const abortControllerRef = useRef(null);

  // 요약/문서가 바뀌면 진행 중 요청 취소 후 Supabase에서 캐시 복원
  useEffect(() => {
    const trimmed = String(summary || "").trim();

    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMindmapData("");
    setIsLoadingMindmap(false);
    summarySourceRef.current = "";

    if (!trimmed || !userId || !docId) return;

    fetchMindmap({ userId, docId })
      .then((cached) => {
        if (cached) {
          setMindmapData(cached);
          summarySourceRef.current = trimmed;
        }
      })
      .catch(() => {});
  }, [summary, userId, docId]);

  const requestMindMap = useCallback(
    async ({ force = false } = {}) => {
      const currentSummary = String(summary || "").trim();
      if (!currentSummary) return;
      if (isLoadingMindmap) return;
      if (!force && summarySourceRef.current === currentSummary && mindmapData) return;

      // 이전 요청 취소 후 새 컨트롤러 등록
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      summarySourceRef.current = "";
      setIsLoadingMindmap(true);
      setMindmapData("");

      try {
        const { generateMindMap } = await getOpenAiService();
        if (controller.signal.aborted) return;

        const result = await generateMindMap(currentSummary, { outputLanguage });
        if (controller.signal.aborted) return;

        summarySourceRef.current = currentSummary;
        setMindmapData(result);

        if (userId && docId) {
          saveMindmap({ userId, docId, mindmap: result }).catch(() => {});
        }
      } catch (e) {
        if (e?.name !== "AbortError") console.error("[MindMap] generation failed", e);
      } finally {
        // 이 요청이 여전히 활성 요청인 경우에만 로딩 해제
        if (abortControllerRef.current === controller) {
          setIsLoadingMindmap(false);
          abortControllerRef.current = null;
        }
      }
    },
    [summary, mindmapData, isLoadingMindmap, outputLanguage, getOpenAiService, userId, docId]
  );

  return { mindmapData, isLoadingMindmap, requestMindMap };
}

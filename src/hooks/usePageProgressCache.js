import { useCallback, useRef } from "react";
import { toNonNegativeInt, toSortedUniquePages } from "../utils/appStateHelpers";

export function usePageProgressCache({ isPremiumTier, activePremiumProfileId }) {
  const filePageProgressRef = useRef(new Map());

  const getPageProgressCacheKey = useCallback(
    (docId, profileIdOverride = null) => {
      const normalizedDocId = String(docId || "").trim();
      if (!normalizedDocId) return "";
      if (!isPremiumTier) return normalizedDocId;
      const normalizedProfileId =
        String(profileIdOverride || activePremiumProfileId || "").trim() || "default";
      return `${normalizedDocId}:${normalizedProfileId}`;
    },
    [activePremiumProfileId, isPremiumTier]
  );

  const savePageProgressSnapshot = useCallback(
    ({ docId, visited = [], page = 1, profileId = null }) => {
      const cacheKey = getPageProgressCacheKey(docId, profileId);
      if (!cacheKey) return;
      const normalizedVisited = Array.isArray(visited)
        ? visited
        : visited instanceof Set
          ? Array.from(visited)
          : [];
      filePageProgressRef.current.set(cacheKey, {
        visitedPages: toSortedUniquePages(normalizedVisited),
        currentPage: toNonNegativeInt(page) || 1,
      });
    },
    [getPageProgressCacheKey]
  );

  const loadPageProgressSnapshot = useCallback(
    ({ docId, profileId = null }) => {
      const cacheKey = getPageProgressCacheKey(docId, profileId);
      if (!cacheKey) {
        return { visitedPages: [], currentPage: 1 };
      }
      const saved = filePageProgressRef.current.get(cacheKey);
      return {
        visitedPages: toSortedUniquePages(saved?.visitedPages),
        currentPage: toNonNegativeInt(saved?.currentPage) || 1,
      };
    },
    [getPageProgressCacheKey]
  );

  return { savePageProgressSnapshot, loadPageProgressSnapshot };
}

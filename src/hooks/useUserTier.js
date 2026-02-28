import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TIER, getUserTier } from "../services/supabase";

export function useUserTier(user) {
  const [tier, setTier] = useState(DEFAULT_TIER);
  const [loadingTier, setLoadingTier] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshTier = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadTier = async () => {
      if (!user?.id) {
        setTier(DEFAULT_TIER);
        setResolvedUserId(null);
        setLoadingTier(false);
        return;
      }
      const currentUserId = user.id;
      setLoadingTier(true);
      try {
        const fetched = await getUserTier({ userId: user.id });
        if (mounted) setTier(fetched || DEFAULT_TIER);
      } catch {
        if (mounted) setTier(DEFAULT_TIER);
      } finally {
        if (mounted) {
          setResolvedUserId(currentUserId);
          setLoadingTier(false);
        }
      }
    };
    loadTier();
    return () => {
      mounted = false;
    };
  }, [user?.id, refreshKey]);

  const isTierLoading =
    Boolean(user?.id) && (loadingTier || resolvedUserId !== user.id);

  return { tier, loadingTier: isTierLoading, refreshTier };
}

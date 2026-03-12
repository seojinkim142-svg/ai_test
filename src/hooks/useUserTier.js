import { useCallback, useEffect, useState } from "react";
import { DEFAULT_TIER, getUserTierStatus } from "../services/supabase";

export function useUserTier(user) {
  const [tier, setTier] = useState(DEFAULT_TIER);
  const [tierExpiresAt, setTierExpiresAt] = useState(null);
  const [tierRemainingDays, setTierRemainingDays] = useState(null);
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
        setTierExpiresAt(null);
        setTierRemainingDays(null);
        setResolvedUserId(null);
        setLoadingTier(false);
        return;
      }
      const currentUserId = user.id;
      setLoadingTier(true);
      try {
        const fetched = await getUserTierStatus({ userId: user.id });
        if (mounted) {
          setTier(fetched?.tier || DEFAULT_TIER);
          setTierExpiresAt(fetched?.tierExpiresAt || null);
          setTierRemainingDays(
            Number.isFinite(Number(fetched?.tierRemainingDays))
              ? Number(fetched.tierRemainingDays)
              : null
          );
        }
      } catch {
        if (mounted) {
          setTier(DEFAULT_TIER);
          setTierExpiresAt(null);
          setTierRemainingDays(null);
        }
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

  return { tier, tierExpiresAt, tierRemainingDays, loadingTier: isTierLoading, refreshTier };
}

import { useEffect, useState } from "react";
import { DEFAULT_TIER, getUserTier } from "../services/supabase";

export function useUserTier(user) {
  const [tier, setTier] = useState(DEFAULT_TIER);
  const [loadingTier, setLoadingTier] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadTier = async () => {
      if (!user?.id) {
        setTier(DEFAULT_TIER);
        return;
      }
      setLoadingTier(true);
      try {
        const fetched = await getUserTier({ userId: user.id });
        if (mounted) setTier(fetched || DEFAULT_TIER);
      } catch {
        if (mounted) setTier(DEFAULT_TIER);
      } finally {
        if (mounted) setLoadingTier(false);
      }
    };
    loadTier();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return { tier, loadingTier };
}

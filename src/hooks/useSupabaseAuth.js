import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, signOut as supabaseSignOut } from "../services/supabase";

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const handledOAuthRef = useRef(false);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    try {
      if (!handledOAuthRef.current && typeof window !== "undefined") {
        const url = window.location.href;
        const hash = window.location.hash || "";
        const hasAccessToken = hash.includes("access_token=");
        const hasCode = url.includes("code=");

        if (hasAccessToken) {
          handledOAuthRef.current = true;
          const params = new URLSearchParams(hash.slice(1));
          const access_token = params.get("access_token");
          const refresh_token = params.get("refresh_token") || params.get("provider_refresh_token");
          if (access_token) {
            const { data, error } = await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || undefined,
            });
            if (!error && data?.session?.user) {
              setUser(data.session.user);
            }
          }
          const cleanUrl = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } else if (hasCode) {
          handledOAuthRef.current = true;
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (!error && data?.session?.user) {
            setUser(data.session.user);
          }
          const cleanUrl = url.split("?")[0];
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setUser(data.session?.user || null);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Supabase 세션 확인 실패:", err);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [refreshSession]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabaseSignOut();
      setUser(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Supabase 로그아웃 실패:", err);
    }
  }, []);

  return { user, authReady, refreshSession, handleSignOut };
}

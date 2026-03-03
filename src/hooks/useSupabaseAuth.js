import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, signOut as supabaseSignOut } from "../services/supabase";

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const handledOAuthRef = useRef(false);
  const authResolveVersionRef = useRef(0);

  const resolveFreshUser = useCallback(async (sessionUser) => {
    const version = ++authResolveVersionRef.current;
    if (!sessionUser) {
      setUser(null);
      return;
    }

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (version !== authResolveVersionRef.current) return;
      if (!userError && userData?.user) {
        setUser(userData.user);
        return;
      }
    } catch {
      // Fallback to session user below.
    }

    if (version !== authResolveVersionRef.current) return;
    setUser(sessionUser);
  }, []);

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
            await supabase.auth.setSession({
              access_token,
              refresh_token: refresh_token || undefined,
            });
          }
          const cleanUrl = `${window.location.origin}${window.location.pathname}`;
          window.history.replaceState({}, document.title, cleanUrl);
        } else if (hasCode) {
          handledOAuthRef.current = true;
          await supabase.auth.exchangeCodeForSession(url);
          const cleanUrl = url.split("?")[0];
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        await resolveFreshUser(data.session?.user || null);
      }
    } catch (err) {
      console.warn("Supabase session check failed:", err);
    } finally {
      setAuthReady(true);
    }
  }, [resolveFreshUser]);

  useEffect(() => {
    refreshSession();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveFreshUser(session?.user || null);
    });
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [refreshSession, resolveFreshUser]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabaseSignOut();
      setUser(null);
    } catch (err) {
      console.warn("Supabase signout failed:", err);
    }
  }, []);

  return { user, authReady, refreshSession, handleSignOut };
}

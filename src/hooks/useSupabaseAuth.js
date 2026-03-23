import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  isNativeSupabaseRedirectUrl,
  supabase,
  signOut as supabaseSignOut,
} from "../services/supabase";

const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();
const NativeAppPlugin =
  IS_NATIVE_PLATFORM && Capacitor.isPluginAvailable("App")
    ? Capacitor.registerPlugin("App")
    : null;

function getHandledOAuthKey(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const code = parsed.searchParams.get("code");
    if (code) return `code:${code}`;

    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    if (accessToken) return `token:${accessToken}`;

    return parsed.toString();
  } catch {
    return value;
  }
}

function clearOAuthParamsFromBrowserUrl() {
  if (typeof window === "undefined" || !window.history) return;
  window.history.replaceState({}, document.title, window.location.pathname);
}

export function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const handledOAuthKeyRef = useRef("");
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

  const refreshResolvedUser = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      await resolveFreshUser(data.session?.user || null);
    }
  }, [resolveFreshUser]);

  const handleOAuthCallbackUrl = useCallback(async (rawUrl, { clearBrowserUrl = false } = {}) => {
    if (!supabase) return false;

    const url = String(rawUrl || "").trim();
    if (!url) return false;

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    const hash = parsed.hash || "";
    const hasAccessToken = hash.includes("access_token=");
    const hasCode = parsed.searchParams.has("code");
    if (!hasAccessToken && !hasCode) return false;

    const handledKey = getHandledOAuthKey(url);
    if (handledKey && handledKey === handledOAuthKeyRef.current) return true;

    const previousKey = handledOAuthKeyRef.current;
    handledOAuthKeyRef.current = handledKey;

    try {
      if (hasAccessToken) {
        const params = new URLSearchParams(hash.slice(1));
        const access_token = params.get("access_token");
        const refresh_token =
          params.get("refresh_token") || params.get("provider_refresh_token");

        if (access_token) {
          await supabase.auth.setSession({
            access_token,
            refresh_token: refresh_token || undefined,
          });
        }
      } else {
        await supabase.auth.exchangeCodeForSession(url);
      }

      if (clearBrowserUrl) {
        clearOAuthParamsFromBrowserUrl();
      }
      return true;
    } catch (err) {
      handledOAuthKeyRef.current = previousKey;
      throw err;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    try {
      if (IS_NATIVE_PLATFORM && NativeAppPlugin && typeof NativeAppPlugin.getLaunchUrl === "function") {
        const launchData = await NativeAppPlugin.getLaunchUrl();
        if (isNativeSupabaseRedirectUrl(launchData?.url)) {
          await handleOAuthCallbackUrl(launchData.url);
        }
      }

      if (typeof window !== "undefined") {
        await handleOAuthCallbackUrl(window.location.href, { clearBrowserUrl: true });
      }

      await refreshResolvedUser();
    } catch (err) {
      console.warn("Supabase session check failed:", err);
    } finally {
      setAuthReady(true);
    }
  }, [handleOAuthCallbackUrl, refreshResolvedUser]);

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

  useEffect(() => {
    if (!supabase || !IS_NATIVE_PLATFORM || !NativeAppPlugin) return undefined;

    let cancelled = false;
    let listenerHandle = null;

    (async () => {
      try {
        listenerHandle = await NativeAppPlugin.addListener("appUrlOpen", async ({ url }) => {
          if (!url || !isNativeSupabaseRedirectUrl(url)) return;

          try {
            await handleOAuthCallbackUrl(url);
            if (cancelled) return;
            await refreshResolvedUser();
            if (!cancelled) setAuthReady(true);
          } catch (err) {
            console.warn("Supabase native OAuth callback failed:", err);
          }
        });
      } catch (err) {
        console.warn("Supabase native App listener setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      listenerHandle?.remove?.();
    };
  }, [handleOAuthCallbackUrl, refreshResolvedUser]);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabaseSignOut();
      handledOAuthKeyRef.current = "";
      setUser(null);
    } catch (err) {
      console.warn("Supabase signout failed:", err);
    }
  }, []);

  return { user, authReady, refreshSession, handleSignOut };
}

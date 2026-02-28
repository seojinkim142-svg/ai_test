import { Suspense, lazy, memo, useCallback, useEffect, useRef, useState } from "react";
import StartSplash from "./StartSplash";

const LandingIntro = lazy(() => import("./LandingIntro"));
const SPLASH_TIMING = {
  motion: { startExitDelay: 1250, fadeDuration: 560 },
  reduced: { startExitDelay: 90, fadeDuration: 220 },
};

const PromoIntro = memo(function PromoIntro({ onStart }) {
  const [showLandingIntro, setShowLandingIntro] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashExiting, setIsSplashExiting] = useState(false);
  const activatedRef = useRef(false);
  const startExitTimerRef = useRef(null);
  const hideSplashTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let handle = null;
    const preload = () => {
      if (cancelled) return;
      import("./LandingIntro");
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      handle = window.requestIdleCallback(preload, { timeout: 1000 });
    } else {
      handle = window.setTimeout(preload, 200);
    }

    return () => {
      cancelled = true;
      if (handle == null || typeof window === "undefined") return;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previous = document.body.style.overflow;
    if (showSplash) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previous;
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [showSplash]);

  const handleActivate = useCallback(({ reduceMotion = false } = {}) => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setShowLandingIntro(true);
    setIsSplashExiting(false);
    const timing = reduceMotion ? SPLASH_TIMING.reduced : SPLASH_TIMING.motion;
    if (startExitTimerRef.current) {
      window.clearTimeout(startExitTimerRef.current);
    }
    if (hideSplashTimerRef.current) {
      window.clearTimeout(hideSplashTimerRef.current);
    }
    startExitTimerRef.current = window.setTimeout(() => {
      setIsSplashExiting(true);
    }, timing.startExitDelay);
    hideSplashTimerRef.current = window.setTimeout(() => {
      setShowSplash(false);
    }, timing.startExitDelay + timing.fadeDuration);
  }, []);

  useEffect(() => {
    return () => {
      if (startExitTimerRef.current) {
        window.clearTimeout(startExitTimerRef.current);
      }
      if (hideSplashTimerRef.current) {
        window.clearTimeout(hideSplashTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      {showSplash && (
        <div className="promo-splash-layer fixed inset-0 z-[70]" data-exiting={isSplashExiting}>
          <StartSplash onActivated={handleActivate} />
        </div>
      )}
      {showLandingIntro && (
        <Suspense fallback={null}>
          <LandingIntro onStart={onStart} />
        </Suspense>
      )}
    </>
  );
});

export default PromoIntro;

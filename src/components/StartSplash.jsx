import { memo, useCallback, useEffect, useRef, useState } from "react";

const StartSplash = memo(function StartSplash({ onActivated }) {
  const [active, setActive] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const activatedRef = useRef(false);

  const activate = useCallback(() => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setActive(true);
    onActivated?.({ reduceMotion });
  }, [onActivated, reduceMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (active || typeof window === "undefined") return undefined;

    window.addEventListener("wheel", activate, { passive: true });
    window.addEventListener("scroll", activate, { passive: true });
    window.addEventListener("touchstart", activate, { passive: true });

    return () => {
      window.removeEventListener("wheel", activate);
      window.removeEventListener("scroll", activate);
      window.removeEventListener("touchstart", activate);
    };
  }, [active, activate]);

  return (
    <section
      className="splash-screen"
      data-active={active}
      data-skip={reduceMotion}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Start Zeusian intro"
    >
      <div className="splash-backdrop" aria-hidden="true" />
      <div className="splash-grid" aria-hidden="true" />
      <div className="splash-aura" aria-hidden="true" />
      <div className="splash-flash" aria-hidden="true" />
      <div className="splash-lightning-wrap" aria-hidden="true">
        <img
          className="splash-lightning"
          src="/zeusian_logo-Photoroom.png"
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </div>
      <div className="splash-title" aria-hidden={!active}>
        <span>Z</span>
        <span>e</span>
        <span>u</span>
        <span className="splash-title-gap">i</span>
        <span>a</span>
        <span>n</span>
      </div>
      <p className="splash-hint" aria-hidden={active}>
        click / scroll / start
      </p>
    </section>
  );
});

export default StartSplash;

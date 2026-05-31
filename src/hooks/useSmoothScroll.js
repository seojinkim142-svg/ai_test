import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenisInstance = null;

export function getLenis() {
  return lenisInstance;
}

export function useSmoothScroll() {
  useEffect(() => {
    if (lenisInstance) return;

    lenisInstance = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
    });

    lenisInstance.on("scroll", ScrollTrigger.update);

    // 함수를 변수에 저장해야 cleanup 시 정확히 제거 가능
    const tickerFn = (time) => {
      if (lenisInstance) lenisInstance.raf(time * 1000);
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tickerFn);
      if (lenisInstance) {
        lenisInstance.off("scroll", ScrollTrigger.update);
        lenisInstance.destroy();
        lenisInstance = null;
      }
    };
  }, []);
}

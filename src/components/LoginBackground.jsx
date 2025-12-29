import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 로그인 화면 배경용: 커서를 따라 몽우리 블롭이 부드럽게 움직입니다.
 */
function LoginBackground({ children, intensity = 80 }) {
  const blobARef = useRef(null);
  const blobBRef = useRef(null);
  const blobCRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const [allowMotion, setAllowMotion] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllowMotion(!media.matches);
    update();
    media.addEventListener("change", update);

    const animate = () => {
      const { x: tx, y: ty } = targetRef.current;
      const { x: cx, y: cy } = currentRef.current;
      const nx = cx + (tx - cx) * 0.18;
      const ny = cy + (ty - cy) * 0.18;
      currentRef.current = { x: nx, y: ny };

      if (blobARef.current) {
        blobARef.current.style.transform = `translate(-50%, -50%) translate3d(${nx}px, ${ny}px, 0) scale(1.05)`;
      }
      if (blobBRef.current) {
        blobBRef.current.style.transform = `translate(-50%, -50%) translate3d(${nx * -0.4}px, ${ny * -0.4}px, 0) scale(0.95)`;
      }
      if (blobCRef.current) {
        blobCRef.current.style.transform = `translate(-50%, -50%) translate3d(${nx * 0.8}px, ${ny * 0.8}px, 0) scale(1.15)`;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      media.removeEventListener("change", update);
    };
  }, []);

  const handleMove = useCallback(
    (event) => {
      if (!allowMotion) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - rect.left - rect.width / 2;
      const dy = event.clientY - rect.top - rect.height / 2;
      const scale = event.pointerType && event.pointerType !== "mouse" ? 0.45 : 1;
      const factor = (intensity || 80) / 100; // intensity는 중심 대비 이동량 스케일
      targetRef.current = { x: dx * factor * scale, y: dy * factor * scale };
    },
    [intensity, allowMotion]
  );
  const handleLeave = useCallback(() => {
    if (!allowMotion) return;
    targetRef.current = { x: 0, y: 0 };
  }, [allowMotion]);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100"
      onPointerMove={allowMotion ? handleMove : undefined}
      onPointerLeave={allowMotion ? handleLeave : undefined}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-slate-950 to-indigo-900/30" />
        <div
          ref={blobARef}
          className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/35 blur-3xl"
        />
        <div
          ref={blobBRef}
          className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/28 blur-3xl"
        />
        <div
          ref={blobCRef}
          className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/22 blur-3xl"
        />
        <div className="absolute inset-0 bg-slate-950/40 backdrop-blur" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default LoginBackground;


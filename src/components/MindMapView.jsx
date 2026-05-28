import { useEffect, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap, globalCSS, deriveOptions } from "markmap-view";

const transformer = new Transformer();

let cssInjected = false;
function injectCSS() {
  if (cssInjected || !globalCSS) return;
  const style = document.createElement("style");
  style.textContent = globalCSS;
  document.head.appendChild(style);
  cssInjected = true;
}

export default function MindMapView({ summary }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    injectCSS();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !summary) return;

    svgRef.current.innerHTML = "";

    const containerWidth = containerRef.current?.clientWidth || 360;
    const nodeMaxWidth = Math.min(280, Math.max(120, Math.floor(containerWidth * 0.3)));

    let mm;
    try {
      const { root } = transformer.transform(summary);
      mm = Markmap.create(svgRef.current, deriveOptions({
        color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15"],
        duration: 400,
        maxWidth: nodeMaxWidth,
        initialExpandLevel: 3,
        paddingX: 8,
      }), root);
    } catch (e) {
      console.error("MindMap render error", e);
    }

    return () => {
      mm?.destroy?.();
      if (svgRef.current) svgRef.current.innerHTML = "";
    };
  }, [summary]);

  if (!summary) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        요약을 먼저 생성해 주세요.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
      style={{ height: "520px" }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        style={{ display: "block" }}
      />
      <p className="absolute bottom-2 right-3 text-[10px] text-slate-500 select-none">
        스크롤·드래그로 탐색
      </p>
    </div>
  );
}

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

const EXTRA_CSS = `
.markmap-node-circle { stroke-width: 1.5px; }
.markmap-node > line { stroke-width: 1.5px; stroke-opacity: 0.5; }
.markmap-link { stroke-opacity: 0.45; stroke-width: 1.5px; }
.markmap-foreign { line-height: 1.55; }
.markmap-foreign div { font-size: 13px; }
.markmap-foreign strong { font-weight: 700; }
`;

let extraCSSInjected = false;
function injectExtraCSS() {
  if (extraCSSInjected) return;
  const style = document.createElement("style");
  style.textContent = EXTRA_CSS;
  document.head.appendChild(style);
  extraCSSInjected = true;
}

export default function MindMapView({ summary }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    injectCSS();
    injectExtraCSS();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !summary) return;

    svgRef.current.innerHTML = "";

    const containerWidth = containerRef.current?.clientWidth || 500;
    const nodeMaxWidth = Math.min(420, Math.max(220, Math.floor(containerWidth * 0.38)));

    let mm;
    try {
      const { root } = transformer.transform(summary);
      mm = Markmap.create(svgRef.current, deriveOptions({
        color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15", "#38bdf8", "#f87171"],
        duration: 350,
        maxWidth: nodeMaxWidth,
        initialExpandLevel: 2,
        paddingX: 16,
        spacingHorizontal: 80,
        spacingVertical: 10,
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
      style={{ height: "680px" }}
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

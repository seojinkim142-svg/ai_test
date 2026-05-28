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
.mm-anchor,
.mm-tier {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  text-decoration: none;
}
.mm-anchor {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
  cursor: pointer;
}
.mm-anchor:hover {
  background: rgba(139, 92, 246, 0.3);
}
.mm-tier {
  font-weight: 600;
  border: 1px solid transparent;
}
.mm-tier--t1 {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
}
.mm-tier--t2 {
  background: rgba(234, 179, 8, 0.16);
  color: #fde68a;
  border-color: rgba(234, 179, 8, 0.35);
}
.mm-tier--t3 {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5e1;
  border-color: rgba(148, 163, 184, 0.28);
}
`;

let extraCSSInjected = false;
function injectExtraCSS() {
  if (extraCSSInjected) return;
  const style = document.createElement("style");
  style.textContent = EXTRA_CSS;
  document.head.appendChild(style);
  extraCSSInjected = true;
}

function injectAnchorTags(markdown) {
  return String(markdown || "").replace(
    /\[(?:문서:)?p\.(\d+)\]|\[(T[123])\]/g,
    (_, page, tier) =>
      page
        ? `<a class="mm-anchor" data-page="${page}" href="#">p.${page}</a>`
        : `<span class="mm-tier mm-tier--${tier.toLowerCase()}">${tier}</span>`
  );
}

export default function MindMapView({ summary, onJumpToPage }) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const pointerDownRef = useRef(null);

  useEffect(() => {
    injectCSS();
    injectExtraCSS();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !summary) return;

    svgRef.current.innerHTML = "";
    pointerDownRef.current = null;

    const containerWidth = containerRef.current?.clientWidth || 500;
    const nodeMaxWidth = Math.min(420, Math.max(220, Math.floor(containerWidth * 0.38)));

    let mm;
    const svg = svgRef.current;
    const handlePointerDown = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest(".mm-anchor") : null;
      if (!anchor) {
        pointerDownRef.current = null;
        return;
      }
      pointerDownRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleClick = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest(".mm-anchor") : null;
      if (!anchor) return;

      event.preventDefault();
      event.stopPropagation();

      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;

      const page = parseInt(anchor.dataset.page || "", 10);
      if (!Number.isNaN(page) && typeof onJumpToPage === "function") {
        onJumpToPage(page);
      }
    };

    try {
      const { root } = transformer.transform(injectAnchorTags(summary));
      mm = Markmap.create(svg, deriveOptions({
        color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15", "#38bdf8", "#f87171"],
        duration: 350,
        maxWidth: nodeMaxWidth,
        initialExpandLevel: 1,
        paddingX: 16,
        spacingHorizontal: 90,
        spacingVertical: 8,
      }), root);
      svg.addEventListener("pointerdown", handlePointerDown);
      svg.addEventListener("click", handleClick);
    } catch (e) {
      console.error("MindMap render error", e);
    }

    return () => {
      svg.removeEventListener("pointerdown", handlePointerDown);
      svg.removeEventListener("click", handleClick);
      mm?.destroy?.();
      svg.innerHTML = "";
    };
  }, [onJumpToPage, summary]);

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

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
.markmap-foreign .mm-anchor,
.markmap-foreign .mm-tier {
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
.markmap-foreign .mm-anchor {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
  border: 1px solid rgba(139, 92, 246, 0.3);
  cursor: pointer;
}
.markmap-foreign .mm-anchor:hover {
  background: rgba(139, 92, 246, 0.3);
  color: #ddd6fe;
}
.markmap-foreign .mm-tier {
  font-weight: 600;
  border: 1px solid transparent;
}
.markmap-foreign .mm-tier--t1 {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.3);
}
.markmap-foreign .mm-tier--t2 {
  background: rgba(234, 179, 8, 0.16);
  color: #fde68a;
  border-color: rgba(234, 179, 8, 0.35);
}
.markmap-foreign .mm-tier--t3 {
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

const INLINE_BADGE_RE = /\[(?:[^\]:]+:)?p\.(\d+)\]|\[(T[123])\]|\((T[123])\)/gi;

function injectAnchorTags(markdown) {
  return String(markdown || "").replace(
    INLINE_BADGE_RE,
    (_, page, bracketTier, parenTier) => {
      const tier = bracketTier || parenTier;
      return page
        ? `<a class="mm-anchor" data-page="${page}" href="#">p.${page}</a>`
        : `<span class="mm-tier mm-tier--${tier.toLowerCase()}">${tier}</span>`;
    }
  );
}

function createPageAnchor(doc, page) {
  const anchor = doc.createElement("a");
  anchor.className = "mm-anchor";
  anchor.dataset.page = page;
  anchor.href = "#";
  anchor.textContent = `p.${page}`;
  return anchor;
}

function createTierBadge(doc, tier) {
  const badge = doc.createElement("span");
  badge.className = `mm-tier mm-tier--${tier.toLowerCase()}`;
  badge.textContent = tier;
  return badge;
}

function renderInlineBadges(svg) {
  const doc = svg.ownerDocument || document;
  const roots = svg.querySelectorAll(".markmap-foreign div");

  roots.forEach((root) => {
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!INLINE_BADGE_RE.test(node.nodeValue || "")) {
          INLINE_BADGE_RE.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }
        INLINE_BADGE_RE.lastIndex = 0;
        const parent = node.parentElement;
        if (parent?.closest(".mm-anchor, .mm-tier")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach((node) => {
      const text = node.nodeValue || "";
      const fragment = doc.createDocumentFragment();
      let lastIndex = 0;
      INLINE_BADGE_RE.lastIndex = 0;

      for (const match of text.matchAll(INLINE_BADGE_RE)) {
        const index = match.index ?? 0;
        if (lastIndex < index) {
          fragment.appendChild(doc.createTextNode(text.slice(lastIndex, index)));
        }

        const page = match[1];
        const tier = match[2] || match[3];
        fragment.appendChild(page ? createPageAnchor(doc, page) : createTierBadge(doc, tier));
        lastIndex = index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
      }
      node.parentNode?.replaceChild(fragment, node);
    });
  });
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
    let isDisposed = false;

    const containerWidth = containerRef.current?.clientWidth || 500;
    const nodeMaxWidth = Math.min(420, Math.max(220, Math.floor(containerWidth * 0.38)));

    let mm;
    let badgeFrame = 0;
    let badgeTimer = 0;
    const svg = svgRef.current;
    const scheduleBadgeRender = () => {
      if (isDisposed) return;
      if (badgeFrame) window.cancelAnimationFrame(badgeFrame);
      if (badgeTimer) window.clearTimeout(badgeTimer);
      badgeFrame = window.requestAnimationFrame(() => {
        if (!isDisposed) renderInlineBadges(svg);
        badgeTimer = window.setTimeout(() => {
          if (!isDisposed) renderInlineBadges(svg);
        }, 120);
      });
    };
    const handlePointerDown = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest(".mm-anchor") : null;
      if (!anchor) {
        pointerDownRef.current = null;
        return;
      }
      event.stopPropagation();
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

    const renderMindMap = async () => {
      const { root } = transformer.transform(injectAnchorTags(summary));
      mm = Markmap.create(svg, deriveOptions({
        color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15", "#38bdf8", "#f87171"],
        duration: 350,
        maxWidth: nodeMaxWidth,
        initialExpandLevel: 1,
        paddingX: 16,
        spacingHorizontal: 90,
        spacingVertical: 8,
      }));

      const originalRenderData = mm.renderData.bind(mm);
      mm.renderData = async (...args) => {
        const result = await originalRenderData(...args);
        scheduleBadgeRender();
        return result;
      };

      svg.addEventListener("pointerdown", handlePointerDown, true);
      svg.addEventListener("click", handleClick, true);

      await mm.setData(root);
      if (!isDisposed) {
        await mm.fit().catch(() => {});
        scheduleBadgeRender();
      }
    };

    try {
      renderMindMap().catch((e) => {
        if (!isDisposed) console.error("MindMap render error", e);
      });
    } catch (e) {
      console.error("MindMap render error", e);
    }

    return () => {
      isDisposed = true;
      if (badgeFrame) window.cancelAnimationFrame(badgeFrame);
      if (badgeTimer) window.clearTimeout(badgeTimer);
      svg.removeEventListener("pointerdown", handlePointerDown, true);
      svg.removeEventListener("click", handleClick, true);
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

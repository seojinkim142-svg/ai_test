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
/* ── connecting curves ── */
.markmap-node > line { stroke-width: 2px; stroke-opacity: 0.5; }
.markmap-link { stroke-opacity: 0.4; stroke-width: 2px; }

/* ── remove the small circle dot completely ── */
.markmap-node-circle { display: none !important; }

/* ── CARD NODE ── */
.markmap-foreign {
  overflow: visible !important;
}
.markmap-foreign > div {
  display: inline-block !important;
  background: #1e293b !important;
  border: 1.5px solid rgba(148, 163, 184, 0.25) !important;
  border-radius: 12px !important;
  padding: 8px 16px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  color: #e2e8f0 !important;
  line-height: 1.5 !important;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.55),
    0 1px 3px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.07) !important;
  transition: border-color 0.15s, box-shadow 0.15s !important;
  cursor: default !important;
  white-space: nowrap !important;
}
.markmap-foreign > div:hover {
  border-color: rgba(148, 163, 184, 0.5) !important;
  box-shadow:
    0 6px 24px rgba(0, 0, 0, 0.65),
    0 2px 6px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
}
.markmap-foreign strong { font-weight: 700; color: #f8fafc; }
.markmap-foreign em { color: #94a3b8; }

/* ── page / tier badges inside cards ── */
.markmap-foreign .mm-anchor,
.markmap-foreign .mm-tier {
  display: inline-flex;
  align-items: center;
  margin-left: 5px;
  padding: 1px 7px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  vertical-align: middle;
}
.markmap-foreign .mm-anchor {
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border: 1px solid rgba(139, 92, 246, 0.4);
  cursor: pointer;
  font-family: inherit;
  line-height: 1.35;
  text-decoration: none;
}
.markmap-foreign .mm-anchor:hover {
  background: rgba(139, 92, 246, 0.35);
  color: #ddd6fe;
}
.markmap-foreign .mm-tier { font-weight: 600; border: 1px solid transparent; }
.markmap-foreign .mm-tier--t1 { background: rgba(34,197,94,0.15); color: #86efac; border-color: rgba(34,197,94,0.3); }
.markmap-foreign .mm-tier--t2 { background: rgba(234,179,8,0.16); color: #fde68a; border-color: rgba(234,179,8,0.35); }
.markmap-foreign .mm-tier--t3 { background: rgba(148,163,184,0.14); color: #cbd5e1; border-color: rgba(148,163,184,0.28); }
`;

let extraStyleEl = null;
function injectExtraCSS() {
  if (extraStyleEl) {
    extraStyleEl.textContent = EXTRA_CSS; // always update in case CSS changed
    return;
  }
  extraStyleEl = document.createElement("style");
  extraStyleEl.id = "mm-extra-css";
  extraStyleEl.textContent = EXTRA_CSS;
  document.head.appendChild(extraStyleEl);
}

// ── JSON tree → markmap markdown ─────────────────────────────────────────────

function buildTreeFromJson(nodes) {
  const map = {};
  nodes.forEach((n) => { map[n.id] = { ...n, children: [] }; });
  let root = null;
  nodes.forEach((n) => {
    if (!n.parentId || !map[n.parentId]) {
      if (!root) root = map[n.id];
    } else {
      map[n.parentId].children.push(map[n.id]);
    }
  });
  return root;
}

function cleanContentForMarkmap(content) {
  if (!content) return "";
  // Remove markdown tables (markmap renders them poorly)
  const lines = String(content).split("\n").filter((l) => !l.trim().startsWith("|"));
  return lines.join("\n").trim();
}

function dfsToMarkmap(node, depth, lines) {
  if (!node) return;
  const label = String(node.label || "").trim();
  const content = cleanContentForMarkmap(node.content);
  const isQuestion = node.type === "question";

  if (depth === 0) {
    lines.push(`# ${label}`);
    if (content) content.split("\n").forEach((l) => l.trim() && lines.push(l));
  } else if (depth === 1) {
    lines.push(`## ${isQuestion ? "? " : ""}${label}`);
    if (content) content.split("\n").forEach((l) => l.trim() && lines.push(l));
  } else if (depth === 2) {
    lines.push(`### ${isQuestion ? "? " : ""}${label}`);
    if (content) content.split("\n").forEach((l) => l.trim() && lines.push(l));
  } else {
    // depth 3+ → leaf bullets
    if (content) {
      // content has its own bullets — emit them directly
      content.split("\n").forEach((l) => {
        const stripped = l.trim();
        if (!stripped) return;
        if (stripped.startsWith("-") || stripped.startsWith("*")) {
          lines.push(stripped);
        } else {
          lines.push(`- **${label}**: ${stripped}`);
        }
      });
    } else {
      lines.push(`- **${label}**`);
    }
    // don't recurse deeper for depth 3+ to keep markmap readable
    return;
  }

  // sort: put start/source/next first, then branches, then questions last
  const sorted = [...(node.children || [])].sort((a, b) => {
    const order = { start: 0, source: 1, next: 2, branch: 3, sub: 4, leaf: 5, question: 6 };
    return (order[a.type] ?? 5) - (order[b.type] ?? 5);
  });
  sorted.forEach((child) => dfsToMarkmap(child, depth + 1, lines));
}

function jsonToMarkmap(jsonStr) {
  try {
    const nodes = JSON.parse(jsonStr);
    if (!Array.isArray(nodes)) return null;
    const root = buildTreeFromJson(nodes);
    if (!root) return null;
    const lines = [];
    dfsToMarkmap(root, 0, lines);
    return lines.join("\n");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const INLINE_BADGE_RE = /\[(?:[^\]:]+:)?p\.(\d+)\]|\[(T[123])\]|\((T[123])\)/gi;

function injectAnchorTags(markdown) {
  return String(markdown || "").replace(
    INLINE_BADGE_RE,
    (_, page, bracketTier, parenTier) => {
      const tier = bracketTier || parenTier;
      return page
        ? `<button type="button" class="mm-anchor" data-page="${page}">p.${page}</button>`
        : `<span class="mm-tier mm-tier--${tier.toLowerCase()}">${tier}</span>`;
    }
  );
}

function createPageAnchor(doc, page) {
  const anchor = doc.createElement("button");
  anchor.type = "button";
  anchor.className = "mm-anchor";
  anchor.dataset.page = page;
  anchor.textContent = `p.${page}`;
  return anchor;
}

function createTierBadge(doc, tier) {
  const badge = doc.createElement("span");
  badge.className = `mm-tier mm-tier--${tier.toLowerCase()}`;
  badge.textContent = tier;
  return badge;
}

function applyCardStyles(svg) {
  svg.querySelectorAll(".markmap-foreign > div").forEach((div) => {
    div.style.cssText = `
      display: inline-block !important;
      background: #1e293b !important;
      border: 1.5px solid rgba(148,163,184,0.25) !important;
      border-radius: 12px !important;
      padding: 8px 16px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      color: #e2e8f0 !important;
      line-height: 1.5 !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07) !important;
      white-space: nowrap !important;
      cursor: default !important;
    `;
  });
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

export default function MindMapView({ summary, mindmapData, onJumpToPage }) {
  // Resolve the markdown to render: JSON mindmapData takes priority, fallback to summary
  const resolvedMarkdown = (() => {
    if (mindmapData) {
      const converted = jsonToMarkmap(mindmapData);
      if (converted) return converted;
    }
    return summary || null;
  })();

  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const onJumpToPageRef = useRef(onJumpToPage);
  const pointerDownRef = useRef(null);

  useEffect(() => {
    injectCSS();
    injectExtraCSS();
  }, []);

  useEffect(() => {
    onJumpToPageRef.current = onJumpToPage;
  }, [onJumpToPage]);

  useEffect(() => {
    if (!svgRef.current || !resolvedMarkdown) return;

    svgRef.current.innerHTML = "";
    pointerDownRef.current = null;
    let isDisposed = false;

    const containerWidth = containerRef.current?.clientWidth || 500;
    const nodeMaxWidth = Math.min(420, Math.max(220, Math.floor(containerWidth * 0.38)));

    let mm;
    const svg = svgRef.current;

    // DOM 변경이 안정되면(50ms 조용하면) 한 번만 뱃지를 렌더링
    let debounceTimer = 0;
    const observer = new MutationObserver(() => {
      if (isDisposed) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isDisposed) {
          applyCardStyles(svg);
          renderInlineBadges(svg);
        }
      }, 50);
    });
    observer.observe(svg, { childList: true, subtree: true });

    const handlePointerDown = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest(".mm-anchor") : null;
      if (!anchor) {
        pointerDownRef.current = null;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      pointerDownRef.current = { x: event.clientX, y: event.clientY };
    };
    const handleClick = (event) => {
      const anchor = event.target instanceof Element ? event.target.closest(".mm-anchor") : null;
      if (!anchor) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;

      const page = parseInt(anchor.dataset.page || "", 10);
      const jumpToPage = onJumpToPageRef.current;
      if (!Number.isNaN(page) && typeof jumpToPage === "function") {
        jumpToPage(page);
      }
    };

    const renderMindMap = async () => {
      const { root } = transformer.transform(injectAnchorTags(resolvedMarkdown));
      mm = Markmap.create(svg, deriveOptions({
        color: ["#34d399", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15", "#38bdf8", "#f87171"],
        duration: 350,
        maxWidth: nodeMaxWidth,
        initialExpandLevel: 1,
        paddingX: 16,
        spacingHorizontal: 130,
        spacingVertical: 14,
      }));

      svg.addEventListener("pointerdown", handlePointerDown, true);
      svg.addEventListener("click", handleClick, true);

      await mm.setData(root);
      if (!isDisposed) {
        await mm.fit().catch(() => {});
        applyCardStyles(svg);
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
      clearTimeout(debounceTimer);
      observer.disconnect();
      svg.removeEventListener("pointerdown", handlePointerDown, true);
      svg.removeEventListener("click", handleClick, true);
      mm?.destroy?.();
      svg.innerHTML = "";
    };
  }, [resolvedMarkdown]);

  if (!resolvedMarkdown) {
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

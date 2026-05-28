import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// ── color map ────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  "blue-200":   { border: "border-blue-400/30",   bg: "bg-blue-500/10",   text: "text-blue-300",   badge: "bg-blue-500/20 text-blue-200" },
  "green-200":  { border: "border-green-400/30",  bg: "bg-green-500/10",  text: "text-green-300",  badge: "bg-green-500/20 text-green-200" },
  "yellow-200": { border: "border-yellow-400/30", bg: "bg-yellow-500/10", text: "text-yellow-300", badge: "bg-yellow-500/20 text-yellow-200" },
  "red-200":    { border: "border-red-400/30",    bg: "bg-red-500/10",    text: "text-red-300",    badge: "bg-red-500/20 text-red-200" },
  "sky-200":    { border: "border-sky-400/30",    bg: "bg-sky-500/10",    text: "text-sky-300",    badge: "bg-sky-500/20 text-sky-200" },
  "pink-200":   { border: "border-pink-400/30",   bg: "bg-pink-500/10",   text: "text-pink-300",   badge: "bg-pink-500/20 text-pink-200" },
  "purple-200": { border: "border-purple-400/30", bg: "bg-purple-500/10", text: "text-purple-300", badge: "bg-purple-500/20 text-purple-200" },
};

const DEFAULT_COLOR = { border: "border-white/10", bg: "bg-white/[0.03]", text: "text-slate-300", badge: "bg-white/10 text-slate-300" };

function getColor(color) {
  return COLOR_MAP[color] || DEFAULT_COLOR;
}

// ── tree builder ─────────────────────────────────────────────────────────────
function buildTree(nodes) {
  const map = {};
  nodes.forEach((n) => { map[n.id] = { ...n, children: [] }; });
  const roots = [];
  nodes.forEach((n) => {
    if (!n.parentId || !map[n.parentId]) {
      if (n.id === "1" || !n.parentId) roots.push(map[n.id]);
    } else {
      map[n.parentId].children.push(map[n.id]);
    }
  });
  return { map, root: roots[0] || null };
}

// ── parse mindmap data ───────────────────────────────────────────────────────
function parseMindmapData(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return buildTree(parsed);
  } catch {
    // not JSON — legacy markdown, can't render as tree
  }
  return null;
}

// ── page citation renderer ───────────────────────────────────────────────────
const PAGE_RE = /\[(?:문서:)?p\.(\d+)\]/g;

function CitationText({ text, onJumpToPage }) {
  if (!PAGE_RE.test(text)) return <span>{text}</span>;
  PAGE_RE.lastIndex = 0;
  const parts = [];
  let last = 0;
  let m;
  while ((m = PAGE_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={last}>{text.slice(last, m.index)}</span>);
    const page = parseInt(m[1], 10);
    parts.push(
      <button
        key={m.index}
        type="button"
        onClick={() => onJumpToPage?.(page)}
        className="mx-0.5 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 hover:bg-violet-500/25 hover:text-violet-200 transition-colors"
      >
        p.{m[1]}
      </button>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={last}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

// ── markdown renderer ────────────────────────────────────────────────────────
function NodeMarkdown({ content, onJumpToPage }) {
  if (!content) return null;

  // Replace [p.N] with a placeholder so ReactMarkdown doesn't eat it
  // We handle it in the text renderer
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      className="prose-mm"
      components={{
        p: ({ children }) => <p className="text-[12px] text-slate-300 leading-relaxed mb-1">{children}</p>,
        ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-3">{children}</ul>,
        ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-4 list-decimal">{children}</ol>,
        li: ({ children }) => (
          <li className="text-[12px] text-slate-300 leading-relaxed flex gap-1.5">
            <span className="mt-[5px] h-1 w-1 flex-shrink-0 rounded-full bg-slate-500" />
            <span className="flex-1">{children}</span>
          </li>
        ),
        strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
        em: ({ children }) => <em className="italic text-slate-300">{children}</em>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="w-full text-[11px] border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-white/5">{children}</thead>,
        th: ({ children }) => <th className="border border-white/10 px-2 py-1 text-left text-slate-200 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-white/10 px-2 py-1 text-slate-300">{children}</td>,
        code: ({ inline, children }) =>
          inline
            ? <code className="rounded bg-white/10 px-1 py-0.5 text-[11px] font-mono text-emerald-300">{children}</code>
            : <code className="block rounded-lg bg-black/30 p-2 text-[11px] font-mono text-emerald-300 overflow-x-auto my-1">{children}</code>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-violet-400/50 pl-2 my-1 text-slate-400 italic text-[12px]">{children}</blockquote>
        ),
        // intercept text nodes to render page citations
        text: ({ children }) => {
          const str = String(children || "");
          if (!PAGE_RE.test(str)) { PAGE_RE.lastIndex = 0; return <>{str}</>; }
          return <CitationText text={str} onJumpToPage={onJumpToPage} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ── type icons ───────────────────────────────────────────────────────────────
function TypeIcon({ type }) {
  if (type === "start")    return <span className="mr-1 text-sky-400 text-[11px]">▶</span>;
  if (type === "next")     return <span className="mr-1 text-green-400 text-[11px]">→</span>;
  if (type === "source")   return <span className="mr-1 text-purple-400 text-[11px]">◈</span>;
  if (type === "question") return <span className="mr-1 text-yellow-400 text-[11px]">?</span>;
  return null;
}

// ── leaf / sub node card (compact) ───────────────────────────────────────────
const LeafCard = memo(function LeafCard({ node, onJumpToPage, depth = 0 }) {
  const [open, setOpen] = useState(false);
  const c = getColor(node.color);
  const hasChildren = node.children?.length > 0;
  const isQuestion = node.type === "question";

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`} style={{ marginLeft: depth * 8 }}>
      <button
        type="button"
        onClick={() => hasChildren && setOpen((v) => !v)}
        className={`flex w-full items-start gap-2 px-3 py-2 text-left ${hasChildren ? "cursor-pointer hover:bg-white/5" : "cursor-default"}`}
      >
        <TypeIcon type={node.type} />
        <span className={`flex-1 text-[12px] font-medium ${isQuestion ? "text-yellow-300" : c.text}`}>
          {node.label}
        </span>
        {hasChildren && (
          <span className="text-[10px] text-slate-500 flex-shrink-0 mt-0.5">{open ? "▲" : "▼"}</span>
        )}
      </button>
      {node.content && (
        <div className="px-3 pb-2">
          <NodeMarkdown content={node.content} onJumpToPage={onJumpToPage} />
        </div>
      )}
      {open && hasChildren && (
        <div className="border-t border-white/5 px-2 py-2 flex flex-col gap-1.5">
          {node.children.map((child) => (
            <LeafCard key={child.id} node={child} onJumpToPage={onJumpToPage} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
});

// ── branch card (main section) ───────────────────────────────────────────────
const BranchCard = memo(function BranchCard({ node, onJumpToPage }) {
  const [open, setOpen] = useState(true);
  const c = getColor(node.color);
  const hasChildren = node.children?.length > 0;

  // separate question nodes from sub nodes
  const questionNodes = node.children?.filter((n) => n.type === "question") || [];
  const subNodes = node.children?.filter((n) => n.type !== "question") || [];

  return (
    <div className={`rounded-2xl border ${c.border} overflow-hidden`}>
      {/* header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left ${c.bg} hover:brightness-110 transition-all`}
      >
        <span className={`flex-1 text-[13px] font-bold ${c.text}`}>{node.label}</span>
        {hasChildren && (
          <span className="text-[10px] text-slate-500">{open ? "▲" : `▼ ${node.children.length}`}</span>
        )}
      </button>

      {/* branch summary content */}
      {node.content && (
        <div className={`px-4 py-2 ${c.bg} border-t border-white/5`}>
          <NodeMarkdown content={node.content} onJumpToPage={onJumpToPage} />
        </div>
      )}

      {/* children */}
      {open && hasChildren && (
        <div className="bg-slate-950/40 px-3 py-3 flex flex-col gap-2">
          {subNodes.map((child) => (
            <LeafCard key={child.id} node={child} onJumpToPage={onJumpToPage} />
          ))}
          {questionNodes.map((q) => (
            <div key={q.id} className="rounded-xl border border-yellow-400/20 bg-yellow-500/5 px-3 py-2">
              <p className="text-[11px] font-semibold text-yellow-400 mb-1">? 핵심 질문</p>
              <NodeMarkdown content={q.content} onJumpToPage={onJumpToPage} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── meta card (start / next / source) ────────────────────────────────────────
const MetaCard = memo(function MetaCard({ node, onJumpToPage }) {
  const [open, setOpen] = useState(false);
  const c = getColor(node.color);

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:brightness-110 transition-all"
      >
        <TypeIcon type={node.type} />
        <span className={`flex-1 text-[12px] font-semibold ${c.text}`}>{node.label}</span>
        <span className="text-[10px] text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && node.content && (
        <div className="px-3 pb-2 border-t border-white/5">
          <NodeMarkdown content={node.content} onJumpToPage={onJumpToPage} />
        </div>
      )}
    </div>
  );
});

// ── main component ────────────────────────────────────────────────────────────
const META_TYPES = new Set(["start", "next", "source"]);

export default function MindMapTreeView({ mindmapData, onJumpToPage }) {
  const tree = useMemo(() => parseMindmapData(mindmapData), [mindmapData]);

  const handleJump = useCallback(
    (page) => { if (typeof onJumpToPage === "function") onJumpToPage(page); },
    [onJumpToPage]
  );

  if (!tree || !tree.root) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        마인드맵 데이터가 없습니다. 재생성해 주세요.
      </div>
    );
  }

  const { root } = tree;
  const metaNodes   = root.children.filter((n) => META_TYPES.has(n.type));
  const branchNodes = root.children.filter((n) => !META_TYPES.has(n.type));

  return (
    <div className="flex flex-col gap-4">
      {/* ── root card ── */}
      <div className="rounded-2xl border border-white/15 bg-gradient-to-r from-slate-800/80 to-slate-900/60 px-5 py-4">
        <p className="text-base font-bold text-white">{root.label}</p>
        {root.content && (
          <p className="mt-1 text-[12px] text-slate-400">{root.content}</p>
        )}
      </div>

      {/* ── meta row (source / start / next) ── */}
      {metaNodes.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {metaNodes.map((n) => (
            <MetaCard key={n.id} node={n} onJumpToPage={handleJump} />
          ))}
        </div>
      )}

      {/* ── branch cards ── */}
      <div className="flex flex-col gap-3">
        {branchNodes.map((n) => (
          <BranchCard key={n.id} node={n} onJumpToPage={handleJump} />
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "reactflow";
import dagre from "@dagrejs/dagre";
import katex from "katex";
import "reactflow/dist/style.css";
import "katex/dist/katex.min.css";

// ── light color palette ───────────────────────────────────────────────────────

const COLOR_STYLES = {
  "blue-200":   { headerBg: "#eff6ff", headerBorder: "#bfdbfe", accent: "#3b82f6", title: "#1e40af", text: "#374151" },
  "green-200":  { headerBg: "#f0fdf4", headerBorder: "#bbf7d0", accent: "#22c55e", title: "#15803d", text: "#374151" },
  "yellow-200": { headerBg: "#fefce8", headerBorder: "#fef08a", accent: "#eab308", title: "#a16207", text: "#374151" },
  "red-200":    { headerBg: "#fff1f2", headerBorder: "#fecdd3", accent: "#ef4444", title: "#b91c1c", text: "#374151" },
  "sky-200":    { headerBg: "#f0f9ff", headerBorder: "#bae6fd", accent: "#38bdf8", title: "#0369a1", text: "#374151" },
  "pink-200":   { headerBg: "#fdf2f8", headerBorder: "#f9a8d4", accent: "#ec4899", title: "#9d174d", text: "#374151" },
  "purple-200": { headerBg: "#faf5ff", headerBorder: "#e9d5ff", accent: "#a855f7", title: "#7e22ce", text: "#374151" },
};
const DEFAULT_STYLE = { headerBg: "#f8fafc", headerBorder: "#e2e8f0", accent: "#64748b", title: "#1e293b", text: "#374151" };

function getStyle(color) {
  return COLOR_STYLES[color] || DEFAULT_STYLE;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const PAGE_RE = /\[(?:문서:)?p\.(\d+)\]/g;

function extractPages(str) {
  PAGE_RE.lastIndex = 0;
  const pages = [];
  let m;
  while ((m = PAGE_RE.exec(str || "")) !== null) pages.push(parseInt(m[1], 10));
  return [...new Set(pages)];
}

function cleanLine(line) {
  return line
    .replace(/^[-*]\s*/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(PAGE_RE, "")
    .trim();
}

// ── math rendering ────────────────────────────────────────────────────────────

const MATH_RE = /\$([^$\n]+)\$/g;

function MathText({ text, style }) {
  const parts = useMemo(() => {
    const result = [];
    let last = 0;
    MATH_RE.lastIndex = 0;
    let m;
    while ((m = MATH_RE.exec(text)) !== null) {
      if (m.index > last) result.push({ type: "text", value: text.slice(last, m.index) });
      result.push({ type: "math", value: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) result.push({ type: "text", value: text.slice(last) });
    return result;
  }, [text]);

  return (
    <span style={style}>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        try {
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(p.value, { throwOnError: false, displayMode: false, output: "html" }),
              }}
            />
          );
        } catch {
          return <span key={i}>{`$${p.value}$`}</span>;
        }
      })}
    </span>
  );
}

const TYPE_LABEL = {
  start: "시작점", next: "다음 단계", source: "출처",
  branch: null, sub: null, leaf: null, question: "핵심 질문",
};
const TYPE_ICON = { start: "▶", next: "→", source: "◈", question: "?" };

// ── card node ─────────────────────────────────────────────────────────────────

function CardNode({ data }) {
  const s = getStyle(data.color);
  const isRoot = data.depth === 0;
  const isQuestion = data.nodeType === "question";

  const accentColor = isQuestion ? "#d97706" : s.accent;
  const titleColor  = isQuestion ? "#92400e" : s.title;
  const headerBg    = isQuestion ? "#fffbeb" : (isRoot ? "#f0f4ff" : s.headerBg);
  const headerBorder= isQuestion ? "#fde68a" : (isRoot ? "#c7d7fe" : s.headerBorder);
  const typeLabel   = TYPE_LABEL[data.nodeType];

  const contentLines = useMemo(() => {
    if (!data.content) return [];
    return data.content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("|") && l !== "---")
      .map(cleanLine)
      .filter(Boolean)
      .slice(0, isRoot ? 4 : 5);
  }, [data.content, isRoot]);

  const pages = useMemo(
    () => extractPages((data.label || "") + " " + (data.content || "")),
    [data.label, data.content]
  );

  return (
    <div
      style={{
        background: "#ffffff",
        border: `1px solid ${isRoot ? "#c7d7fe" : "#e2e8f0"}`,
        borderRadius: isRoot ? 16 : 12,
        minWidth: isRoot ? 240 : 196,
        maxWidth: isRoot ? 310 : 284,
        overflow: "hidden",
        fontFamily: "inherit",
        boxShadow: isRoot
          ? "0 4px 24px rgba(0,0,0,0.10), 0 1px 6px rgba(0,0,0,0.06)"
          : "0 2px 12px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* ── header ── */}
      <div
        style={{
          background: headerBg,
          borderBottom: `1px solid ${headerBorder}`,
          padding: isRoot ? "11px 15px 10px" : "8px 13px 7px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {typeLabel && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: accentColor,
            }}
          >
            {TYPE_ICON[data.nodeType] ? `${TYPE_ICON[data.nodeType]} ` : ""}
            {typeLabel}
          </span>
        )}
        <MathText
          text={data.label}
          style={{
            fontSize: isRoot ? 13.5 : 12,
            fontWeight: isRoot ? 800 : 700,
            color: titleColor,
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        />
      </div>

      {/* ── body ── */}
      {contentLines.length > 0 && (
        <div style={{ padding: "8px 13px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
          {contentLines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ color: accentColor, fontSize: 8, flexShrink: 0, marginTop: 4, opacity: 0.7 }}>▸</span>
              <MathText
                text={line}
                style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.55, wordBreak: "break-word" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* ── footer (citations) ── */}
      {pages.length > 0 && (
        <div
          style={{
            borderTop: "1px solid #f1f5f9",
            padding: "5px 13px 7px",
            background: "#fafafa",
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, color: "#94a3b8", marginRight: 2 }}>출처</span>
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => data.onJumpToPage?.(p)}
              style={{
                background: "#f5f3ff",
                border: "1px solid #ddd6fe",
                borderRadius: 9999,
                color: "#7c3aed",
                fontSize: 10,
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: 1.3,
                fontFamily: "inherit",
              }}
            >
              p.{p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { card: CardNode };

// ── tree builder ──────────────────────────────────────────────────────────────

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

function estimateHeight(node, isRoot) {
  const titleLines = Math.ceil((node.label || "").length / 26);
  const hasTypeLabel = !!TYPE_LABEL[node.type];
  const rawLines = (node.content || "")
    .split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|")).length;
  const contentLines = Math.min(isRoot ? 4 : 5, rawLines);
  const pages = extractPages((node.label || "") + " " + (node.content || ""));
  const headerH = (isRoot ? 21 : 15) + titleLines * (isRoot ? 20 : 17) + (hasTypeLabel ? 14 : 0);
  const bodyH   = contentLines > 0 ? 14 + contentLines * 20 : 0;
  const footerH = pages.length > 0 ? 28 : 0;
  return Math.max(isRoot ? 64 : 48, headerH + bodyH + footerH);
}

// ── flow element builder ──────────────────────────────────────────────────────

function jsonToFlowElements(jsonStr, onJumpToPage) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    const root = buildTreeFromJson(parsed);
    if (!root) return null;

    const flowNodes = [];
    const flowEdges = [];
    const depthMap  = {};

    function dfs(node, depth) {
      depthMap[node.id] = depth;
      const isRoot = depth === 0;
      const w = isRoot ? 310 : 284;
      const h = estimateHeight(node, isRoot);

      flowNodes.push({
        id: String(node.id),
        type: "card",
        data: { label: node.label || "", content: node.content || "", color: node.color, nodeType: node.type, depth, onJumpToPage },
        width: w,
        height: h,
        position: { x: 0, y: 0 },
      });

      if (node.parentId) {
        const pDepth = depthMap[node.parentId] ?? 0;
        const strokeWidth = pDepth === 0 ? 1.8 : 1.2;
        const strokeColor = pDepth === 0 ? "#cbd5e1" : "#e2e8f0";

        flowEdges.push({
          id: `e-${node.parentId}-${node.id}`,
          source: String(node.parentId),
          target: String(node.id),
          type: "smoothstep",
          style: { stroke: strokeColor, strokeWidth },
          markerEnd: { type: MarkerType.None },
        });
      }

      const sorted = [...(node.children || [])].sort((a, b) => {
        const order = { start: 0, source: 1, next: 2, branch: 3, sub: 4, leaf: 5, question: 6 };
        return (order[a.type] ?? 5) - (order[b.type] ?? 5);
      });
      sorted.forEach((child) => dfs(child, depth + 1));
    }

    dfs(root, 0);

    // dagre layout — generous spacing so cards never crowd
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 90, marginx: 60, marginy: 60 });

    flowNodes.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));
    flowEdges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    const layoutedNodes = flowNodes.map((n) => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - n.width / 2, y: pos.y - n.height / 2 } };
    });

    return { nodes: layoutedNodes, edges: flowEdges };
  } catch {
    return null;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function MindMapView({ summary, mindmapData, onJumpToPage }) {
  const result = useMemo(
    () => (mindmapData ? jsonToFlowElements(mindmapData, onJumpToPage) : null),
    [mindmapData, onJumpToPage]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(result?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(result?.edges ?? []);

  useEffect(() => {
    setNodes(result?.nodes ?? []);
    setEdges(result?.edges ?? []);
  }, [result, setNodes, setEdges]);

  if (!mindmapData && !summary) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        요약을 먼저 생성해 주세요.
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        마인드맵 데이터를 불러올 수 없습니다. 재생성해 주세요.
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-slate-200"
      style={{ height: 680, background: "#f8fafc" }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        nodesDraggable
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={28} size={1} variant="dots" />
        <Controls showInteractive={false} className="!bottom-3 !left-3" />
      </ReactFlow>
      <p className="absolute bottom-2 right-3 text-[10px] text-slate-400 select-none pointer-events-none">
        스크롤·드래그로 탐색
      </p>
    </div>
  );
}

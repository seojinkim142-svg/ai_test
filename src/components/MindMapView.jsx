import { useCallback, useEffect, useMemo } from "react";
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
import "reactflow/dist/style.css";

// ── color palette ─────────────────────────────────────────────────────────────

const COLOR_STYLES = {
  "blue-200":   { bg: "#0f2140", border: "#3b82f6", title: "#93c5fd", text: "#7ea8e0" },
  "green-200":  { bg: "#0b2e1b", border: "#22c55e", title: "#86efac", text: "#6aba8a" },
  "yellow-200": { bg: "#2c1a05", border: "#eab308", title: "#fde68a", text: "#d4b86a" },
  "red-200":    { bg: "#2a0d0d", border: "#ef4444", title: "#fca5a5", text: "#d97c7c" },
  "sky-200":    { bg: "#071e2e", border: "#38bdf8", title: "#7dd3fc", text: "#60afd4" },
  "pink-200":   { bg: "#2a0b1a", border: "#ec4899", title: "#f9a8d4", text: "#d07aaa" },
  "purple-200": { bg: "#1a0a30", border: "#a855f7", title: "#d8b4fe", text: "#b08ad4" },
};
const DEFAULT_STYLE = { bg: "#1e293b", border: "#475569", title: "#e2e8f0", text: "#94a3b8" };

function getStyle(color) {
  return COLOR_STYLES[color] || DEFAULT_STYLE;
}

// ── citation badge regex ───────────────────────────────────────────────────────

const PAGE_RE = /\[(?:문서:)?p\.(\d+)\]/g;

function extractPages(str) {
  PAGE_RE.lastIndex = 0;
  const pages = [];
  let m;
  while ((m = PAGE_RE.exec(str || "")) !== null) pages.push(parseInt(m[1], 10));
  return [...new Set(pages)];
}

function stripPageRefs(str) {
  return (str || "").replace(PAGE_RE, "").replace(/\*\*/g, "").trim();
}

// ── type icon ─────────────────────────────────────────────────────────────────

const TYPE_ICON = { start: "▶", next: "→", source: "◈", question: "❓", branch: null, sub: null, leaf: null };

// ── card node component ───────────────────────────────────────────────────────

function CardNode({ data }) {
  const s = getStyle(data.color);
  const isRoot = data.depth === 0;
  const isQuestion = data.nodeType === "question";

  const contentLines = useMemo(() => {
    if (!data.content) return [];
    return data.content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("|"))
      .map((l) => stripPageRefs(l.replace(/^[-*]\s*/, "")))
      .filter(Boolean)
      .slice(0, 5);
  }, [data.content]);

  const pages = useMemo(
    () => extractPages((data.label || "") + " " + (data.content || "")),
    [data.label, data.content]
  );

  const borderColor = isQuestion ? "#eab308" : s.border;
  const bgColor = isQuestion ? "#1c1500" : s.bg;

  return (
    <div
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: isRoot ? 18 : 12,
        padding: isRoot ? "14px 20px" : "10px 14px",
        minWidth: isRoot ? 220 : 180,
        maxWidth: isRoot ? 280 : 260,
        boxShadow: isRoot
          ? "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)"
          : "0 4px 16px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.3)",
        fontFamily: "inherit",
        position: "relative",
      }}
    >
      {/* handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ opacity: 0, pointerEvents: "none" }}
      />

      {/* title */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 5,
          marginBottom: contentLines.length > 0 ? 7 : 0,
        }}
      >
        {TYPE_ICON[data.nodeType] && (
          <span style={{ fontSize: 11, color: borderColor, flexShrink: 0, marginTop: 1 }}>
            {TYPE_ICON[data.nodeType]}
          </span>
        )}
        <span
          style={{
            fontSize: isRoot ? 14 : 12,
            fontWeight: isRoot ? 800 : 700,
            color: isQuestion ? "#fde68a" : s.title,
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {data.label}
        </span>
      </div>

      {/* content bullets */}
      {contentLines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {contentLines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
              <span style={{ color: "#475569", fontSize: 10, flexShrink: 0, marginTop: 2 }}>•</span>
              <span style={{ fontSize: 11, color: s.text, lineHeight: 1.5, wordBreak: "break-word" }}>
                {line}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* citation badges */}
      {pages.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => data.onJumpToPage?.(p)}
              style={{
                background: "rgba(139,92,246,0.18)",
                border: "1px solid rgba(139,92,246,0.38)",
                borderRadius: 9999,
                color: "#c4b5fd",
                fontSize: 10,
                padding: "2px 8px",
                cursor: "pointer",
                lineHeight: 1.3,
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

// ── height estimator ──────────────────────────────────────────────────────────

function estimateHeight(node, isRoot) {
  const titleLines = Math.ceil((node.label || "").length / 28);
  const contentLines = node.content
    ? Math.min(
        5,
        node.content
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("|")).length
      )
    : 0;
  const hasPages = extractPages((node.label || "") + " " + (node.content || "")).length > 0;
  const base = isRoot ? 28 : 20;
  return Math.max(
    isRoot ? 64 : 50,
    base + titleLines * 20 + contentLines * 17 + (hasPages ? 26 : 0)
  );
}

// ── convert JSON tree → React Flow elements ───────────────────────────────────

function jsonToFlowElements(jsonStr, onJumpToPage) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    const root = buildTreeFromJson(parsed);
    if (!root) return null;

    const flowNodes = [];
    const flowEdges = [];

    function dfs(node, depth) {
      const isRoot = depth === 0;
      const w = isRoot ? 280 : 260;
      const h = estimateHeight(node, isRoot);

      flowNodes.push({
        id: String(node.id),
        type: "card",
        data: {
          label: node.label || "",
          content: node.content || "",
          color: node.color,
          nodeType: node.type,
          depth,
          onJumpToPage,
        },
        width: w,
        height: h,
        position: { x: 0, y: 0 },
      });

      if (node.parentId) {
        flowEdges.push({
          id: `e-${node.parentId}-${node.id}`,
          source: String(node.parentId),
          target: String(node.id),
          type: "smoothstep",
          style: { stroke: "#334155", strokeWidth: 1.5 },
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

    // dagre layout
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 72, marginx: 48, marginy: 48 });

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
      className="relative w-full overflow-hidden rounded-2xl border border-white/10"
      style={{ height: 680, background: "#020617" }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12, minZoom: 0.3 }}
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#0f172a" gap={28} size={1} variant="dots" />
        <Controls showInteractive={false} className="!bottom-3 !left-3" />
      </ReactFlow>
      <p className="absolute bottom-2 right-3 text-[10px] text-slate-600 select-none pointer-events-none">
        스크롤·드래그로 탐색
      </p>
    </div>
  );
}

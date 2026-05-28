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
import "reactflow/dist/style.css";

// ── color palette ─────────────────────────────────────────────────────────────

const COLOR_STYLES = {
  "blue-200":   { bg: "#0d1f35", border: "#3b82f6", title: "#93c5fd", text: "#7ea8d8", accent: "#1d3a5f" },
  "green-200":  { bg: "#0a1f12", border: "#22c55e", title: "#86efac", text: "#6aad80", accent: "#112d1a" },
  "yellow-200": { bg: "#1f1200", border: "#eab308", title: "#fde68a", text: "#c8a84a", accent: "#2c1900" },
  "red-200":    { bg: "#200c0c", border: "#ef4444", title: "#fca5a5", text: "#c87070", accent: "#2e1010" },
  "sky-200":    { bg: "#071828", border: "#38bdf8", title: "#7dd3fc", text: "#5aafcc", accent: "#0c2236" },
  "pink-200":   { bg: "#200b14", border: "#ec4899", title: "#f9a8d4", text: "#c87aa8", accent: "#2e0f1c" },
  "purple-200": { bg: "#140820", border: "#a855f7", title: "#d8b4fe", text: "#a87ad4", accent: "#1e1030" },
};
const DEFAULT_STYLE = { bg: "#131c2b", border: "#3b4f6a", title: "#cbd5e1", text: "#8899aa", accent: "#1a2438" };

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

const TYPE_ICON = { start: "▶", next: "→", source: "◈", question: "❓" };
const TYPE_LABEL = { start: "시작점", next: "다음 단계", source: "출처", branch: null, sub: null, leaf: null, question: "핵심 질문" };

// ── card node ─────────────────────────────────────────────────────────────────

function CardNode({ data }) {
  const s = getStyle(data.color);
  const isRoot = data.depth === 0;
  const isQuestion = data.nodeType === "question";

  const headerBg = isRoot
    ? "linear-gradient(135deg, rgba(59,130,246,0.22) 0%, rgba(30,41,59,0.5) 100%)"
    : isQuestion
      ? "rgba(234,179,8,0.12)"
      : `${s.accent}`;

  const borderColor = isQuestion ? "#eab308" : s.border;

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

  const typeLabel = TYPE_LABEL[data.nodeType];

  return (
    <div
      style={{
        background: isRoot
          ? "linear-gradient(160deg, #0f2340 0%, #131c2b 100%)"
          : s.bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: isRoot ? 18 : 14,
        minWidth: isRoot ? 240 : 196,
        maxWidth: isRoot ? 310 : 284,
        overflow: "hidden",
        fontFamily: "inherit",
        boxShadow: isRoot
          ? `0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px ${borderColor}33`
          : `0 4px 18px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.35)`,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* ── header ── */}
      <div
        style={{
          background: headerBg,
          padding: isRoot ? "11px 15px 10px" : "8px 12px 7px",
          borderBottom: `1px solid ${borderColor}28`,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        {typeLabel && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              color: isQuestion ? "#ca8a04" : s.border,
              opacity: 0.85,
            }}
          >
            {TYPE_ICON[data.nodeType] ? `${TYPE_ICON[data.nodeType]} ` : ""}
            {typeLabel}
          </span>
        )}
        <span
          style={{
            fontSize: isRoot ? 13.5 : 12,
            fontWeight: isRoot ? 800 : 700,
            color: isQuestion ? "#fde68a" : s.title,
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {!typeLabel && TYPE_ICON[data.nodeType] && (
            <span style={{ marginRight: 5, fontSize: 11 }}>{TYPE_ICON[data.nodeType]}</span>
          )}
          {data.label}
        </span>
      </div>

      {/* ── body (bullets) ── */}
      {contentLines.length > 0 && (
        <div
          style={{
            padding: "8px 12px 6px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {contentLines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span
                style={{
                  color: borderColor,
                  fontSize: 8,
                  flexShrink: 0,
                  marginTop: 4,
                  opacity: 0.7,
                }}
              >
                ▸
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: s.text,
                  lineHeight: 1.55,
                  wordBreak: "break-word",
                }}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── footer (citations) ── */}
      {pages.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${borderColor}22`,
            padding: "5px 12px 7px",
            background: "rgba(0,0,0,0.25)",
            display: "flex",
            gap: 4,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, color: "#475569", marginRight: 2 }}>출처</span>
          {pages.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => data.onJumpToPage?.(p)}
              style={{
                background: "rgba(139,92,246,0.15)",
                border: "1px solid rgba(139,92,246,0.35)",
                borderRadius: 9999,
                color: "#c4b5fd",
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
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("|"))
    .length;
  const contentLines = Math.min(isRoot ? 4 : 5, rawLines);
  const pages = extractPages((node.label || "") + " " + (node.content || ""));
  const headerH = (isRoot ? 21 : 15) + titleLines * (isRoot ? 20 : 17) + (hasTypeLabel ? 14 : 0);
  const bodyH = contentLines > 0 ? 14 + contentLines * 20 : 0;
  const footerH = pages.length > 0 ? 28 : 0;
  return Math.max(isRoot ? 64 : 50, headerH + bodyH + footerH);
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
    const depthMap = {};

    function dfs(node, depth) {
      const isRoot = depth === 0;
      depthMap[node.id] = depth;
      const w = isRoot ? 310 : 284;
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
        const pDepth = depthMap[node.parentId] ?? 0;
        const strokeWidth = pDepth === 0 ? 2.2 : pDepth === 1 ? 1.6 : 1.1;
        const strokeColor = pDepth === 0 ? "#3b4f7a" : pDepth === 1 ? "#2e3f5c" : "#243043";

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

    // dagre layout
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 80, marginx: 48, marginy: 48 });

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
      style={{ height: 680, background: "#070e1a" }}
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
        <Background color="#0f1829" gap={28} size={1} variant="dots" />
        <Controls showInteractive={false} className="!bottom-3 !left-3" />
      </ReactFlow>
      <p className="absolute bottom-2 right-3 text-[10px] text-slate-600 select-none pointer-events-none">
        스크롤·드래그로 탐색
      </p>
    </div>
  );
}

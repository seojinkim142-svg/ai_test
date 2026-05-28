import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateDocAnswer } from "../services/openai";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useNodesInitialized,
  useReactFlow,
  ReactFlowProvider,
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

// ── chip button (hover action) ────────────────────────────────────────────────

function Chip({ icon, label, onClick, color = "#6366f1", bg = "#eef2ff", border = "#c7d2fe" }) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: h ? color : bg,
        border: `1px solid ${h ? color : border}`,
        borderRadius: 9999,
        color: h ? "#fff" : color,
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 9px",
        cursor: "pointer",
        fontFamily: "inherit",
        lineHeight: 1.3,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {icon && <span style={{ fontSize: 9 }}>{icon}</span>}
      {label}
    </button>
  );
}

// ── card node ─────────────────────────────────────────────────────────────────

function CardNode({ data }) {
  const [hovered, setHovered] = useState(false);

  const s = getStyle(data.color);
  const isRoot = data.depth === 0;
  const isQuestion = data.nodeType === "question";

  const accentColor  = isQuestion ? "#d97706" : s.accent;
  const titleColor   = isQuestion ? "#92400e" : s.title;
  const headerBg     = isQuestion ? "#fffbeb" : (isRoot ? "#f0f4ff" : s.headerBg);
  const headerBorder = isQuestion ? "#fde68a" : (isRoot ? "#c7d7fe" : s.headerBorder);
  const typeLabel    = TYPE_LABEL[data.nodeType];

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

  const borderColor = hovered
    ? (isRoot ? "#818cf8" : accentColor)
    : (isRoot ? "#c7d7fe" : "#e2e8f0");

  const shadow = hovered
    ? `0 8px 28px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.07), 0 0 0 2px ${accentColor}22`
    : isRoot
      ? "0 4px 20px rgba(0,0,0,0.09), 0 1px 5px rgba(0,0,0,0.05)"
      : "0 2px 10px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#ffffff",
        border: `1.5px solid ${borderColor}`,
        borderRadius: isRoot ? 16 : 12,
        minWidth: isRoot ? 240 : 196,
        maxWidth: isRoot ? 310 : 284,
        overflow: "hidden",
        fontFamily: "inherit",
        boxShadow: shadow,
        transition: "border-color 0.18s, box-shadow 0.18s",
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
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: accentColor }}>
            {TYPE_ICON[data.nodeType] ? `${TYPE_ICON[data.nodeType]} ` : ""}
            {typeLabel}
          </span>
        )}
        <MathText
          text={data.label}
          style={{ fontSize: isRoot ? 13.5 : 12, fontWeight: isRoot ? 800 : 700, color: titleColor, lineHeight: 1.4, wordBreak: "break-word" }}
        />
      </div>

      {/* ── body ── */}
      {contentLines.length > 0 && (
        <div style={{ padding: "8px 13px 6px", display: "flex", flexDirection: "column", gap: 4 }}>
          {contentLines.map((line, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
              <span style={{ color: accentColor, fontSize: 8, flexShrink: 0, marginTop: 4, opacity: 0.7 }}>▸</span>
              <MathText text={line} style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.55, wordBreak: "break-word" }} />
            </div>
          ))}
        </div>
      )}

      {/* ── footer: citations + hover chips ── */}
      <div
        style={{
          borderTop: (pages.length > 0 || hovered) ? "1px solid #f1f5f9" : "none",
          padding: (pages.length > 0 || hovered) ? "5px 13px 8px" : "0 13px",
          background: "#fafafa",
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          alignItems: "center",
          minHeight: hovered ? undefined : (pages.length > 0 ? undefined : 0),
          overflow: "hidden",
        }}
      >
        {/* citation badges */}
        {pages.length > 0 && (
          <>
            <span style={{ fontSize: 9, color: "#94a3b8", marginRight: 1 }}>출처</span>
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
          </>
        )}

        {/* hover action chips */}
        {hovered && (
          <div
            style={{
              display: "flex",
              gap: 4,
              marginLeft: pages.length > 0 ? "auto" : 0,
              flexWrap: "wrap",
              paddingTop: pages.length > 0 ? 0 : 0,
              animation: "mmChipFadeIn 0.15s ease",
            }}
          >
            <Chip
              icon="✦"
              label="AI에게 물어보기"
              onClick={() => data.onAskAI?.(data.label, data.content, data.color)}
              color="#6366f1"
              bg="#eef2ff"
              border="#c7d2fe"
            />
          </div>
        )}
      </div>

      <style>{`@keyframes mmChipFadeIn { from { opacity:0; transform:translateY(3px) } to { opacity:1; transform:translateY(0) } }`}</style>
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

// ── dagre layout (runs with measured or estimated sizes) ─────────────────────

const NODESEP = 52;   // vertical gap between cards in same rank
const RANKSEP = 100;  // horizontal gap between ranks

function runDagreLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: NODESEP, ranksep: RANKSEP, marginx: 64, marginy: 64 });

  nodes.forEach((n) => {
    const w = n.measured?.width  ?? n.width  ?? 300;
    const h = n.measured?.height ?? n.height ?? 100;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const w   = n.measured?.width  ?? n.width  ?? 300;
    const h   = n.measured?.height ?? n.height ?? 100;
    return { ...n, position: { x: pos.x - w / 2, y: pos.y - h / 2 } };
  });
}

// ── flow element builder (positions are 0,0 — layout applied separately) ─────

function jsonToFlowElements(jsonStr, onJumpToPage, onAskAI) {
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

      flowNodes.push({
        id: String(node.id),
        type: "card",
        data: { label: node.label || "", content: node.content || "", color: node.color, nodeType: node.type, depth, onJumpToPage, onAskAI },
        width: isRoot ? 310 : 284,
        position: { x: 0, y: 0 },
      });

      if (node.parentId) {
        const pDepth = depthMap[node.parentId] ?? 0;
        flowEdges.push({
          id: `e-${node.parentId}-${node.id}`,
          source: String(node.parentId),
          target: String(node.id),
          type: "smoothstep",
          style: { stroke: pDepth === 0 ? "#cbd5e1" : "#e2e8f0", strokeWidth: pDepth === 0 ? 1.8 : 1.2 },
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

    // initial layout with estimated sizes so nodes don't all stack at 0,0
    const positioned = runDagreLayout(flowNodes, flowEdges);
    return { nodes: positioned, edges: flowEdges };
  } catch {
    return null;
  }
}

// ── AI side panel ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: "⚡", label: "깊이 뛰어들기",  prompt: "이 내용의 가장 핵심적인 개념을 깊이 있게 설명해줘." },
  { icon: "💬", label: "설명",           prompt: "이 내용을 초보자도 이해할 수 있게 쉽게 설명해줘." },
  { icon: "✂️", label: "단순화",         prompt: "이 내용을 3줄로 핵심만 요약해줘." },
  { icon: "📌", label: "예시",           prompt: "이 내용을 실제 예시를 들어 설명해줘." },
];

async function generateWonderQuestions(label, content) {
  const ctx = `제목: ${label}\n${content ? `내용: ${content}` : ""}`;
  const raw = await generateDocAnswer(
    "위 카드 내용을 공부하는 학생이 가질 법한 핵심 질문 5개를 생성해. 각 질문은 한 줄로, 번호 없이 줄바꿈으로 구분해.",
    ctx,
    { outputLanguage: "ko" }
  );
  return raw.split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean).slice(0, 5);
}

function NodeAIPanel({ activeNode, onAskAI }) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [wonders, setWonders]         = useState([]);
  const [wonderLoading, setWonderLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  const s = activeNode ? getStyle(activeNode.color) : DEFAULT_STYLE;

  const contextDoc = useMemo(() => activeNode
    ? `<CurrentSelection>\n제목: ${activeNode.label}\n${activeNode.content ? `내용:\n${activeNode.content}` : ""}\n</CurrentSelection>\n\n위는 학습 중인 마인드맵 카드입니다. 이 카드 내용을 중심으로 답변하세요.`
    : "", [activeNode]);

  // reset + generate I Wonder questions when node changes
  useEffect(() => {
    setMessages([]);
    setInput("");
    setWonders([]);
    if (!activeNode) return;
    setWonderLoading(true);
    generateWonderQuestions(activeNode.label, activeNode.content)
      .then(setWonders)
      .catch(() => {})
      .finally(() => setWonderLoading(false));
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [activeNode?.label]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async (q) => {
    const question = (q || input).trim();
    if (!question || loading || !activeNode) return;
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    try {
      const answer = await generateDocAnswer(question, contextDoc, { outputLanguage: "ko" });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "답변을 가져오지 못했습니다." }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, contextDoc, activeNode]);

  return (
    <div style={{
      width: 288,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderLeft: "1px solid #e2e8f0",
      background: "#fff",
      height: "100%",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f1f5f9", background: "#fafbff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#6366f1" }}>✦</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", flex: 1 }}>AI에게 묻기</span>
          {/* send icon placeholder */}
          <span style={{ width: 28, height: 28, borderRadius: 8, background: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1", fontSize: 13 }}>→</span>
        </div>
        {activeNode && (
          <p style={{ fontSize: 11, color: s.accent, marginTop: 6, fontWeight: 600, wordBreak: "break-word", lineHeight: 1.35 }}>
            {activeNode.label}
          </p>
        )}
      </div>

      {/* body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* no node selected */}
        {!activeNode && (
          <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 24, lineHeight: 1.6 }}>
            카드 위의 <strong style={{ color: "#6366f1" }}>✦ AI에게 물어보기</strong> 버튼을 눌러 카드를 선택하세요.
          </p>
        )}

        {/* quick actions */}
        {activeNode && messages.length === 0 && (
          <>
            <p style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>빠른 작업</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => send(a.prompt)}
                  disabled={loading}
                  style={{
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10,
                    padding: "8px 10px", fontSize: 11, color: "#374151", cursor: "pointer",
                    textAlign: "left", lineHeight: 1.4, fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span style={{ fontSize: 13 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>

            {/* I Wonder section */}
            <p style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, marginTop: 6 }}>
              I Wonder<span style={{ color: "#6366f1" }}>…</span>
            </p>
            {wonderLoading && (
              <p style={{ fontSize: 11, color: "#cbd5e1" }}>질문 생성 중…</p>
            )}
            {wonders.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => send(q)}
                disabled={loading}
                style={{
                  background: "none", border: "none", padding: "4px 0",
                  fontSize: 12, color: "#475569", cursor: "pointer",
                  textAlign: "left", lineHeight: 1.5, fontFamily: "inherit",
                  display: "flex", alignItems: "flex-start", gap: 7,
                }}
              >
                <span style={{ color: "#a5b4fc", fontSize: 11, flexShrink: 0, marginTop: 2 }}>?</span>
                <span style={{ borderBottom: "1px dashed #e2e8f0", paddingBottom: 4, flex: 1 }}>{q}</span>
              </button>
            ))}
          </>
        )}

        {/* chat messages */}
        {messages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "92%",
            background: m.role === "user" ? s.headerBg : "#f8fafc",
            border: `1px solid ${m.role === "user" ? s.headerBorder : "#e2e8f0"}`,
            borderRadius: m.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
            padding: "8px 11px",
            fontSize: 12,
            color: m.role === "user" ? s.title : "#374151",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px 12px 12px 4px", padding: "8px 14px", fontSize: 12, color: "#94a3b8" }}>
            생각 중…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        style={{ borderTop: "1px solid #f1f5f9", padding: "8px 10px", display: "flex", gap: 6 }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={activeNode ? "질문을 입력하세요…" : "카드를 먼저 선택하세요"}
          disabled={loading || !activeNode}
          style={{
            flex: 1, border: "1px solid #e2e8f0", borderRadius: 10, padding: "7px 11px",
            fontSize: 12, color: "#1e293b", outline: "none", background: "#f8fafc",
            fontFamily: "inherit",
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim() || !activeNode}
          style={{
            width: 32, height: 32, borderRadius: 10, border: "none",
            background: "#6366f1", color: "#fff", cursor: "pointer",
            fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
            opacity: (loading || !input.trim() || !activeNode) ? 0.35 : 1,
            flexShrink: 0,
          }}
        >
          ↑
        </button>
      </form>
    </div>
  );
}

// ── inner flow ────────────────────────────────────────────────────────────────

function MindMapFlow({ result }) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const [nodes, setNodes, onNodesChange] = useNodesState(result?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(result?.edges ?? []);
  const [layoutDone, setLayoutDone] = useState(false);

  useEffect(() => {
    setNodes(result?.nodes ?? []);
    setEdges(result?.edges ?? []);
    setLayoutDone(false);
  }, [result, setNodes, setEdges]);

  useEffect(() => {
    if (!nodesInitialized || layoutDone || !nodes.length) return;
    setNodes((curr) => runDagreLayout(curr, edges));
    setLayoutDone(true);
  }, [nodesInitialized, layoutDone, nodes.length, edges, setNodes]);

  useEffect(() => {
    if (!layoutDone) return;
    const t = setTimeout(() => fitView({ padding: 0.12, duration: 300 }), 50);
    return () => clearTimeout(t);
  }, [layoutDone, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.12, minZoom: 0.2 }}
      minZoom={0.15}
      maxZoom={2.5}
      nodesDraggable
      elementsSelectable={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e2e8f0" gap={28} size={1} variant="dots" />
      <Controls showInteractive={false} className="!bottom-3 !left-3" />
    </ReactFlow>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function MindMapView({ summary, mindmapData, onJumpToPage }) {
  const [activeNode, setActiveNode] = useState(null);

  const onAskAI = useCallback((label, content, color) => {
    setActiveNode({ label, content, color });
  }, []);

  const result = useMemo(
    () => (mindmapData ? jsonToFlowElements(mindmapData, onJumpToPage, onAskAI) : null),
    [mindmapData, onJumpToPage, onAskAI]
  );

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
      className="w-full overflow-hidden rounded-2xl border border-slate-200"
      style={{ height: 680, background: "#f8fafc", display: "flex" }}
    >
      {/* mindmap canvas */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <ReactFlowProvider>
          <MindMapFlow result={result} />
        </ReactFlowProvider>
        <p className="absolute bottom-2 left-3 text-[10px] text-slate-400 select-none pointer-events-none">
          스크롤·드래그로 탐색
        </p>
      </div>

      {/* always-visible AI panel */}
      <NodeAIPanel activeNode={activeNode} />
    </div>
  );
}

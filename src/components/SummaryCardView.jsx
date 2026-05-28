import { useCallback, useEffect, useRef, useState } from "react";
import { generateDocAnswer } from "../services/openai";

// ── markdown parser ──────────────────────────────────────────────────────────

const PAGE_RE = /\[(?:문서:)?p\.(\d+)\]/g;
const TIER_RE = /\[(T[123])\]|\((T[123])\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;

function extractQuestions(mindmapMarkdown) {
  if (!mindmapMarkdown) return [];
  const lines = mindmapMarkdown.split("\n");
  const questions = [];
  let inQSection = false;
  for (const line of lines) {
    if (/###\s*핵심 질문/.test(line)) { inQSection = true; continue; }
    if (inQSection) {
      if (/^#{1,3}/.test(line)) { inQSection = false; continue; }
      const m = line.match(/^-\s*(.+)/);
      if (m) questions.push(m[1].replace(PAGE_RE, "").replace(TIER_RE, "").trim());
    }
  }
  return questions.filter(Boolean).slice(0, 6);
}

function parseSummaryCards(markdown) {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const cards = [];
  let current = null;

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const bullet = line.match(/^[-*]\s+(.+)/);
    const bold = line.match(/^\*\*([^*]+)\*\*\s*$/);
    const h1 = line.match(/^#\s+(.+)/);

    if (h1) {
      // root title — skip or show as intro
      continue;
    }
    if (h2) {
      if (current) cards.push(current);
      current = { title: h2[1].trim(), items: [] };
    } else if (current) {
      if (h3) {
        current.items.push({ type: "sub", text: h3[1].trim() });
      } else if (bold) {
        current.items.push({ type: "label", text: bold[1].trim() });
      } else if (bullet) {
        current.items.push({ type: "bullet", text: bullet[1].trim() });
      }
    }
  }
  if (current) cards.push(current);
  return cards;
}

// ── inline renderer ───────────────────────────────────────────────────────────

function renderInline(text, onJumpToPage) {
  PAGE_RE.lastIndex = 0;
  TIER_RE.lastIndex = 0;
  BOLD_RE.lastIndex = 0;

  // collect all tokens
  const tokens = [];
  let last = 0;
  const combined = new RegExp(`${PAGE_RE.source}|${TIER_RE.source}|${BOLD_RE.source}`, "gi");
  let m;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) tokens.push({ type: "page", page: m[1] });
    else if (m[2] || m[3]) tokens.push({ type: "tier", tier: m[2] || m[3] });
    else if (m[4]) tokens.push({ type: "bold", value: m[4] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });

  return tokens.map((tok, i) => {
    if (tok.type === "text") return <span key={i}>{tok.value}</span>;
    if (tok.type === "bold") return <strong key={i} className="font-semibold">{tok.value}</strong>;
    if (tok.type === "page") {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onJumpToPage?.(parseInt(tok.page, 10))}
          className="mx-0.5 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 transition-colors"
        >
          p.{tok.page}
        </button>
      );
    }
    if (tok.type === "tier") {
      const cls = tok.tier === "T1"
        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
        : tok.tier === "T2"
          ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-300"
          : "border-slate-400/25 bg-slate-500/10 text-slate-400";
      return (
        <span key={i} className={`mx-0.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
          {tok.tier}
        </span>
      );
    }
    return null;
  });
}

// ── quick action prompts ─────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: "깊이 뛰어들기", prompt: "이 문서의 가장 핵심적인 개념을 더 깊이 설명해줘." },
  { label: "설명", prompt: "이 문서의 내용을 초보자도 이해할 수 있게 쉽게 설명해줘." },
  { label: "단순화", prompt: "이 문서의 핵심 내용을 3줄로 요약해줘." },
  { label: "예시", prompt: "이 문서의 주요 개념을 실제 예시를 들어 설명해줘." },
];

// ── main component ────────────────────────────────────────────────────────────

export default function SummaryCardView({ summary, mindmapData, onJumpToPage, outputLanguage = "ko" }) {
  const cards = parseSummaryCards(mindmapData || summary);
  const suggestedQuestions = extractQuestions(mindmapData);
  const [qaHistory, setQaHistory] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerError, setAnswerError] = useState("");
  const qaBottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    qaBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory]);

  const askQuestion = useCallback(
    async (question) => {
      const q = String(question || "").trim();
      if (!q || isAnswering || !summary) return;
      setQaHistory((prev) => [...prev, { role: "user", content: q }]);
      setInputValue("");
      setIsAnswering(true);
      setAnswerError("");
      try {
        const answer = await generateDocAnswer(q, summary, { outputLanguage });
        setQaHistory((prev) => [...prev, { role: "assistant", content: answer }]);
      } catch {
        setAnswerError("답변을 생성하지 못했습니다. 다시 시도해 주세요.");
        setQaHistory((prev) => prev.slice(0, -1));
      } finally {
        setIsAnswering(false);
      }
    },
    [isAnswering, outputLanguage, summary]
  );

  const handleSubmit = useCallback(
    (e) => { e.preventDefault(); askQuestion(inputValue); },
    [askQuestion, inputValue]
  );

  if (!summary) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        요약을 먼저 생성해 주세요.
      </div>
    );
  }

  return (
    <div className="flex gap-4 w-full" style={{ minHeight: "600px" }}>
      {/* ── left: cards ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: "700px" }}>
        {cards.map((card, ci) => (
          <div
            key={ci}
            className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
          >
            <p className="text-sm font-bold text-slate-100 mb-3">{card.title}</p>
            <div className="flex flex-col gap-1.5">
              {card.items.map((item, ii) => {
                if (item.type === "sub") {
                  return (
                    <p key={ii} className="mt-1 text-[12px] font-semibold text-slate-400 uppercase tracking-wide">
                      {item.text}
                    </p>
                  );
                }
                if (item.type === "label") {
                  return (
                    <p key={ii} className="mt-1 text-[12px] font-semibold text-slate-300">
                      {renderInline(item.text, onJumpToPage)}
                    </p>
                  );
                }
                return (
                  <div key={ii} className="flex gap-2 text-[13px] text-slate-300 leading-relaxed">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-500" />
                    <span>{renderInline(item.text, onJumpToPage)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── right: AI panel ───────────────────────────────────── */}
      <div
        className="flex w-72 flex-shrink-0 flex-col rounded-2xl border border-white/10 bg-slate-900/60"
        style={{ maxHeight: "700px" }}
      >
        {/* header */}
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-emerald-400">
            <path d="M8 1a1 1 0 0 1 .894.553l1.382 2.8 3.088.449a1 1 0 0 1 .554 1.706L11.61 8.69l.528 3.074a1 1 0 0 1-1.451 1.054L8 11.268l-2.687 1.55a1 1 0 0 1-1.451-1.054l.528-3.074-2.308-2.25a1 1 0 0 1 .554-1.706l3.088-.449 1.382-2.8A1 1 0 0 1 8 1Z" />
          </svg>
          <span className="text-xs font-semibold text-slate-200">AI에게 묻기</span>
        </div>

        {/* Q&A history */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
          {qaHistory.length === 0 && (
            <>
              {/* quick actions */}
              <p className="text-[10px] text-slate-500 mt-1 mb-1">빠른 작업</p>
              <div className="grid grid-cols-2 gap-1.5">
                {QUICK_ACTIONS.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => askQuestion(a.prompt)}
                    disabled={isAnswering}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 transition-colors disabled:opacity-50 text-left"
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* suggested questions */}
              {suggestedQuestions.length > 0 && (
                <>
                  <p className="text-[10px] text-slate-500 mt-3 mb-1">추천 질문</p>
                  <div className="flex flex-col gap-1.5">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => askQuestion(q)}
                        disabled={isAnswering}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[11px] text-slate-300 hover:bg-white/[0.07] hover:text-slate-100 transition-colors disabled:opacity-50 text-left leading-snug"
                      >
                        <span className="mr-1 text-slate-500">?</span>{q}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {qaHistory.map((msg, i) => (
            <div
              key={i}
              className={`rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-emerald-500/10 text-emerald-200 self-end max-w-[90%]"
                  : "bg-white/[0.04] text-slate-300 self-start"
              }`}
            >
              {msg.content}
            </div>
          ))}

          {isAnswering && (
            <div className="self-start rounded-xl bg-white/[0.04] px-3 py-2 text-[12px] text-slate-400">
              답변 생성 중...
            </div>
          )}
          {answerError && (
            <p className="text-[11px] text-rose-400 px-1">{answerError}</p>
          )}
          <div ref={qaBottomRef} />
        </div>

        {/* input */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 p-2 flex gap-1.5">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="질문을 입력하세요..."
            disabled={isAnswering}
            className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-400/40 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isAnswering || !inputValue.trim()}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M2.87 2.298a.75.75 0 0 0-.812 1.021L3.39 6.624a1 1 0 0 0 .928.626H8.25a.75.75 0 0 1 0 1.5H4.318a1 1 0 0 0-.927.626l-1.333 3.305a.75.75 0 0 0 .811 1.022l11-3.994a.75.75 0 0 0 0-1.408L2.87 2.298Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

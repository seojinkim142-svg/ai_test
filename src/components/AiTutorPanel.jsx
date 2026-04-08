import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_MATH_REHYPE_PLUGINS,
  MARKDOWN_MATH_REMARK_PLUGINS,
  normalizeMathMarkdown,
} from "./MathMarkdown";

const TUTOR_BARE_LATEX_RE =
  /\\(?:begin|end|frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|quad|qquad|lim)\b/;

function normalizeTutorMathLine(expr) {
  return String(expr || "")
    .trim()
    .replace(/<=|≤/g, " \\le ")
    .replace(/>=|≥/g, " \\ge ")
    .replace(/!=|≠/g, " \\ne ")
    .replace(/~=|≈/g, " \\approx ")
    .replace(/->|→/g, " \\to ")
    .replace(/∞/g, " \\infty ")
    .replace(/Σ|∑/g, " \\sum ")
    .replace(/∫/g, " \\int ")
    .replace(/×/g, " \\times ")
    .replace(/·/g, " \\cdot ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeStandaloneEquation(text) {
  const line = String(text || "").trim();
  if (!line || line.length > 180) return false;
  if (line.includes("$")) return false;
  const hasKorean = /[가-힣]/.test(line);
  const hasLatexCommand = TUTOR_BARE_LATEX_RE.test(line);
  const hasExplicitEquation = /[=<>]/.test(line);
  const mathSymbolCount = (line.match(/[=^_{}()[\]+\-*/|\\]/g) || []).length;
  if (!hasLatexCommand && !hasExplicitEquation && mathSymbolCount < 5) return false;
  if (hasKorean) {
    // Korean prose that includes tokens like X_n should stay normal text.
    return false;
  }
  if (!/[A-Za-z0-9]/.test(line)) return false;
  return true;
}

function normalizeTutorMathMarkdown(rawContent) {
  const source = String(rawContent || "").replace(/\r\n/g, "\n");
  if (!source) return "";

  const lines = source.split("\n");
  const normalized = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence;
      normalized.push(line);
      continue;
    }
    if (inCodeFence) {
      normalized.push(line);
      continue;
    }

    const bulletMatch = line.match(/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/);
    if (bulletMatch) {
      const prefix = bulletMatch[1];
      const body = bulletMatch[2];
      if (looksLikeStandaloneEquation(body)) {
        normalized.push(`${prefix}$${normalizeTutorMathLine(body)}$`);
      } else {
        normalized.push(line);
      }
      continue;
    }

    const trimmed = line.trim();
    if (looksLikeStandaloneEquation(trimmed)) {
      normalized.push(`$$${normalizeTutorMathLine(trimmed)}$$`);
      continue;
    }
    normalized.push(line);
  }

  return normalized.join("\n");
}

function AiTutorPanel({
  messages,
  onSend,
  onReset,
  isLoading,
  error,
  canChat,
  notice,
  fileName,
}) {
  const [input, setInput] = useState("");

  const markdownComponents = useMemo(
    () => ({
      p: ({ children }) => (
        <p className="my-2 whitespace-pre-wrap break-all leading-relaxed">
          {children}
        </p>
      ),
      ul: ({ children }) => <ul className="my-2 list-disc pl-5 break-all">{children}</ul>,
      ol: ({ children }) => <ol className="my-2 list-decimal pl-5 break-all">{children}</ol>,
      li: ({ children }) => <li className="my-1 break-all">{children}</li>,
      code: ({ inline, children }) =>
        inline ? (
          <code className="rounded bg-white/10 px-1 py-0.5 text-[0.95em] break-all">{children}</code>
        ) : (
          <code className="block overflow-x-auto rounded-xl bg-black/25 p-3 text-xs">{children}</code>
        ),
    }),
    []
  );

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || !canChat || isLoading) return;
    onSend?.(trimmed);
    setInput("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    setInput("");
    onReset?.();
  };

  const canReset = Boolean(messages?.length || input.trim() || error);
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  const showEmptyState = !hasMessages && !isLoading;

  return (
    <div className="flex h-full min-h-[65vh] flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-white">AI 튜터</h3>
          {fileName && <p className="mt-2 text-xs text-slate-400">현재 문서: {fileName}</p>}
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={!canReset || isLoading}
          className="ghost-button text-xs text-slate-200"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          대화 초기화
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {notice}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col gap-3">
          {showEmptyState && <p className="self-center text-sm text-slate-500">질문을 입력해 주세요.</p>}

          {messages?.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`tutor-${index}`}
                className={`max-w-[75%] min-w-0 rounded-2xl border px-4 py-3 shadow-inner shadow-black/20 caret-transparent ${
                  isUser
                    ? "self-end border-emerald-300/30 bg-emerald-500/10"
                    : "self-start border-white/10 bg-slate-950/60"
                }`}
              >
                {isUser ? (
                  <p className="mt-2 whitespace-pre-wrap break-all leading-relaxed">
                    {message.content}
                  </p>
                ) : (
                  <div className="summary-prose prose prose-sm prose-invert mt-2 max-w-none min-w-0 break-all [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:pb-1">
                    <ReactMarkdown
                      remarkPlugins={MARKDOWN_MATH_REMARK_PLUGINS}
                      rehypePlugins={MARKDOWN_MATH_REHYPE_PLUGINS}
                      components={markdownComponents}
                    >
                      {normalizeMathMarkdown(normalizeTutorMathMarkdown(message.content))}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            );
          })}

          {!showEmptyState && isLoading && (
            <div className="max-w-[75%] self-start rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <p className="mt-2">답변 생성 중...</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/20 focus-within:border-emerald-300/40">
        <textarea
          name="ai-tutor-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canChat || isLoading}
          className="show-scrollbar h-[96px] w-full resize-none overflow-y-scroll bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="질문을 입력해 주세요"
        />
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canChat || isLoading || !input.trim()}
            className="ghost-button text-sm text-emerald-100"
            data-ghost-size="lg"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isLoading ? "전송 중..." : "보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AiTutorPanel;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_MATH_REHYPE_PLUGINS,
  MARKDOWN_MATH_REMARK_PLUGINS,
  normalizeMathMarkdown,
} from "./MathMarkdown";
import { getTutorCopy } from "../utils/tutorCopy";
import GraphRenderer from "./GraphRenderer";

const TUTOR_BARE_LATEX_RE =
  /\\(?:begin|end|frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|quad|qquad|lim)\b/;
function normalizeTutorMathLine(expr) {
  return String(expr || "")
    .trim()
    .replace(/<=|\u2264/g, " \\le ")
    .replace(/>=|\u2265/g, " \\ge ")
    .replace(/!=|\u2260/g, " \\ne ")
    .replace(/~=|\u2248/g, " \\approx ")
    .replace(/->|\u2192/g, " \\to ")
    .replace(/\u221E/g, " \\infty ")
    .replace(/\u2211/g, " \\sum ")
    .replace(/\u222B/g, " \\int ")
    .replace(/\u00D7/g, " \\times ")
    .replace(/\u00B7/g, " \\cdot ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeStandaloneEquation(text) {
  const line = String(text || "").trim();
  if (!line || line.length > 180) return false;
  if (line.includes("$")) return false;
  const hasKorean = /[\uAC00-\uD7A3]/.test(line);
  const hasLatexCommand = TUTOR_BARE_LATEX_RE.test(line);
  const hasExplicitEquation = /[=<>]/.test(line);
  const mathSymbolCount = (line.match(/[=^_{}()[\]+\-*/|\\]/g) || []).length;
  if (!hasLatexCommand && !hasExplicitEquation && mathSymbolCount < 5) return false;
  if (hasKorean) return false;
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

    // 인용문(>) 표시는 수식 여부 판단 전에 떼어내야 ">"가 비교연산자로
    // 오인되거나 $$ 안에 함께 갇혀 깨지는 걸 막을 수 있다.
    const quoteMatch = line.match(/^(\s*>+\s*)(.*)$/);
    const quotePrefix = quoteMatch ? quoteMatch[1] : "";
    const afterQuote = quoteMatch ? quoteMatch[2] : line;

    const bulletMatch = afterQuote.match(/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/);
    if (bulletMatch) {
      const prefix = bulletMatch[1];
      const body = bulletMatch[2];
      if (looksLikeStandaloneEquation(body)) {
        normalized.push(`${quotePrefix}${prefix}$${normalizeTutorMathLine(body)}$`);
      } else {
        normalized.push(line);
      }
      continue;
    }

    const trimmed = afterQuote.trim();
    if (looksLikeStandaloneEquation(trimmed)) {
      normalized.push(`${quotePrefix}$$${normalizeTutorMathLine(trimmed)}$$`);
      continue;
    }
    normalized.push(line);
  }

  return normalized.join("\n");
}

function formatConversationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildAttachmentLabel(message, copy) {
  const attachmentName = String(message?.attachmentName || "").trim();
  if (!attachmentName) return "";
  return copy.attachmentLabel(attachmentName);
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
  outputLanguage = "ko",
  folderMode = false,
  folderName = "",
  canUseFolderMode = false,
  onToggleFolderMode,
  conversationKey = "",
  conversations = [],
  activeConversationId = "",
  onSelectConversation,
  onDeleteConversation,
}) {
  const [input, setInput] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInputRef = useRef(null);
  const textareaRef = useRef(null);
  const isComposingRef = useRef(false);
  const submitTriggeredAtRef = useRef(0);
  const scrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const copy = useMemo(() => getTutorCopy(outputLanguage), [outputLanguage]);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom && el.scrollHeight - el.clientHeight > 120);
  }, []);

  // 대화를 열거나 다른 대화로 전환하면 가장 최근 메시지(맨 아래)부터 보여준다
  useEffect(() => {
    const id = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(id);
  }, [conversationKey, scrollToBottom]);

  // 새 메시지가 오면 이미 하단을 보고 있던 경우에만 따라 내려간다
  useEffect(() => {
    if (!isNearBottomRef.current) {
      handleScroll();
      return;
    }
    const id = requestAnimationFrame(() => scrollToBottom("smooth"));
    return () => cancelAnimationFrame(id);
  }, [messages?.length, isLoading, scrollToBottom, handleScroll]);

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
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-current/20 pl-3 not-italic text-current">
          {children}
        </blockquote>
      ),
      code: ({ inline, className, children }) => {
        if (!inline && /language-graph\b/.test(className || "")) {
          return <GraphRenderer raw={String(children).replace(/\n$/, "")} />;
        }
        return inline ? (
          <code className="rounded bg-white/10 px-1 py-0.5 text-[0.95em] break-all">{children}</code>
        ) : (
          <code className="block overflow-x-auto rounded-xl bg-black/25 p-3 text-xs">{children}</code>
        );
      },
    }),
    []
  );

  const clearAttachment = () => {
    setAttachmentFile(null);
    setAttachmentError("");
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    const liveInput = String(textareaRef.current?.value ?? input ?? "");
    if (liveInput !== input) {
      setInput(liveInput);
    }
    const trimmed = liveInput.trim();
    if ((!trimmed && !attachmentFile) || !canChat || isLoading) return;

    const displayPrompt = trimmed || copy.defaultAttachmentPrompt;
    const accepted = await onSend?.({
      prompt: displayPrompt,
      displayPrompt,
      attachmentFile,
    });
    if (accepted === false) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.value = "";
    }
    clearAttachment();
  };

  const triggerSubmit = () => {
    const now = Date.now();
    if (now - submitTriggeredAtRef.current < 350) return;
    submitTriggeredAtRef.current = now;
    void handleSubmit();
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !isComposingRef.current && !event.nativeEvent?.isComposing) {
      event.preventDefault();
      triggerSubmit();
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    triggerSubmit();
  };

  const handleReset = () => {
    setInput("");
    clearAttachment();
    setIsHistoryOpen(false);
    onReset?.();
  };

  const handleAttachmentChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) return;
    if (!String(nextFile.type || "").toLowerCase().startsWith("image/")) {
      clearAttachment();
      setAttachmentError(copy.errors.onlyImageFiles);
      return;
    }
    setAttachmentFile(nextFile);
    setAttachmentError("");
  };

  const hasMessages = Array.isArray(messages) && messages.length > 0;
  const showEmptyState = !hasMessages && !isLoading;

  return (
    <div className="flex h-full min-h-[65vh] flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-white">{copy.title}</h3>
          {folderMode && folderName ? (
            <p className="mt-2 text-xs text-indigo-300">📂 {folderName} 전체 문서 기반</p>
          ) : fileName ? (
            <p className="mt-2 text-xs text-slate-400">{copy.currentDocument(fileName)}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {canUseFolderMode && onToggleFolderMode && (
            <button
              type="button"
              onClick={onToggleFolderMode}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                folderMode
                  ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-400/40"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              폴더 전체
            </button>
          )}
          {typeof onSelectConversation === "function" && (
            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              className="ghost-button text-xs text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              {copy.conversationHistory}
              {conversations.length > 0 ? ` (${conversations.length})` : ""}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {copy.newConversation}
          </button>
        </div>
      </div>

      {isHistoryOpen && typeof onSelectConversation === "function" && (
        <div className="max-h-56 overflow-auto rounded-2xl border border-white/10 bg-black/20 p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">{copy.noConversations}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <li key={conversation.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsHistoryOpen(false);
                        onSelectConversation(conversation.id);
                      }}
                      className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs transition ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-300/30"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <span className="block truncate font-medium">{conversation.title}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        {formatConversationDate(conversation.updatedAt)} · {conversation.messages.length}
                      </span>
                    </button>
                    {typeof onDeleteConversation === "function" && (
                      <button
                        type="button"
                        onClick={() => onDeleteConversation(conversation.id)}
                        aria-label={copy.deleteConversation}
                        title={copy.deleteConversation}
                        className="shrink-0 rounded-lg px-2 py-2 text-xs text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {notice}
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="show-scrollbar h-full overflow-auto">
        <div className="flex flex-col gap-3">
          {showEmptyState && (
            <p className="self-center text-sm text-slate-500">
              {copy.emptyState}
            </p>
          )}

          {messages?.map((message, index) => {
            const isUser = message.role === "user";
            const attachmentLabel = buildAttachmentLabel(message, copy);
            const hasContent = Boolean(String(message?.content || "").trim());
            return (
              <div
                key={message.id ?? `tutor-${index}`}
                className={`max-w-[75%] min-w-0 rounded-2xl border px-4 py-3 shadow-inner shadow-black/20 caret-transparent ${
                  isUser
                    ? "self-end border-emerald-300/30 bg-emerald-500/10"
                    : "self-start border-white/10 bg-slate-950/60"
                }`}
              >
                {attachmentLabel && (
                  <div className="mb-2 inline-flex max-w-full items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-200">
                    <span className="truncate">{attachmentLabel}</span>
                  </div>
                )}

                {isUser ? (
                  hasContent && (
                    <p className="mt-2 whitespace-pre-wrap break-all leading-relaxed">
                      {message.content}
                    </p>
                  )
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
              <p className="mt-2">{copy.generatingAnswer}</p>
            </div>
          )}
          </div>
        </div>

        {showScrollToBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom("smooth")}
            aria-label={copy.scrollToLatest}
            title={copy.scrollToLatest}
            className="absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-slate-800/90 text-slate-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-slate-700/90"
          >
            <span aria-hidden="true" className="text-base leading-none">↓</span>
          </button>
        )}
      </div>

      {(attachmentError || error) && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
          {attachmentError || error}
        </p>
      )}

      <form
        onSubmit={handleFormSubmit}
        className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/20 focus-within:border-emerald-300/40"
      >
        <textarea
          ref={textareaRef}
          name="ai-tutor-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onInput={(event) => setInput(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={(event) => {
            isComposingRef.current = false;
            setInput(event.currentTarget.value);
          }}
          disabled={!canChat || isLoading}
          className="show-scrollbar h-[96px] w-full resize-none overflow-y-scroll bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={copy.placeholder}
        />

        <input
          ref={attachmentInputRef}
          type="file"
          accept="image/*"
          onChange={handleAttachmentChange}
          className="hidden"
        />

        {attachmentFile && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200">
            <span className="rounded-full bg-white/10 px-2 py-1 font-medium text-slate-100">
              {copy.screenshotBadge}
            </span>
            <span className="max-w-full truncate">{attachmentFile.name}</span>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={!canChat || isLoading}
              className="ghost-button text-sm text-slate-100"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              {attachmentFile ? copy.replaceScreenshot : copy.attachScreenshot}
            </button>
            {attachmentFile && (
              <button
                type="button"
                onClick={clearAttachment}
                disabled={isLoading}
                className="ghost-button text-sm text-slate-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                {copy.remove}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              triggerSubmit();
            }}
            onPointerUp={(event) => {
              if (event.pointerType && event.pointerType !== "mouse") {
                event.preventDefault();
                triggerSubmit();
              }
            }}
            disabled={!canChat || isLoading}
            className="ghost-button text-sm text-emerald-100"
            data-ghost-size="lg"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isLoading ? copy.sending : copy.send}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AiTutorPanel;

import { useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  MARKDOWN_MATH_REHYPE_PLUGINS,
  MARKDOWN_MATH_REMARK_PLUGINS,
  normalizeMathMarkdown,
} from "./MathMarkdown";
import { getTutorCopy } from "../utils/tutorCopy";

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
}) {
  const [input, setInput] = useState("");
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentError, setAttachmentError] = useState("");
  const attachmentInputRef = useRef(null);
  const textareaRef = useRef(null);
  const isComposingRef = useRef(false);
  const submitTriggeredAtRef = useRef(0);
  const copy = useMemo(() => getTutorCopy(outputLanguage), [outputLanguage]);

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

  const canReset = Boolean(messages?.length || input.trim() || attachmentFile || error || attachmentError);
  const hasMessages = Array.isArray(messages) && messages.length > 0;
  const showEmptyState = !hasMessages && !isLoading;

  return (
    <div className="flex h-full min-h-[65vh] flex-col gap-4 rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-white">{copy.title}</h3>
          {fileName && (
            <p className="mt-2 text-xs text-slate-400">{copy.currentDocument(fileName)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={!canReset || isLoading}
          className="ghost-button text-xs text-slate-200"
          data-ghost-size="sm"
          style={{ "--ghost-color": "148, 163, 184" }}
        >
          {copy.resetChat}
        </button>
      </div>

      {notice && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
          {notice}
        </div>
      )}

      <div className="flex-1 overflow-auto">
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
                key={`tutor-${index}`}
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
            type="submit"
            onPointerUp={(event) => {
              if (event.pointerType && event.pointerType !== "mouse") {
                event.preventDefault();
                triggerSubmit();
              }
            }}
            disabled={!canChat || isLoading || (!input.trim() && !attachmentFile)}
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

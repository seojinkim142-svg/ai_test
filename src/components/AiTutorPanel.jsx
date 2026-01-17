import { useEffect, useRef, useState } from "react";

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
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading]);

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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">AI Tutor</p>
          <h3 className="text-2xl font-semibold text-white">AI 튜터</h3>
          {fileName && <p className="mt-1 text-xs text-slate-400">현재 문서: {fileName}</p>}
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
          {showEmptyState && (
            <p className="self-center text-sm text-slate-500">질문을 입력해주세요.</p>
          )}
          {messages?.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div
                key={`tutor-${index}`}
                className={`max-w-[75%] rounded-2xl border px-4 py-3 shadow-inner shadow-black/20 ${
                  isUser
                    ? "self-end border-emerald-300/30 bg-emerald-500/10"
                    : "self-start border-white/10 bg-slate-950/60"
                }`}
              >
                <p
                  className={`text-[11px] uppercase tracking-[0.18em] ${
                    isUser ? "text-emerald-200" : "text-slate-400"
                  }`}
                >
                  {isUser ? "You" : "Tutor"}
                </p>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            );
          })}

          {!showEmptyState && isLoading && (
            <div className="max-w-[75%] self-start rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200">AI</p>
              <p className="mt-2">답변 생성 중...</p>
            </div>
          )}

          <div ref={bottomRef} />
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
          placeholder="질문을 입력해주세요"
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

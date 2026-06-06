import { useUiStore } from "../stores";

export default function FeedbackDialog({ onSubmitFeedback, fileName }) {
  const {
    isFeedbackDialogOpen,
    setIsFeedbackDialogOpen,
    feedbackCategory,
    setFeedbackCategory,
    feedbackInput,
    setFeedbackInput,
    feedbackError,
    setFeedbackError,
    isSubmittingFeedback,
    theme,
  } = useUiStore();

  const handleClose = () => {
    if (isSubmittingFeedback) return;
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
  };

  if (!isFeedbackDialogOpen) return null;

  return (
    <div className="fixed inset-0 z-[165] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="피드백 창 닫기"
        onClick={handleClose}
        className={`absolute inset-0 ${
          theme === "light" ? "bg-slate-900/25" : "bg-black/75"
        } backdrop-blur-[2px]`}
      />
      <form
        onSubmit={onSubmitFeedback}
        className={`relative z-[166] w-full max-w-lg rounded-2xl border p-5 ${
          theme === "light"
            ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
            : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
        }`}
      >
        <p className="text-sm font-semibold">{"피드백 보내기"}</p>
        <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
          {"버그, 기능 제안, 사용성 개선 의견을 자유롭게 남겨 주세요."}
        </p>
        <div className="mt-4 space-y-3">
          <select
            name="feedback-category"
            value={feedbackCategory}
            onChange={(event) => setFeedbackCategory(event.target.value)}
            className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
              theme === "light"
                ? "border-slate-300 bg-white text-slate-900"
                : "border-white/15 bg-white/5 text-slate-100"
            }`}
          >
            <option value="general">{"일반"}</option>
            <option value="bug">{"버그 제보"}</option>
            <option value="feature">{"기능 제안"}</option>
            <option value="ux">{"사용성 의견"}</option>
          </select>
          <textarea
            name="feedback-message"
            value={feedbackInput}
            onChange={(event) => setFeedbackInput(event.target.value)}
            rows={7}
            maxLength={2000}
            placeholder={"어떤 문제를 겪으셨는지, 어떻게 개선하면 좋을지 작성해 주세요."}
            className={`w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
              theme === "light"
                ? "border-slate-300 bg-white text-slate-900"
                : "border-white/15 bg-white/5 text-slate-100"
            }`}
          />
          <div className="flex items-center justify-between text-[11px]">
            <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
              {"문맥: "}{fileName || "선택된 문서 없음"}
            </span>
            <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
              {feedbackInput.length}/2000
            </span>
          </div>
        </div>
        {feedbackError && <p className="mt-2 text-xs text-rose-300">{feedbackError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmittingFeedback}
            className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
            data-ghost-size="sm"
            style={{ "--ghost-color": "148, 163, 184" }}
          >
            {"취소"}
          </button>
          <button
            type="submit"
            disabled={isSubmittingFeedback}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isSubmittingFeedback ? "전송 중..." : "전송"}
          </button>
        </div>
      </form>
    </div>
  );
}

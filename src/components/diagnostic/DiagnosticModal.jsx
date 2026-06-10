import { useUiStore, useDiagnosticStore } from "../../stores";
import { saveDiagnosticResult } from "../../services/supabase";
import { computeDiagnosticResult } from "../../utils/diagnosticUtils";
import DiagnosticQuestionStep from "./DiagnosticQuestionStep";
import DiagnosticResultView from "./DiagnosticResultView";

export default function DiagnosticModal({ userId, docId, onGoToQuiz, onGoToSummary }) {
  const { theme } = useUiStore();
  const {
    isDiagnosticModalOpen,
    diagnosticStatus,
    diagnosticError,
    diagnosticItems,
    diagnosticAnswers,
    diagnosticCurrentIndex,
    diagnosticResult,
    setIsDiagnosticModalOpen,
    setDiagnosticStatus,
    setDiagnosticAnswer,
    setDiagnosticCurrentIndex,
    setDiagnosticResult,
  } = useDiagnosticStore();

  if (!isDiagnosticModalOpen) return null;

  const handleClose = () => {
    if (diagnosticStatus === "in-progress" || diagnosticStatus === "generating") {
      setDiagnosticStatus("skipped");
    }
    setIsDiagnosticModalOpen(false);
  };

  const handleAnswer = (choiceIndex) => {
    setDiagnosticAnswer(diagnosticCurrentIndex, choiceIndex);
    const nextIndex = diagnosticCurrentIndex + 1;
    if (nextIndex < diagnosticItems.length) {
      setDiagnosticCurrentIndex(nextIndex);
      return;
    }
    const nextAnswers = { ...diagnosticAnswers, [diagnosticCurrentIndex]: choiceIndex };
    const result = computeDiagnosticResult(diagnosticItems, nextAnswers);
    setDiagnosticResult(result);
    setDiagnosticStatus("completed");
    if (userId && docId) {
      saveDiagnosticResult({
        userId,
        docId,
        totalQuestions: result.totalQuestions,
        correctCount: result.correctCount,
        predictedScore: result.predictedScore,
        topicBreakdown: result.topicBreakdown,
      }).catch((err) => console.warn("saveDiagnosticResult failed", err));
    }
  };

  const handleGoToQuiz = () => {
    setIsDiagnosticModalOpen(false);
    onGoToQuiz?.();
  };

  const handleGoToSummary = () => {
    setIsDiagnosticModalOpen(false);
    onGoToSummary?.();
  };

  return (
    <div className="fixed inset-0 z-[165] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="진단 테스트 창 닫기"
        onClick={handleClose}
        className={`absolute inset-0 ${
          theme === "light" ? "bg-slate-900/25" : "bg-black/75"
        } backdrop-blur-[2px]`}
      />
      <div
        className={`relative z-[166] w-full max-w-lg rounded-2xl border p-5 ${
          theme === "light"
            ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
            : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
        }`}
      >
        {diagnosticStatus !== "completed" && (
          <div className="mb-3">
            <p className="text-sm font-semibold">{"이해도 진단 테스트"}</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              {"4문제만 풀면 현재 예상 시험 점수를 바로 확인할 수 있어요."}
            </p>
          </div>
        )}

        {diagnosticStatus === "generating" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300" />
            <p className="text-sm">{"당신의 이해도를 진단하는 중..."}</p>
          </div>
        )}

        {diagnosticStatus === "in-progress" && diagnosticItems[diagnosticCurrentIndex] && (
          <DiagnosticQuestionStep
            item={diagnosticItems[diagnosticCurrentIndex]}
            index={diagnosticCurrentIndex}
            total={diagnosticItems.length}
            theme={theme}
            onAnswer={handleAnswer}
          />
        )}

        {diagnosticStatus === "completed" && (
          <DiagnosticResultView
            result={diagnosticResult}
            theme={theme}
            onGoToQuiz={handleGoToQuiz}
            onGoToSummary={handleGoToSummary}
          />
        )}

        {diagnosticStatus === "error" && (
          <div className="flex flex-col gap-3 py-4 text-center">
            <p className="text-sm text-rose-300">{diagnosticError || "진단 테스트를 만들지 못했어요."}</p>
            <button
              type="button"
              onClick={handleClose}
              className={`ghost-button w-full text-sm ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
              data-ghost-size="md"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              {"건너뛰기"}
            </button>
          </div>
        )}

        {diagnosticStatus !== "completed" && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              {"나중에 하기"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

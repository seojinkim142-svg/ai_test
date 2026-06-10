import { useUiStore } from "../../stores";

export default function PredictedScoreBadge({ result, onRetake, canRetake = false }) {
  const { theme } = useUiStore();
  if (!result && !(onRetake && canRetake)) return null;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-sm shadow-lg shadow-black/10 ${
        theme === "light"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
      }`}
    >
      <span className="font-medium">
        {result ? "이 문서 기준 예상 점수" : "이해도 진단 테스트를 아직 안 받았어요"}
      </span>
      <div className="flex items-center gap-3">
        {result && <span className="text-lg font-bold">{`${result.predictedScore}점`}</span>}
        {onRetake && canRetake && (
          <button
            type="button"
            onClick={onRetake}
            className={`ghost-button text-xs ${theme === "light" ? "text-emerald-700" : "text-emerald-200"}`}
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            {result ? "다시 테스트" : "진단 테스트 받기"}
          </button>
        )}
      </div>
    </div>
  );
}

import { useUiStore } from "../../stores";

export default function PredictedScoreBadge({ result }) {
  const { theme } = useUiStore();
  if (!result) return null;

  return (
    <div
      className={`flex items-center justify-between rounded-2xl border px-4 py-2 text-sm shadow-lg shadow-black/10 ${
        theme === "light"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
      }`}
    >
      <span className="font-medium">{"이 문서 기준 예상 점수"}</span>
      <span className="text-lg font-bold">{`${result.predictedScore}점`}</span>
    </div>
  );
}

export default function DiagnosticQuestionStep({ item, index, total, theme, onAnswer }) {
  const choices = Array.isArray(item?.choices) ? item.choices : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
          {`진단 테스트 ${index + 1} / ${total}`}
        </span>
        {item?.topic && (
          <span className={`text-xs ${theme === "light" ? "text-emerald-600" : "text-emerald-300"}`}>
            {item.topic}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold leading-relaxed">{item?.question}</p>
      <div className="flex flex-col gap-2">
        {choices.map((choice, choiceIndex) => (
          <button
            key={choiceIndex}
            type="button"
            onClick={() => onAnswer(choiceIndex)}
            className={`ghost-button w-full justify-start text-left text-sm ${
              theme === "light" ? "text-slate-800" : "text-slate-100"
            }`}
            data-ghost-size="md"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {choice}
          </button>
        ))}
      </div>
    </div>
  );
}

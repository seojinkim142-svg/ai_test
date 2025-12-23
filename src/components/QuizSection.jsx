import { LETTERS } from "../constants";

function MultipleChoiceItem({ question, idx, selectedChoice, revealed, onSelect }) {
  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">
          Q{idx + 1}. {question.question}
        </h3>
        <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">객관식</span>
      </div>
      <ul className="mt-3 space-y-2">
        {(question.choices || []).map((choice, cIdx) => {
          const isAnswer = cIdx === question.answerIndex;
          const isSelected = selectedChoice === cIdx;
          const isRevealed = revealed;
          const showState = isRevealed && isSelected;
          const isCorrectSelection = showState && isAnswer;
          const isWrongSelection = showState && !isAnswer;

          return (
            <li
              key={choice}
              className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition ${
                isCorrectSelection
                  ? "bg-emerald-500/20 text-emerald-50 ring-emerald-400/60"
                  : isWrongSelection
                  ? "bg-red-500/10 text-red-100 ring-red-400/40"
                  : "bg-white/5 text-slate-200 ring-white/5 hover:ring-emerald-300/40"
              }`}
              onClick={() => onSelect(idx, cIdx)}
            >
              <span className="font-semibold text-white/80">{LETTERS[cIdx] || "-"}</span>
              <span>{choice}</span>
            </li>
          );
        })}
      </ul>
      {revealed && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {selectedChoice === question.answerIndex ? (
            <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-50 ring-1 ring-emerald-400/40">정답입니다! 잘했어요.</p>
          ) : (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-red-100 ring-1 ring-red-400/40">
              오답입니다. 정답: {LETTERS[question.answerIndex] || "-"}
            </p>
          )}
          {question.explanation && (
            <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">해설: {question.explanation}</p>
          )}
        </div>
      )}
    </article>
  );
}

function ShortAnswer({ question, userInput, result, onChange, onCheck }) {
  if (!question) return null;

  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Q5. {question.question}</h3>
        <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100">계산형</span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <input
          type="text"
          value={userInput}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 focus:ring-emerald-400"
          placeholder="계산 결과를 입력해주세요"
        />
        <button
          onClick={onCheck}
          className="inline-flex items-center justify-center rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300"
        >
          정답 확인
        </button>
        {result && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              result.isCorrect
                ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
                : "bg-red-500/10 text-red-100 ring-red-400/40"
            }`}
          >
            {result.isCorrect ? "정답입니다! 잘했어요." : `오답입니다. 정답: ${result.answer}`}
          </div>
        )}
      </div>
    </article>
  );
}

function QuizSection({
  questions,
  summary,
  selectedChoices,
  revealedChoices,
  shortAnswerInput,
  shortAnswerResult,
  onSelectChoice,
  onShortAnswerChange,
  onShortAnswerCheck,
}) {
  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">결과 미리보기</p>
          <h2 className="text-2xl font-bold text-white">생성된 퀴즈</h2>
        </div>
        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
          5문항
        </div>
      </div>

      {summary}

      <div className="mt-4 space-y-4">
        {(questions?.multipleChoice || []).map((q, idx) => (
          <MultipleChoiceItem
            key={`mc-${idx}`}
            idx={idx}
            question={q}
            selectedChoice={selectedChoices[idx]}
            revealed={revealedChoices[idx]}
            onSelect={onSelectChoice}
          />
        ))}

        <ShortAnswer
          question={questions?.shortAnswer}
          userInput={shortAnswerInput}
          result={shortAnswerResult}
          onChange={onShortAnswerChange}
          onCheck={onShortAnswerCheck}
        />
      </div>
    </div>
  );
}

export default QuizSection;

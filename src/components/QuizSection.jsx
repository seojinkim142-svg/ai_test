import { LETTERS } from "../constants";
import MathMarkdown from "./MathMarkdown";

function MultipleChoiceItem({ question, idx, questionNumber, selectedChoice, revealed, onSelect, onDelete }) {
  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white">Q{questionNumber}.</h3>
          <MathMarkdown
            content={question.question}
            className="summary-prose mt-1 max-w-none break-words text-sm text-slate-100 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">
            객관식
          </span>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(idx)}
              className="ghost-button text-[11px] text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              삭제
            </button>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {(question.choices || []).map((choice, cIdx) => {
          const isAnswer = cIdx === question.answerIndex;
          const isSelected = selectedChoice === cIdx;
          const showState = revealed && isSelected;
          const isCorrectSelection = showState && isAnswer;
          const isWrongSelection = showState && !isAnswer;
          const showChoiceHint = revealed;
          const choiceExplanation = question.choiceExplanations?.[cIdx];

          return (
            <li
              key={`${idx}-${cIdx}-${choice}`}
              className={`flex cursor-pointer flex-col rounded-xl px-3 py-2 text-sm ring-1 transition ${
                revealed && isAnswer
                  ? "bg-emerald-500/20 text-emerald-50 ring-emerald-400/60"
                  : isWrongSelection
                    ? "bg-red-500/10 text-red-100 ring-red-400/40"
                    : "bg-white/5 text-slate-200 ring-white/5 hover:ring-emerald-300/40"
              }`}
              onClick={() => onSelect(idx, cIdx)}
            >
              <div className="flex items-start gap-2">
                <span className="choice-label font-semibold text-white/80">{LETTERS[cIdx] || "-"}</span>
                <MathMarkdown
                  content={choice}
                  className="summary-prose min-w-0 flex-1 max-w-none break-words text-sm text-slate-100 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
                />
              </div>
              {showChoiceHint && choiceExplanation && (
                <p className={`mt-1.5 pl-5 text-xs ${isAnswer ? "text-emerald-200/90" : isSelected ? "text-red-200/80" : "text-slate-400"}`}>
                  {isAnswer ? "✓ " : "✗ "}{choiceExplanation}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {revealed && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {selectedChoice === question.answerIndex ? (
            <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-50 ring-1 ring-emerald-400/40">
              정답입니다. 잘했어요.
            </p>
          ) : (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-red-100 ring-1 ring-red-400/40">
              오답입니다. 정답: {LETTERS[question.answerIndex] || "-"}
            </p>
          )}
          {question.explanation && (
            <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
              <p className="mb-1 font-semibold text-slate-100">해설</p>
              <MathMarkdown
                content={question.explanation}
                className="summary-prose max-w-none break-words text-xs text-slate-200 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ShortAnswer({
  question,
  questionNumber,
  index,
  userInput,
  result,
  onChange,
  onCheck,
  onDelete,
}) {
  if (!question) return null;

  return (
    <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white">Q{questionNumber}.</h3>
          <MathMarkdown
            content={question.question}
            className="summary-prose mt-1 max-w-none break-words text-sm text-slate-100 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100">
            주관식
          </span>
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(index)}
              className="ghost-button text-[11px] text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              삭제
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <input
          name="short-answer"
          type="text"
          value={userInput}
          onChange={(event) => onChange(index, event.target.value)}
          className="w-full rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 focus:ring-emerald-400"
          placeholder="정답을 입력해 주세요"
        />
        <button
          type="button"
          onClick={() => onCheck(index)}
          className="ghost-button inline-flex text-sm text-cyan-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "34, 211, 238" }}
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
            {result.isCorrect ? "정답입니다. 잘했어요." : `오답입니다. 정답: ${result.answer}`}
          </div>
        )}
      </div>
    </article>
  );
}

function QuizSection({
  title = "생성된 퀴즈",
  questions,
  summary,
  selectedChoices,
  revealedChoices,
  shortAnswerInput,
  shortAnswerResult,
  onSelectChoice,
  onShortAnswerChange,
  onShortAnswerCheck,
  onDeleteMultipleChoice,
  onDeleteShortAnswer,
}) {
  const multipleChoice = Array.isArray(questions?.multipleChoice) ? questions.multipleChoice : [];
  const shortAnswers = Array.isArray(questions?.shortAnswer) ? questions.shortAnswer : [];
  const totalCount = multipleChoice.length + shortAnswers.length;

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">결과 미리보기</p>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
        </div>
        <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
          {totalCount || 0}문항
        </div>
      </div>

      {summary}

      <div className="mt-4 space-y-4">
        {multipleChoice.map((question, idx) => (
          <MultipleChoiceItem
            key={`mc-${idx}`}
            idx={idx}
            questionNumber={idx + 1}
            question={question}
            selectedChoice={selectedChoices?.[idx]}
            revealed={revealedChoices?.[idx]}
            onSelect={onSelectChoice}
            onDelete={onDeleteMultipleChoice}
          />
        ))}

        {shortAnswers.map((question, idx) => (
          <ShortAnswer
            key={`sa-${idx}`}
            question={question}
            questionNumber={multipleChoice.length + idx + 1}
            index={idx}
            userInput={shortAnswerInput?.[idx] || ""}
            result={shortAnswerResult?.[idx] || null}
            onChange={onShortAnswerChange}
            onCheck={onShortAnswerCheck}
            onDelete={onDeleteShortAnswer}
          />
        ))}
      </div>
    </div>
  );
}

export default QuizSection;

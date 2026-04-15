import { useState } from "react";
import MathMarkdown from "./MathMarkdown";

const LABELS = {
  title: "\uC624\uB2F5\uB178\uD2B8",
  subtitle: "\uD2C0\uB9B0 \uBB38\uC81C\uB97C \uB2E4\uC2DC \uD480\uACE0 \uC6D0\uBB38 \uADFC\uAC70\uB85C \uBC14\uB85C \uBCF5\uADC0\uD569\uB2C8\uB2E4.",
  pending: "\uBCF5\uC2B5 \uD544\uC694",
  resolved: "\uD574\uACB0\uB428",
  unresolvedCountSuffix: "\uAC1C \uBCF5\uC2B5 \uD544\uC694",
  noItems: "\uC800\uC7A5\uB41C \uC624\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  retry: "\uB2E4\uC2DC \uD480\uAE30",
  correct: "\uC815\uB2F5\uC785\uB2C8\uB2E4.",
  wrong: "\uB2E4\uC2DC \uD2C0\uB838\uC2B5\uB2C8\uB2E4.",
  answerInput: "\uC815\uB2F5 \uC785\uB825",
  checkAnswer: "\uC815\uB2F5 \uD655\uC778",
  myAnswer: "\uB0B4 \uB2F5",
  correctAnswer: "\uC815\uB2F5",
  explanation: "\uD574\uC124",
  previousAnswer: "\uC774\uC804 \uC81C\uCD9C \uB2F5\uC548",
  showAnswer: "\uC815\uB2F5/\uD574\uC124 \uBCF4\uAE30",
  hideAnswer: "\uC815\uB2F5/\uD574\uC124 \uC228\uAE30\uAE30",
  delete: "\uC0AD\uC81C",
  wrongCountPrefix: "\uC624\uB2F5 ",
  wrongCountSuffix: "\uD68C",
  recentWrong: "\uCD5C\uADFC \uC624\uB2F5",
  recentCorrect: "\uCD5C\uADFC \uC815\uB2F5",
  updatedAt: "\uC5C5\uB370\uC774\uD2B8",
  filterPending: "\uBCF5\uC2B5 \uD544\uC694",
  filterAll: "\uC804\uCCB4",
  filterResolved: "\uD574\uACB0\uB428",
  createMockExam: "\uC624\uB2F5\uB178\uD2B8 \uB9CC\uB4E4\uAE30",
  createMockExamLoading: "\uC624\uB2F5\uB178\uD2B8 \uC0DD\uC131 \uC911...",
  sectionInput: "\uCC55\uD130 \uBC94\uC704",
  sectionPlaceholder: "\uCC55\uD130 \uBC94\uC704 (\uC608: 3, 3-5, 1,3,5)",
  sectionHelp:
    "\uC120\uD0DD\uD55C \uCC55\uD130 \uBC94\uC704\uAC00 \uC624\uB2F5\uB178\uD2B8\uC640 \uC2DC\uD5D8 \uC9C1\uC804 \uC815\uB9AC\uC5D0 \uD568\uAED8 \uC801\uC6A9\uB429\uB2C8\uB2E4.",
  availableSections: "\uC124\uC815\uB41C \uCC55\uD130",
  sectionUnknown: "\uCC55\uD130 \uBBF8\uC9C0\uC815",
  examCramTitle: "\uC2DC\uD5D8 \uC9C1\uC804",
  examCramSubtitle:
    "\uC694\uC57D, \uD034\uC988, O/X, \uC624\uB2F5\uB178\uD2B8\uB97C \uD569\uCCD0 \uC2DC\uD5D8 \uC9C1\uC804\uC5D0 \uC774\uAC83\uB9CC \uBCF4\uBA74 \uB418\uB294 AI \uCD5C\uC885 \uC815\uB9AC\uB97C \uB9CC\uB4ED\uB2C8\uB2E4.",
  examCramCreate: "\uC2DC\uD5D8 \uC9C1\uC804 \uC815\uB9AC \uB9CC\uB4E4\uAE30",
  examCramCreateLoading: "\uC2DC\uD5D8 \uC9C1\uC804 \uC815\uB9AC \uC0DD\uC131 \uC911...",
  examCramPendingCount: "\uC624\uB2F5 \uCC38\uACE0",
  examCramPreviewCount: "\uCD5C\uADFC \uC624\uB2F5 \uBBF8\uB9AC\uBCF4\uAE30",
  examCramSummaryRef: "\uC694\uC57D",
  examCramQuizRef: "\uD034\uC988",
  examCramOxRef: "O/X",
  examCramReviewRef: "\uC624\uB2F5\uB178\uD2B8",
  examCramReferenceTitle: "\uCC38\uACE0 \uC790\uB8CC",
  examCramGuideTitle: "\uC2DC\uD5D8 \uC9C1\uC804 \uC774\uAC83\uB9CC \uBD10\uB77C",
  examCramGuideEmpty: "\uC544\uC9C1 \uC0DD\uC131\uB41C \uC2DC\uD5D8 \uC9C1\uC804 AI \uC815\uB9AC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  examCramUpdatedAt: "\uCD5C\uADFC \uC0DD\uC131",
  examCramScope: "\uAE30\uC900 \uBC94\uC704",
  examCramNoReferences:
    "\uBA3C\uC800 \uC694\uC57D, \uD034\uC988, O/X, \uC624\uB2F5\uB178\uD2B8 \uC911 \uD558\uB098 \uC774\uC0C1\uC744 \uC900\uBE44\uD574\uC8FC\uC138\uC694.",
  examCramEmpty: "\uC120\uD0DD\uD55C \uBC94\uC704\uC5D0 \uCD5C\uADFC \uC624\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
};

function formatTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function normalizeShortAnswerText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function normalizeChapterSelectionInput(value) {
  return String(value || "").replace(/\s+/g, "");
}

function ReviewRetryBlock({ item, onSubmit, onAttemptStateChange }) {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [shortAnswerInput, setShortAnswerInput] = useState("");
  const [result, setResult] = useState(null);

  const handleMultipleChoice = (choice, choiceIndex) => {
    const isCorrect = choiceIndex === item.answerIndex;
    setSelectedChoice(choiceIndex);
    setResult({ isCorrect, answerText: item.correctAnswerText });
    onAttemptStateChange?.({ isCorrect, answerText: item.correctAnswerText });
    onSubmit?.(item, {
      userAnswerText: String(choice || "").trim(),
      userAnswerValue: choiceIndex,
      isCorrect,
    });
  };

  const handleOx = (choice) => {
    const normalizedChoice = String(choice || "").trim().toUpperCase();
    const isCorrect =
      (normalizedChoice === "O" && item.correctAnswerValue === true) ||
      (normalizedChoice === "X" && item.correctAnswerValue === false);
    setResult({
      isCorrect,
      answerText: item.correctAnswerText || (item.correctAnswerValue ? "O" : "X"),
    });
    onAttemptStateChange?.({
      isCorrect,
      answerText: item.correctAnswerText || (item.correctAnswerValue ? "O" : "X"),
    });
    onSubmit?.(item, {
      userAnswerText: normalizedChoice,
      userAnswerValue: normalizedChoice === "O",
      isCorrect,
    });
  };

  const handleShortAnswer = () => {
    const userText = String(shortAnswerInput || "").trim();
    if (!userText) return;
    const isCorrect =
      normalizeShortAnswerText(userText) === normalizeShortAnswerText(item.correctAnswerText);
    setResult({ isCorrect, answerText: item.correctAnswerText });
    onAttemptStateChange?.({ isCorrect, answerText: item.correctAnswerText });
    onSubmit?.(item, {
      userAnswerText: userText,
      userAnswerValue: userText,
      isCorrect,
    });
  };

  if (item.sourceType === "quiz_multiple_choice") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {LABELS.retry}
        </p>
        <div className="space-y-2">
          {(item.choices || []).map((choice, index) => {
            const isSelected = selectedChoice === index;
            return (
              <button
                key={`${item.id}-choice-${index}`}
                type="button"
                onClick={() => handleMultipleChoice(choice, index)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ring-1 transition ${
                  isSelected
                    ? "bg-emerald-500/18 text-emerald-50 ring-emerald-400/50"
                    : "bg-white/5 text-slate-200 ring-white/10 hover:ring-emerald-300/35"
                }`}
              >
                <MathMarkdown
                  content={choice}
                  className="summary-prose max-w-none break-words text-sm text-inherit [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
                />
              </button>
            );
          })}
        </div>
        {result && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              result.isCorrect
                ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
                : "bg-red-500/10 text-red-100 ring-red-400/40"
            }`}
          >
            {result.isCorrect ? LABELS.correct : LABELS.wrong}
          </p>
        )}
      </div>
    );
  }

  if (item.sourceType === "ox") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {LABELS.retry}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {["O", "X"].map((choice) => (
            <button
              key={`${item.id}-${choice}`}
              type="button"
              onClick={() => handleOx(choice)}
              className={`ghost-button review-note-action w-full text-sm text-slate-100 ${
                choice === "O" ? "review-note-action--success" : "review-note-action--danger"
              }`}
              data-ghost-size="sm"
              style={{ "--ghost-color": choice === "O" ? "52, 211, 153" : "248, 113, 113" }}
            >
              {choice}
            </button>
          ))}
        </div>
        {result && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ring-1 ${
              result.isCorrect
                ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
                : "bg-red-500/10 text-red-100 ring-red-400/40"
            }`}
          >
            {result.isCorrect ? LABELS.correct : LABELS.wrong}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {LABELS.retry}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={shortAnswerInput}
          onChange={(event) => setShortAnswerInput(event.target.value)}
          placeholder={LABELS.answerInput}
          className="w-full flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent focus:border-emerald-300/50 focus:ring-emerald-300/40"
        />
        <button
          type="button"
          onClick={handleShortAnswer}
          className="ghost-button review-note-action review-note-action--accent text-sm text-cyan-100"
          data-ghost-size="sm"
          style={{ "--ghost-color": "34, 211, 238" }}
        >
          {LABELS.checkAnswer}
        </button>
      </div>
      {result && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
            result.isCorrect
              ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
              : "bg-red-500/10 text-red-100 ring-red-400/40"
          }`}
        >
          {result.isCorrect ? LABELS.correct : LABELS.wrong}
        </p>
      )}
    </div>
  );
}

function ReviewNoteCard({
  item,
  onSubmitAttempt,
  onJumpToEvidencePage,
  onDelete,
}) {
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  return (
    <article className="review-note-card rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="review-note-pill review-note-pill--source rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/30">
              {item.sourceLabel}
            </span>
            <span
              className={`review-note-pill rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
                item.resolved
                  ? "review-note-pill--resolved bg-slate-500/15 text-slate-200 ring-slate-300/20"
                  : "review-note-pill--pending bg-amber-500/15 text-amber-100 ring-amber-300/30"
              }`}
            >
              {item.resolved ? LABELS.resolved : LABELS.pending}
            </span>
            <span className="review-note-pill review-note-pill--count rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
              {`${LABELS.wrongCountPrefix}${item.wrongCount}${LABELS.wrongCountSuffix}`}
            </span>
            {(item.sectionLabels || []).map((sectionLabel) => (
              <span
                key={`${item.id}-${sectionLabel}`}
                className="review-note-pill review-note-pill--section rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 ring-1 ring-cyan-300/25"
              >
                {sectionLabel}
              </span>
            ))}
            {!item.sectionLabels?.length && (
              <span className="review-note-pill review-note-pill--unknown rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-400 ring-1 ring-white/10">
                {LABELS.sectionUnknown}
              </span>
            )}
          </div>
          <div className="mt-3">
            <MathMarkdown
              content={item.prompt}
              className="summary-prose max-w-none break-words text-sm text-slate-100 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAnswerVisible((prev) => !prev)}
            className="ghost-button review-note-action review-note-action--neutral text-xs text-slate-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "148, 163, 184" }}
          >
            {isAnswerVisible ? LABELS.hideAnswer : LABELS.showAnswer}
          </button>
          <button
            type="button"
            onClick={() => onDelete?.(item.id)}
            className="ghost-button review-note-action review-note-action--danger text-xs text-red-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "248, 113, 113" }}
          >
            {LABELS.delete}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(item.evidencePages || []).map((pageNumber) => (
          <button
            key={`${item.id}-page-${pageNumber}`}
            type="button"
            onClick={() =>
              onJumpToEvidencePage?.(pageNumber, item.evidenceSnippet || "", item.evidenceLabel || "")
            }
            className="ghost-button review-note-action review-note-action--success text-[11px] text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {`p.${pageNumber}`}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <ReviewRetryBlock
          item={item}
          onSubmit={onSubmitAttempt}
          onAttemptStateChange={(attempt) => {
            if (!attempt?.isCorrect) {
              setIsAnswerVisible(true);
            }
          }}
        />
      </div>

      {isAnswerVisible && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-950/45 px-3 py-2 ring-1 ring-white/10">
              <p className="font-semibold text-slate-100">{LABELS.previousAnswer}</p>
              <p className="mt-1 break-words text-slate-300">{item.userAnswerText || "-"}</p>
            </div>
            <div className="rounded-xl bg-slate-950/45 px-3 py-2 ring-1 ring-white/10">
              <p className="font-semibold text-slate-100">{LABELS.correctAnswer}</p>
              <p className="mt-1 break-words text-emerald-100">{item.correctAnswerText || "-"}</p>
            </div>
          </div>

          {item.explanation && (
            <div className="rounded-xl bg-slate-950/45 px-3 py-3 ring-1 ring-white/10">
              <p className="text-xs font-semibold text-slate-100">{LABELS.explanation}</p>
              <MathMarkdown
                content={item.explanation}
                className="summary-prose mt-2 max-w-none break-words text-xs text-slate-200 [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto"
              />
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span>{`${LABELS.recentWrong}: ${formatTimestamp(item.lastWrongAt)}`}</span>
        <span>{`${LABELS.recentCorrect}: ${formatTimestamp(item.lastCorrectAt)}`}</span>
        <span>{`${LABELS.updatedAt}: ${formatTimestamp(item.updatedAt)}`}</span>
      </div>
    </article>
  );
}

function ExamCramCard({
  content,
  updatedAt,
  scopeLabel,
  status,
  error,
  hasAnySource,
}) {
  const hasResult = Boolean(content || status || error || updatedAt);

  return (
    <div className="mt-4">
      {status && <p className="text-sm text-emerald-100">{status}</p>}
      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-100 ring-1 ring-red-400/30">
          {error}
        </p>
      )}

      {!hasAnySource && <p className="mt-3 text-sm text-slate-300">{LABELS.examCramNoReferences}</p>}

      {hasResult && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-cyan-100">{LABELS.examCramGuideTitle}</p>
              {scopeLabel && (
                <p className="text-xs text-slate-300">{`${LABELS.examCramScope} ${scopeLabel}`}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {updatedAt && (
                <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
                  {`${LABELS.examCramUpdatedAt} ${formatTimestamp(updatedAt)}`}
                </span>
              )}
            </div>
          </div>

          {content ? (
            <div className="mt-4">
              <MathMarkdown
                content={content}
                className="summary-prose prose prose-invert max-w-none break-words text-sm text-slate-100 prose-headings:text-cyan-50 prose-strong:text-slate-50 prose-p:leading-relaxed [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto"
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-300">{LABELS.examCramGuideEmpty}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewNotesPanel({
  items,
  availableSections,
  sectionSelectionInput,
  onSectionSelectionChange,
  sectionSelectionError,
  examCramItems,
  examCramPendingCount = 0,
  examCramSectionError,
  examCramReferenceCounts,
  examCramHasAnySource = false,
  examCramContent,
  examCramUpdatedAt,
  examCramScopeLabel,
  examCramStatus,
  examCramError,
  onSubmitAttempt,
  onJumpToEvidencePage,
  onDelete,
  onGenerateExamCram,
  onCreateMockExam,
  isCreatingMockExam = false,
  isGeneratingExamCram = false,
}) {
  const list = Array.isArray(items) ? items : [];
  const pendingCount = list.filter((item) => !item?.resolved).length;
  void examCramItems;
  void examCramPendingCount;
  void examCramReferenceCounts;
  const normalizedSectionSelection = normalizeChapterSelectionInput(sectionSelectionInput);
  const activeSectionError = sectionSelectionError || examCramSectionError || "";
  const availableSectionSummary = Array.isArray(availableSections)
    ? availableSections
        .slice(0, 4)
        .map((section) => {
          const chapterNumber = Number.parseInt(section?.chapterNumber, 10);
          const pageStart = Number.parseInt(section?.pageStart, 10);
          const pageEnd = Number.parseInt(section?.pageEnd, 10);
          if (Number.isFinite(chapterNumber) && Number.isFinite(pageStart) && Number.isFinite(pageEnd)) {
            return `챕터 ${chapterNumber} (${pageStart}-${pageEnd}p)`;
          }
          return LABELS.sectionUnknown;
        })
        .join(", ")
    : "";
  const availableSectionSuffix =
    Array.isArray(availableSections) && availableSections.length > 4
      ? ` 외 ${availableSections.length - 4}개`
      : "";
  const sectionGuideText = activeSectionError
    ? activeSectionError
    : availableSectionSummary
      ? `${LABELS.availableSections}: ${availableSectionSummary}${availableSectionSuffix}`
      : LABELS.sectionHelp;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-300">{LABELS.subtitle}</p>
            <h2 className="text-2xl font-bold text-white">{LABELS.title}</h2>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {LABELS.sectionInput}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={sectionSelectionInput}
              onChange={(event) =>
                onSectionSelectionChange?.(normalizeChapterSelectionInput(event.target.value))
              }
              placeholder={LABELS.sectionPlaceholder}
              className={`w-full rounded-xl border bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition ${
                activeSectionError
                  ? "border-red-400/45 focus:border-red-300/60"
                  : "border-white/15 focus:border-emerald-300/60"
              }`}
            />
          </div>
          <p
            className={`mt-2 text-xs ${
              activeSectionError ? "text-red-200" : "text-slate-400"
            }`}
          >
            {sectionGuideText}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onCreateMockExam?.({
                chapterSelectionInput: normalizedSectionSelection,
                titlePrefix: "\uC624\uB2F5\uB178\uD2B8",
                sourceKind: "review_notes",
                statusLabel: "\uC624\uB2F5\uB178\uD2B8",
              })
            }
            disabled={isCreatingMockExam || pendingCount <= 0 || Boolean(activeSectionError)}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            {isCreatingMockExam ? LABELS.createMockExamLoading : LABELS.createMockExam}
          </button>
          <button
            type="button"
            onClick={() => onGenerateExamCram?.({ chapterSelectionInput: normalizedSectionSelection })}
            disabled={isGeneratingExamCram || !examCramHasAnySource || Boolean(activeSectionError)}
            className="ghost-button text-xs text-emerald-100"
            data-ghost-size="sm"
            style={{ "--ghost-color": "16, 185, 129" }}
          >
            {isGeneratingExamCram ? LABELS.examCramCreateLoading : LABELS.examCramCreate}
          </button>
        </div>

        <ExamCramCard
          hasAnySource={examCramHasAnySource}
          content={examCramContent}
          updatedAt={examCramUpdatedAt}
          scopeLabel={examCramScopeLabel}
          status={examCramStatus}
          error={examCramError}
        />
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-300">
          {LABELS.noItems}
        </div>
      ) : (
        <div className="space-y-4">
          {list.map((item) => (
            <ReviewNoteCard
              key={item.id}
              item={item}
              onSubmitAttempt={onSubmitAttempt}
              onJumpToEvidencePage={onJumpToEvidencePage}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ReviewNotesPanel;

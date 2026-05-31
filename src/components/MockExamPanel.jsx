import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { LETTERS } from "../constants";
import { buildMockExamQuestionPdfBlob } from "../utils/pdfExport";

// ── Math utils ────────────────────────────────────────────────────────────────

const MOCK_BARE_LATEX_RE =
  /\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)\b/;
const MOCK_INLINE_EQUATION_RE =
  /[A-Za-z][A-Za-z0-9]*(?:\([^\)\n]{0,40}\))?\s*=\s*[^,.;!?\n$]{2,220}/g;
const MOCK_POWER_EXPR_RE =
  /[A-Za-z][A-Za-z0-9]*\s*\^\s*\{[^}\n]{1,50}\}[A-Za-z0-9{}^_\\\-]*/g;
const MOCK_EXPECTATION_EXPR_RE = /E\[[A-Za-z0-9\\^_{}\[\]().,+\-*\/|=\s\u221E]{2,260}\]/g;
const MOCK_INTEGRAL_EXPR_RE = /(?:\\+int|\u222B)\s*[A-Za-z0-9\\^_{}\[\]().,+\-*\/|=\s\u221E]{2,260}/g;
const MOCK_NESTED_MATH_EXPECTATION_RE = /E\[\$([^$\n]{1,300})\$\]/g;
const MOCK_MATH_TOKEN_RE =
  /(?:\\(?:int|infty|sum|frac|dfrac|tfrac|sqrt|left|right|cdot|times|to|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim|mid)|[_^=+\-*/])/;

function isInsideMathSegment(text, index) {
  let delimiterCount = 0;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '$' && text[i - 1] !== '\\') delimiterCount += 1;
  }
  return delimiterCount % 2 === 1;
}

function toLatexMath(expr) {
  return String(expr || "")
    .normalize("NFKC")
    .trim()
    .replace(
      /\\{2,}(?=(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)\b)/g,
      "\\"
    )
    .replace(/\u2212/g, "-")
    .replace(/<=|\u2264/g, " \\le ")
    .replace(/>=|\u2265/g, " \\ge ")
    .replace(/!=|\u2260/g, " \\ne ")
    .replace(/~=|\u2248/g, " \\approx ")
    .replace(/->|\u2192/g, " \\to ")
    .replace(/\u221E/g, " \\infty ")
    .replace(/\u2211/g, " \\sum ")
    .replace(/\\int\s*\\infty\s*0/g, " \\int_0^\\infty ")
    .replace(/\\int\s*0\s*\\infty/g, " \\int_0^\\infty ")
    .replace(/\\int\s*\u221E\s*0/g, " \\int_0^\\infty ")
    .replace(/\\int\s*0\s*\u221E/g, " \\int_0^\\infty ")
    .replace(/\u222B\s*\u221E\s*0/g, " \\int_0^\\infty ")
    .replace(/\u222B\s*0\s*\u221E/g, " \\int_0^\\infty ")
    .replace(/\u222B/g, " \\int ")
    .replace(/[\u00D7\u2715\u2716]/g, " \\times ")
    .replace(/[\u00B7\u22C5]/g, " \\cdot ")
    .replace(/\|/g, " \\mid ")
    .replace(/\bd([A-Za-z])\b/g, " \\, d$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function wrapPatternAsLatexMath(text, pattern, options = {}) {
  const compact = options.compact === true;
  return String(text || "").replace(pattern, (match, offset, source) => {
    if (typeof offset !== "number" || isInsideMathSegment(source, offset)) return match;
    const normalized = toLatexMath(match);
    if (!normalized) return match;
    if (!MOCK_MATH_TOKEN_RE.test(normalized)) return match;
    const expression = compact ? normalized.replace(/\s+/g, "") : normalized;
    return `$${expression}$`;
  });
}

function toMarkdownText(rawText) {
  return String(rawText || "")
    .replace(/[\uFF61-\uFFEF\uFFF0-\uFFFF]/g, " ")
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\uFFFD+/g, "")
    .replace(/^[\u00B7\u2022\u318D\uFF65]+\s*/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function toMarkdownWithLatexMath(rawText) {
  const source = toMarkdownText(String(rawText || "").replace(/\r\n/g, "\n"));
  if (!source) return "";
  const lines = source.split("\n");
  let inCodeFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) { inCodeFence = !inCodeFence; return line; }
      if (inCodeFence) return line;
      if (line.includes("`")) return line;
      let working = String(line || "");
      working = wrapPatternAsLatexMath(working, MOCK_INTEGRAL_EXPR_RE);
      working = working.replace(MOCK_NESTED_MATH_EXPECTATION_RE, (full, inner, offset, sourceText) => {
        if (isInsideMathSegment(sourceText, Number(offset))) return full;
        const normalized = toLatexMath(`E[${inner}]`);
        if (!normalized) return full;
        return `$${normalized}$`;
      });
      working = wrapPatternAsLatexMath(working, MOCK_EXPECTATION_EXPR_RE);
      working = wrapPatternAsLatexMath(working, MOCK_INLINE_EQUATION_RE);
      working = wrapPatternAsLatexMath(working, MOCK_POWER_EXPR_RE, { compact: true });
      if (MOCK_BARE_LATEX_RE.test(working)) {
        working = working.replace(
          /(^|[\s(])((?:\\(?:frac|dfrac|tfrac|sum|prod|int|sqrt|left|right|cdot|times|to|infty|leq?|geq?|neq?|approx|mathbb|mathbf|mathrm|text|lim)[^,\n)]{0,180}))/g,
          (full, prefix, expr, offset, sourceText) => {
            const exprIndex = Number(offset) + String(prefix || "").length;
            if (isInsideMathSegment(sourceText, exprIndex)) return full;
            const normalized = toLatexMath(expr);
            if (!normalized) return full;
            return `${prefix}$${normalized}$`;
          }
        );
      }
      return working;
    })
    .join("\n");
}

// ── MockExamPanel ─────────────────────────────────────────────────────────────

export default function MockExamPanel({
  mockExams,
  mockExamMenuRef,
  mockExamMenuButtonRef,
  isMockExamMenuOpen,
  setIsMockExamMenuOpen,
  isLoadingMockExams,
  activeMockExam,
  activeMockExamTitle,
  formatMockExamTitle,
  handleDeleteMockExam,
  handleCreateMockExam,
  mockExamChapterSelectionInput,
  setMockExamChapterSelectionInput,
  mockExamPromptAddonInput,
  setMockExamPromptAddonInput,
  isGeneratingMockExam,
  selectedFileId,
  isLoadingText,
  handleExportMockExam,
  mockExamOrderedItems,
  mockExamPrintRef,
  mockExamPages,
  showMockExamAnswers,
  setShowMockExamAnswers,
  mockExamStatus,
  mockExamError,
  setActiveMockExamId,
}) {
  const [mockExamPdfUrl, setMockExamPdfUrl] = useState(null);
  const [isBuildingMockExamPdf, setIsBuildingMockExamPdf] = useState(false);
  const mockExamPdfUrlRef = useRef(null);

  const setAndRevokeMockExamPdfUrl = useCallback((url) => {
    if (mockExamPdfUrlRef.current) URL.revokeObjectURL(mockExamPdfUrlRef.current);
    mockExamPdfUrlRef.current = url ?? null;
    setMockExamPdfUrl(url ?? null);
  }, []);

  useEffect(() => {
    if (!activeMockExam || mockExamOrderedItems.length === 0) {
      setAndRevokeMockExamPdfUrl(null);
      setIsBuildingMockExamPdf(false);
      return undefined;
    }
    let cancelled = false;
    setIsBuildingMockExamPdf(true);
    setAndRevokeMockExamPdfUrl(null);
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled) return;
        const container = mockExamPrintRef.current;
        if (!container) return;
        const blob = await buildMockExamQuestionPdfBlob(container);
        if (cancelled) return;
        setAndRevokeMockExamPdfUrl(URL.createObjectURL(blob));
      } catch (err) {
        if (!cancelled) console.error("Mock exam PDF build failed:", err);
      } finally {
        if (!cancelled) setIsBuildingMockExamPdf(false);
      }
    })();
    return () => {
      cancelled = true;
      setAndRevokeMockExamPdfUrl(null);
      setIsBuildingMockExamPdf(false);
    };
  }, [activeMockExam?.id, mockExamOrderedItems.length, mockExamPrintRef, setAndRevokeMockExamPdfUrl]);

  const mockMarkdownComponents = useMemo(
    () => ({
      p: ({ children }) => <p className="my-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
      li: ({ children }) => <li className="my-0.5">{children}</li>,
    }),
    []
  );

  const renderMockRichText = useCallback(
    (text, className = "") => {
      const normalized = toMarkdownWithLatexMath(String(text || "").trim());
      if (!normalized) return null;
      return (
        <div className={`summary-prose max-w-none break-words [&_.katex-display]:my-1 [&_.katex-display]:overflow-x-auto ${className}`}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={mockMarkdownComponents}>
            {normalized}
          </ReactMarkdown>
        </div>
      );
    },
    [mockMarkdownComponents]
  );

  const renderMockExamItem = useCallback(
    (item, number) => {
      const choices = Array.isArray(item?.choices) ? item.choices : [];
      const isOx = item?.type === "ox";
      const isShort = item?.type === "quiz-short";
      const isMultiple = !isOx && !isShort;
      return (
        <div key={`mock-exam-q-${number}`} className="space-y-2">
          <p className="text-[13px] font-semibold text-black">{number}.</p>
          {renderMockRichText(item?.prompt, "text-[13px] text-black")}
          {isOx && <p className="text-[12px] text-black/80">1) O  2) X</p>}
          {isShort && <p className="text-[12px] text-black/80">답 ____________________</p>}
          {isMultiple && choices.length > 0 && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-black/85">
              {choices.slice(0, 4).map((choice, idx) => (
                <div key={`choice-${number}-${idx}`} className="flex gap-2">
                  <span className="w-4">{idx + 1})</span>
                  {renderMockRichText(choice, "min-w-0 flex-1 text-[12px] text-black/85")}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    },
    [renderMockRichText]
  );

  const mockExamAnswerEntries = useMemo(() => {
    const persistedAnswerSheet = Array.isArray(activeMockExam?.payload?.answerSheet)
      ? activeMockExam.payload.answerSheet
      : [];
    const deriveAnswerFromItem = (item) => {
      const answerText =
        item.type === "ox"
          ? item.answer || "-"
          : item.type === "quiz-short"
            ? item.answer || "-"
            : Number.isFinite(item.answerIndex)
              ? LETTERS[item.answerIndex] || "-"
              : "-";
      return String(answerText || "-").trim() || "-";
    };
    if (mockExamOrderedItems.length === 0 && persistedAnswerSheet.length > 0) {
      return persistedAnswerSheet.map((item, idx) => ({
        number: Number.isFinite(item?.number) ? item.number : idx + 1,
        answer: String(item?.answer || "-").trim() || "-",
        explanation: String(item?.explanation || "").trim(),
        evidence: String(item?.evidence || "").trim(),
      }));
    }
    return mockExamOrderedItems.map((item, idx) => {
      const persisted = persistedAnswerSheet[idx] || {};
      const persistedAnswer = String(persisted?.answer || "").trim();
      const fallbackAnswer = deriveAnswerFromItem(item);
      const answer = persistedAnswer && persistedAnswer !== "-" ? persistedAnswer : fallbackAnswer;
      return {
        number: idx + 1,
        answer,
        explanation: String(persisted?.explanation || item?.explanation || "").trim(),
        evidence: String(persisted?.evidence || item?.evidence || "").trim(),
        choiceExplanations: Array.isArray(item?.choiceExplanations) ? item.choiceExplanations : [],
      };
    });
  }, [activeMockExam?.payload?.answerSheet, mockExamOrderedItems]);

  const normalizeInput = (value) => String(value || "").replace(/\s+/g, "");

  return (
    <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">총 모의고사</p>
          <h3 className="text-lg font-semibold text-white">모의고사</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-100">
            어려움 (상)
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
            {mockExams.length}개
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={mockExamChapterSelectionInput}
              onChange={(e) => setMockExamChapterSelectionInput(normalizeInput(e.target.value))}
              placeholder="챕터 범위 (예: 1-3,5)"
              className="w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition focus:border-emerald-300/60"
            />
            <button
              type="button"
              onClick={handleCreateMockExam}
              disabled={isGeneratingMockExam || isLoadingText || !selectedFileId}
              className="ghost-button text-xs text-emerald-100"
              data-ghost-size="sm"
              style={{ "--ghost-color": "52, 211, 153" }}
            >
              확인
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
          <label className="block text-xs font-semibold text-slate-300">추가 요청</label>
          <textarea
            value={mockExamPromptAddonInput}
            onChange={(e) => setMockExamPromptAddonInput(e.target.value)}
            disabled={isGeneratingMockExam || isLoadingText}
            placeholder="예: 계산형 문항 위주로, 헷갈리는 함정 선택지를 더 넣어줘, 정의 비교 문제를 포함해줘"
            className="mt-2 min-h-[88px] w-full rounded-xl border border-white/15 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-emerald-300/60"
          />
          <p className="mt-2 text-xs text-slate-400">선택사항. 모의고사 생성 프롬프트에 함께 반영됩니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={mockExamMenuRef}>
            <button
              ref={mockExamMenuButtonRef}
              type="button"
              onClick={() => setIsMockExamMenuOpen((prev) => !prev)}
              className="ghost-button text-sm text-emerald-100"
              data-ghost-size="lg"
              style={{ "--ghost-color": "52, 211, 153" }}
            >
              모의고사 고르기
            </button>
            {isMockExamMenuOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
                {isLoadingMockExams && (
                  <div className="px-4 py-3 text-xs text-slate-400">모의고사 불러오는 중...</div>
                )}
                {!isLoadingMockExams && mockExams.length === 0 && (
                  <div className="px-4 py-3 text-xs text-slate-400">저장된 모의고사가 없습니다.</div>
                )}
                {!isLoadingMockExams && mockExams.map((exam, idx) => {
                  const isActive = activeMockExam?.id === exam.id;
                  const displayTitle = formatMockExamTitle(exam, idx);
                  return (
                    <div
                      key={exam.id}
                      className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${idx === 0 ? "" : "border-t border-white/10"} ${isActive ? "bg-emerald-500/10" : "hover:bg-white/5"}`}
                    >
                      <button
                        type="button"
                        onClick={() => { setActiveMockExamId(exam.id); setShowMockExamAnswers(true); setIsMockExamMenuOpen(false); }}
                        className="flex flex-1 flex-col items-start text-left"
                      >
                        <span className="text-sm font-semibold text-slate-100">{displayTitle}</span>
                        <span className="text-[11px] text-slate-400">{new Date(exam.created_at).toLocaleString("ko-KR")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteMockExam(exam.id); setIsMockExamMenuOpen(false); }}
                        className="ghost-button text-[11px] text-slate-200"
                        data-ghost-size="sm"
                        style={{ "--ghost-color": "226, 232, 240" }}
                      >
                        삭제
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {activeMockExam && (
            <span className="text-xs text-slate-300">선택됨: {activeMockExamTitle}</span>
          )}
          <button
            type="button"
            onClick={handleCreateMockExam}
            disabled={isGeneratingMockExam || isLoadingText || !selectedFileId}
            className="ghost-button text-sm text-emerald-100"
            data-ghost-size="lg"
            style={{ "--ghost-color": "52, 211, 153" }}
          >
            {isGeneratingMockExam ? "모의고사 생성 중..." : "모의고사 생성"}
          </button>
          <button
            type="button"
            onClick={() => handleExportMockExam(activeMockExam)}
            disabled={!activeMockExam || mockExamOrderedItems.length === 0}
            className="ghost-button text-sm text-indigo-100"
            data-ghost-size="lg"
            style={{ "--ghost-color": "99, 102, 241" }}
          >
            PDF 저장
          </button>
          <button
            type="button"
            onClick={() => setShowMockExamAnswers((prev) => !prev)}
            disabled={!activeMockExam}
            className="ghost-button text-sm text-slate-200"
            data-ghost-size="lg"
            style={{ "--ghost-color": "148, 163, 184" }}
          >
            {showMockExamAnswers ? "정답 숨기기" : "정답 보기"}
          </button>
        </div>

        {mockExamStatus && <p className="text-sm text-emerald-200">{mockExamStatus}</p>}
        {mockExamError && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
            {mockExamError}
          </p>
        )}

        {/* 오프스크린: A4 PDF 캡처 소스 */}
        <div
          ref={mockExamPrintRef}
          aria-hidden="true"
          style={{ position: "fixed", left: "-9999px", top: 0, pointerEvents: "none", opacity: 0, zIndex: -1 }}
        >
          {activeMockExam && mockExamPages.map((pageItems, pageIndex) => {
            const isFourGrid = pageItems.length === 4;
            const pageStart = pageIndex === 0 ? 1 : pageIndex === 1 ? 5 : 9;
            return (
              <section
                key={`mock-exam-page-print-${pageIndex}`}
                className="mock-exam-page"
                style={{ display: "flex", flexDirection: "column", background: "white", color: "black", width: "794px", minHeight: "1123px", padding: "44px 52px 48px", boxSizing: "border-box" }}
              >
                <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                  <h4 style={{ fontSize: "18px", fontWeight: 600 }}>{activeMockExamTitle}</h4>
                  <span style={{ position: "absolute", right: 0, top: 0, fontSize: "18px", fontWeight: 600 }}>{pageIndex + 1}</span>
                </div>
                <div style={{ marginTop: "12px", borderTop: "1px solid black" }} />
                <div style={{ position: "relative", flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, ...(isFourGrid ? { gridTemplateRows: "1fr 1fr", gridAutoFlow: "column" } : { gridAutoFlow: "row" }) }}>
                  <div style={{ position: "absolute", left: "50%", top: 0, height: "100%", width: "1px", background: "rgba(0,0,0,0.8)" }} />
                  {pageItems.map((item, idx) => {
                    const colIdx = isFourGrid ? Math.floor(idx / 2) : idx % 2;
                    const rowIdx = isFourGrid ? idx % 2 : 0;
                    return (
                      <div
                        key={`mock-exam-cell-print-${pageIndex}-${idx}`}
                        style={{ paddingLeft: colIdx === 0 ? "0" : "24px", paddingRight: colIdx === 0 ? "24px" : "0", paddingTop: "24px", paddingBottom: "24px" }}
                      >
                        {renderMockExamItem(item, pageStart + idx)}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100">
          {!activeMockExam && <p className="text-sm text-slate-400">선택된 모의고사가 없습니다.</p>}
          {activeMockExam && (
            <div className="space-y-6">
              {mockExamOrderedItems.length === 0 && (
                <p className="text-sm text-slate-400">모의고사 문항이 없습니다.</p>
              )}
              {mockExamOrderedItems.length > 0 && (
                <div className="overflow-x-auto">
                  <div className="flex flex-col items-center gap-10" style={{ minWidth: "794px" }}>
                    {mockExamPages.map((pageItems, pageIndex) => {
                      const isFourGrid = pageItems.length === 4;
                      const pageStart = pageIndex === 0 ? 1 : pageIndex === 1 ? 5 : 9;
                      return (
                        <section
                          key={`mock-exam-page-${pageIndex}`}
                          className="mock-exam-page bg-white text-black shadow-sm"
                          style={{ display: "flex", flexDirection: "column", width: "794px", minHeight: "1123px", padding: "44px 52px 48px", boxSizing: "border-box" }}
                        >
                          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
                            <h4 style={{ fontSize: "18px", fontWeight: 600 }}>{activeMockExamTitle}</h4>
                            <span style={{ position: "absolute", right: 0, top: 0, fontSize: "18px", fontWeight: 600 }}>{pageIndex + 1}</span>
                          </div>
                          <div style={{ marginTop: "12px", borderTop: "1px solid black" }} />
                          <div style={{ position: "relative", flex: 1, marginTop: "0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, ...(isFourGrid ? { gridTemplateRows: "1fr 1fr", gridAutoFlow: "column" } : { gridAutoFlow: "row" }) }}>
                            <div style={{ position: "absolute", left: "50%", top: 0, height: "100%", width: "1px", background: "rgba(0,0,0,0.8)" }} />
                            {pageItems.map((item, idx) => {
                              const colIdx = isFourGrid ? Math.floor(idx / 2) : idx % 2;
                              return (
                                <div
                                  key={`mock-exam-cell-${pageIndex}-${idx}`}
                                  style={{ paddingLeft: colIdx === 0 ? "0" : "24px", paddingRight: colIdx === 0 ? "24px" : "0", paddingTop: "24px", paddingBottom: "24px" }}
                                >
                                  {renderMockExamItem(item, pageStart + idx)}
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}

              {showMockExamAnswers && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-sm font-semibold text-emerald-200">정답/해설</p>
                  <div className="mt-3 space-y-2 text-xs text-slate-200">
                    {mockExamAnswerEntries.length === 0 && (
                      <p className="rounded-lg bg-white/5 px-3 py-2 text-slate-300">답지 데이터가 없습니다.</p>
                    )}
                    {mockExamAnswerEntries.map((item, idx) => (
                      <div key={`mock-exam-answer-${idx}`} className="rounded-lg bg-white/5 px-3 py-2">
                        <p className="font-semibold text-emerald-200">{item.number}번 정답: {item.answer}</p>
                        {item.explanation && (
                          <div className="mt-1">
                            <p className="font-semibold text-slate-100">해설</p>
                            {renderMockRichText(item.explanation, "text-xs text-slate-200")}
                          </div>
                        )}
                        {item.choiceExplanations?.length > 0 && (
                          <div className="mt-2">
                            <p className="font-semibold text-slate-100">선지 해설</p>
                            <ul className="mt-1 space-y-0.5">
                              {item.choiceExplanations.map((exp, cIdx) => (
                                <li key={cIdx} className="flex gap-1.5 text-xs">
                                  <span className="shrink-0 font-semibold text-slate-400">{LETTERS[cIdx]}.</span>
                                  <span className="text-slate-300">{exp}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {item.evidence && (
                          <div className="mt-1">
                            <p className="font-semibold text-slate-100">근거</p>
                            {renderMockRichText(item.evidence, "text-xs text-slate-200")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

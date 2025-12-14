import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const MODEL = "gpt-4o-mini";

const letters = ["A", "B", "C", "D", "E", "F"];

async function extractPdfText(file, pageLimit = 12) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, pageLimit);

  const chunks = [];

  for (let i = 1; i <= pagesToRead; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str).join(" ");
    chunks.push(strings);
  }

  const normalized = chunks.join("\n").replace(/\s+/g, " ").trim();
  return {
    text: normalized,
    pagesUsed: pagesToRead,
    totalPages,
  };
}

function App() {
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [pageInfo, setPageInfo] = useState({ used: 0, total: 0 });
  const [pdfUrl, setPdfUrl] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [questions, setQuestions] = useState(null);
  const [summary, setSummary] = useState("");
  const [selectedChoices, setSelectedChoices] = useState({});
  const [revealedChoices, setRevealedChoices] = useState({});
  const [shortAnswerInput, setShortAnswerInput] = useState("");
  const [shortAnswerResult, setShortAnswerResult] = useState(null);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl(URL.createObjectURL(selected));
    setFile(selected);
    setQuestions(null);
    setSelectedChoices({});
    setRevealedChoices({});
    setShortAnswerInput("");
    setShortAnswerResult(null);
    setError("");
    setSummary("");
    setStatus("");
    setStatus("PDF 텍스트를 추출하는 중입니다...");
    setIsLoadingText(true);

    try {
      const { text, pagesUsed, totalPages } = await extractPdfText(selected);
      const trimmed = text.slice(0, 12000);
      setExtractedText(trimmed);
      setPreviewText(trimmed);
      setPageInfo({ used: pagesUsed, total: totalPages });
      setStatus(`텍스트 추출 완료 (사용 페이지: ${pagesUsed}/${totalPages})`);
    } catch (err) {
      setError(`PDF 텍스트 추출에 실패했습니다: ${err.message}`);
      setExtractedText("");
      setPreviewText("");
      setPageInfo({ used: 0, total: 0 });
    } finally {
      setIsLoadingText(false);
    }
  };

  const requestQuestions = async () => {
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }

    if (!extractedText) {
      setError("PDF 텍스트가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

    if (!apiKey) {
      setError("환경 변수 VITE_OPENAI_API_KEY를 .env 파일에 설정해주세요.");
      return;
    }

    setIsLoadingQuiz(true);
    setError("");
    setStatus("문제를 생성하는 중입니다...");

    try {
      const prompt = `
당신은 대학 강의 PDF에서 퀴즈를 만드는 조교입니다. 아래 처리 과정을 거쳐 결과를 만드세요.

1) 텍스트 추출(OCR): 각 페이지의 시각 정보를 텍스트로 변환
2) 구조 분석: 목차, 섹션 헤더, 주요 주제를 파악
3) 핵심 정보 식별: 질문과 관련된 핵심 개념, 정의, 예시, 수식을 찾기
4) 응답 생성: 아래 형식에 맞춰 한국어 문제 생성 (JSON only)

- 객관식: 보기 4~5개, 질문은 짧고 핵심만 제시
- 주관식: 숫자 계산이 필요한 문제, 답은 숫자/수식으로 제시
- 문제/보기/정답/해설은 모두 한국어
- 모든 문항은 아래 본문에서 근거를 가져와 구성
- JSON 외 다른 출력 금지

반환 형식:
{
  "multipleChoice": [
    { "question": "...", "choices": ["...","...","...","..."], "answerIndex": 1, "explanation": "..." }
  ],
  "shortAnswer": { "question": "...", "answer": "..." }
}

PDF 텍스트:
${extractedText}
      `.trim();

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "Generate 5 Korean quiz items (4 MCQ + 1 calculation short answer) strictly from the user's text. Respond with JSON only.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`OpenAI API 오류: ${response.status} ${details}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const sanitized = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "");

      const parsed = JSON.parse(sanitized);

      setQuestions(parsed);
      setSelectedChoices({});
      setRevealedChoices({});
      setShortAnswerInput("");
      setShortAnswerResult(null);
      setStatus("문제 생성 완료!");
    } catch (err) {
      setError(`문제 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleChoiceSelect = (qIdx, choiceIdx) => {
    setSelectedChoices((prev) => ({ ...prev, [qIdx]: choiceIdx }));
    setRevealedChoices((prev) => ({ ...prev, [qIdx]: true }));
  };

  const handleShortAnswerCheck = () => {
    if (!questions?.shortAnswer?.answer) return;
    const user = shortAnswerInput.trim().toLowerCase();
    const answer = String(questions.shortAnswer.answer).trim().toLowerCase();
    const normalizedUser = user.replace(/\s+/g, "");
    const normalizedAnswer = answer.replace(/\s+/g, "");
    const isCorrect = normalizedUser === normalizedAnswer;
    setShortAnswerResult({
      isCorrect,
      answer: questions.shortAnswer.answer,
    });
  };

  const renderSummary = (text) => {
    if (!text) return null;
    const sanitized = text.replace(
      /\[\s*([^[\]]*(?:\\frac|\\cdot|\\lambda|\\mu|\\sigma|\\pi|\\sum|\\int|\\alpha|\\beta|\\gamma|\\theta|\\phi|\\psi)[^[\]]*)\s*\]/g,
      (_, expr) => `$$${expr.trim()}$$`
    );
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-white mt-4" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-semibold text-white mt-3" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-emerald-100 mt-2" {...props} />,
          p: ({ node, ...props }) => (
            <p className="text-sm leading-relaxed text-slate-100" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="text-emerald-100 font-semibold" {...props} />
          ),
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1 text-sm text-slate-100" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-100" {...props} />,
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          code: ({ inline, className, children, ...props }) =>
            inline ? (
              <code className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[12px] text-emerald-100" {...props}>
                {children}
              </code>
            ) : (
              <pre className="overflow-auto rounded-xl bg-slate-900/80 p-3 text-[12px] text-slate-100" {...props}>
                <code className={className}>{children}</code>
              </pre>
            ),
          table: ({ node, ...props }) => (
            <div className="overflow-auto">
              <table className="min-w-full text-sm text-left text-slate-100" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border-b border-white/10 px-3 py-2 font-semibold text-emerald-100" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border-b border-white/5 px-3 py-2 text-slate-100" {...props} />
          ),
        }}
      >
        {sanitized}
      </ReactMarkdown>
    );
  };

  const requestSummary = async () => {
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      setError("환경 변수 VITE_OPENAI_API_KEY를 .env 파일에 설정해주세요.");
      return;
    }

    setIsLoadingSummary(true);
    setError("");
    setStatus("요약을 생성하는 중입니다...");

    try {
      const prompt = `
const summaryPrompt = \`당신은 대학 강의 자료를 분석하고 학생들의 학습을 돕는 전문 교육 어시스턴트입니다. 
첨부된 PDF 강의 자료를 매우 상세하게 분석하여 학생이 강의를 듣지 않아도 이 요약만으로 핵심 내용을 완전히 이해할 수 있도록 요약해주세요.

**요약 작성 지침:**

1. **전체 개요 (2-3문장)**
   - 강의 전체의 핵심 주제와 학습 목표를 명확히 제시

2. **주요 섹션별 상세 설명**
   각 섹션마다 다음 형식으로 작성:
   
   ### [섹션 번호]. [섹션 제목]
   
   **[하위 주제 1]**
   - 개념 정의와 설명 (2-3문장)
   - 핵심 공식이나 수식이 있다면 명시 (LaTeX 형식 사용)
   - 구체적인 예시 포함
   - 중요한 특징이나 주의사항
   
   **[하위 주제 2]**
   - (위와 동일한 형식 반복)

3. **수식 및 공식 표현**
   - 모든 수학 공식은 LaTeX 형식으로 작성
   - 각 변수의 의미를 명확히 설명
   - 예: Y_t = B_0 + B_1 * t + e (여기서 Y_t는 시간 t에서의 값, B_0는 절편, B_1는 기울기, e는 오차항)

4. **개념 설명 깊이**
   - 단순 나열이 아닌 "왜 이것이 중요한가", "어떻게 사용되는가" 설명
   - 개념 간의 관계와 연결고리 명시
   - 실제 응용 사례나 예시 포함

5. **용어 처리**
   - 전문 용어는 한글(English Term) 형식으로 병기
   - 처음 나오는 용어는 반드시 정의 포함

6. **구조화된 정보**
   - 여러 항목을 비교할 때는 표 형식 사용
   - 단계적 절차는 번호 목록으로 표현
   - 관련 개념은 항목별로 구분하여 설명

7. **강조 표시**
   - 특히 중요한 내용은 **굵은 글씨** 사용
   - 시험이나 과제에 자주 나오는 내용 강조
   - 학생들이 혼동하기 쉬운 부분 명시

8. **분량**
   - 전체 강의 자료의 주요 내용을 빠짐없이 포함
   - 각 섹션은 최소 3-4개의 하위 주제 포함
   - 총 길이는 강의 자료 분량에 비례하여 충분히 상세하게 (보통 2000-4000단어)

9. **추가 학습 요소**
   - 각 섹션 마지막에 "핵심 포인트" 정리
   - 관련 개념이나 발전된 주제가 있다면 간단히 언급

**출력 형식:**
마크다운 형식으로 작성하되, 계층 구조를 명확히 유지하세요.
- # (제목)
- ## (섹션)
- ### (하위 주제)
- **굵은 글씨** (중요 개념)
- 수식: LaTeX 형식
- 코드 블록: \`\`\` 사용

이제 첨부된 강의 자료를 위 지침에 따라 상세히 요약해주세요.\`

본문:
${extractedText}
      `.trim();

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "Produce a detailed Korean markdown summary of the user's academic text. Follow their instructions for sections, subsections, bold emphasis, LaTeX math, tables/lists, and sufficient length (long-form; do not shorten to a few lines).",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(`OpenAI API 오류: ${response.status} ${details}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const sanitized = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```$/i, "");
      setSummary(sanitized);
      setStatus("요약 생성 완료!");
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-80px] top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-2xl shadow-emerald-900/20 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">PDF Quiz</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight text-white sm:text-4xl">
                본문 기반 객관식 4문제, 계산형 주관식 1문제 생성
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                PDF를 올리면 본문을 사용해 한국어 퀴즈를 만들어드립니다. 로컬에서 실행되며 OpenAI API 키는 직접 설정하세요.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-2 shadow-inner shadow-black/30">
                <img
                  src="/pnu-logo.png"
                  alt="Pusan National University Industrial Engineering"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="rounded-2xl bg-emerald-400/10 px-4 py-3 text-emerald-100 ring-1 ring-emerald-300/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-200">Model</p>
                <p className="text-sm font-bold">{MODEL}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="col-span-2 rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">1단계</p>
                <h2 className="text-xl font-semibold text-white">PDF 업로드</h2>
              </div>
              {pageInfo.used > 0 && (
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
                  {pageInfo.used} / {pageInfo.total} 페이지 사용
                </span>
              )}
            </div>

            <label
              htmlFor="pdf"
              className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 px-6 py-8 text-center transition hover:border-emerald-300/60 hover:bg-emerald-400/5"
            >
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs text-emerald-100">
                PDF 파일을 선택해주세요
              </div>
              <p className="text-lg font-semibold text-white">끌어놓거나 클릭해 업로드</p>
              <p className="max-w-xl text-sm text-slate-300">최대 12페이지까지 사용합니다 (추가 페이지는 무시)</p>
              <input
                id="pdf"
                name="pdf"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {file && (
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-slate-200 ring-1 ring-white/10">
                <div className="truncate">
                  <p className="font-semibold">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                {isLoadingText && <span className="animate-pulse text-xs text-emerald-200">추출 중...</span>}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <p className="text-sm text-slate-300">2단계</p>
            <h2 className="text-xl font-semibold text-white">문제 생성</h2>
            <p className="mt-2 text-sm text-slate-400">
              OpenAI API 키를 .env 파일의 <code className="font-mono">VITE_OPENAI_API_KEY</code>로 설정한 뒤 실행해주세요.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                onClick={requestQuestions}
                disabled={isLoadingQuiz || isLoadingText}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
              >
                {isLoadingQuiz ? "문제 생성 중.." : "퀴즈 생성 (5문제)"}
              </button>
              <button
                onClick={requestSummary}
                disabled={isLoadingSummary || isLoadingText}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-500/50"
              >
                {isLoadingSummary ? "요약 생성 중.." : "요약 생성"}
              </button>
            </div>

            {status && <p className="mt-3 text-sm text-emerald-200">{status}</p>}
            {error && (
              <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200 ring-1 ring-red-400/30">
                {error}
              </p>
            )}

            {shortPreview && (
              <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-slate-200 ring-1 ring-white/10">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">본문 미리보기</p>
                <p className="mt-2 leading-relaxed">{shortPreview}</p>
              </div>
            )}
          </div>
        </section>

        {(summary || questions) && (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">PDF 미리보기</p>
                  <h3 className="text-lg font-semibold text-white">문제 출제 근거</h3>
                </div>
                {pageInfo.used > 0 && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-200 ring-1 ring-white/10">
                    {pageInfo.used}/{pageInfo.total} p
                  </span>
                )}
              </div>
              {pdfUrl ? (
                <div className="h-[75vh] overflow-hidden rounded-2xl ring-1 ring-white/10">
                  <object data={pdfUrl} type="application/pdf" className="h-full w-full">
                    <iframe src={pdfUrl} title="PDF preview" className="h-full w-full" />
                  </object>
                </div>
              ) : (
                <div className="flex h-[75vh] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 text-sm text-slate-300">
                  PDF를 업로드하면 여기에서 볼 수 있습니다.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">퀴즈 풀어보기</p>
                  <h2 className="text-2xl font-bold text-white">생성된 퀴즈</h2>
                </div>
                <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
                  5문제
                </div>
              </div>

              {summary && (
                <div className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-900/40 via-slate-900/40 to-cyan-900/30 p-4 ring-1 ring-emerald-300/30">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-200">요약</p>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-semibold text-emerald-50 ring-1 ring-emerald-300/40">
                      Markdown styled
                    </span>
                  </div>
                  <div className="prose prose-invert max-w-none space-y-2 text-slate-100 prose-p:leading-relaxed prose-headings:text-emerald-100">
                    {renderSummary(summary)}
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-4">
                {(questions?.multipleChoice || []).map((q, idx) => (
                  <article
                    key={`mc-${idx}`}
                    className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">
                        Q{idx + 1}. {q.question}
                      </h3>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">
                        객관식
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {(q.choices || []).map((choice, cIdx) => {
                        const isAnswer = cIdx === q.answerIndex;
                        const isSelected = selectedChoices[idx] === cIdx;
                        const isRevealed = revealedChoices[idx];
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
                            onClick={() => handleChoiceSelect(idx, cIdx)}
                          >
                            <span className="font-semibold text-white/80">{letters[cIdx] || "-"}</span>
                            <span>{choice}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {revealedChoices[idx] && (
                      <div className="mt-3 flex flex-col gap-2 text-sm">
                        {selectedChoices[idx] === q.answerIndex ? (
                          <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-emerald-50 ring-1 ring-emerald-400/40">
                            정답입니다! 🎉
                          </p>
                        ) : (
                          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-red-100 ring-1 ring-red-400/40">
                            오답입니다. 정답: {letters[q.answerIndex] || "-"}
                          </p>
                        )}
                        {q.explanation && (
                          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
                            해설: {q.explanation}
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                ))}

                {questions?.shortAnswer && (
                  <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold text-white">Q5. {questions.shortAnswer.question}</h3>
                      <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100">
                        계산형
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <input
                        type="text"
                        value={shortAnswerInput}
                        onChange={(e) => setShortAnswerInput(e.target.value)}
                        className="w-full rounded-lg bg-slate-900/60 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 focus:ring-emerald-400"
                        placeholder="계산 결과를 입력하세요"
                      />
                      <button
                        onClick={handleShortAnswerCheck}
                        className="inline-flex items-center justify-center rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-cyan-950 transition hover:bg-cyan-300"
                      >
                        정답 확인
                      </button>
                      {shortAnswerResult && (
                        <div
                          className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                            shortAnswerResult.isCorrect
                              ? "bg-emerald-500/15 text-emerald-50 ring-emerald-400/40"
                              : "bg-red-500/10 text-red-100 ring-red-400/40"
                          }`}
                        >
                          {shortAnswerResult.isCorrect
                            ? "정답입니다! 🎉"
                            : `오답입니다. 정답: ${shortAnswerResult.answer}`}
                        </div>
                      )}
                    </div>
                  </article>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

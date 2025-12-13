import { useMemo, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

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
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [questions, setQuestions] = useState(null);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );

  const handleFileChange = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setQuestions(null);
    setError("");
    setStatus("PDF 텍스트를 읽는 중입니다...");
    setIsLoadingText(true);

    try {
      const { text, pagesUsed, totalPages } = await extractPdfText(selected);
      const trimmed = text.slice(0, 12000);
      setExtractedText(trimmed);
      setPreviewText(trimmed);
      setPageInfo({ used: pagesUsed, total: totalPages });
      setStatus(`텍스트 추출 완료 (사용한 페이지: ${pagesUsed}/${totalPages})`);
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
당신은 대학 강의 슬라이드에서 퀴즈를 만드는 조교입니다.
아래 PDF에서 추출한 내용을 바탕으로 객관식 4문제와 주관식 1문제를 만들어주세요.

- 객관식: 보기 4~5개, 하나의 정답, 짧은 해설 포함
- 주관식: 한 줄 답변 가능하도록 간결하게
- 한국어로 작성
- JSON 형식만 반환

반환 예시:
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
              content: "Generate quizzes in concise Korean. Respond with JSON only.",
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
      setStatus("문제 생성 완료!");
    } catch (err) {
      setError(`문제 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
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
              <p className="text-sm uppercase tracking-[0.2em] text-emerald-300/80">PDF → Quiz</p>
              <h1 className="mt-1 text-3xl font-bold leading-tight text-white sm:text-4xl">
                슬라이드로부터 객관식 4문제, 주관식 1문제 생성
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-300">
                PDF를 올리면 내용을 읽어 한국어 퀴즈를 만들어 드립니다. 로컬에서 실행하며 OpenAI API
                키는 직접 설정하세요.
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
                PDF 파일을 선택하세요
              </div>
              <p className="text-lg font-semibold text-white">클릭 또는 드래그해서 업로드</p>
              <p className="max-w-xl text-sm text-slate-300">
                최대 12페이지까지만 요약에 사용합니다. (추가 페이지는 무시)
              </p>
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
                  <p className="text-xs text-slate-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {isLoadingText && (
                  <span className="animate-pulse text-xs text-emerald-200">추출 중...</span>
                )}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/5 bg-slate-900/60 p-6 shadow-lg shadow-black/30 backdrop-blur">
            <p className="text-sm text-slate-300">2단계</p>
            <h2 className="text-xl font-semibold text-white">문제 생성</h2>
            <p className="mt-2 text-sm text-slate-400">
              OpenAI API 키를 .env 파일에 <code className="font-mono">VITE_OPENAI_API_KEY</code>로
              설정한 뒤 실행하세요.
            </p>

            <button
              onClick={requestQuestions}
              disabled={isLoadingQuiz || isLoadingText}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-500/50"
            >
              {isLoadingQuiz ? "문제 생성 중..." : "객관식 4문제 + 주관식 1문제 만들기"}
            </button>

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

        {questions && (
          <section className="rounded-3xl border border-white/5 bg-slate-900/70 p-6 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-300">결과</p>
                <h2 className="text-2xl font-bold text-white">생성된 퀴즈</h2>
              </div>
              <div className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase text-emerald-100 ring-1 ring-emerald-300/30">
                4 객관식 + 1 주관식
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {(questions.multipleChoice || []).slice(0, 4).map((q, idx) => (
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
                      return (
                        <li
                          key={choice}
                          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
                            isAnswer
                              ? "bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/40"
                              : "bg-white/5 text-slate-200 ring-1 ring-white/5"
                          }`}
                        >
                          <span className="font-semibold text-white/80">{letters[cIdx] || "-"}</span>
                          <span>{choice}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && (
                    <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
                      해설: {q.explanation}
                    </p>
                  )}
                </article>
              ))}

              {questions.shortAnswer && (
                <article className="rounded-2xl border border-white/5 bg-white/5 p-4 shadow-lg shadow-black/20">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">주관식</h3>
                    <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100">
                      Short Answer
                    </span>
                  </div>
                  <p className="mt-2 text-base text-slate-100">{questions.shortAnswer.question}</p>
                  <div className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-emerald-100 ring-1 ring-emerald-300/30">
                    모범답안: {questions.shortAnswer.answer}
                  </div>
                </article>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;

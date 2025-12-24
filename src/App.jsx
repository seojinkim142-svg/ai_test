import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionsPanel from "./components/ActionsPanel";
import FileUpload from "./components/FileUpload";
import Header from "./components/Header";
import PdfPreview from "./components/PdfPreview";
import QuizSection from "./components/QuizSection";
import SummaryCard from "./components/SummaryCard";
import { generateQuiz, generateSummary } from "./services/openai";
import { extractPdfText, generatePdfThumbnail } from "./utils/pdf";

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
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);

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

  const resetQuizState = () => {
    setQuestions(null);
    setSelectedChoices({});
    setRevealedChoices({});
    setShortAnswerInput("");
    setShortAnswerResult(null);
  };

  const processSelectedFile = useCallback(
    async (item, { pushState = true } = {}) => {
      if (!item?.file) return;
      const targetFile = item.file;

      if (pushState && selectedFileId !== item.id) {
        window.history.pushState({ view: "detail", fileId: item.id }, "", window.location.pathname);
      }

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(URL.createObjectURL(targetFile));
      setFile(targetFile);
      setSelectedFileId(item.id);
      resetQuizState();
        setError(`PDF 추출에 실패했습니다: ${err.message}`);
      setSummary("");
      setStatus("PDF 텍스트 추출 중입니다...");
      setIsLoadingText(true);
      setThumbnailUrl(null);

      try {
        const [textResult, thumb] = await Promise.all([extractPdfText(targetFile), generatePdfThumbnail(targetFile)]);
        const { text, pagesUsed, totalPages } = textResult;
        const trimmed = text.slice(0, 12000);
        setExtractedText(trimmed);
        setPreviewText(trimmed);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        setStatus(`추출 완료 (사용 페이지: ${pagesUsed}/${totalPages})`);
      } catch (err) {
        setError(`PDF ??? ??????: ${err.message}`);
        setExtractedText("");
        setPreviewText("");
        setPageInfo({ used: 0, total: 0 });
      } finally {
        setIsLoadingText(false);
      }
    },
    [pdfUrl, selectedFileId]
  );

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const withThumbs = await Promise.all(
      files.map(async (f) => {
        const thumb = await generatePdfThumbnail(f);
        return {
          id: `${f.name}-${f.lastModified}-${Math.random().toString(16).slice(2)}`,
          file: f,
          name: f.name,
          size: f.size,
          thumbnail: thumb,
        };
      })
    );

    setUploadedFiles((prev) => [...prev, ...withThumbs]);
    setStatus("업로드 목록에서 썸네일을 선택해 요약/퀴즈를 시작하세요.");
  };

  const showDetail = Boolean(file && selectedFileId);

  const goBackToList = useCallback(() => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setSelectedFileId(null);
    setFile(null);
    setPdfUrl(null);
    setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    resetQuizState();
    setStatus("업로드 목록에서 썸네일을 선택해 요약/퀴즈를 시작하세요.");
  }, [pdfUrl]);
  const uploadedFilesRef = useRef(uploadedFiles);
  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    goBackToListRef.current = goBackToList;
  }, [goBackToList]);

  useEffect(() => {
    processSelectedFileRef.current = processSelectedFile;
  }, [processSelectedFile]);

  useEffect(() => {
    window.history.replaceState({ view: "list" }, "", window.location.pathname);

    const handlePopState = (event) => {
      const state = event.state;
      if (state?.view === "detail" && state.fileId) {
        const target = uploadedFilesRef.current.find((f) => f.id === state.fileId);
        if (target) {
          processSelectedFileRef.current(target, { pushState: false });
          return;
        }
      }
      goBackToListRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);



  const requestQuestions = async () => {
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }

    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }

    setIsLoadingQuiz(true);
    setError("");
    setStatus("문제 세트를 생성하는 중입니다...");

    try {
      const quiz = await generateQuiz(extractedText);
      setQuestions(quiz);
      setSelectedChoices({});
      setRevealedChoices({});
      setShortAnswerInput("");
      setShortAnswerResult(null);
      setStatus("문제 세트 생성 완료!");
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

  const requestSummary = async () => {
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }

    setIsLoadingSummary(true);
    setError("");
    setStatus("요약을 생성하는 중입니다...");

    try {
      const summarized = await generateSummary(extractedText);
      setSummary(summarized);
      setStatus("요약 생성 완료!");
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  // 파일이 선택되고 텍스트가 준비되면 요약을 자동으로 요청
  useEffect(() => {
    if (file && extractedText && !summary && !isLoadingSummary) {
      requestSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, extractedText]);

  const renderStartPage = () => (
    <section className="grid grid-cols-1 gap-4">
      <FileUpload
        file={file}
        pageInfo={pageInfo}
        isLoadingText={isLoadingText}
        thumbnailUrl={thumbnailUrl}
        uploadedFiles={uploadedFiles}
        onSelectFile={(item) => processSelectedFile(item)}
        onFileChange={handleFileChange}
        selectedFileId={selectedFileId}
      />
    </section>
  );

  const renderDetailPage = () => (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <PdfPreview pdfUrl={pdfUrl} pageInfo={pageInfo} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
          <p className="text-sm font-semibold text-emerald-200">요약</p>
          {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">요약 생성 중...</p>}
          {!isLoadingSummary && summary && <SummaryCard summary={summary} />}
          {!isLoadingSummary && !summary && <p className="mt-2 text-sm text-slate-400">요약이 준비되면 표시됩니다.</p>}
        </div>

        <ActionsPanel
          title="퀴즈 생성"
          stepLabel="퀴즈"
          hideSummary
          isLoadingQuiz={isLoadingQuiz}
          isLoadingSummary={isLoadingSummary}
          isLoadingText={isLoadingText}
          status={status}
          error={error}
          shortPreview={shortPreview}
          onRequestQuiz={requestQuestions}
          onRequestSummary={requestSummary}
        />

        {questions && (
          <QuizSection
            questions={questions}
            summary={null}
            selectedChoices={selectedChoices}
            revealedChoices={revealedChoices}
            shortAnswerInput={shortAnswerInput}
            shortAnswerResult={shortAnswerResult}
            onSelectChoice={handleChoiceSelect}
            onShortAnswerChange={setShortAnswerInput}
            onShortAnswerCheck={handleShortAnswerCheck}
          />
        )}
      </div>
    </section>
  );

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-80px] top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-6 py-10">
        <Header />
        <div className="px-6">
          {!showDetail && renderStartPage()}
          {showDetail && renderDetailPage()}
        </div>
      </main>
    </div>
  );
}

export default App;

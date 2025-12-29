import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionsPanel from "./components/ActionsPanel";
import AuthPanel from "./components/AuthPanel";
import FlashcardsPanel from "./components/FlashcardsPanel";
import FileUpload from "./components/FileUpload";
import Header from "./components/Header";
import LoginBackground from "./components/LoginBackground";
import OxSection from "./components/OxSection";
import PdfPreview from "./components/PdfPreview";
import QuizSection from "./components/QuizSection";
import SummaryCard from "./components/SummaryCard";
import { generateQuiz, generateSummary, generateOxQuiz } from "./services/openai";
import {
  supabase,
  uploadPdfToStorage,
  signOut as supabaseSignOut,
  saveBookmark,
  fetchBookmarks,
  deleteBookmark,
  addFlashcard,
  listFlashcards,
  deleteFlashcard,
  saveUploadMetadata,
  listUploads,
  getSignedStorageUrl,
  updateUploadThumbnail,
  fetchDocArtifacts,
  saveDocArtifacts,
} from "./services/supabase";
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
  const [summary, setSummary] = useState("");
  const [quizSets, setQuizSets] = useState([]);
  const [selectedChoices, setSelectedChoices] = useState({});
  const [revealedChoices, setRevealedChoices] = useState({});
  const [shortAnswerInput, setShortAnswerInput] = useState("");
  const [shortAnswerResult, setShortAnswerResult] = useState(null);
  const [oxItems, setOxItems] = useState(null);
  const [oxSelections, setOxSelections] = useState({});
  const [isLoadingOx, setIsLoadingOx] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [panelTab, setPanelTab] = useState("summary");
  const [splitPercent, setSplitPercent] = useState(50);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarkNote, setBookmarkNote] = useState("");
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [artifacts, setArtifacts] = useState(null);
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const quizAutoRequestedRef = useRef(false);
  const oxAutoRequestedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const detailContainerRef = useRef(null);

  const computeFileHash = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );

  const refreshSession = useCallback(async () => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (!error) {
      setUser(data.session?.user || null);
    }
    setAuthReady(true);
  }, []);

  useEffect(() => {
    refreshSession();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => {
      data?.subscription?.unsubscribe();
    };
  }, [refreshSession]);

  const loadBookmarks = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setBookmarks([]);
        return;
      }
      setIsLoadingBookmarks(true);
      try {
        const list = await fetchBookmarks({ userId: user.id, docId });
        setBookmarks(list);
      } catch (err) {
        setError(`북마크 불러오기 실패: ${err.message}`);
      } finally {
        setIsLoadingBookmarks(false);
      }
    },
    [user]
  );
  const loadFlashcards = useCallback(
    async (deckId) => {
      if (!supabase || !user) {
        setFlashcards([]);
        return;
      }
      setIsLoadingFlashcards(true);
      try {
        const list = await listFlashcards({ userId: user.id, deckId });
        setFlashcards(list);
      } catch (err) {
        setError(`카드 불러오기 실패: ${err.message}`);
      } finally {
        setIsLoadingFlashcards(false);
      }
    },
    [user]
  );
  const loadUploads = useCallback(
    async () => {
      if (!supabase || !user) {
        setUploadedFiles([]);
        return;
      }
      try {
        const list = await listUploads({ userId: user.id });
        const mapped = list.map((u) => ({
          id: u.id || `${u.storage_path}`,
          file: null,
          name: u.file_name,
          size: u.file_size,
          path: u.storage_path,
          bucket: u.bucket,
          thumbnail: u.thumbnail || null,
          remote: true,
          hash: u.file_hash || null,
        }));
        setUploadedFiles(mapped);
      } catch (err) {
        setError(`업로드 이력 불러오기 실패: ${err.message}`);
      }
    },
    [user]
  );

  const loadArtifacts = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setArtifacts(null);
        return;
      }
      try {
        const data = await fetchDocArtifacts({ userId: user.id, docId });
        const mapped = {
          summary: data?.summary || null,
          quiz: data?.quiz_json || null,
          ox: data?.ox_json || null,
          highlights: data?.highlights_json || null,
        };
        setArtifacts(mapped);
        if (mapped.summary) {
          setSummary(mapped.summary);
          summaryRequestedRef.current = true;
        }
        if (mapped.quiz) {
          const cachedSet = {
            id: `quiz-cached-${docId}`,
            questions: mapped.quiz,
            selectedChoices: {},
            revealedChoices: {},
            shortAnswerInput: "",
            shortAnswerResult: null,
          };
          setQuizSets([cachedSet]);
          quizAutoRequestedRef.current = true;
        }
        if (mapped.ox) {
          setOxItems(mapped.ox?.items || []);
          oxAutoRequestedRef.current = true;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to load artifacts", err);
      }
    },
    [user, supabase]
  );
  const backfillThumbnails = useCallback(
    async (items) => {
      if (backfillInProgressRef.current) return;
      const needs = items.filter((i) => !i.thumbnail);
      if (!needs.length) return;
      backfillInProgressRef.current = true;
      try {
        await Promise.all(
          needs.map(async (item) => {
            try {
              const ensured = await ensureFileForItemRef.current(item);
              const thumb = ensured.thumbnail || (await generatePdfThumbnail(ensured.file));
              if (!thumb) return;
              await updateUploadThumbnail({ id: item.id, thumbnail: thumb });
              setUploadedFiles((prev) =>
                prev.map((p) => (p.id === item.id ? { ...p, thumbnail: thumb } : p))
              );
            } catch (err) {
              // skip failure
              console.warn("thumbnail backfill failed", err);
            }
          })
        );
      } finally {
        backfillInProgressRef.current = false;
      }
    },
    []
  );
  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    setIsSigningOut(true);
    setError("");
    setStatus("로그아웃 중...");
    try {
      await supabaseSignOut();
      await refreshSession();
      setStatus("로그아웃 완료");
    } catch (err) {
      setError(`로그아웃 실패: ${err.message}`);
      setStatus("");
    } finally {
      setIsSigningOut(false);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (user) {
      loadUploads().then(() => {
        const current = uploadedFilesRef.current || [];
        backfillThumbnails(current);
      });
    } else {
      setUploadedFiles([]);
    }
  }, [user, loadUploads, backfillThumbnails]);

  const ensureFileForItem = useCallback(
    async (item) => {
      if (item.file) return item;
      if (!item.path && !item.remotePath) throw new Error("저장된 파일 경로가 없습니다.");
      const storagePath = item.path || item.remotePath;

      // 캐시된 파일/썸네일 우선 사용
      const cached = downloadCacheRef.current.get(storagePath);
      if (cached) {
        const enriched = { ...item, ...cached };
        setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
        return enriched;
      }

      const bucket = item.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
      const signed = await getSignedStorageUrl({ bucket, path: storagePath, expiresIn: 60 * 60 * 24 });
      const res = await fetch(signed);
      if (!res.ok) throw new Error("저장된 파일을 불러오지 못했습니다.");
      const blob = await res.blob();
      const name = item.name || item.file?.name || "document.pdf";
      const fileObj = new File([blob], name, { type: blob.type || "application/pdf" });
      const thumb = await generatePdfThumbnail(fileObj);
      const enriched = { ...item, file: fileObj, thumbnail: item.thumbnail || thumb, remoteUrl: signed, path: storagePath, bucket };
      downloadCacheRef.current.set(storagePath, {
        file: fileObj,
        thumbnail: item.thumbnail || thumb,
        remoteUrl: signed,
        path: storagePath,
        bucket,
      });
      setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
      return enriched;
    },
    [setUploadedFiles]
  );

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const resetQuizState = () => {
    setQuizSets([]);
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
      summaryRequestedRef.current = false;
      quizAutoRequestedRef.current = false;
      setError("");
      setSummary("");
      setStatus("PDF 텍스트 추출 중입니다...");
      setIsLoadingText(true);
      setThumbnailUrl(null);
      setBookmarks([]);
      setBookmarkNote("");
      setFlashcards([]);
      oxAutoRequestedRef.current = false;

      try {
        const [textResult, thumb] = await Promise.all([extractPdfText(targetFile), generatePdfThumbnail(targetFile)]);
        const { text, pagesUsed, totalPages } = textResult;
        setExtractedText(text);
        setPreviewText(text);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        setStatus(`추출 완료 (사용 페이지: ${pagesUsed}/${totalPages})`);
        await loadBookmarks(item.id);
        await loadFlashcards(item.id);
        await loadArtifacts(item.id);
      } catch (err) {
        setError(`PDF 추출에 실패했습니다: ${err.message}`);
        setExtractedText("");
        setPreviewText("");
        setPageInfo({ used: 0, total: 0 });
      } finally {
        setIsLoadingText(false);
      }
    },
    [pdfUrl, selectedFileId, loadBookmarks, loadFlashcards, loadArtifacts]
  );

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const withThumbs = await Promise.all(
      files.map(async (f) => {
        const [thumb, hash] = await Promise.all([generatePdfThumbnail(f), computeFileHash(f)]);
        return {
          id: `${f.name}-${f.lastModified}-${Math.random().toString(16).slice(2)}`,
          file: f,
          name: f.name,
          size: f.size,
          hash,
          thumbnail: thumb,
        };
      })
    );

    const withUploads = await Promise.all(
      withThumbs.map(async (item) => {
        if (!supabase || !user) return item;

        // 중복 해시가 이미 DB에 있으면 업로드 생략
        const existing = uploadedFiles.find((f) => f.hash && item.hash && f.hash === item.hash && f.remotePath);
        try {
          if (existing) {
            return {
              ...item,
              id: existing.id || item.id,
              remotePath: existing.remotePath || existing.path,
              remoteUrl: existing.remoteUrl,
              bucket: existing.bucket,
              thumbnail: existing.thumbnail || item.thumbnail,
              hash: existing.hash || item.hash,
            };
          }

          const uploaded = await uploadPdfToStorage(user.id, item.file);
          const record = await saveUploadMetadata({
            userId: user.id,
            fileName: item.name,
            fileSize: item.size,
            storagePath: uploaded.path,
            bucket: uploaded.bucket,
            thumbnail: item.thumbnail,
            fileHash: item.hash,
          });
          return {
            ...item,
            id: record.id || item.id,
            remotePath: uploaded.path,
            remoteUrl: uploaded.signedUrl,
            bucket: uploaded.bucket,
            thumbnail: record.thumbnail || item.thumbnail,
            hash: record.file_hash || item.hash,
          };
        } catch (err) {
          setError(`클라우드 업로드 실패: ${err.message}`);
          return { ...item, uploadError: err.message };
        }
      })
    );

    setUploadedFiles((prev) => [...prev, ...withUploads]);
    setStatus("업로드 목록에서 썸네일을 선택해 요약/퀴즈를 시작하세요.");
  };

  const handleSelectFile = async (item) => {
    try {
      const ensured = await ensureFileForItemRef.current(item);
      await processSelectedFileRef.current(ensured);
    } catch (err) {
      setError(`파일 불러오기 실패: ${err.message}`);
    }
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
    setBookmarks([]);
    setBookmarkNote("");
    setFlashcards([]);
    setOxItems(null);
    setOxSelections({});
    setPanelTab("summary");
    summaryRequestedRef.current = false;
    quizAutoRequestedRef.current = false;
    oxAutoRequestedRef.current = false;
    setArtifacts(null);
    resetQuizState();
    setStatus("업로드 목록에서 썸네일을 선택해 요약/퀴즈를 시작하세요.");
  }, [pdfUrl]);
  const uploadedFilesRef = useRef(uploadedFiles);
  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);
  const ensureFileForItemRef = useRef(ensureFileForItem);

  const persistArtifacts = useCallback(
    async (partial) => {
      if (!user || !selectedFileId) return;
      const merged = {
        ...(artifacts || {}),
        ...partial,
      };
      setArtifacts(merged);
      try {
        await saveDocArtifacts({
          userId: user.id,
          docId: selectedFileId,
          summary: merged.summary,
          quiz: merged.quiz,
          ox: merged.ox,
          highlights: merged.highlights,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to save artifacts", err);
      }
    },
    [user, selectedFileId, artifacts]
  );

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
    ensureFileForItemRef.current = ensureFileForItem;
  }, [ensureFileForItem]);

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (!isDraggingRef.current) return;
      const container = detailContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const percent = ((event.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(25, percent));
      setSplitPercent(clamped);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

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

  const handleDragStart = () => {
    isDraggingRef.current = true;
    document.body.style.userSelect = "none";
  };

  const splitStyle = {
    flexBasis: `${splitPercent}%`,
    flexShrink: 0,
    minWidth: "25%",
    maxWidth: "75%",
  };

  const requestQuestions = async ({ force = false } = {}) => {
    if (isLoadingQuiz && !force) return;
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
      const newSet = {
        id: `quiz-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        questions: quiz,
        selectedChoices: {},
        revealedChoices: {},
        shortAnswerInput: "",
        shortAnswerResult: null,
      };
      setQuizSets((prev) => [...prev, newSet]);
      setStatus("문제 세트 생성 완료!");
      persistArtifacts({ quiz });
    } catch (err) {
      setError(`문제 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const regenerateQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }
    quizAutoRequestedRef.current = true;
    resetQuizState();
    setStatus("퀴즈를 새로 생성하는 중입니다...");
    setError("");
    await persistArtifacts({ quiz: null });
    await requestQuestions({ force: true });
  };

  const handleChoiceSelect = (setId, qIdx, choiceIdx) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? {
              ...set,
              selectedChoices: { ...set.selectedChoices, [qIdx]: choiceIdx },
              revealedChoices: { ...set.revealedChoices, [qIdx]: true },
            }
          : set
      )
    );
  };

  const handleShortAnswerChange = (setId, value) => {
    setQuizSets((prev) =>
      prev.map((set) => (set.id === setId ? { ...set, shortAnswerInput: value } : set))
    );
  };

  const handleShortAnswerCheck = (setId) => {
    setQuizSets((prev) =>
      prev.map((set) => {
        if (set.id !== setId || !set.questions?.shortAnswer?.answer) return set;
        const user = set.shortAnswerInput.trim().toLowerCase();
        const answer = String(set.questions.shortAnswer.answer).trim().toLowerCase();
        const normalizedUser = user.replace(/\s+/g, "");
        const normalizedAnswer = answer.replace(/\s+/g, "");
        const isCorrect = normalizedUser === normalizedAnswer;
        return {
          ...set,
          shortAnswerResult: { isCorrect, answer: set.questions.shortAnswer.answer },
        };
      })
    );
  };

  const requestSummary = async ({ force = false } = {}) => {
    if (isLoadingSummary || (!force && summaryRequestedRef.current)) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }

    summaryRequestedRef.current = true;
    setIsLoadingSummary(true);
    setError("");
    setStatus("요약을 생성하는 중입니다...");
    try {
      const summarized = await generateSummary(extractedText);
      setSummary(summarized);
      setStatus("요약 생성 완료!");
      persistArtifacts({ summary: summarized });
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
      // 실패 시 다시 시도할 수 있도록 플래그 해제
      summaryRequestedRef.current = false;
      setStatus("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const regenerateSummary = async () => {
    if (isLoadingSummary) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }
    summaryRequestedRef.current = false;
    setSummary("");
    setStatus("요약을 새로 생성하는 중입니다...");
    setError("");
    await persistArtifacts({ summary: null, highlights: null });
    await requestSummary({ force: true });
  };

  const requestOxQuiz = async ({ auto = false, force = false } = {}) => {
    if (isLoadingOx && !force) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }
    if (auto) oxAutoRequestedRef.current = true;
    setIsLoadingOx(true);
    setError("");
    setStatus("O/X 퀴즈를 생성하는 중입니다...");
    try {
      const ox = await generateOxQuiz(extractedText);
      const items = Array.isArray(ox?.items) ? ox.items : [];

      if (ox?.debug || items.length === 0) {
        setOxItems([]);
        setStatus("");
        setError("O/X 퀴즈를 생성할 수 있는 내용이 부족합니다.");
        if (ox?.fallback && import.meta.env.DEV) {
          // 개발 시에만 fallback을 로그로 확인
          // eslint-disable-next-line no-console
          console.debug("O/X fallback", ox.fallback);
        }
        return;
      }

      setOxItems(items);
      setOxSelections({});
      setStatus("O/X 퀴즈 생성 완료!");
      persistArtifacts({ ox });
    } catch (err) {
      setError(`O/X 퀴즈 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingOx(false);
    }
  };

  const regenerateOxQuiz = async () => {
    if (isLoadingOx) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!extractedText) {
      setError("PDF 텍스트가 아직 준비되지 않았습니다. 잠시 후에 시도해주세요.");
      return;
    }
    oxAutoRequestedRef.current = true;
    setOxItems(null);
    setOxSelections({});
    setStatus("O/X 퀴즈를 새로 생성하는 중입니다...");
    setError("");
    await persistArtifacts({ ox: null });
    await requestOxQuiz({ auto: false, force: true });
  };

  const canAutoRequest = useCallback(() => file && extractedText && !isLoadingText, [file, extractedText, isLoadingText]);

  // 파일이 선택되고 텍스트가 준비되면 요약을 자동으로 요청
  useEffect(() => {
    if (
      canAutoRequest() &&
      !summary &&
      !isLoadingSummary &&
      !summaryRequestedRef.current
    ) {
      requestSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoRequest, summary, isLoadingSummary]);

  useEffect(() => {
    if (
      summary &&
      canAutoRequest() &&
      quizSets.length === 0 &&
      !isLoadingQuiz &&
      !quizAutoRequestedRef.current
    ) {
      quizAutoRequestedRef.current = true;
      requestQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, canAutoRequest, quizSets.length, isLoadingQuiz]);

  useEffect(() => {
    if (
      canAutoRequest() &&
      quizSets.length > 0 &&
      !isLoadingOx &&
      !oxItems &&
      !oxAutoRequestedRef.current
    ) {
      oxAutoRequestedRef.current = true;
      requestOxQuiz({ auto: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoRequest, quizSets.length, isLoadingOx, oxItems]);

  if (!authReady) {
    return (
      <div className="relative min-h-screen overflow-hidden text-slate-100">
        <main className="flex min-h-screen items-center justify-center bg-slate-950">
          <p className="text-sm text-slate-200">로그인 상태 확인 중...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginBackground>
        <main className="mx-auto flex min-h-screen w-full flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md">
            <AuthPanel user={user} onAuth={refreshSession} />
          </div>
        </main>
      </LoginBackground>
    );
  }

  const renderStartPage = () => (
    <section className="grid grid-cols-1 gap-4">
      <FileUpload
        file={file}
        pageInfo={pageInfo}
        isLoadingText={isLoadingText}
        thumbnailUrl={thumbnailUrl}
        uploadedFiles={uploadedFiles}
        onSelectFile={handleSelectFile}
        onFileChange={handleFileChange}
        selectedFileId={selectedFileId}
      />
    </section>
  );

  const renderDetailPage = () => (
    <section
      ref={detailContainerRef}
      className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:overflow-hidden"
    >
      <div className="flex flex-col gap-3 lg:h-full lg:overflow-y-auto" style={splitStyle}>
        <PdfPreview pdfUrl={pdfUrl} file={file} pageInfo={pageInfo} onPageChange={(page) => setCurrentPage(page)} />
      </div>

      <div className="hidden w-2 cursor-col-resize items-stretch justify-center lg:flex">
        <div
          className="h-full w-1 rounded-full bg-white/10 transition hover:bg-white/30"
          onMouseDown={handleDragStart}
          role="separator"
          aria-label="패널 크기 조절"
        />
      </div>

      <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/30 lg:sticky lg:top-0 lg:z-10 lg:backdrop-blur">
          {[
            { id: "summary", label: "요약" },
            { id: "quiz", label: "퀴즈" },
            { id: "ox", label: "O/X" },
            { id: "bookmark", label: "북마크" },
            { id: "flashcards", label: "카드" },
          ].map((tab) => {
            const active = panelTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPanelTab(tab.id)}
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                  active
                    ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-100"
                    : "border-white/15 bg-white/5 text-slate-200 hover:border-emerald-200/40 hover:text-emerald-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto pr-1 pb-1">
          {panelTab === "summary" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-200">요약</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => requestSummary({ force: true })}
                    disabled={isLoadingSummary || isLoadingText}
                    className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-cyan-400 disabled:opacity-60"
                  >
                    {isLoadingSummary ? "요약 생성 중..." : "요약 새로 생성"}
                  </button>
                  <button
                    type="button"
                    onClick={regenerateSummary}
                    disabled={isLoadingSummary || isLoadingText}
                    className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                  >
                    요약 재생성
                  </button>
                </div>
              </div>
              {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">요약 생성 중...</p>}
              {!isLoadingSummary && summary && <SummaryCard summary={summary} />}
              {!isLoadingSummary && !summary && <p className="mt-2 text-sm text-slate-400">요약이 준비되면 표시됩니다.</p>}
            </div>
          )}

          {panelTab === "bookmark" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">현재 페이지: {currentPage || 1}</p>
                  <h3 className="text-lg font-semibold text-white">북마크 / 메모</h3>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
                  {bookmarks.length}개
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={bookmarkNote}
                  onChange={(e) => setBookmarkNote(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/50 focus:ring-emerald-300/40"
                  placeholder="이 페이지에 대한 메모를 입력하세요"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!file || !selectedFileId) {
                      setError("먼저 PDF를 선택해주세요.");
                      return;
                    }
                    if (!bookmarkNote.trim()) {
                      setError("메모를 입력하세요.");
                      return;
                    }
                    setError("");
                    setStatus("북마크 저장 중...");
                    try {
                      const saved = await saveBookmark({
                        userId: user?.id,
                        docId: selectedFileId,
                        docName: file?.name || "",
                        pageNumber: currentPage || 1,
                        note: bookmarkNote.trim(),
                      });
                      setBookmarks((prev) => [saved, ...prev]);
                      setBookmarkNote("");
                      setStatus("북마크 저장 완료");
                    } catch (err) {
                      setError(`북마크 저장 실패: ${err.message}`);
                      setStatus("");
                    }
                  }}
                  disabled={!user || isLoadingText}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  북마크 추가
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {isLoadingBookmarks && <p className="text-sm text-slate-300">북마크 불러오는 중...</p>}
                {!isLoadingBookmarks && bookmarks.length === 0 && (
                  <p className="text-sm text-slate-400">저장된 북마크가 없습니다.</p>
                )}
                {!isLoadingBookmarks &&
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100"
                    >
                      <div>
                        <p className="text-xs text-slate-400">
                          페이지 {bm.page_number} · {bm.doc_name || "PDF"}
                        </p>
                        <p className="text-sm">{bm.note}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await deleteBookmark({ userId: user?.id, bookmarkId: bm.id });
                            setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
                          } catch (err) {
                            setError(`북마크 삭제 실패: ${err.message}`);
                          }
                        }}
                        className="rounded-full bg-white/10 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/20"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {panelTab === "quiz" && (
            <>
              <ActionsPanel
                title="퀴즈 생성"
                stepLabel="퀴즈"
                hideSummary
                hideQuiz
                isLoadingQuiz={isLoadingQuiz}
                isLoadingSummary={isLoadingSummary}
                isLoadingText={isLoadingText}
                status={status}
                error={error}
                shortPreview={shortPreview}
                onRequestQuiz={requestQuestions}
                onRequestSummary={requestSummary}
              />

              {quizSets.length > 0 && (
                <div className="space-y-4">
                  {quizSets.map((set, idx) => (
                    <QuizSection
                      key={set.id}
                      title={`퀴즈 세트 ${idx + 1}`}
                      questions={set.questions}
                      summary={null}
                      selectedChoices={set.selectedChoices}
                      revealedChoices={set.revealedChoices}
                      shortAnswerInput={set.shortAnswerInput}
                      shortAnswerResult={set.shortAnswerResult}
                      onSelectChoice={(qIdx, choiceIdx) => handleChoiceSelect(set.id, qIdx, choiceIdx)}
                      onShortAnswerChange={(val) => handleShortAnswerChange(set.id, val)}
                      onShortAnswerCheck={() => handleShortAnswerCheck(set.id)}
                    />
                  ))}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={requestQuestions}
                  disabled={isLoadingQuiz || isLoadingText}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {isLoadingQuiz ? "퀴즈 생성 중..." : "퀴즈 5문제 더 생성하기"}
                </button>
                <button
                  type="button"
                  onClick={regenerateQuiz}
                  disabled={isLoadingQuiz || isLoadingText}
                  className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {isLoadingQuiz ? "퀴즈 재생성 중..." : "퀴즈 재생성(덮어쓰기)"}
                </button>
              </div>
            </>
          )}

          {panelTab === "ox" && (
            <div className="space-y-4">
              <ActionsPanel
                title="O/X 퀴즈 생성"
                stepLabel="O/X"
                hideSummary
                hideQuiz
                isLoadingQuiz={isLoadingOx}
                isLoadingSummary={isLoadingSummary}
                isLoadingText={isLoadingText}
                status={status}
                error={error}
                shortPreview={shortPreview}
                onRequestQuiz={requestOxQuiz}
                onRequestSummary={requestSummary}
              />

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => requestOxQuiz({ auto: false })}
                  disabled={isLoadingOx || isLoadingText}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {isLoadingOx ? "O/X 생성 중..." : "O/X 퀴즈 생성"}
                </button>
                <button
                  type="button"
                  onClick={regenerateOxQuiz}
                  disabled={isLoadingOx || isLoadingText}
                  className="w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-300 disabled:opacity-60"
                >
                  {isLoadingOx ? "O/X 재생성 중..." : "O/X 퀴즈 재생성(덮어쓰기)"}
                </button>
              </div>

              {oxItems && oxItems.length > 0 && (
                <OxSection
                  title="O/X 퀴즈"
                  items={oxItems}
                  selections={oxSelections}
                  onSelect={(qIdx, choice) =>
                    setOxSelections((prev) => ({
                      ...prev,
                      [qIdx]: choice,
                    }))
                  }
                />
              )}
            </div>
          )}

          {panelTab === "flashcards" && (
            <FlashcardsPanel
              cards={flashcards}
              isLoading={isLoadingFlashcards}
              onAdd={async (front, back, hint) => {
                if (!user) {
                  setError("로그인이 필요합니다.");
                  return;
                }
                const deckId = selectedFileId || "default";
                setError("");
                setStatus("카드 저장 중...");
                try {
                  const saved = await addFlashcard({
                    userId: user.id,
                    deckId,
                    front,
                    back,
                    hint,
                  });
                  setFlashcards((prev) => [saved, ...prev]);
                  setStatus("카드 저장 완료");
                } catch (err) {
                  setError(`카드 저장 실패: ${err.message}`);
                  setStatus("");
                }
              }}
              onDelete={async (cardId) => {
                try {
                  await deleteFlashcard({ userId: user?.id, cardId });
                  setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
                } catch (err) {
                  setError(`카드 삭제 실패: ${err.message}`);
                }
              }}
            />
          )}
        </div>
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

      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 py-4">
        <Header user={user} onSignOut={handleSignOut} signingOut={isSigningOut} />
        <div className="px-0">
          {!showDetail && renderStartPage()}
          {showDetail && renderDetailPage()}
        </div>
      </main>
    </div>
  );
}

export default App;

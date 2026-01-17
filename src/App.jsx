import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionsPanel from "./components/ActionsPanel";
import AuthPanel from "./components/AuthPanel";
import AiTutorPanel from "./components/AiTutorPanel";
import FlashcardsPanel from "./components/FlashcardsPanel";
import FileUpload from "./components/FileUpload";
import Header from "./components/Header";
import LoginBackground from "./components/LoginBackground";
import OxSection from "./components/OxSection";
import PdfPreview from "./components/PdfPreview";
import ProgressPanel from "./components/ProgressPanel";
import QuizSection from "./components/QuizSection";
import SummaryCard from "./components/SummaryCard";
import PaymentPage from "./components/PaymentPage";
import {
  generateQuiz,
  generateSummary,
  generateOxQuiz,
  generateFlashcards,
  generateHardQuiz,
  generateTutorReply,
} from "./services/openai";
import { LETTERS } from "./constants";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useUserTier } from "./hooks/useUserTier";
import {
  supabase,
  uploadPdfToStorage,
  saveMockExam,
  fetchMockExams,
  deleteMockExam,
  addFlashcard,
  addFlashcards,
  listFlashcards,
  deleteFlashcard,
  createFolder,
  listFolders,
  deleteFolder,
  deleteUpload,
  saveUploadMetadata,
  listUploads,
  getSignedStorageUrl,
  updateUploadThumbnail,
  fetchDocArtifacts,
  saveDocArtifacts,
  updateUploadFolder,
} from "./services/supabase";
import { extractPdfText, generatePdfThumbnail } from "./utils/pdf";
import { exportElementToPdf, exportPagedElementToPdf } from "./utils/pdfExport";

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
  const [isExportingSummary, setIsExportingSummary] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [summary, setSummary] = useState("");
  const [quizSets, setQuizSets] = useState([]);
  const [selectedChoices, setSelectedChoices] = useState({});
  const [revealedChoices, setRevealedChoices] = useState({});
  const [shortAnswerInput, setShortAnswerInput] = useState("");
  const [shortAnswerResult, setShortAnswerResult] = useState(null);
  const [oxItems, setOxItems] = useState(null);
  const [oxSelections, setOxSelections] = useState({});
  const [oxExplanationOpen, setOxExplanationOpen] = useState({});
  const [isLoadingOx, setIsLoadingOx] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [panelTab, setPanelTab] = useState("summary");
  const [splitPercent, setSplitPercent] = useState(50);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [visitedPages, setVisitedPages] = useState(() => new Set());
  const [mockExams, setMockExams] = useState([]);
  const [isLoadingMockExams, setIsLoadingMockExams] = useState(false);
  const [isGeneratingMockExam, setIsGeneratingMockExam] = useState(false);
  const [mockExamStatus, setMockExamStatus] = useState("");
  const [mockExamError, setMockExamError] = useState("");
  const [activeMockExamId, setActiveMockExamId] = useState(null);
  const [showMockExamAnswers, setShowMockExamAnswers] = useState(false);
  const [isMockExamMenuOpen, setIsMockExamMenuOpen] = useState(false);
  const [flashcards, setFlashcards] = useState([]);
  const [isLoadingFlashcards, setIsLoadingFlashcards] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [flashcardStatus, setFlashcardStatus] = useState("");
  const [flashcardError, setFlashcardError] = useState("");
  const [flashcardExamStats, setFlashcardExamStats] = useState(null);
  const [tutorMessages, setTutorMessages] = useState([]);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState("");
  const [artifacts, setArtifacts] = useState(null);
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const quizAutoRequestedRef = useRef(false);
  const oxAutoRequestedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const loadUploadsRef = useRef(null);
  const detailContainerRef = useRef(null);
  const summaryRef = useRef(null);
  const mockExamPrintRef = useRef(null);
  const mockExamMenuRef = useRef(null);
  const mockExamMenuButtonRef = useRef(null);
  const { user, authReady, refreshSession, handleSignOut: authSignOut } = useSupabaseAuth();
  const { tier, loadingTier } = useUserTier(user);
  const isFreeTier = tier === "free";
  const isFolderFeatureEnabled = !isFreeTier;
  const [usageCounts, setUsageCounts] = useState({ summary: 0, quiz: 0, ox: 0 });
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [selectedUploadIds, setSelectedUploadIds] = useState([]);

  const computeFileHash = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);

  const limits = useMemo(() => {
    if (tier === "free") {
      return { maxUploads: 4, maxSummary: 1, maxQuiz: 1, maxOx: 1 };
    }
    if (tier === "pro") {
      return { maxUploads: Infinity, maxSummary: Infinity, maxQuiz: Infinity, maxOx: Infinity };
    }
    return { maxUploads: Infinity, maxSummary: Infinity, maxQuiz: Infinity, maxOx: Infinity };
  }, [tier]);

  const hasReached = useCallback(
    (type) => {
      if (!limits) return false;
      if (limits[type] === Infinity) return false;
      return usageCounts[type] >= limits[type];
    },
    [limits, usageCounts]
  );

  const loadFolders = useCallback(
    async () => {
      if (!supabase || !user) {
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      try {
        const list = await listFolders({ userId: user.id });
        setFolders(list || []);
      } catch (err) {
        setError(`폴더 불러오기 실패: ${err.message}`);
      }
    },
    [user, supabase]
  );

  const handleCreateFolder = useCallback(
    async (name) => {
      if (!isFolderFeatureEnabled) {
        setError("폴더 기능은 Pro/Premium에서만 사용할 수 있습니다.");
        return;
      }
      if (!user) {
        setError("로그인 후 이용해주세요.");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (folders.some((f) => f.name === trimmed)) {
        setStatus("이미 같은 이름의 폴더가 있습니다.");
        return;
      }
      try {
        const created = await createFolder({ userId: user.id, name: trimmed });
        if (created) {
          setFolders((prev) => [...prev, created]);
        }
        setSelectedFolderId("all");
        setSelectedUploadIds([]);
        setStatus("폴더를 만들었습니다.");
      } catch (err) {
        setError(`폴더 생성 실패: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, folders]
  );

  const handleDeleteFolder = useCallback(
    async (folderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("로그인 후 이용해주세요.");
        return;
      }
      const hasFiles = uploadedFiles.some((u) => u.folderId === folderId);
      if (hasFiles) {
        setError("폴더를 삭제하려면 먼저 파일을 이동하거나 삭제하세요.");
        return;
      }
      try {
        await deleteFolder({ userId: user.id, folderId });
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }
      } catch (err) {
        setError(`폴더 삭제 실패: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, uploadedFiles, selectedFolderId, user]
  );

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setSelectedUploadIds([]);
  }, []);

  const handleToggleUploadSelect = useCallback(
    (uploadId) => {
      if (!isFolderFeatureEnabled) return;
      setSelectedUploadIds((prev) =>
        prev.includes(uploadId) ? prev.filter((id) => id !== uploadId) : [...prev, uploadId]
      );
    },
    [isFolderFeatureEnabled]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedUploadIds([]);
  }, []);

  const handleDeleteUpload = useCallback(
    async (upload) => {
      if (!user) {
        setError("로그인 후 이용해주세요.");
        return;
      }
      const uploadId = upload?.id || null;
      const storagePath = upload?.path || upload?.remotePath || null;
      if (!uploadId && !storagePath) {
        setError("삭제할 파일 정보를 찾을 수 없습니다.");
        return;
      }
      const before = uploadedFiles;
      setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
      try {
        await deleteUpload({
          userId: user.id,
          uploadId,
          bucket: upload.bucket,
          path: storagePath,
        });
        setStatus("파일을 삭제했습니다.");
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`파일 삭제 실패: ${err.message}`);
      }
    },
    [user, uploadedFiles]
  );

  const handleMoveUploadsToFolder = useCallback(
    async (uploadIds, targetFolderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!uploadIds || uploadIds.length === 0) return;
      if (!user) {
        setError("로그인 후 이용해주세요.");
        return;
      }
      const normalizedIds = uploadIds.map((id) => id?.toString()).filter(Boolean);
      const target = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      const before = uploadedFiles;
      const targetEntries = before.filter((item) => normalizedIds.includes(item.id?.toString()));
      const remoteIds = targetEntries.map((item) => item.id).filter(Boolean);
      const remotePaths = targetEntries.map((item) => item.path || item.remotePath).filter(Boolean);
      try {
        if (remoteIds.length > 0 || remotePaths.length > 0) {
          const updated = await updateUploadFolder({
            userId: user.id,
            uploadIds: remoteIds,
            storagePaths: remotePaths,
            folderId: target,
          });
          const updatedMap = new Map();
          (updated || []).forEach((u) => {
            const folderVal = u.folder_id || null;
            const infolderVal = Number(u.infolder ?? (folderVal ? 1 : 0));
            if (u.id) updatedMap.set(u.id.toString(), { folderId: folderVal, infolder: infolderVal });
            if (u.storage_path) updatedMap.set(u.storage_path, { folderId: folderVal, infolder: infolderVal });
          });
          setUploadedFiles((prev) =>
            prev.map((item) => {
              const key = item.id?.toString();
              if (!normalizedIds.includes(key)) return item;
              const mapped = updatedMap.get(key) || updatedMap.get(item.path || item.remotePath);
              const nextFolder = mapped?.folderId ?? target;
              const nextInFolder = Number(mapped?.infolder ?? (nextFolder ? 1 : 0));
              return { ...item, folderId: nextFolder, infolder: nextInFolder };
            })
          );
        } else {
          // 로컬 항목만 있는 경우 로컬 상태만 갱신
          setUploadedFiles((prev) =>
            prev.map((item) =>
              normalizedIds.includes(item.id?.toString())
                ? { ...item, folderId: target, infolder: target ? 1 : 0 }
                : item
            )
          );
        }
        setSelectedUploadIds([]);
        setStatus("폴더로 이동했습니다.");
        // 서버 반영 상태를 다시 받아와 UI가 되돌아가지 않도록 동기화
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`폴더 이동에 실패했습니다: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, uploadedFiles]
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );

  const tutorNotice = useMemo(() => {
    if (!file || !selectedFileId) {
      return "먼저 PDF를 선택해주세요.";
    }
    if (isLoadingText) {
      return "PDF 추출 중입니다. 잠시만 기다려주세요.";
    }
    const trimmed = (extractedText || "").trim();
    if (!trimmed) {
      return "PDF에서 텍스트를 추출할 수 없습니다.";
    }
    return "";
  }, [extractedText, file, isLoadingText, selectedFileId]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.remove("theme-light");
    }
  }, [theme]);

  useEffect(() => {
    if (!isMockExamMenuOpen) return;
    const handleClickOutside = (event) => {
      if (event.button === 2) return;
      const menu = mockExamMenuRef.current;
      const button = mockExamMenuButtonRef.current;
      if (menu && menu.contains(event.target)) return;
      if (button && button.contains(event.target)) return;
      setIsMockExamMenuOpen(false);
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsMockExamMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [isMockExamMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("flashcardExamHistory");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setFlashcardExamStats(parsed[0]);
      }
    } catch (err) {
      // ignore parse errors
    }
  }, []);

  const loadMockExams = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setMockExams([]);
        return;
      }
      setIsLoadingMockExams(true);
      try {
        const list = await fetchMockExams({ userId: user.id, docId });
        setMockExams(list);
      } catch (err) {
        setMockExamError(`모의고사 불러오기 실패: ${err.message}`);
      } finally {
        setIsLoadingMockExams(false);
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
        setFolders([]);
        setSelectedFolderId("all");
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
          folderId: u.folder_id || null,
          infolder: Number(u.infolder ?? (u.folder_id ? 1 : 0)) || 0,
        }));
        setUploadedFiles(mapped);
      } catch (err) {
        setError(`업로드 이력 불러오기 실패: ${err.message}`);
      }
    },
    [user, supabase]
  );
  useEffect(() => {
    loadUploadsRef.current = loadUploads;
  }, [loadUploads]);

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
      await authSignOut();
      await refreshSession();
      setStatus("로그아웃 완료");
    } catch (err) {
      setError(`로그아웃 실패: ${err.message}`);
      setStatus("");
    } finally {
      setIsSigningOut(false);
    }
  }, [authSignOut, refreshSession]);

  useEffect(() => {
    if (user) {
      loadFolders();
    } else {
      setFolders([]);
      setSelectedFolderId("all");
    }
  }, [user, loadFolders]);

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
        setMockExams([]);
        setMockExamStatus("");
        setMockExamError("");
        setActiveMockExamId(null);
        setShowMockExamAnswers(false);
      setFlashcards([]);
      setVisitedPages(new Set());
      setFlashcardStatus("");
      setFlashcardError("");
      setIsGeneratingFlashcards(false);
      setTutorMessages([]);
      setTutorError("");
      setIsTutorLoading(false);
      oxAutoRequestedRef.current = false;

      try {
        const [textResult, thumb] = await Promise.all([extractPdfText(targetFile), generatePdfThumbnail(targetFile)]);
        const { text, pagesUsed, totalPages } = textResult;
        setExtractedText(text);
        setPreviewText(text);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        setStatus(`추출 완료 (사용 페이지: ${pagesUsed}/${totalPages})`);
          await loadMockExams(item.id);
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
    [pdfUrl, selectedFileId, loadMockExams, loadFlashcards, loadArtifacts]
  );

  const handleFileChange = async (event, targetFolderId = null) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const activeFolderId = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
    const nextCount = uploadedFiles.length + files.length;
    if (limits.maxUploads !== Infinity && nextCount > limits.maxUploads) {
      setError(`무료 티어에서는 업로드를 ${limits.maxUploads}개까지만 할 수 있습니다.`);
      return;
    }

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
          folderId: activeFolderId,
          infolder: activeFolderId ? 1 : 0,
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
              folderId: existing.folderId || existing.folder_id || item.folderId || null,
              infolder: Number(
                existing.infolder ??
                  (existing.folderId || existing.folder_id || item.folderId ? 1 : 0)
              ),
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
            folderId: activeFolderId,
          });
          return {
            ...item,
            id: record.id || item.id,
            remotePath: uploaded.path,
            remoteUrl: uploaded.signedUrl,
            bucket: uploaded.bucket,
            thumbnail: record.thumbnail || item.thumbnail,
            hash: record.file_hash || item.hash,
            folderId: record.folder_id || activeFolderId || null,
            infolder: Number(record.infolder ?? (record.folder_id || activeFolderId ? 1 : 0)),
          };
        } catch (err) {
          setError(`클라우드 업로드 실패: ${err.message}`);
          return { ...item, uploadError: err.message };
        }
      })
    );

    setUploadedFiles((prev) => {
      const merged = [...prev, ...withUploads];
      return merged;
    });
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
      setMockExams([]);
      setMockExamStatus("");
      setMockExamError("");
      setActiveMockExamId(null);
      setShowMockExamAnswers(false);
    setFlashcards([]);
    setVisitedPages(new Set());
    setFlashcardStatus("");
    setFlashcardError("");
    setIsGeneratingFlashcards(false);
    setTutorMessages([]);
    setTutorError("");
    setIsTutorLoading(false);
    setOxItems(null);
    setOxSelections({});
    setPanelTab("summary");
    summaryRequestedRef.current = false;
    quizAutoRequestedRef.current = false;
    oxAutoRequestedRef.current = false;
    setArtifacts(null);
    resetQuizState();
    setStatus("업로드 목록에서 썸네일을 선택해 요약/퀴즈를 시작하세요.");
    setSelectedUploadIds([]);
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

  const handlePageChange = useCallback((page) => {
    setCurrentPage(page);
    if (!page) return;
    setVisitedPages((prev) => {
      if (prev.has(page)) return prev;
      const next = new Set(prev);
      next.add(page);
      return next;
    });
  }, []);

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
    if (isFreeTier && quizSets.length > 0) {
      setError("무료 티어에서는 퀴즈를 재생성할 수 없습니다.");
      return;
    }
    if (!force && hasReached("maxQuiz")) {
      setError("무료 티어에서는 퀴즈를 1회까지만 생성할 수 있습니다.");
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
      setUsageCounts((prev) => ({ ...prev, quiz: prev.quiz + 1 }));
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
    if (isFreeTier) {
      setError("무료 티어에서는 퀴즈를 재생성할 수 없습니다.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("무료 티어에서는 퀴즈를 1회까지만 생성할 수 있습니다.");
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
    if (isFreeTier && summary) {
      setError("무료 티어에서는 요약을 재생성할 수 없습니다.");
      return;
    }
    if (hasReached("maxSummary")) {
      setError("무료 티어에서는 요약을 1회까지만 생성할 수 있습니다.");
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
      setUsageCounts((prev) => ({ ...prev, summary: prev.summary + 1 }));
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
    if (isFreeTier) {
      setError("무료 티어에서는 요약을 재생성할 수 없습니다.");
      return;
    }
    if (hasReached("maxSummary")) {
      setError("무료 티어에서는 요약을 1회까지만 생성할 수 있습니다.");
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

  const handleExportSummaryPdf = useCallback(async () => {
    if (isExportingSummary) return;
    if (!summary) {
      setError("요약이 없습니다. 먼저 요약을 생성해주세요.");
      return;
    }
    if (!summaryRef.current) {
      setError("요약 뷰를 찾지 못했습니다. 새로고침 후 다시 시도해주세요.");
      return;
    }
    setIsExportingSummary(true);
    setError("");
    const baseName = (file?.name || "summary").replace(/\.[^/.]+$/, "");
    try {
      const target = summaryRef.current;
      await exportElementToPdf(target, { filename: `${baseName}-summary.pdf` });
      setStatus("요약 PDF 저장 완료");
    } catch (err) {
      setError(`요약 PDF 내보내기에 실패했습니다: ${err.message}`);
      setStatus("");
    } finally {
      setIsExportingSummary(false);
    }
  }, [summary, file, isExportingSummary]);

  const requestOxQuiz = async ({ auto = false, force = false } = {}) => {
    if (isLoadingOx && !force) return;
    if (!file) {
      setError("먼저 PDF를 업로드해주세요.");
      return;
    }
    if (!force && hasReached("maxOx")) {
      setError("무료 티어에서는 O/X 퀴즈를 1회까지만 생성할 수 있습니다.");
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
      setOxExplanationOpen({});
      setStatus("O/X 퀴즈 생성 완료!");
      setUsageCounts((prev) => ({ ...prev, ox: prev.ox + 1 }));
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
    if (hasReached("maxOx")) {
      setError("무료 티어에서는 O/X 퀴즈를 1회까지만 생성할 수 있습니다.");
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

  const handleAddFlashcard = useCallback(
    async (front, back, hint) => {
      if (!user) {
        setFlashcardError("로그인이 필요합니다.");
        return;
      }
      const deckId = selectedFileId || "default";
      setFlashcardError("");
      setFlashcardStatus("카드 저장 중..");
      try {
        const saved = await addFlashcard({
          userId: user.id,
          deckId,
          front,
          back,
          hint,
        });
        setFlashcards((prev) => [saved, ...prev]);
        setFlashcardStatus("카드 저장 완료");
      } catch (err) {
        setFlashcardError(`카드 저장 실패: ${err.message}`);
        setFlashcardStatus("");
      }
    },
    [user, selectedFileId]
  );

  const handleDeleteFlashcard = useCallback(
    async (cardId) => {
      if (!user) {
        setFlashcardError("로그인이 필요합니다.");
        return;
      }
      setFlashcardError("");
      try {
        await deleteFlashcard({ userId: user.id, cardId });
        setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        setFlashcardStatus("카드 삭제 완료");
      } catch (err) {
        setFlashcardError(`카드 삭제 실패: ${err.message}`);
      }
    },
    [user]
  );

  const handleGenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    if (!user) {
      setFlashcardError("로그인이 필요합니다.");
      return;
    }
    if (!file || !selectedFileId) {
      setFlashcardError("먼저 PDF를 선택해주세요.");
      return;
    }
    if (isLoadingText) {
      setFlashcardError("PDF 추출 중입니다. 잠시만 기다려주세요.");
      return;
    }
    const trimmedText = (extractedText || "").trim();
    if (trimmedText.length < 80) {
      setFlashcardError("PDF에서 텍스트를 추출할 수 없습니다.");
      return;
    }

    setFlashcardError("");
    setFlashcardStatus("AI 플래시카드 생성 중..");
    setIsGeneratingFlashcards(true);
    try {
      const result = await generateFlashcards(trimmedText, { count: 8 });
      const rawCards = Array.isArray(result?.cards)
        ? result.cards
        : Array.isArray(result)
          ? result
          : [];
      const cleaned = rawCards
        .map((card) => ({
          front: String(card?.front || "").trim(),
          back: String(card?.back || "").trim(),
          hint: String(card?.hint || "").trim(),
        }))
        .filter((card) => card.front && card.back);
      if (cleaned.length === 0) {
        throw new Error("생성된 카드가 없습니다.");
      }
      const deckId = selectedFileId || "default";
      const saved = await addFlashcards({ userId: user.id, deckId, cards: cleaned });
      if (!saved.length) {
        throw new Error("카드 저장에 실패했습니다.");
      }
      setFlashcards((prev) => [...saved, ...prev]);
      setFlashcardStatus(`AI 플래시카드 ${saved.length}장 생성 완료`);
    } catch (err) {
      setFlashcardError(`AI 플래시카드 생성 실패: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
    }, [isGeneratingFlashcards, user, file, selectedFileId, isLoadingText, extractedText]);

  const handleResetTutor = useCallback(() => {
    setTutorMessages([]);
    setTutorError("");
    setIsTutorLoading(false);
  }, []);

  const handleSendTutorMessage = useCallback(
    async (prompt) => {
      const trimmed = String(prompt || "").trim();
      if (!trimmed || isTutorLoading) return;
      if (!file || !selectedFileId) {
        setTutorError("먼저 PDF를 선택해주세요.");
        return;
      }
      if (isLoadingText) {
        setTutorError("PDF 추출 중입니다. 잠시만 기다려주세요.");
        return;
      }
      const docText = (extractedText || "").trim();
      if (!docText) {
        setTutorError("PDF에서 텍스트를 추출할 수 없습니다.");
        return;
      }

      setTutorError("");
      const history = tutorMessages.slice(-12);
      const userMessage = { role: "user", content: trimmed };
      setTutorMessages((prev) => [...prev, userMessage]);
      setIsTutorLoading(true);
      try {
        const reply = await generateTutorReply({
          question: trimmed,
          extractedText: docText,
          messages: history,
        });
        setTutorMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        setTutorError(`AI 튜터 답변 생성 실패: ${err.message}`);
      } finally {
        setIsTutorLoading(false);
      }
    },
    [extractedText, file, isLoadingText, isTutorLoading, selectedFileId, tutorMessages]
  );

  const pickRandomItems = useCallback((items, count) => {
    if (!Array.isArray(items) || count <= 0) return [];
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, count);
  }, []);

  const handleCreateMockExam = useCallback(async () => {
    if (isGeneratingMockExam) return;
    if (!user) {
      setMockExamError("로그인이 필요합니다.");
      return;
    }
    if (!file || !selectedFileId) {
      setMockExamError("먼저 PDF를 선택해주세요.");
      return;
    }
    if (isLoadingText) {
      setMockExamError("PDF 추출 중입니다. 잠시만 기다려주세요.");
      return;
    }

    const oxPool = Array.isArray(oxItems) ? oxItems : [];
    if (oxPool.length < 3) {
      setMockExamError("O/X 퀴즈가 3문항 이상 필요합니다.");
      return;
    }

    const quizPool = [];
    quizSets.forEach((set) => {
      const multipleChoice = set.questions?.multipleChoice || [];
      multipleChoice.forEach((question) => {
        const prompt = String(question?.question || "").trim();
        if (!prompt) return;
        quizPool.push({
          type: "quiz-mc",
          prompt,
          choices: Array.isArray(question?.choices) ? question.choices : [],
          answerIndex: Number.isFinite(question?.answerIndex) ? question.answerIndex : null,
          explanation: String(question?.explanation || "").trim(),
        });
      });
      if (set.questions?.shortAnswer) {
        const prompt = String(set.questions.shortAnswer.question || "").trim();
        if (!prompt) return;
        quizPool.push({
          type: "quiz-short",
          prompt,
          answer: String(set.questions.shortAnswer.answer || "").trim(),
          explanation: String(set.questions.shortAnswer.explanation || "").trim(),
        });
      }
    });

    if (quizPool.length < 4) {
      setMockExamError("퀴즈 문항이 4문항 이상 필요합니다.");
      return;
    }

    const trimmedText = (extractedText || "").trim();
    if (trimmedText.length < 80) {
      setMockExamError("PDF에서 텍스트를 추출할 수 없습니다.");
      return;
    }

    setMockExamStatus("모의고사 생성 중...");
    setMockExamError("");
    setIsGeneratingMockExam(true);

    try {
      const pickedOx = pickRandomItems(oxPool, 3);
      const pickedQuiz = pickRandomItems(quizPool, 4);
      const hardCount = Math.max(3, 10 - (pickedOx.length + pickedQuiz.length));
      const hardResult = await generateHardQuiz(trimmedText, { count: hardCount });
      const hardItems = Array.isArray(hardResult?.items) ? hardResult.items.slice(0, hardCount) : [];

      if (hardItems.length < hardCount) {
        throw new Error("고난도 문항 생성에 실패했습니다.");
      }

      const mappedOx = pickedOx.map((item) => ({
        type: "ox",
        prompt: String(item?.statement || "").trim(),
        answer: item?.answer === true ? "O" : "X",
        explanation: String(item?.explanation || "").trim(),
        evidence: String(item?.evidence || "").trim(),
      }));

      const mappedQuiz = pickedQuiz.map((item) => ({ ...item }));

      const mappedHard = hardItems.map((item) => ({
        type: "hard",
        prompt: String(item?.question || "").trim(),
        choices: Array.isArray(item?.choices) ? item.choices : [],
        answerIndex: Number.isFinite(item?.answerIndex) ? item.answerIndex : null,
        explanation: String(item?.explanation || "").trim(),
      }));

      const examItems = [...mappedOx, ...mappedQuiz, ...mappedHard].map((item, idx) => ({
        ...item,
        order: idx + 1,
      }));

      if (examItems.length !== 10) {
        throw new Error("모의고사 10문항을 구성하지 못했습니다.");
      }

      const now = new Date();
      const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      const nextIndex = mockExams.length + 1;
      const title = `${dateStamp} ${nextIndex}번째 모의고사`;
      const payload = {
        title,
        items: examItems,
        source: {
          oxCount: mappedOx.length,
          quizCount: mappedQuiz.length,
          hardCount: mappedHard.length,
        },
        generatedAt: new Date().toISOString(),
      };

      const saved = await saveMockExam({
        userId: user.id,
        docId: selectedFileId,
        docName: file?.name || "",
        title,
        totalQuestions: examItems.length,
        payload,
      });

      setMockExams((prev) => [saved, ...prev]);
      setActiveMockExamId(saved.id);
      setShowMockExamAnswers(false);
      setMockExamStatus("모의고사 저장 완료");
    } catch (err) {
      setMockExamError(`모의고사 생성 실패: ${err.message}`);
      setMockExamStatus("");
    } finally {
      setIsGeneratingMockExam(false);
    }
  }, [
    extractedText,
    file,
    isGeneratingMockExam,
    isLoadingText,
    oxItems,
    pickRandomItems,
    mockExams.length,
    quizSets,
    selectedFileId,
    user,
  ]);

  const handleDeleteMockExam = useCallback(
    async (examId) => {
      if (!user) {
        setMockExamError("로그인이 필요합니다.");
        return;
      }
      try {
        await deleteMockExam({ userId: user.id, examId });
        setMockExams((prev) => prev.filter((item) => item.id !== examId));
        if (activeMockExamId === examId) {
          setActiveMockExamId(null);
        }
        setMockExamStatus("모의고사를 삭제했습니다.");
      } catch (err) {
        setMockExamError(`모의고사 삭제 실패: ${err.message}`);
      }
    },
    [activeMockExamId, user]
  );

  const handleExportMockExam = useCallback(
    async (exam) => {
      if (!exam) {
        setMockExamError("내보낼 모의고사가 없습니다.");
        return;
      }
      if (!mockExamPrintRef.current) {
        setMockExamError("내보낼 영역을 찾지 못했습니다.");
        return;
      }
      setMockExamError("");
      try {
        const safeTitle = (exam.title || "mock-exam").replace(/[^\w\-]+/g, "-");
        await exportPagedElementToPdf(mockExamPrintRef.current, {
          filename: `${safeTitle}.pdf`,
          margin: 0,
          pageSelector: ".mock-exam-page",
        });
      } catch (err) {
        setMockExamError(`PDF 저장 실패: ${err.message}`);
      }
    },
    [mockExamPrintRef]
  );

  const quizProgress = useMemo(() => {
    let total = 0;
    let answered = 0;
    let correct = 0;

    quizSets.forEach((set) => {
      const multipleChoice = set.questions?.multipleChoice || [];
      multipleChoice.forEach((question, idx) => {
        total += 1;
        const selection = set.selectedChoices?.[idx];
        const hasAnswer = selection !== undefined || set.revealedChoices?.[idx];
        if (!hasAnswer) return;
        answered += 1;
        if (selection === question.answerIndex) {
          correct += 1;
        }
      });

      if (set.questions?.shortAnswer) {
        total += 1;
        if (set.shortAnswerResult) {
          answered += 1;
          if (set.shortAnswerResult.isCorrect) {
            correct += 1;
          }
        }
      }
    });

    return { total, answered, correct };
  }, [quizSets]);

  const oxProgress = useMemo(() => {
    let total = 0;
    let answered = 0;
    let correct = 0;

    const oxList = Array.isArray(oxItems) ? oxItems : [];
    oxList.forEach((item, idx) => {
      total += 1;
      const selection = oxSelections?.[idx];
      if (!selection) return;
      answered += 1;
      if ((selection === "o" && item.answer === true) || (selection === "x" && item.answer === false)) {
        correct += 1;
      }
    });

    return { total, answered, correct };
  }, [oxItems, oxSelections]);

  const questionProgress = useMemo(
    () => ({
      total: quizProgress.total + oxProgress.total,
      answered: quizProgress.answered + oxProgress.answered,
      correct: quizProgress.correct + oxProgress.correct,
    }),
    [quizProgress, oxProgress]
  );

  const pageProgress = useMemo(() => {
    const totalPages = pageInfo.total || 0;
    const visitedCount = visitedPages.size || 0;
    const progress = totalPages ? visitedCount / totalPages : 0;
    return { totalPages, visitedCount, progress };
  }, [pageInfo.total, visitedPages]);

  const activeMockExam = useMemo(() => {
    if (!mockExams.length) return null;
    if (activeMockExamId) {
      return mockExams.find((exam) => exam.id === activeMockExamId) || mockExams[0];
    }
    return mockExams[0];
  }, [activeMockExamId, mockExams]);
  const formatMockExamTitle = useCallback((exam, index) => {
    if (!exam) return "모의고사";
    const rawTitle = String(exam.title || "").trim();
    if (/^\d{4}\.\d{1,2}\.\d{1,2}\s+\d+번째\s+모의고사$/.test(rawTitle)) {
      return rawTitle;
    }
    const date = exam.created_at ? new Date(exam.created_at) : new Date();
    const dateStamp = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    const seq = Math.max(1, (index ?? 0) + 1);
    return `${dateStamp} ${seq}번째 모의고사`;
  }, []);
  const activeMockExamIndex = useMemo(
    () => (activeMockExam ? mockExams.findIndex((exam) => exam.id === activeMockExam.id) : -1),
    [activeMockExam, mockExams]
  );
  const activeMockExamTitle = useMemo(
    () => formatMockExamTitle(activeMockExam, activeMockExamIndex),
    [activeMockExam, activeMockExamIndex, formatMockExamTitle]
  );

  const mockExamOrderedItems = useMemo(() => {
    const items = Array.isArray(activeMockExam?.payload?.items) ? activeMockExam.payload.items : [];
    if (!items.length) return [];
    return [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [activeMockExam]);

  const mockExamPages = useMemo(() => {
    if (!mockExamOrderedItems.length) return [];
    return [
      mockExamOrderedItems.slice(0, 4),
      mockExamOrderedItems.slice(4, 8),
      mockExamOrderedItems.slice(8, 10),
    ];
  }, [mockExamOrderedItems]);

  const renderMockExamItem = (item, number) => {
    const choices = Array.isArray(item?.choices) ? item.choices : [];
    const isOx = item?.type === "ox";
    const isShort = item?.type === "quiz-short";
    const isMultiple = !isOx && !isShort;

    return (
      <div key={`mock-exam-q-${number}`} className="space-y-2">
        <p className="text-[13px] font-semibold text-black">
          {number}. {item?.prompt}
        </p>
        {isOx && <p className="text-[12px] text-black/80">1) O  2) X</p>}
        {isShort && <p className="text-[12px] text-black/80">답: ____________________</p>}
        {isMultiple && choices.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-black/85">
            {choices.slice(0, 4).map((choice, idx) => (
              <div key={`choice-${number}-${idx}`} className="flex gap-2">
                <span className="w-4">{idx + 1})</span>
                <span>{choice}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
        folders={folders}
        selectedFolderId={selectedFolderId}
        onSelectFolder={handleSelectFolder}
        onCreateFolder={handleCreateFolder}
        onDeleteFolder={handleDeleteFolder}
        selectedUploadIds={selectedUploadIds}
        onToggleUploadSelect={handleToggleUploadSelect}
        onMoveUploads={handleMoveUploadsToFolder}
        onClearSelection={handleClearSelection}
        isFolderFeatureEnabled={isFolderFeatureEnabled}
        onDeleteUpload={handleDeleteUpload}
      />
    </section>
  );

  const renderDetailPage = () => (
    <section
      ref={detailContainerRef}
      className="flex flex-col gap-4 lg:h-[clamp(70vh,calc(100vh-120px),90vh)] lg:flex-row lg:items-stretch lg:overflow-hidden"
    >
      <div className="flex flex-col gap-3 lg:h-full lg:overflow-y-auto" style={splitStyle}>
        <PdfPreview pdfUrl={pdfUrl} file={file} pageInfo={pageInfo} onPageChange={handlePageChange} />
      </div>

      <div className="hidden w-2 cursor-col-resize items-stretch justify-center lg:flex">
        <div
          className="h-full w-1 rounded-full bg-white/10 transition hover:bg-white/30"
          onMouseDown={handleDragStart}
          role="separator"
          aria-label="Resize panel"
        />
      </div>

        <div className="flex flex-col gap-4 lg:min-w-0 lg:flex-1 lg:h-full lg:max-h-full lg:overflow-hidden">
        <div className="grid grid-cols-7 items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2 shadow-lg shadow-black/30 lg:sticky lg:top-0 lg:z-10 lg:backdrop-blur">
          {[
            { id: "summary", label: "\uC694\uC57D", type: "tab" },
            { id: "progress", label: "\uC9C4\uB3C4", type: "tab" },
            { id: "quiz", label: "\uD034\uC988", type: "tab" },
            { id: "ox", label: "O/X", type: "tab" },
            { id: "mockExam", label: "\uBAA8\uC758\uACE0\uC0AC", type: "tab" },
            { id: "flashcards", label: "\uCE74\uB4DC", type: "tab" },
            { id: "tutor", label: "AI 튜터", type: "tab" },
          ].map((item) => {
            const active = panelTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPanelTab(item.id)}
                className="ghost-button w-full text-sm text-slate-200"
                data-ghost-size="sm"
                data-ghost-active={active}
                style={{ "--ghost-color": active ? "52, 211, 153" : "148, 163, 184" }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto pr-1 pb-1">
          {panelTab === "summary" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-emerald-200">요약</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => requestSummary({ force: true })}
                    disabled={isLoadingSummary || isLoadingText || (isFreeTier && summary)}
                    title={isFreeTier && summary ? "무료 티어에서는 요약을 재생성할 수 없습니다." : undefined}
                    className="ghost-button text-xs text-emerald-100"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingSummary ? "요약 생성 중..." : "요약 새로 생성"}
                  </button>
                  {!isFreeTier && (
                    <button
                      type="button"
                      onClick={regenerateSummary}
                      disabled={isLoadingSummary || isLoadingText}
                      className="ghost-button text-xs text-emerald-100"
                      style={{ "--ghost-color": "52, 211, 153" }}
                    >
                      요약 재생성
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportSummaryPdf}
                    disabled={
                      isLoadingSummary || isLoadingText || !summary || isExportingSummary
                    }
                    className="ghost-button text-xs text-indigo-100"
                    style={{ "--ghost-color": "99, 102, 241" }}
                  >
                    {isExportingSummary ? "PDF 내보내는 중..." : "요약 PDF 다운로드"}
                  </button>
                </div>
              </div>
              {isLoadingSummary && <p className="mt-2 text-sm text-slate-300">요약 생성 중...</p>}
              {!isLoadingSummary && summary && (
                <div ref={summaryRef}>
                  <SummaryCard summary={summary} />
                </div>
              )}
              {!isLoadingSummary && !summary && <p className="mt-2 text-sm text-slate-400">요약이 준비되면 표시됩니다.</p>}
            </div>
          )}
          {panelTab === "progress" && (
            <ProgressPanel
              totalQuestions={questionProgress.total}
              answeredQuestions={questionProgress.answered}
              correctQuestions={questionProgress.correct}
              quizProgress={quizProgress}
              oxProgress={oxProgress}
              flashcardProgress={flashcardExamStats}
              pageTotal={pageProgress.totalPages}
              pageVisited={pageProgress.visitedCount}
              pageProgress={pageProgress.progress}
            />
          )}

          {panelTab === "mockExam" && (
            <div className="rounded-3xl border border-white/5 bg-slate-900/70 p-4 shadow-lg shadow-black/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">총 모의고사</p>
                  <h3 className="text-lg font-semibold text-white">모의고사</h3>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 ring-1 ring-white/15">
                  {mockExams.length}개
                </span>
              </div>

              <div className="mt-4 space-y-3">
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
                        {!isLoadingMockExams &&
                          mockExams.map((exam, idx) => {
                            const isActive = activeMockExam?.id === exam.id;
                            const displayTitle = formatMockExamTitle(exam, idx);
                            return (
                              <div
                                key={exam.id}
                                className={`flex items-center justify-between gap-2 px-4 py-2 text-sm ${
                                  idx === 0 ? "" : "border-t border-white/10"
                                } ${isActive ? "bg-emerald-500/10" : "hover:bg-white/5"}`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMockExamId(exam.id);
                                    setIsMockExamMenuOpen(false);
                                  }}
                                  className="flex flex-1 flex-col items-start text-left"
                                >
                                  <span className="text-sm font-semibold text-slate-100">{displayTitle}</span>
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(exam.created_at).toLocaleString("ko-KR")}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteMockExam(exam.id);
                                    setIsMockExamMenuOpen(false);
                                  }}
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

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-100 overflow-auto">
                  {!activeMockExam && <p className="text-sm text-slate-400">선택된 모의고사가 없습니다.</p>}
                  {activeMockExam && (
                    <div className="space-y-6">
                      {mockExamOrderedItems.length === 0 && (
                        <p className="text-sm text-slate-400">모의고사 문항이 없습니다.</p>
                      )}
                      {mockExamOrderedItems.length > 0 && (
                        <div ref={mockExamPrintRef} className="space-y-10 flex flex-col items-center">
                          {mockExamPages.map((pageItems, pageIndex) => {
                            const isFourGrid = pageItems.length === 4;
                            const pageStart = pageIndex === 0 ? 1 : pageIndex === 1 ? 5 : 9;
                            return (
                              <section
                                key={`mock-exam-page-${pageIndex}`}
                                className="mock-exam-page relative mx-auto bg-white text-black shadow-sm"
                                style={{ width: "794px", minHeight: "1123px", padding: "44px 52px 48px" }}
                              >
                                <div className="relative flex items-start justify-center">
                                  <h4 className="text-[18px] font-semibold">{activeMockExamTitle}</h4>
                                  <span className="absolute right-0 top-0 text-[18px] font-semibold">
                                    {pageIndex + 1}
                                  </span>
                                </div>
                                <div className="mt-3 border-t border-black" />
                                <div
                                  className={`relative mt-6 grid gap-8 ${
                                    isFourGrid ? "grid-cols-2 grid-rows-2" : "grid-cols-2"
                                  }`}
                                  style={{
                                    minHeight: "900px",
                                    gridAutoFlow: isFourGrid ? "column" : "row",
                                  }}
                                >
                                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/80" />
                                  {pageItems.map((item, idx) => {
                                    const columnIndex = isFourGrid ? Math.floor(idx / 2) : idx % 2;
                                    const paddingClass = columnIndex === 0 ? "pr-6" : "pl-6";
                                    return (
                                      <div key={`mock-exam-cell-${pageIndex}-${idx}`} className={paddingClass}>
                                        {renderMockExamItem(item, pageStart + idx)}
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      )}

                      {showMockExamAnswers && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                          <p className="text-sm font-semibold text-emerald-200">정답/해설</p>
                          <div className="mt-3 space-y-2 text-xs text-slate-200">
                            {mockExamOrderedItems.map((item, idx) => {
                              const answerText =
                                item.type === "ox"
                                  ? item.answer || "-"
                                  : item.type === "quiz-short"
                                    ? item.answer || "-"
                                    : Number.isFinite(item.answerIndex)
                                      ? LETTERS[item.answerIndex] || "-"
                                      : "-";
                              return (
                                <div key={`mock-exam-answer-${idx}`} className="rounded-lg bg-white/5 px-3 py-2">
                                  <p className="font-semibold text-emerald-200">
                                    {idx + 1}번 정답: {answerText}
                                  </p>
                                  {item.explanation && <p className="mt-1">해설: {item.explanation}</p>}
                                  {item.evidence && <p className="mt-1">근거: {item.evidence}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  disabled={isLoadingQuiz || isLoadingText || (isFreeTier && quizSets.length > 0)}
                  title={isFreeTier && quizSets.length > 0 ? "무료 티어에서는 퀴즈를 재생성할 수 없습니다." : undefined}
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingQuiz ? "퀴즈 생성 중..." : "퀴즈 5문제 더 생성하기"}
                </button>
                {!isFreeTier && (
                  <button
                    type="button"
                    onClick={regenerateQuiz}
                    disabled={isLoadingQuiz || isLoadingText}
                    className="ghost-button w-full text-sm text-emerald-100"
                    data-ghost-size="xl"
                    style={{ "--ghost-color": "16, 185, 129" }}
                  >
                    {isLoadingQuiz ? "퀴즈 재생성 중..." : "퀴즈 재생성(덮어쓰기)"}
                  </button>
                )}
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
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingOx ? "O/X 생성 중..." : "O/X 퀴즈 생성"}
                </button>
                <button
                  type="button"
                  onClick={regenerateOxQuiz}
                  disabled={isLoadingOx || isLoadingText}
                  className="ghost-button w-full text-sm text-emerald-100"
                  data-ghost-size="xl"
                  style={{ "--ghost-color": "16, 185, 129" }}
                >
                  {isLoadingOx ? "O/X 재생성 중..." : "O/X 퀴즈 재생성(덮어쓰기)"}
                </button>
              </div>

              {oxItems && oxItems.length > 0 && (
                <OxSection
                  title="O/X 퀴즈"
                  items={oxItems}
                  selections={oxSelections}
                  explanationsOpen={oxExplanationOpen}
                  onSelect={(qIdx, choice) =>
                    setOxSelections((prev) => ({
                      ...prev,
                      [qIdx]: choice,
                    }))
                  }
                  onToggleExplanation={(qIdx) =>
                    setOxExplanationOpen((prev) => ({
                      ...prev,
                      [qIdx]: !prev?.[qIdx],
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
              onAdd={handleAddFlashcard}
              onDelete={handleDeleteFlashcard}
              onGenerate={handleGenerateFlashcards}
              isGenerating={isGeneratingFlashcards}
              canGenerate={Boolean(file && selectedFileId && extractedText && !isLoadingText)}
              status={flashcardStatus}
              error={flashcardError}
              onExamComplete={setFlashcardExamStats}
            />
          )}
          {panelTab === "tutor" && (
            <AiTutorPanel
              messages={tutorMessages}
              isLoading={isTutorLoading}
              error={tutorError}
              canChat={!tutorNotice}
              notice={tutorNotice}
              fileName={file?.name || ""}
              onSend={handleSendTutorMessage}
              onReset={handleResetTutor}
            />
          )}
        </div>
      </div>
    </section>
  );

  if (!authReady) {
    return (
      <LoginBackground theme={theme}>
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200 shadow-lg">
            Loading...
          </div>
        </div>
      </LoginBackground>
    );
  }

  if (!user) {
    return (
      <LoginBackground theme={theme}>
        <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8">
          <AuthPanel user={user} onAuth={refreshSession} />
        </div>
      </LoginBackground>
    );
  }

  return (
    <div className={`relative min-h-screen overflow-hidden ${theme === "light" ? "text-slate-900" : "text-slate-100"}`}>
      {showPayment && <PaymentPage onClose={() => setShowPayment(false)} currentTier={tier} theme={theme} />}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute right-[-80px] top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 py-4">
        <Header
          user={user}
          onSignOut={handleSignOut}
          signingOut={isSigningOut}
          theme={theme}
          onOpenBilling={() => setShowPayment(true)}
          onToggleTheme={toggleTheme}
        />
        <div className="px-0">
          {!showDetail && renderStartPage()}
          {showDetail && renderDetailPage()}
        </div>
      </main>
    </div>
  );
}

export default App;

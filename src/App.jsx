import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import StartPage from "./pages/StartPage";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useUserTier } from "./hooks/useUserTier";
import { usePageProgressCache } from "./hooks/usePageProgressCache";
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
import {
  extractPdfText,
  extractPdfTextByRanges,
  extractChapterRangesFromToc,
  extractPdfTextFromPages,
  generatePdfThumbnail,
} from "./utils/pdf";
import { exportPagedElementToPdf } from "./utils/pdfExport";
import {
  PDF_MAX_SIZE_BY_TIER,
  DEFAULT_PREMIUM_PROFILE_PIN,
  PREMIUM_PROFILE_PRESETS,
  PREMIUM_PROFILE_LIMIT,
  PREMIUM_SHARED_SCOPE_ID,
  PREMIUM_SPACE_MODE_PROFILE,
  PREMIUM_SPACE_MODE_SHARED,
  createPremiumProfileId,
  decodePremiumScopeValue,
  encodePremiumScopeValue,
  formatSizeMB,
  getPremiumActiveProfileStorageKey,
  getPremiumProfilesStorageKey,
  getPremiumSpaceModeStorageKey,
  getTierLabel,
  normalizePremiumProfilePinInput,
  normalizePremiumProfiles,
  normalizeQuizPayload,
  parseChapterRangeSelectionInput,
  parsePageSelectionInput,
  pickRandomItems,
  sanitizePremiumProfileName,
  sanitizePremiumProfilePin,
  formatMockExamTitle,
  chunkMockExamPages,
} from "./utils/appStateHelpers";

const AuthPanel = lazy(() => import("./components/AuthPanel"));
const Header = lazy(() => import("./components/Header"));
const LoginBackground = lazy(() => import("./components/LoginBackground"));
const PaymentPage = lazy(() => import("./components/PaymentPage"));
const DetailPage = lazy(() => import("./pages/DetailPage"));
const PremiumProfilePicker = lazy(() => import("./components/PremiumProfilePicker"));

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
  const [quizMix, setQuizMix] = useState({ multipleChoice: 4, shortAnswer: 1 });
  const [oxItems, setOxItems] = useState(null);
  const [oxSelections, setOxSelections] = useState({});
  const [oxExplanationOpen, setOxExplanationOpen] = useState({});
  const [isLoadingOx, setIsLoadingOx] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [panelTab, setPanelTab] = useState("summary");
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
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
  const [tutorMessages, setTutorMessages] = useState([]);
  const [isTutorLoading, setIsTutorLoading] = useState(false);
  const [tutorError, setTutorError] = useState("");
  const [isPageSummaryOpen, setIsPageSummaryOpen] = useState(false);
  const [pageSummaryInput, setPageSummaryInput] = useState("");
  const [pageSummaryError, setPageSummaryError] = useState("");
  const [isPageSummaryLoading, setIsPageSummaryLoading] = useState(false);
  const [isChapterRangeOpen, setIsChapterRangeOpen] = useState(false);
  const [chapterRangeInput, setChapterRangeInput] = useState("");
  const [chapterRangeError, setChapterRangeError] = useState("");
  const [isDetectingChapterRanges, setIsDetectingChapterRanges] = useState(false);
  const [artifacts, setArtifacts] = useState(null);
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const summaryContextCacheRef = useRef(new Map()); // fileId -> extended summary text
  const quizAutoRequestedRef = useRef(false);
  const oxAutoRequestedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activeDragPointerIdRef = useRef(null);
  const dragHandleElementRef = useRef(null);
  const loadUploadsRef = useRef(null);
  const loadUploadsRequestSeqRef = useRef(0);
  const loadFoldersRequestSeqRef = useRef(0);
  const detailContainerRef = useRef(null);
  const summaryRef = useRef(null);
  const mockExamPrintRef = useRef(null);
  const mockExamMenuRef = useRef(null);
  const mockExamMenuButtonRef = useRef(null);
  const openAiModulePromiseRef = useRef(null);
  const { user, refreshSession, handleSignOut: authSignOut } = useSupabaseAuth();
  const { tier, loadingTier, refreshTier } = useUserTier(user);
  const isFreeTier = tier === "free";
  const isPremiumTier = tier === "premium";
  const isFolderFeatureEnabled = !isFreeTier;
  const [usageCounts, setUsageCounts] = useState({ summary: 0, quiz: 0, ox: 0 });
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState("all");
  const [selectedUploadIds, setSelectedUploadIds] = useState([]);
  const [premiumProfiles, setPremiumProfiles] = useState([]);
  const [activePremiumProfileId, setActivePremiumProfileId] = useState(null);
  const [showPremiumProfilePicker, setShowPremiumProfilePicker] = useState(false);
  const [showProfilePinDialog, setShowProfilePinDialog] = useState(false);
  const [profilePinInputs, setProfilePinInputs] = useState({
    currentPin: "",
    nextPin: "",
    confirmPin: "",
  });
  const [profilePinError, setProfilePinError] = useState("");
  const [premiumSpaceMode, setPremiumSpaceMode] = useState(PREMIUM_SPACE_MODE_PROFILE);

  const computeFileHash = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);
  const normalizePdfFile = useCallback((inputFile) => {
    if (!(inputFile instanceof File)) return inputFile;
    const fileType = String(inputFile.type || "").toLowerCase();
    const fileName = String(inputFile.name || "").toLowerCase();
    const looksLikePdf = fileType.includes("pdf") || fileName.endsWith(".pdf");
    if (!looksLikePdf) return inputFile;
    if (fileType === "application/pdf") return inputFile;
    return new File([inputFile], inputFile.name, {
      type: "application/pdf",
      lastModified: inputFile.lastModified || Date.now(),
    });
  }, []);
  const getOpenAiService = useCallback(async () => {
    if (!openAiModulePromiseRef.current) {
      openAiModulePromiseRef.current = import("./services/openai");
    }
    return openAiModulePromiseRef.current;
  }, []);

  const limits = useMemo(() => {
    if (tier === "free") {
      return {
        maxUploads: 4,
        maxSummary: 1,
        maxQuiz: 1,
        maxOx: 1,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.free,
      };
    }
    if (tier === "pro") {
      return {
        maxUploads: Infinity,
        maxSummary: Infinity,
        maxQuiz: Infinity,
        maxOx: Infinity,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.pro,
      };
    }
    return {
      maxUploads: Infinity,
      maxSummary: Infinity,
      maxQuiz: Infinity,
      maxOx: Infinity,
      maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.premium,
    };
  }, [tier]);

  const hasReached = useCallback(
    (type) => {
      if (!limits) return false;
      if (limits[type] === Infinity) return false;
      return usageCounts[type] >= limits[type];
    },
    [limits, usageCounts]
  );

  const openAuth = useCallback(() => {
    setShowAuth(true);
  }, []);

  const closeAuth = useCallback(() => {
    setShowAuth(false);
  }, []);

  const openBilling = useCallback(() => {
    setShowPayment(true);
  }, []);

  const activePremiumProfile = useMemo(
    () => premiumProfiles.find((profile) => profile.id === activePremiumProfileId) || null,
    [premiumProfiles, activePremiumProfileId]
  );
  const premiumOwnerProfileId = useMemo(() => premiumProfiles[0]?.id || null, [premiumProfiles]);
  const premiumScopeProfileId = useMemo(() => {
    if (!isPremiumTier) return null;
    if (premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED) {
      return PREMIUM_SHARED_SCOPE_ID;
    }
    return activePremiumProfileId || null;
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode]);
  const { savePageProgressSnapshot, loadPageProgressSnapshot } = usePageProgressCache({
    isPremiumTier,
    activePremiumProfileId,
  });

  const resetActiveDocumentState = useCallback(() => {
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
    setQuizSets([]);
    setOxItems(null);
    setOxSelections({});
    setOxExplanationOpen({});
    setThumbnailUrl(null);
    setPanelTab("summary");
    setMockExams([]);
    setActiveMockExamId(null);
    setShowMockExamAnswers(false);
    setMockExamStatus("");
    setMockExamError("");
    setFlashcards([]);
    setArtifacts(null);
  }, [pdfUrl]);

  const handleOpenProfilePicker = useCallback(() => {
    if (!user || !isPremiumTier) return;
    setShowPremiumProfilePicker(true);
  }, [isPremiumTier, user]);

  const handleOpenProfilePinDialog = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
    setShowProfilePinDialog(true);
  }, [activePremiumProfileId, isPremiumTier, user]);

  const handleCloseProfilePinDialog = useCallback(() => {
    setShowProfilePinDialog(false);
    setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
    setProfilePinError("");
  }, []);

  const handleChangeProfilePinInput = useCallback((field, value) => {
    const sanitized = String(value || "").replace(/\D/g, "").slice(0, 4);
    setProfilePinInputs((prev) => ({ ...prev, [field]: sanitized }));
    setProfilePinError("");
  }, []);

  const handleCloseProfilePicker = useCallback(() => {
    if (!activePremiumProfileId) return;
    setShowPremiumProfilePicker(false);
  }, [activePremiumProfileId]);

  const handleTogglePremiumSpaceMode = useCallback(() => {
    if (!user || !isPremiumTier || !activePremiumProfileId) return;
    const nextMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_PROFILE
        : PREMIUM_SPACE_MODE_SHARED;
    resetActiveDocumentState();
    setSelectedFolderId("all");
    setSelectedUploadIds([]);
    setPremiumSpaceMode(nextMode);
    setStatus(
      nextMode === PREMIUM_SPACE_MODE_SHARED
        ? "Shared study mode enabled. Study data is now shared across premium members."
        : "Personal study mode enabled. Study data is now private to your profile."
    );
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode, resetActiveDocumentState, user]);

  const handleSelectPremiumProfile = useCallback(
    (profileId, pinInput) => {
      const selected = premiumProfiles.find((profile) => profile.id === profileId);
      if (!selected) {
        return { ok: false, message: "Selected profile was not found." };
      }
      const inputPin = normalizePremiumProfilePinInput(pinInput);
      if (!inputPin) {
        return { ok: false, message: "Please enter a 4-digit PIN." };
      }
      const expectedPin = sanitizePremiumProfilePin(selected.pin);
      if (inputPin !== expectedPin) {
        return { ok: false, message: "Incorrect PIN." };
      }
      resetActiveDocumentState();
      setSelectedFolderId("all");
      setSelectedUploadIds([]);
      setActivePremiumProfileId(selected.id);
      setShowPremiumProfilePicker(false);
      setStatus(`${selected.name} profile selected.`);
      return { ok: true };
    },
    [premiumProfiles, resetActiveDocumentState]
  );

  const handleSubmitProfilePinChange = useCallback(
    (event) => {
      event.preventDefault();
      if (!activePremiumProfileId) {
        setProfilePinError("No active profile selected.");
        return;
      }
      const currentProfile = premiumProfiles.find((profile) => profile.id === activePremiumProfileId);
      if (!currentProfile) {
        setProfilePinError("Selected profile was not found.");
        return;
      }
      const currentPin = normalizePremiumProfilePinInput(profilePinInputs.currentPin);
      const nextPin = normalizePremiumProfilePinInput(profilePinInputs.nextPin);
      const confirmPin = normalizePremiumProfilePinInput(profilePinInputs.confirmPin);

      if (!currentPin || !nextPin || !confirmPin) {
        setProfilePinError("All PIN fields must be 4 digits.");
        return;
      }
      if (currentPin !== sanitizePremiumProfilePin(currentProfile.pin)) {
        setProfilePinError("Current PIN does not match.");
        return;
      }
      if (nextPin !== confirmPin) {
        setProfilePinError("New PIN and confirmation PIN do not match.");
        return;
      }
      if (nextPin === currentPin) {
        setProfilePinError("New PIN must be different from current PIN.");
        return;
      }

      setPremiumProfiles((prev) =>
        prev.map((profile) =>
          profile.id === activePremiumProfileId ? { ...profile, pin: nextPin } : profile
        )
      );
      setShowProfilePinDialog(false);
      setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
      setProfilePinError("");
      setStatus("Profile PIN has been updated.");
    },
    [activePremiumProfileId, premiumProfiles, profilePinInputs]
  );

  const handleCreatePremiumProfile = useCallback(
    (requestedName) => {
      if (!isPremiumTier) return;
      setPremiumProfiles((prev) => {
        if (prev.length >= PREMIUM_PROFILE_LIMIT) return prev;
        const index = prev.length;
        const preset = PREMIUM_PROFILE_PRESETS[index % PREMIUM_PROFILE_PRESETS.length];
        const created = {
          id: createPremiumProfileId(),
          name: sanitizePremiumProfileName(requestedName, `Member ${index + 1}`),
          color: preset.color,
          avatar: preset.avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        };
        return [...prev, created];
      });
    },
    [isPremiumTier]
  );

  useEffect(() => {
    if (!user?.id || !isPremiumTier) {
      setPremiumProfiles([]);
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(false);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      return;
    }
    if (typeof window === "undefined") return;

    const profilesKey = getPremiumProfilesStorageKey(user.id);

    let loadedProfiles = [];
    try {
      const raw = window.localStorage.getItem(profilesKey);
      loadedProfiles = normalizePremiumProfiles(raw ? JSON.parse(raw) : []);
    } catch {
      loadedProfiles = [];
    }

    if (loadedProfiles.length === 0) {
      const ownerName = sanitizePremiumProfileName(
        user?.user_metadata?.name || user?.email?.split("@")?.[0] || "Owner",
        "Owner"
      );
      loadedProfiles = [
        {
          id: createPremiumProfileId(),
          name: ownerName,
          color: PREMIUM_PROFILE_PRESETS[0].color,
          avatar: PREMIUM_PROFILE_PRESETS[0].avatar,
          pin: DEFAULT_PREMIUM_PROFILE_PIN,
        },
      ];
      window.localStorage.setItem(profilesKey, JSON.stringify(loadedProfiles));
    }

    const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
    const storedActiveProfileId = String(window.localStorage.getItem(activeProfileKey) || "").trim();
    const hasStoredActiveProfile = loadedProfiles.some((profile) => profile.id === storedActiveProfileId);
    const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);
    const storedSpaceMode = String(window.localStorage.getItem(spaceModeKey) || "").trim();
    const normalizedSpaceMode =
      storedSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    if (storedSpaceMode && storedSpaceMode !== normalizedSpaceMode) {
      window.localStorage.removeItem(spaceModeKey);
    }

    setPremiumProfiles(loadedProfiles);
    setPremiumSpaceMode(normalizedSpaceMode);
    if (hasStoredActiveProfile) {
      setActivePremiumProfileId(storedActiveProfileId);
      setShowPremiumProfilePicker(false);
    } else {
      if (storedActiveProfileId) {
        window.localStorage.removeItem(activeProfileKey);
      }
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(true);
    }
  }, [isPremiumTier, user]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const normalized = normalizePremiumProfiles(premiumProfiles);
    if (!normalized.length) return;
    window.localStorage.setItem(getPremiumProfilesStorageKey(user.id), JSON.stringify(normalized));
  }, [isPremiumTier, premiumProfiles, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumActiveProfileStorageKey(user.id);
    if (activePremiumProfileId) {
      window.localStorage.setItem(key, activePremiumProfileId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [activePremiumProfileId, isPremiumTier, user?.id]);

  useEffect(() => {
    if (!user?.id || !isPremiumTier || typeof window === "undefined") return;
    const key = getPremiumSpaceModeStorageKey(user.id);
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    window.localStorage.setItem(key, normalizedMode);
  }, [isPremiumTier, premiumSpaceMode, user?.id]);

  useEffect(() => {
    if (user) {
      setShowAuth(false);
    }
  }, [user]);

  useEffect(() => {
    if (!showProfilePinDialog) return undefined;
    const prevOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleCloseProfilePinDialog();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCloseProfilePinDialog, showProfilePinDialog]);

  const loadFolders = useCallback(
    async () => {
      const requestSeq = loadFoldersRequestSeqRef.current + 1;
      loadFoldersRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadFoldersRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      try {
        const list = await listFolders({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((folder) => {
          const decoded = decodePremiumScopeValue(folder?.name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            ...folder,
            name: decoded.value || folder?.name || "",
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((folder) => folder.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setFolders(scoped);
        setSelectedFolderId((prev) => {
          if (prev === "all") return "all";
          const hasFolder = scoped.some((folder) => folder.id?.toString() === prev?.toString());
          return hasFolder ? prev : "all";
        });
      } catch (err) {
        if (!isLatestRequest()) return;
        setError(`Failed to load folders: ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );

  const handleCreateFolder = useCallback(
    async (name) => {
      if (!isFolderFeatureEnabled) {
        setError("Folder feature is available only on Pro or Premium tier.");
        return;
      }
      if (!user) {
        setError("Please sign in first.");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (isPremiumTier && !premiumScopeProfileId) {
        setError("Select a premium profile before creating folders.");
        return;
      }
      if (folders.some((f) => f.name === trimmed)) {
        setStatus("A folder with the same name already exists.");
        return;
      }
      try {
        const storedName =
          isPremiumTier && premiumScopeProfileId
            ? encodePremiumScopeValue(trimmed, premiumScopeProfileId)
            : trimmed;
        const created = await createFolder({ userId: user.id, name: storedName });
        if (created) {
          const decoded = decodePremiumScopeValue(created?.name || trimmed);
          const ownerProfileId = isPremiumTier
            ? decoded.ownerProfileId || premiumOwnerProfileId || premiumScopeProfileId
            : null;
          setFolders((prev) => [
            ...prev,
            {
              ...created,
              name: decoded.value || trimmed,
              ownerProfileId,
            },
          ]);
        }
        setSelectedFolderId("all");
        setSelectedUploadIds([]);
        setStatus("Folder created.");
      } catch (err) {
        setError(`Failed to create folder: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, folders, isPremiumTier, premiumScopeProfileId, premiumOwnerProfileId]
  );

  const handleDeleteFolder = useCallback(
    async (folderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("Please sign in first.");
        return;
      }
      const hasFiles = uploadedFiles.some((u) => u.folderId === folderId);
      if (hasFiles) {
        setError("Move or delete files in this folder before deleting it.");
        return;
      }
      try {
        await deleteFolder({ userId: user.id, folderId });
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }
      } catch (err) {
        setError(`Failed to delete folder: ${err.message}`);
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
        setError("Please sign in first.");
        return;
      }
      const uploadId = upload?.id || null;
      const storagePath = upload?.path || upload?.remotePath || null;
      if (!uploadId && !storagePath) {
        setError("Upload identifier is missing.");
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
        setStatus("Upload deleted.");
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`Failed to delete upload: ${err.message}`);
      }
    },
    [user, uploadedFiles]
  );

  const handleMoveUploadsToFolder = useCallback(
    async (uploadIds, targetFolderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!uploadIds || uploadIds.length === 0) return;
      if (!user) {
        setError("Please sign in first.");
        return;
      }
      const normalizedIds = uploadIds.map((id) => id?.toString()).filter(Boolean);
      const target = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      if (isPremiumTier && target && !folders.some((folder) => folder.id?.toString() === target)) {
        setError("Target folder does not exist in the current premium profile scope.");
        return;
      }
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
          // Local-only items without remote IDs: update folder fields in memory.
          setUploadedFiles((prev) =>
            prev.map((item) =>
              normalizedIds.includes(item.id?.toString())
                ? { ...item, folderId: target, infolder: target ? 1 : 0 }
                : item
            )
          );
        }
        setSelectedUploadIds([]);
        setStatus("Selected uploads moved.");
        // Sync with server to keep list and folder counts in sync with DB.
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`Failed to move uploads: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, uploadedFiles, isPremiumTier, folders]
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
      return "Open a PDF to use tutor chat."
    }
    if (isLoadingText) {
      return "PDF text extraction is still running. Please wait."
    }
    const trimmed = (extractedText || "").trim();
    if (!trimmed) {
      return "No extracted text found from this PDF."
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
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "1") {
      setShowAuth(true);
    }
    if (params.get("pg_token") || params.get("kakaoPay") || params.get("nicePay") || params.get("np_token")) {
      setShowPayment(true);
    }
  }, []);

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
        setMockExamError(`Failed to load mock exams: ${err.message}`);
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
        setError(`Failed to load flashcards: ${err.message}`);
      } finally {
        setIsLoadingFlashcards(false);
      }
    },
    [user]
  );
  const loadUploads = useCallback(
    async () => {
      const requestSeq = loadUploadsRequestSeqRef.current + 1;
      loadUploadsRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadUploadsRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setSelectedUploadIds([]);
        return;
      }
      try {
        const list = await listUploads({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((u) => {
          const decoded = decodePremiumScopeValue(u.file_name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            id: u.id || `${u.storage_path}`,
            file: null,
            name: decoded.value || u.file_name,
            size: u.file_size,
            path: u.storage_path,
            bucket: u.bucket,
            thumbnail: u.thumbnail || null,
            remote: true,
            hash: u.file_hash || null,
            folderId: u.folder_id || null,
            infolder: Number(u.infolder ?? (u.folder_id ? 1 : 0)) || 0,
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((item) => item.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setUploadedFiles(scoped);
        setSelectedUploadIds((prev) =>
          prev.filter((id) => scoped.some((item) => item.id?.toString() === id?.toString()))
        );
      } catch (err) {
        if (!isLatestRequest()) return;
        setError(`Failed to load uploads: ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );
  useEffect(() => {
    loadUploadsRef.current = loadUploads;
  }, [loadUploads]);

  const loadArtifacts = useCallback(
    async (docId) => {
      if (!supabase || !user || !docId) {
        setArtifacts(null);
        return null;
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
          const normalizedQuiz = normalizeQuizPayload(mapped.quiz);
          const cachedSet = {
            id: `quiz-cached-${docId}`,
            questions: normalizedQuiz,
            selectedChoices: {},
            revealedChoices: {},
            shortAnswerInput: {},
            shortAnswerResult: {},
          };
          setQuizSets([cachedSet]);
          quizAutoRequestedRef.current = true;
        }
        if (mapped.ox) {
          setOxItems(mapped.ox?.items || []);
          oxAutoRequestedRef.current = true;
        }
        return mapped;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Failed to load artifacts", err);
        return null;
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
        for (const item of needs) {
          try {
            const ensured = await ensureFileForItemRef.current(item);
            const thumb = ensured.thumbnail || (await generatePdfThumbnail(ensured.file));
            if (!thumb) continue;
            await updateUploadThumbnail({ id: item.id, thumbnail: thumb });
            setUploadedFiles((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, thumbnail: thumb } : p))
            );
          } catch (err) {
            // skip failure
            console.warn("thumbnail backfill failed", err);
          }
        }
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
    setStatus("Signing out...");
    try {
      setShowPremiumProfilePicker(false);
      setShowProfilePinDialog(false);
      setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
      setProfilePinError("");
      setActivePremiumProfileId(null);
      setPremiumProfiles([]);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      await authSignOut();
      await refreshSession();
      setStatus("signed out.");
    } catch (err) {
      setError(`sign out failed: ${err.message}`);
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
    let cancelled = false;
    let idleHandle = null;

    if (user) {
      loadUploads().then(() => {
        if (cancelled) return;
        const current = uploadedFilesRef.current || [];
        const runBackfill = () => {
          if (cancelled) return;
          backfillThumbnails(current);
        };

        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
          idleHandle = window.requestIdleCallback(runBackfill, { timeout: 1500 });
        } else {
          idleHandle = window.setTimeout(runBackfill, 250);
        }
      });
    } else {
      setUploadedFiles([]);
    }

    return () => {
      cancelled = true;
      if (idleHandle == null || typeof window === "undefined") return;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      } else {
        window.clearTimeout(idleHandle);
      }
    };
  }, [user, loadUploads, backfillThumbnails]);

  const ensureFileForItem = useCallback(
    async (item) => {
      if (item.file) return item;
      if (!item.path && !item.remotePath) throw new Error("Missing storage path for this PDF item.");
      const storagePath = item.path || item.remotePath;

      // Reuse downloaded file/blob from memory cache when possible
      const cached = downloadCacheRef.current.get(storagePath);
      if (cached) {
        const enriched = { ...item, ...cached };
        setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
        return enriched;
      }

      const bucket = item.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
      const signed = await getSignedStorageUrl({ bucket, path: storagePath, expiresIn: 60 * 60 * 24 });
      const res = await fetch(signed);
      if (!res.ok) throw new Error("Failed to download PDF from storage.");
      const blob = await res.blob();
      const headerType = String(res.headers.get("content-type") || "").toLowerCase();
      if (headerType.includes("text/html")) {
        throw new Error("Received HTML instead of PDF. The signed URL may be invalid or expired.");
      }
      const name = item.name || item.file?.name || "document.pdf";
      const blobType = String(blob.type || "").toLowerCase();
      const resolvedType =
        blobType.includes("pdf") || name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : blob.type || "application/pdf";
      const fileObj = new File([blob], name, { type: resolvedType });
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
  };

  const processSelectedFile = useCallback(
    async (item, { pushState = true } = {}) => {
      if (!item) return;
      let resolvedItem = item;
      if (!resolvedItem.file) {
        try {
          resolvedItem = await ensureFileForItem(resolvedItem);
        } catch (err) {
          setError(`Failed to load PDF file: ${err.message}`);
          return;
        }
      }
      if (!resolvedItem?.file) return;

      const targetFile = normalizePdfFile(resolvedItem.file);
      if (!(targetFile instanceof File)) return;
      const nextDocId = resolvedItem.id;

      if (targetFile !== resolvedItem.file && nextDocId) {
        setUploadedFiles((prev) =>
          prev.map((entry) => (entry.id === nextDocId ? { ...entry, file: targetFile } : entry))
        );
      }

      if (selectedFileId && selectedFileId !== nextDocId) {
        savePageProgressSnapshot({
          docId: selectedFileId,
          visited: Array.from(visitedPages),
          page: currentPage,
        });
      }
      const restoredPageProgress = loadPageProgressSnapshot({ docId: nextDocId });

      if (pushState && selectedFileId !== nextDocId) {
        window.history.pushState({ view: "detail", fileId: nextDocId }, "", window.location.pathname);
      }

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(URL.createObjectURL(targetFile));
      setFile(targetFile);
      setSelectedFileId(nextDocId);
      setPanelTab("summary");
      resetQuizState();
      summaryRequestedRef.current = false;
      quizAutoRequestedRef.current = false;
      setError("");
      setSummary("");
      setArtifacts(null);
      const extractStart =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      setStatus("Extracting PDF text and preview...");
      setIsLoadingText(true);
      setThumbnailUrl(null);
        setMockExams([]);
        setMockExamStatus("");
        setMockExamError("");
        setActiveMockExamId(null);
        setShowMockExamAnswers(false);
      setFlashcards([]);
      setCurrentPage(restoredPageProgress.currentPage);
      setVisitedPages(new Set(restoredPageProgress.visitedPages));
      setFlashcardStatus("");
      setFlashcardError("");
      setIsGeneratingFlashcards(false);
      setTutorMessages([]);
      setTutorError("");
      setIsTutorLoading(false);
      setIsPageSummaryOpen(false);
      setPageSummaryInput("");
      setPageSummaryError("");
      setIsPageSummaryLoading(false);
      setIsChapterRangeOpen(false);
      setChapterRangeInput("");
      setChapterRangeError("");
      oxAutoRequestedRef.current = false;

      try {
        const [textResult, thumb] = await Promise.all([
          extractPdfText(targetFile, 30, 12000, {
            useOcr: true,
            ocrLang: "kor+eng",
            onOcrProgress: (message) => setStatus(message),
          }),
          generatePdfThumbnail(targetFile),
        ]);
        const { text, pagesUsed, totalPages } = textResult;
        setExtractedText(text);
        setPreviewText(text);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        const extractEnd =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const elapsedSeconds = Math.max(0, (extractEnd - extractStart) / 1000);
        setStatus(`extraction complete: ${pagesUsed}/${totalPages} pages, ${elapsedSeconds.toFixed(1)}s`);
        setError("");
        const [, , loaded] = await Promise.all([
          loadMockExams(nextDocId),
          loadFlashcards(nextDocId),
          loadArtifacts(nextDocId),
        ]);
        if (loaded?.summary) {
          setStatus("Saved summary loaded.");
        }
      } catch (err) {
        setError(`Failed to process PDF: ${err.message}`);
        setExtractedText("");
        setPreviewText("");
        setPageInfo({ used: 0, total: 0 });
      } finally {
        setIsLoadingText(false);
      }
    },
    [
      currentPage,
      ensureFileForItem,
      loadArtifacts,
      loadFlashcards,
      loadMockExams,
      loadPageProgressSnapshot,
      normalizePdfFile,
      pdfUrl,
      savePageProgressSnapshot,
      selectedFileId,
      visitedPages,
    ]
  );

  const handleFileChange = useCallback(
    async (event, targetFolderId = null) => {
      if (!user) {
        openAuth();
        return;
      }
      const fileInput = event.target;
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      const activeFolderId = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      const activeProfileScopeId = isPremiumTier ? premiumScopeProfileId : null;
      if (isPremiumTier && !activeProfileScopeId) {
        setError("Select a premium profile before uploading files.");
        fileInput.value = "";
        return;
      }

      const invalidTypeFile = files.find((f) => {
        const fileType = String(f?.type || "").toLowerCase();
        const fileName = String(f?.name || "").toLowerCase();
        return fileType !== "application/pdf" && !fileName.endsWith(".pdf");
      });
      if (invalidTypeFile) {
        setError(`Only PDF files are allowed. (${invalidTypeFile.name})`);
        fileInput.value = "";
        return;
      }

      const oversizedFile = files.find((f) => f.size > limits.maxPdfSizeBytes);
      if (oversizedFile) {
        setError(
          `${getTierLabel(tier)} tier allows up to ${formatSizeMB(limits.maxPdfSizeBytes)} per PDF. (${oversizedFile.name}: ${formatSizeMB(oversizedFile.size)})`
        );
        fileInput.value = "";
        return;
      }
      const nextCount = uploadedFiles.length + files.length;
      if (limits.maxUploads !== Infinity && nextCount > limits.maxUploads) {
        setError(`Upload limit exceeded. Maximum allowed files: ${limits.maxUploads}.`);
        fileInput.value = "";
        return;
      }

      const existingByHash = new Map();
      uploadedFiles.forEach((item) => {
        if (!item?.hash) return;
        if (!item.remotePath && !item.path) return;
        existingByHash.set(item.hash, item);
      });

      const withThumbs = await Promise.all(
        files.map(async (rawFile) => {
          const f = normalizePdfFile(rawFile);
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
            ownerProfileId: activeProfileScopeId,
          };
        })
      );

      const withUploads = await Promise.all(
        withThumbs.map(async (item) => {
          if (!supabase || !user) return item;

          // Reuse existing remote upload by hash to avoid duplicate storage writes.
          const existing = item.hash ? existingByHash.get(item.hash) : null;
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
                ownerProfileId: existing.ownerProfileId || activeProfileScopeId || null,
              };
            }

            const uploaded = await uploadPdfToStorage(user.id, item.file);
            const storedFileName =
              isPremiumTier && activeProfileScopeId
                ? encodePremiumScopeValue(item.name, activeProfileScopeId)
                : item.name;
            const record = await saveUploadMetadata({
              userId: user.id,
              fileName: storedFileName,
              fileSize: item.size,
              storagePath: uploaded.path,
              bucket: uploaded.bucket,
              thumbnail: item.thumbnail,
              fileHash: item.hash,
              folderId: activeFolderId,
            });
            const decodedRecordName = decodePremiumScopeValue(record.file_name || storedFileName);
            const ownerProfileId = isPremiumTier
              ? decodedRecordName.ownerProfileId || activeProfileScopeId || premiumOwnerProfileId || null
              : null;
            return {
              ...item,
              id: record.id || item.id,
              remotePath: uploaded.path,
              remoteUrl: uploaded.signedUrl,
              bucket: uploaded.bucket,
              name: decodedRecordName.value || item.name,
              thumbnail: record.thumbnail || item.thumbnail,
              hash: record.file_hash || item.hash,
              folderId: record.folder_id || activeFolderId || null,
              infolder: Number(record.infolder ?? (record.folder_id || activeFolderId ? 1 : 0)),
              ownerProfileId,
            };
          } catch (err) {
            setError(`Failed to upload file: ${err.message}`);
            return { ...item, uploadError: err.message };
          }
        })
      );

      setUploadedFiles((prev) => {
        const merged = [...prev, ...withUploads];
        return merged;
      });
      fileInput.value = "";
      const firstReadyUpload = withUploads.find((item) => item?.file && !item?.uploadError);
      if (firstReadyUpload) {
        await processSelectedFile(firstReadyUpload);
      } else {
        setStatus("Upload finished, but no selectable file was ready.");
      }
    },
    [
      user,
      openAuth,
      uploadedFiles,
      limits,
      supabase,
      computeFileHash,
      normalizePdfFile,
      isPremiumTier,
      premiumScopeProfileId,
      premiumOwnerProfileId,
      tier,
      processSelectedFile,
    ]
  );

  const showDetail = Boolean(file && selectedFileId);
  const shouldShowPremiumProfilePicker = Boolean(
    user && isPremiumTier && !loadingTier && showPremiumProfilePicker
  );

  const goBackToList = useCallback(() => {
    if (selectedFileId) {
      savePageProgressSnapshot({
        docId: selectedFileId,
        visited: Array.from(visitedPages),
        page: currentPage,
      });
    }
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
    setCurrentPage(1);
    setVisitedPages(new Set());
    setFlashcardStatus("");
    setFlashcardError("");
    setIsGeneratingFlashcards(false);
    setTutorMessages([]);
    setTutorError("");
    setIsTutorLoading(false);
    setIsPageSummaryOpen(false);
    setPageSummaryInput("");
    setPageSummaryError("");
    setIsPageSummaryLoading(false);
    setIsChapterRangeOpen(false);
    setChapterRangeInput("");
    setChapterRangeError("");
    setOxItems(null);
    setOxSelections({});
    setPanelTab("summary");
    summaryRequestedRef.current = false;
    quizAutoRequestedRef.current = false;
    oxAutoRequestedRef.current = false;
    setArtifacts(null);
    resetQuizState();
    setStatus("Back to upload list.");
    setSelectedUploadIds([]);
  }, [currentPage, pdfUrl, savePageProgressSnapshot, selectedFileId, visitedPages]);

  const uploadedFilesRef = useRef(uploadedFiles);
  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);
  const ensureFileForItemRef = useRef(ensureFileForItem);

  const handleSelectFile = useCallback(
    async (item) => {
      try {
        const ensured = await ensureFileForItemRef.current(item);
        await processSelectedFileRef.current(ensured);
      } catch (err) {
        setError(`Failed to open selected file: ${err.message}`);
      }
    },
    [ensureFileForItemRef, processSelectedFileRef]
  );


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
    [artifacts, selectedFileId, user]
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

  const stopSplitDragging = useCallback(() => {
    if (!isDraggingRef.current && !isResizingSplit) return;
    const pointerId = activeDragPointerIdRef.current;
    const dragHandle = dragHandleElementRef.current;
    if (
      dragHandle &&
      typeof dragHandle.releasePointerCapture === "function" &&
      typeof pointerId === "number"
    ) {
      try {
        if (typeof dragHandle.hasPointerCapture !== "function" || dragHandle.hasPointerCapture(pointerId)) {
          dragHandle.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore capture release failures.
      }
    }
    activeDragPointerIdRef.current = null;
    dragHandleElementRef.current = null;
    isDraggingRef.current = false;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setIsResizingSplit(false);
  }, [isResizingSplit]);

  useEffect(() => {
    const applySplitPercent = (clientX) => {
      const container = detailContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width) return;
      const percent = ((clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(75, Math.max(25, percent));
      setSplitPercent(clamped);
    };

    const handlePointerMove = (event) => {
      if (!isDraggingRef.current) return;
      if (typeof event.buttons === "number" && event.buttons === 0) {
        stopSplitDragging();
        return;
      }
      applySplitPercent(event.clientX);
    };

    const handleMouseMove = (event) => {
      if (!isDraggingRef.current) return;
      if (typeof event.buttons === "number" && event.buttons === 0) {
        stopSplitDragging();
        return;
      }
      applySplitPercent(event.clientX);
    };

    const handleDragEnd = () => {
      if (!isDraggingRef.current && !isResizingSplit) return;
      stopSplitDragging();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleDragEnd();
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handleDragEnd);
    window.addEventListener("pointercancel", handleDragEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("blur", handleDragEnd);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handleDragEnd);
      window.removeEventListener("pointercancel", handleDragEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("blur", handleDragEnd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isResizingSplit, stopSplitDragging]);

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

  const handleDragStart = useCallback((event) => {
    if (typeof event?.button === "number" && event.button !== 0) return;
    event?.preventDefault?.();
    isDraggingRef.current = true;
    if (typeof event?.pointerId === "number") {
      activeDragPointerIdRef.current = event.pointerId;
      dragHandleElementRef.current = event.currentTarget || null;
      const handleElement = dragHandleElementRef.current;
      if (handleElement && typeof handleElement.setPointerCapture === "function") {
        try {
          handleElement.setPointerCapture(event.pointerId);
        } catch {
          // Ignore capture setup failures.
        }
      }
    } else {
      activeDragPointerIdRef.current = null;
      dragHandleElementRef.current = null;
    }
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    setIsResizingSplit(true);
  }, []);

  useEffect(() => {
    if (!selectedFileId) return;
    savePageProgressSnapshot({
      docId: selectedFileId,
      visited: Array.from(visitedPages),
      page: currentPage,
    });
  }, [currentPage, savePageProgressSnapshot, selectedFileId, visitedPages]);

  const splitStyle = {
    flexBasis: `${splitPercent}%`,
    flexShrink: 0,
    minWidth: "25%",
    maxWidth: "75%",
  };

  const requestQuestions = async ({ force = false } = {}) => {
    if (isLoadingQuiz && !force) return;
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (isFreeTier && quizSets.length > 0) {
      setError("Free tier can generate only one quiz set.");
      return;
    }
    if (!force && hasReached("maxQuiz")) {
      setError("Quiz generation limit reached for your tier.");
      return;
    }

    if (!extractedText) {
      setError("No extracted text found. Please run PDF extraction first.");
      return;
    }

    setIsLoadingQuiz(true);
    setError("");
    setStatus("Generating quiz set...");

    try {
      const { generateQuiz } = await getOpenAiService();
      const quiz = normalizeQuizPayload(
        await generateQuiz(extractedText, {
          multipleChoiceCount: quizMix.multipleChoice,
          shortAnswerCount: quizMix.shortAnswer,
        })
      );
      const trimmedQuiz = {
        multipleChoice: quiz.multipleChoice.slice(0, quizMix.multipleChoice),
        shortAnswer: quiz.shortAnswer.slice(0, quizMix.shortAnswer),
      };
      const newSet = {
        id: `quiz-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        questions: trimmedQuiz,
        selectedChoices: {},
        revealedChoices: {},
        shortAnswerInput: {},
        shortAnswerResult: {},
      };
      setQuizSets((prev) => [...prev, newSet]);
      setStatus("Quiz set generated.");
      setUsageCounts((prev) => ({ ...prev, quiz: prev.quiz + 1 }));
      persistArtifacts({ quiz: trimmedQuiz });
    } catch (err) {
      setError(`Failed to generate quiz set: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const regenerateQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (isFreeTier) {
      setError("Free tier cannot regenerate quiz sets.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("Quiz generation limit reached for your tier.");
      return;
    }
    if (!extractedText) {
      setError("No extracted text found. Please run PDF extraction first.");
      return;
    }
    quizAutoRequestedRef.current = true;
    resetQuizState();
    setStatus("Resetting quiz set and regenerating...");
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

  const handleShortAnswerChange = (setId, idx, value) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? { ...set, shortAnswerInput: { ...set.shortAnswerInput, [idx]: value } }
          : set
      )
    );
  };

  const handleShortAnswerCheck = (setId, idx) => {
    setQuizSets((prev) =>
      prev.map((set) => {
        const shortAnswers = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
        const target = shortAnswers[idx];
        if (set.id !== setId || !target?.answer) return set;
        const user = String(set.shortAnswerInput?.[idx] || "").trim().toLowerCase();
        const answer = String(target.answer).trim().toLowerCase();
        const normalizedUser = user.replace(/\s+/g, "");
        const normalizedAnswer = answer.replace(/\s+/g, "");
        const isCorrect = normalizedUser === normalizedAnswer;
        return {
          ...set,
          shortAnswerResult: {
            ...set.shortAnswerResult,
            [idx]: { isCorrect, answer: target.answer },
          },
        };
      })
    );
  };

  const buildAdaptiveChapterSummaryRanges = (chapters) => {
    const list = Array.isArray(chapters) ? chapters : [];
    const expanded = [];

    for (const chapter of list) {
      const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
      const normalizedChapterNumber =
        Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : expanded.length + 1;
      const start = Number.parseInt(chapter?.pageStart, 10);
      const end = Number.parseInt(chapter?.pageEnd, 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0 || start > end) {
        continue;
      }

      // Interpret the user formula as chunk-count first, then derive pages-per-chunk.
      // This keeps short ranges like 5-9 as a single chunk instead of 1-page chunks.
      const totalPages = end - start + 1;
      const chunkCount = Math.max(1, Math.round(Math.abs(end - start) / 10));
      const pagesPerChunk = Math.max(1, Math.ceil(totalPages / chunkCount));
      const rangeIdBase = String(chapter?.id || `chapter-${normalizedChapterNumber}`);
      let sectionIndex = 1;

      for (let pageStart = start; pageStart <= end; pageStart += pagesPerChunk) {
        const pageEnd = Math.min(end, pageStart + pagesPerChunk - 1);
        expanded.push({
          id: `${rangeIdBase}-part-${sectionIndex}`,
          chapterNumber: normalizedChapterNumber,
          chapterTitle: `Chapter ${normalizedChapterNumber} (${pageStart}-${pageEnd}p)`,
          pagesPerChunk,
          pageStart,
          pageEnd,
        });
        sectionIndex += 1;
      }
    }

    return expanded;
  };

  const requestSummary = async ({ force = false } = {}) => {
    if (isLoadingSummary || (!force && summaryRequestedRef.current)) return;
    const hasManualChapterConfig = Boolean(String(chapterRangeInput || "").trim());
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (isFreeTier && summary) {
      setError("Free tier can generate only one summary.");
      return;
    }
    if (hasReached("maxSummary")) {
      setError("Summary generation limit reached for your tier.");
      return;
    }
    if (!extractedText && !hasManualChapterConfig) {
      setError("No extracted text found. Enter chapter ranges or run PDF extraction first.");
      return;
    }

    summaryRequestedRef.current = true;
    setIsLoadingSummary(true);
    setError("");
    setChapterRangeError("");
    setStatus("Generating summary...");
    try {
      const chapterConfigRaw = String(chapterRangeInput || "").trim();
      let customChapterSections = null;
      if (chapterConfigRaw) {
        const totalPages = pageInfo.total || pageInfo.used || 0;
        const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
        if (parsedChapters.error) {
          setChapterRangeError(parsedChapters.error);
          throw new Error(parsedChapters.error);
        }
        const adaptiveChapterRanges = buildAdaptiveChapterSummaryRanges(parsedChapters.chapters);
        if (!adaptiveChapterRanges.length) {
          throw new Error("No valid chapter ranges remain after adaptive splitting.");
        }
        const pagesPerChunkById = new Map(
          adaptiveChapterRanges.map((range) => [String(range.id), Number(range.pagesPerChunk) || 1])
        );
        setStatus("Extracting text for configured chapter ranges...");
        const chapterExtraction = await extractPdfTextByRanges(file, adaptiveChapterRanges, {
          maxLengthPerRange: 14000,
          useOcr: true,
          ocrLang: "kor+eng",
          onOcrProgress: (message) => setStatus(message),
        });
        customChapterSections = (chapterExtraction?.chapters || [])
          .map((chapter) => ({
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.chapterTitle,
            pageStart: chapter.pageStart,
            pageEnd: chapter.pageEnd,
            pagePerChunk:
              pagesPerChunkById.get(String(chapter.id)) ||
              Math.max(1, (Number(chapter.pageEnd) || 0) - (Number(chapter.pageStart) || 0) + 1),
            text: chapter.text || "",
          }))
          .filter((chapter) => String(chapter.text || "").trim().length > 0);
        if (!customChapterSections.length) {
          throw new Error("No text extracted from configured chapter ranges.");
        }
      }

      let summarySourceText = extractedText;
      if (!customChapterSections) {
        const summaryCacheKey = selectedFileId || file?.name || null;
        const cachedSummaryText = summaryCacheKey
          ? summaryContextCacheRef.current.get(summaryCacheKey)
          : null;

        if (typeof cachedSummaryText === "string" && cachedSummaryText.length > summarySourceText.length) {
          summarySourceText = cachedSummaryText;
        } else if (file && summaryCacheKey) {
          try {
            setStatus("Extending extraction scope for better summary quality...");
            const extended = await extractPdfText(file, 80, 50000, { useOcr: false });
            const extendedText = String(extended?.text || "").trim();
            if (extendedText.length > summarySourceText.length) {
              summarySourceText = extendedText;
              summaryContextCacheRef.current.set(summaryCacheKey, extendedText);
            }
          } catch {
            // fallback to already extracted text
          }
        }
      }

      setStatus("Summarizing content with AI...");
      const { generateSummary } = await getOpenAiService();
      const summarized = customChapterSections
        ? await generateSummary("", {
            scope: "custom chapter range",
            chapterized: true,
            chapterSections: customChapterSections,
          })
        : await generateSummary(summarySourceText);
      setSummary(summarized);
      setUsageCounts((prev) => ({ ...prev, summary: prev.summary + 1 }));
      setStatus("selected page summary created.");
      persistArtifacts({ summary: summarized });
    } catch (err) {
      setError(`selected page summary failed: ${err.message}`);
      setStatus("");
      summaryRequestedRef.current = false;
      setStatus("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const regenerateSummary = async () => {
    if (isLoadingSummary) return;
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (isFreeTier) {
      setError("Free tier cannot regenerate summaries.");
      return;
    }
    if (hasReached("maxSummary")) {
      setError("Summary generation limit reached for your tier.");
      return;
    }
    if (!extractedText) {
      setError("No extracted text found. Please run PDF extraction first.");
      return;
    }
    summaryRequestedRef.current = false;
    setSummary("");
    setStatus("Resetting summary and regenerating...");
    setError("");
    await persistArtifacts({ summary: null, highlights: null });
    await requestSummary({ force: true });
  };

  const handleAutoDetectChapterRanges = useCallback(async () => {
    if (isDetectingChapterRanges || isLoadingSummary || isLoadingText) return;
    if (!file) {
      setChapterRangeError("Open a PDF first.");
      return;
    }

    setIsDetectingChapterRanges(true);
    setChapterRangeError("");
    setError("");
    setStatus("목차에서 챕터 범위를 자동 추출 중...");
    try {
      const totalPages = Number(pageInfo.total || pageInfo.used || 0);
      const detected = await extractChapterRangesFromToc(file, {
        maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
      });
      const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
      if (chapters.length < 2) {
        throw new Error(
          detected?.error ||
            "목차에서 챕터 범위를 찾지 못했습니다. 수동 입력(예: 1:1-12)으로 설정해주세요."
        );
      }

      const chapterInput = chapters
        .map((chapter, index) => {
          const start = Number.parseInt(chapter?.pageStart, 10);
          const end = Number.parseInt(chapter?.pageEnd, 10);
          if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return "";
          return `${index + 1}:${start}-${end}`;
        })
        .filter(Boolean)
        .join("\n");

      if (!chapterInput) {
        throw new Error("목차 추출 결과가 비어 있습니다.");
      }

      const limit = totalPages || Number(detected?.totalPages) || 0;
      const parsed = parseChapterRangeSelectionInput(chapterInput, limit);
      if (parsed.error) throw new Error(parsed.error);

      setChapterRangeInput(chapterInput);
      setChapterRangeError("");
      const sourceLabel =
        detected?.source === "outline" ? "PDF 개요(북마크)" : "앞쪽 목차 페이지";
      setStatus(`${sourceLabel}에서 챕터 범위 ${parsed.chapters.length}개를 자동 설정했습니다.`);
      setIsChapterRangeOpen(true);
    } catch (err) {
      setChapterRangeError(err?.message || "목차 자동 추출에 실패했습니다.");
      setStatus("");
    } finally {
      setIsDetectingChapterRanges(false);
    }
  }, [
    file,
    isDetectingChapterRanges,
    isLoadingSummary,
    isLoadingText,
    pageInfo.total,
    pageInfo.used,
  ]);

  const handleConfirmChapterRanges = useCallback(() => {
    const raw = String(chapterRangeInput || "").trim();
    if (!raw) {
      setChapterRangeError("Enter chapter ranges first.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    const parsed = parseChapterRangeSelectionInput(raw, totalPages);
    if (parsed.error) {
      setChapterRangeError(parsed.error);
      return;
    }
    setChapterRangeError("");
    setStatus(`Chapter ranges saved (${parsed.chapters.length} sections).`);
    setIsChapterRangeOpen(false);
  }, [
    chapterRangeInput,
    pageInfo.total,
    pageInfo.used,
  ]);

  const handleSummaryByPages = useCallback(async () => {
    if (isPageSummaryLoading || isLoadingSummary) return;
    if (!file || !selectedFileId) {
      setPageSummaryError("Open a PDF first.");
      return;
    }
    if (isFreeTier && summary) {
      setPageSummaryError("Free tier can generate only one summary.");
      return;
    }
    if (hasReached("maxSummary")) {
      setPageSummaryError("Summary generation limit reached for your tier.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    if (!totalPages) {
      setPageSummaryError("Total page count is unavailable. Please reload the PDF.");
      return;
    }
    const parsed = parsePageSelectionInput(pageSummaryInput, totalPages);
    if (parsed.error) {
      setPageSummaryError(parsed.error);
      return;
    }

    setPageSummaryError("");
    setError("");
    setStatus("Generating summary for selected pages...");
    setIsPageSummaryLoading(true);
    summaryRequestedRef.current = true;
    try {
      const extracted = await extractPdfTextFromPages(file, parsed.pages, 12000, {
        useOcr: true,
        ocrLang: "kor+eng",
        onOcrProgress: (message) => setStatus(message),
      });
      if (!extracted?.text) {
        const suffix = extracted?.ocrUsed ? " OCR was attempted but no readable text was found." : "";
        throw new Error(`No text extracted from selected pages.${suffix}`);
      }
      if (extracted?.ocrUsed) {
        setStatus("OCR complete. Generating summary...");
      }
      setStatus("Generating selected-page summary...");
      const { generateSummary } = await getOpenAiService();
      const summarized = await generateSummary(extracted.text, {
            scope: "selected pages",
        chapterized: false,
      });
      setSummary(summarized);
      setUsageCounts((prev) => ({ ...prev, summary: prev.summary + 1 }));
      setStatus("selected page summary created.");
      persistArtifacts({ summary: summarized });
    } catch (err) {
      setError(`selected page summary failed: ${err.message}`);
      setStatus("");
      summaryRequestedRef.current = false;
    } finally {
      setIsPageSummaryLoading(false);
    }
  }, [
    file,
    getOpenAiService,
    hasReached,
    isFreeTier,
    isLoadingSummary,
    isPageSummaryLoading,
    pageInfo.total,
    pageInfo.used,
    pageSummaryInput,
    persistArtifacts,
    selectedFileId,
    summary,
  ]);

  const handleExportSummaryPdf = useCallback(async () => {
    if (isExportingSummary) return;
    if (!summary) {
      setError("No summary to export. Generate a summary first.");
      return;
    }
    if (!summaryRef.current) {
      setError("Summary container is missing, cannot export PDF.");
      return;
    }
    setIsExportingSummary(true);
    setError("");
    const baseName = (file?.name || "summary").replace(/\.[^/.]+$/, "");
    try {
      const target = summaryRef.current;
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      });
      await exportPagedElementToPdf(target, {
        filename: `${baseName}-summary.pdf`,
        margin: 0,
        pageSelector: ".summary-export-page",
        background: "#0f172a",
      });
      setStatus("summary PDF export complete.");
    } catch (err) {
      setError(`summary PDF export failed: ${err.message}`);
      setStatus("");
    } finally {
      setIsExportingSummary(false);
    }
  }, [summary, file, isExportingSummary]);

  const requestOxQuiz = async ({ auto = false, force = false } = {}) => {
    if (isLoadingOx && !force) return;
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (!force && hasReached("maxOx")) {
      setError("O/X generation limit reached for your tier.");
      return;
    }
    if (!extractedText) {
      setError("No extracted text found. Please run PDF extraction first.");
      return;
    }
    if (auto) oxAutoRequestedRef.current = true;
    setIsLoadingOx(true);
    setError("");
    setStatus("Generating O/X questions...");
    try {
      const { generateOxQuiz } = await getOpenAiService();
      const ox = await generateOxQuiz(extractedText);
      const items = Array.isArray(ox?.items) ? ox.items : [];

      if (ox?.debug || items.length === 0) {
        setOxItems([]);
        setStatus("");
        setError("O/X generation returned no valid items.");
        if (ox?.fallback && import.meta.env.DEV) {
          // Keep fallback payload visible in dev tools for debugging.
          // eslint-disable-next-line no-console
          console.debug("O/X fallback", ox.fallback);
        }
        return;
      }

      setOxItems(items);
      setOxSelections({});
      setOxExplanationOpen({});
      setStatus("O/X questions generated.");
      setUsageCounts((prev) => ({ ...prev, ox: prev.ox + 1 }));
      persistArtifacts({ ox });
    } catch (err) {
      setError(`Failed to generate O/X questions: ${err.message}`);
    } finally {
      setIsLoadingOx(false);
    }
  };

  const regenerateOxQuiz = async () => {
    if (isLoadingOx) return;
    if (!file) {
      setError("Open a PDF first.");
      return;
    }
    if (hasReached("maxOx")) {
      setError("O/X generation limit reached for your tier.");
      return;
    }
    if (!extractedText) {
      setError("No extracted text found. Please run PDF extraction first.");
      return;
    }
    oxAutoRequestedRef.current = true;
    setOxItems(null);
      setOxSelections({});
    setStatus("Resetting O/X and regenerating...");
    setError("");
    await persistArtifacts({ ox: null });
    await requestOxQuiz({ auto: false, force: true });
  };

  const handleAddFlashcard = useCallback(
    async (front, back, hint) => {
      if (!user) {
        setFlashcardError("Please sign in first.");
        return;
      }
      const deckId = selectedFileId || "default";
      setFlashcardError("");
      setFlashcardStatus("Saving flashcard...");
      try {
        const saved = await addFlashcard({
          userId: user.id,
          deckId,
          front,
          back,
          hint,
        });
        setFlashcards((prev) => [saved, ...prev]);
        setFlashcardStatus("flashcard saved.");
      } catch (err) {
        setFlashcardError(`flashcard save failed: ${err.message}`);
        setFlashcardStatus("");
      }
    },
    [user, selectedFileId]
  );

  const handleDeleteFlashcard = useCallback(
    async (cardId) => {
      if (!user) {
        setFlashcardError("Please sign in first.");
        return;
      }
      setFlashcardError("");
      try {
        await deleteFlashcard({ userId: user.id, cardId });
        setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        setFlashcardStatus("flashcard deleted.");
      } catch (err) {
        setFlashcardError(`flashcard delete failed: ${err.message}`);
      }
    },
    [user]
  );

  const handleGenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    if (!user) {
      setFlashcardError("Please sign in first.");
      return;
    }
    if (!file || !selectedFileId) {
      setFlashcardError("Open a PDF first.");
      return;
    }
    if (isLoadingText) {
      setFlashcardError("PDF text extraction is still running. Please wait.");
      return;
    }
    const trimmedText = (extractedText || "").trim();
    if (trimmedText.length < 80) {
      setFlashcardError("Not enough extracted text to generate flashcards.");
      return;
    }

    setFlashcardError("");
    setFlashcardStatus("Generating AI flashcards...");
    setIsGeneratingFlashcards(true);
    try {
      const { generateFlashcards } = await getOpenAiService();
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
        throw new Error("No valid flashcards could be generated from the content.");
      }
      const deckId = selectedFileId || "default";
      const saved = await addFlashcards({ userId: user.id, deckId, cards: cleaned });
      if (!saved.length) {
        throw new Error("Failed to save generated flashcards.");
      }
      setFlashcards((prev) => [...saved, ...prev]);
      setFlashcardStatus(`Generated ${saved.length} AI flashcards.`);
    } catch (err) {
      setFlashcardError(`Failed to generate AI flashcards: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
    }, [isGeneratingFlashcards, user, file, selectedFileId, isLoadingText, extractedText, getOpenAiService]);

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
        setTutorError("Open a PDF first.");
        return;
      }
      if (isLoadingText) {
        setTutorError("PDF text extraction is still running. Please wait.");
        return;
      }
      const docText = (extractedText || "").trim();
      if (!docText) {
        setTutorError("No extracted text found from this PDF.");
        return;
      }

      setTutorError("");
      const history = tutorMessages.slice(-12);
      const userMessage = { role: "user", content: trimmed };
      setTutorMessages((prev) => [...prev, userMessage]);
      setIsTutorLoading(true);
      try {
        const { generateTutorReply } = await getOpenAiService();
        const reply = await generateTutorReply({
          question: trimmed,
          extractedText: docText,
          messages: history,
        });
        setTutorMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (err) {
        setTutorError(`Failed to generate AI tutor reply: ${err.message}`);
      } finally {
        setIsTutorLoading(false);
      }
    },
    [extractedText, file, getOpenAiService, isLoadingText, isTutorLoading, selectedFileId, tutorMessages]
  );

  const handleCreateMockExam = useCallback(async () => {
    if (isGeneratingMockExam) return;
    if (!user) {
      setMockExamError("Please sign in first.");
      return;
    }
    if (!file || !selectedFileId) {
      setMockExamError("Open a PDF first.");
      return;
    }
    if (isLoadingText) {
      setMockExamError("PDF text extraction is still running. Please wait.");
      return;
    }

    const oxPool = Array.isArray(oxItems) ? oxItems : [];
    if (oxPool.length < 3) {
      setMockExamError("At least 3 O/X items are required to build a mock exam.");
      return;
    }

    const quizPool = [];
    quizSets.forEach((set) => {
      const multipleChoice = set.questions?.multipleChoice || [];
      const shortAnswers = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
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
      shortAnswers.forEach((item) => {
        const prompt = String(item?.question || "").trim();
        if (!prompt) return;
        quizPool.push({
          type: "quiz-short",
          prompt,
          answer: String(item?.answer || "").trim(),
          explanation: String(item?.explanation || "").trim(),
        });
      });
    });

    if (quizPool.length < 4) {
      setMockExamError("At least 4 quiz items are required to build a mock exam.");
      return;
    }

    const trimmedText = (extractedText || "").trim();
    if (trimmedText.length < 80) {
      setMockExamError("Not enough extracted text to generate a mock exam.");
      return;
    }

    setMockExamStatus("Generating mock exam...");
    setMockExamError("");
    setIsGeneratingMockExam(true);

    try {
      const pickedOx = pickRandomItems(oxPool, 3);
      const pickedQuiz = pickRandomItems(quizPool, 4);
      const hardCount = Math.max(3, 10 - (pickedOx.length + pickedQuiz.length));
      const { generateHardQuiz } = await getOpenAiService();
      const hardResult = await generateHardQuiz(trimmedText, { count: hardCount });
      const hardItems = Array.isArray(hardResult?.items) ? hardResult.items.slice(0, hardCount) : [];

      if (hardItems.length < hardCount) {
        throw new Error("Failed to generate enough hard questions.");
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
        throw new Error("Mock exam generation requires exactly 10 questions.");
      }

      const now = new Date();
      const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      const nextIndex = mockExams.length + 1;
      const title = `${dateStamp} mock exam ${nextIndex}`;
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
      setMockExamStatus("mock exam saved.");
    } catch (err) {
      setMockExamError(`mock exam generation failed: ${err.message}`);
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
    mockExams.length,
    quizSets,
    selectedFileId,
    getOpenAiService,
    user,
  ]);

  const handleDeleteMockExam = useCallback(
    async (examId) => {
      if (!user) {
        setMockExamError("Please sign in first.");
        return;
      }
      try {
        await deleteMockExam({ userId: user.id, examId });
        setMockExams((prev) => prev.filter((item) => item.id !== examId));
        if (activeMockExamId === examId) {
          setActiveMockExamId(null);
        }
        setMockExamStatus("Mock exam deleted.");
      } catch (err) {
        setMockExamError(`Failed to delete mock exam: ${err.message}`);
      }
    },
    [activeMockExamId, user]
  );

  const handleExportMockExam = useCallback(
    async (exam) => {
      if (!exam) {
        setMockExamError("No mock exam selected for export.");
        return;
      }
      if (!mockExamPrintRef.current) {
        setMockExamError("Mock exam print container is missing.");
        return;
      }
      setMockExamError("");
      try {
        const safeTitle = (exam.title || "mock-exam").replace(/[^\w-]+/g, "-");
        await exportPagedElementToPdf(mockExamPrintRef.current, {
          filename: `${safeTitle}.pdf`,
          margin: 0,
          pageSelector: ".mock-exam-page",
        });
      } catch (err) {
        setMockExamError(`PDF export failed: ${err.message}`);
      }
    },
    [mockExamPrintRef]
  );

  const activeMockExam = useMemo(() => {
    if (!mockExams.length) return null;
    if (activeMockExamId) {
      return mockExams.find((exam) => exam.id === activeMockExamId) || mockExams[0];
    }
    return mockExams[0];
  }, [activeMockExamId, mockExams]);
  const activeMockExamIndex = useMemo(
    () => (activeMockExam ? mockExams.findIndex((exam) => exam.id === activeMockExam.id) : -1),
    [activeMockExam, mockExams]
  );
  const getMockExamTitle = useCallback(
    (exam, index) => formatMockExamTitle(exam, index),
    []
  );
  const activeMockExamTitle = useMemo(
    () => getMockExamTitle(activeMockExam, activeMockExamIndex),
    [activeMockExam, activeMockExamIndex, getMockExamTitle]
  );

  const mockExamOrderedItems = useMemo(() => {
    const items = Array.isArray(activeMockExam?.payload?.items) ? activeMockExam.payload.items : [];
    if (!items.length) return [];
    return [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [activeMockExam]);

  const mockExamPages = useMemo(
    () => chunkMockExamPages(mockExamOrderedItems),
    [mockExamOrderedItems]
  );

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
        {isShort && <p className="text-[12px] text-black/80">?? ____________________</p>}
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

  const startPageProps = {
    file,
    pageInfo,
    isLoadingText,
    thumbnailUrl,
    uploadedFiles,
    onSelectFile: handleSelectFile,
    onFileChange: handleFileChange,
    selectedFileId,
    folders,
    selectedFolderId,
    onSelectFolder: handleSelectFolder,
    onCreateFolder: handleCreateFolder,
    onDeleteFolder: handleDeleteFolder,
    selectedUploadIds,
    onToggleUploadSelect: handleToggleUploadSelect,
    onMoveUploads: handleMoveUploadsToFolder,
    onClearSelection: handleClearSelection,
    isFolderFeatureEnabled,
    onDeleteUpload: handleDeleteUpload,
    isGuest: !user,
    onRequireAuth: openAuth,
    currentTier: tier,
    maxPdfSizeBytes: limits.maxPdfSizeBytes,
  };
  const detailPageProps = {
    detailContainerRef,
    splitStyle,
    pdfUrl,
    file,
    pageInfo,
    currentPage,
    handleDragStart,
    panelTab,
    setPanelTab,
    requestSummary,
    isLoadingSummary,
    isLoadingText,
    isFreeTier,
    summary,
    regenerateSummary,
    setIsPageSummaryOpen,
    setPageSummaryError,
    isPageSummaryOpen,
    pageSummaryInput,
    setPageSummaryInput,
    pageSummaryError,
    handleSummaryByPages,
    isPageSummaryLoading,
    isChapterRangeOpen,
    setIsChapterRangeOpen,
    chapterRangeInput,
    setChapterRangeInput,
    chapterRangeError,
    setChapterRangeError,
    handleAutoDetectChapterRanges,
    isDetectingChapterRanges,
    handleConfirmChapterRanges,
    handleExportSummaryPdf,
    isExportingSummary,
    status,
    error,
    summaryRef,
    mockExams,
    mockExamMenuRef,
    mockExamMenuButtonRef,
    isMockExamMenuOpen,
    setIsMockExamMenuOpen,
    isLoadingMockExams,
    activeMockExam,
    activeMockExamTitle,
    formatMockExamTitle: getMockExamTitle,
    handleDeleteMockExam,
    handleCreateMockExam,
    isGeneratingMockExam,
    selectedFileId,
    handleExportMockExam,
    mockExamOrderedItems,
    mockExamPrintRef,
    mockExamPages,
    showMockExamAnswers,
    setShowMockExamAnswers,
    mockExamStatus,
    mockExamError,
    renderMockExamItem,
    setActiveMockExamId,
    isLoadingQuiz,
    shortPreview,
    requestQuestions,
    quizMix,
    setQuizMix,
    quizSets,
    handleChoiceSelect,
    handleShortAnswerChange,
    handleShortAnswerCheck,
    regenerateQuiz,
    isLoadingOx,
    requestOxQuiz,
    regenerateOxQuiz,
    oxItems,
    oxSelections,
    setOxSelections,
    oxExplanationOpen,
    setOxExplanationOpen,
    flashcards,
    isLoadingFlashcards,
    handleAddFlashcard,
    handleDeleteFlashcard,
    handleGenerateFlashcards,
    isGeneratingFlashcards,
    extractedText,
    flashcardStatus,
    flashcardError,
    tutorMessages,
    isTutorLoading,
    tutorError,
    tutorNotice,
    handleSendTutorMessage,
    handleResetTutor,
  };

  if (!user && showAuth) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <LoginBackground theme={theme}>
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-8">
          <div className="flex w-full max-w-md justify-end">
            <button
              type="button"
              onClick={closeAuth}
              className="ghost-button text-xs text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              Back to Home
            </button>
          </div>
          <AuthPanel user={user} onAuth={refreshSession} />
        </div>
        </LoginBackground>
      </Suspense>
    );
  }

  const showHeader = Boolean(user || showDetail);
  const showAmbient = showHeader;

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        theme === "light" ? "text-slate-900" : "text-slate-100"
      } ${showAmbient ? "" : "bg-black"}`}
    >
      {showPayment && (
        <Suspense fallback={null}>
          <PaymentPage
            onClose={() => setShowPayment(false)}
            currentTier={tier}
            theme={theme}
            user={user}
            onTierUpdated={refreshTier}
          />
        </Suspense>
      )}
      {shouldShowPremiumProfilePicker && (
        <Suspense fallback={null}>
          <PremiumProfilePicker
            profiles={premiumProfiles}
            activeProfileId={activePremiumProfileId}
            maxProfiles={PREMIUM_PROFILE_LIMIT}
            theme={theme}
            onSelectProfile={handleSelectPremiumProfile}
            onCreateProfile={handleCreatePremiumProfile}
            onClose={handleCloseProfilePicker}
            canClose={Boolean(activePremiumProfileId)}
          />
        </Suspense>
      )}
      {showProfilePinDialog && activePremiumProfile && (
        <div className="fixed inset-0 z-[155] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close PIN dialog"
            onClick={handleCloseProfilePinDialog}
            className={`absolute inset-0 ${theme === "light" ? "bg-slate-900/25" : "bg-black/75"} backdrop-blur-[2px]`}
          />
          <form
            onSubmit={handleSubmitProfilePinChange}
            className={`relative z-[156] w-full max-w-md rounded-2xl border p-5 ${
              theme === "light"
                ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
            }`}
          >
            <p className="text-sm font-semibold">{activePremiumProfile.name} PIN Change</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              Enter your current PIN and set a new 4-digit PIN.
            </p>
            <div className="mt-4 space-y-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.currentPin}
                onChange={(event) => handleChangeProfilePinInput("currentPin", event.target.value)}
                placeholder="Current PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.nextPin}
                onChange={(event) => handleChangeProfilePinInput("nextPin", event.target.value)}
                placeholder="New PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.confirmPin}
                onChange={(event) => handleChangeProfilePinInput("confirmPin", event.target.value)}
                placeholder="Confirm new PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
            </div>
            {profilePinError && <p className="mt-2 text-xs text-rose-300">{profilePinError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseProfilePinDialog}
                className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
      {isResizingSplit && showDetail && (
        <div className="pointer-events-none fixed inset-0 z-[160] cursor-col-resize" aria-hidden="true" />
      )}
      {showAmbient && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-[-80px] top-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
      )}

      <main className="relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 py-4">
        {showHeader && (
          <Suspense fallback={null}>
            <Header
              user={user}
              onSignOut={handleSignOut}
              signingOut={isSigningOut}
              theme={theme}
              onGoHome={showDetail ? goBackToList : null}
              onOpenBilling={openBilling}
              onToggleTheme={toggleTheme}
              onOpenLogin={openAuth}
              isPremiumTier={isPremiumTier}
              loadingTier={loadingTier}
              activeProfile={activePremiumProfile}
              onOpenProfilePicker={handleOpenProfilePicker}
              onOpenProfilePinDialog={handleOpenProfilePinDialog}
              premiumSpaceMode={premiumSpaceMode}
              onTogglePremiumSpaceMode={handleTogglePremiumSpaceMode}
            />
          </Suspense>
        )}
        <div className="px-0">
          {!showDetail && <StartPage {...startPageProps} />}
          {showDetail && (
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-300">
                  Loading...
                </div>
              }
            >
              <DetailPage {...detailPageProps} />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;


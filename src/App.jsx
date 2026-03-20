import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import StartPage from "./pages/StartPage";
import { useAdMobBanner } from "./hooks/useAdMobBanner";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useUserTier } from "./hooks/useUserTier";
import { usePageProgressCache } from "./hooks/usePageProgressCache";
import { AUTH_ENABLED } from "./config/auth";
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
  renameFolder,
  deleteUpload,
  saveUploadMetadata,
  listUploads,
  getSignedStorageUrl,
  updateUploadThumbnail,
  fetchDocArtifacts,
  saveDocArtifacts,
  updateUploadFolder,
  saveUserFeedback,
  getPremiumProfileStateFromUser,
  savePremiumProfileState,
} from "./services/supabase";
import { notifyFeedbackEmail } from "./services/feedback";
import {
  extractPdfText,
  extractPdfTextByRanges,
  extractChapterRangesFromToc,
  extractPdfTextFromPages,
  extractPdfPageTexts,
} from "./utils/pdf";
import {
  detectSupportedDocumentKind,
  extractDocumentText,
  generateDocumentThumbnail,
  isPdfDocumentKind,
  isSupportedUploadFile,
  normalizeSupportedDocumentFile,
} from "./utils/document";
import {
  createRichTextPdfFile,
  createTextPdfFile,
  exportMockAnswerSheetToPdf,
  exportPagedElementToPdf,
} from "./utils/pdfExport";
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
  sanitizePremiumProfileName,
  sanitizePremiumProfilePin,
  formatMockExamTitle,
  chunkMockExamPages,
} from "./utils/appStateHelpers";
import { clearPaymentReturnPending, readPaymentReturnPending } from "./utils/paymentReturn";
import {
  resolveAnswerIndex,
  resolveShortAnswerText,
  buildMockExamAnswerSheet,
} from "./utils/mockExamUtils";
import {
  dedupeQuestionTexts,
  mergeQuestionHistory,
  getQuizPromptText,
  getOxPromptText,
  getMockExamPromptText,
  collectQuestionTextsFromQuizSets,
  collectQuestionTextsFromOxItems,
  collectQuestionTextsFromMockExams,
  createQuestionKeySet,
  isLowValueStudyPrompt,
  pushUniqueByQuestionKey,
  pickRandomUniqueByQuestionKey,
} from "./utils/questionDedupe";
import {
  buildChapterRangeStorageKey,
  buildFolderAggregateDocId,
  buildFolderAggregateThumbnail,
  buildStoragePathCandidates,
  createPlaceholderPdfFile,
  createLocalEntityId,
  FOLDER_AGGREGATE_MAX_LENGTH,
  FOLDER_AGGREGATE_MAX_LENGTH_PER_FILE,
  isFolderAggregateDocId,
  isSafeStoragePathForReuse,
  parseFolderAggregateDocId,
} from "./utils/appShared";
import {
  formatPartialSummaryDefaultName,
  normalizeSavedPartialSummaryEntries,
  readPartialSummaryBundleFromHighlights,
  sanitizeUiText,
  writePartialSummaryBundleToHighlights,
} from "./utils/studyArtifacts";
import {
  buildTutorPageCandidates,
  detectTutorSectionPageRange,
  extractTutorProblemTokenCandidates,
  extractTutorSectionCandidates,
  parseChapterNumberSelectionInput,
  resolveTutorReplyText,
} from "./utils/tutorHelpers";

const AuthPanel = lazy(() => import("./components/AuthPanel"));
const Header = lazy(() => import("./components/Header"));
const LoginBackground = lazy(() => import("./components/LoginBackground"));
const PaymentPage = lazy(() => import("./components/PaymentPage"));
const DetailPage = lazy(() => import("./pages/DetailPage"));
const PremiumProfilePicker = lazy(() => import("./components/PremiumProfilePicker"));
const FOLDER_AGGREGATE_META_KEY = "__folder_aggregate_meta_v1";
const FEEDBACK_CATEGORY_OPTIONS = [
  { value: "general", label: "\uC77C\uBC18" },
  { value: "bug", label: "\uBC84\uADF8 \uC81C\uBCF4" },
  { value: "feature", label: "\uAE30\uB2A5 \uC81C\uC548" },
  { value: "ux", label: "\uC0AC\uC6A9\uC131 \uC758\uACAC" },
];
const isMissingFeedbackTableError = (error) => {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST205" ||
    (message.includes("could not find the table") && message.includes("user_feedback")) ||
    (message.includes("relation") && message.includes("user_feedback"))
  );
};

function App() {
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [pageInfo, setPageInfo] = useState({ used: 0, total: 0 });
  const [pdfUrl, setPdfUrl] = useState(null);
  const [documentRemoteUrl, setDocumentRemoteUrl] = useState("");
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
  const [showGuestIntro, setShowGuestIntro] = useState(() => !AUTH_ENABLED);
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
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("general");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isPageSummaryOpen, setIsPageSummaryOpen] = useState(false);
  const [pageSummaryInput, setPageSummaryInput] = useState("");
  const [pageSummaryError, setPageSummaryError] = useState("");
  const [isPageSummaryLoading, setIsPageSummaryLoading] = useState(false);
  const [partialSummary, setPartialSummary] = useState("");
  const [partialSummaryRange, setPartialSummaryRange] = useState("");
  const [savedPartialSummaries, setSavedPartialSummaries] = useState([]);
  const [isSavedPartialSummaryOpen, setIsSavedPartialSummaryOpen] = useState(false);
  const [quizChapterSelectionInput, setQuizChapterSelectionInput] = useState("");
  const [oxChapterSelectionInput, setOxChapterSelectionInput] = useState("");
  const [flashcardChapterSelectionInput, setFlashcardChapterSelectionInput] = useState("");
  const [mockExamChapterSelectionInput, setMockExamChapterSelectionInput] = useState("");
  const [isChapterRangeOpen, setIsChapterRangeOpen] = useState(false);
  const [chapterRangeInput, setChapterRangeInput] = useState("");
  const [chapterRangeError, setChapterRangeError] = useState("");
  const [isDetectingChapterRanges, setIsDetectingChapterRanges] = useState(false);
  const [artifacts, setArtifacts] = useState(null);
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const summaryContextCacheRef = useRef(new Map()); // fileId -> extended summary text
  const tutorPageTextCacheRef = useRef(new Map()); // docId:page -> { text, ocrUsed }
  const tutorSectionRangeCacheRef = useRef(new Map()); // docId:section:anchor -> range
  const chapterScopeTextCacheRef = useRef(new Map()); // scoped key -> text
  const extractTextForChapterSelectionRef = useRef(null);
  const chapterOneStartPageCacheRef = useRef(new Map()); // docId -> chapter 1 start page
  const questionSourceTextCacheRef = useRef(new Map()); // docId:chapter1 -> source text
  const docArtifactsCacheRef = useRef(new Map()); // docId -> artifacts snapshot
  const folderAggregateCacheRef = useRef(new Map()); // folderId -> { signature, item }
  const folderAggregateBuildRef = useRef(new Map()); // folderId -> Promise<item>
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
  const { user, authReady, refreshSession, handleSignOut: authSignOut } = useSupabaseAuth();
  const { tier, tierExpiresAt, tierRemainingDays, loadingTier, refreshTier } = useUserTier(user);
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
  const premiumProfileHydratedRef = useRef(false);
  const premiumProfileSyncSignatureRef = useRef("");
  const safeStatus = useMemo(() => sanitizeUiText(status, ""), [status]);
  const safeError = useMemo(() => sanitizeUiText(error, "오류가 발생했습니다."), [error]);
  const safePageSummaryError = useMemo(
    () => sanitizeUiText(pageSummaryError, "페이지 요약 처리 중 오류가 발생했습니다."),
    [pageSummaryError]
  );
  const safeChapterRangeError = useMemo(
    () => sanitizeUiText(chapterRangeError, "챕터 범위를 다시 확인해주세요."),
    [chapterRangeError]
  );
  const safeMockExamStatus = useMemo(
    () => sanitizeUiText(mockExamStatus, "모의고사 작업이 완료되었습니다."),
    [mockExamStatus]
  );
  const safeMockExamError = useMemo(
    () => sanitizeUiText(mockExamError, "모의고사 처리 중 오류가 발생했습니다."),
    [mockExamError]
  );
  const safeFlashcardStatus = useMemo(
    () => sanitizeUiText(flashcardStatus, "플래시카드 작업이 완료되었습니다."),
    [flashcardStatus]
  );
  const safeFlashcardError = useMemo(
    () => sanitizeUiText(flashcardError, "플래시카드 처리 중 오류가 발생했습니다."),
    [flashcardError]
  );
  const activeDocumentKind = useMemo(() => detectSupportedDocumentKind(file), [file]);
  const isCurrentPdfDocument = useMemo(() => {
    if (isPdfDocumentKind(activeDocumentKind)) return true;
    const fileType = String(file?.type || "").trim().toLowerCase();
    const fileName = String(file?.name || "").trim().toLowerCase();
    return Boolean(pdfUrl) || fileType.includes("pdf") || fileName.endsWith(".pdf");
  }, [activeDocumentKind, file, pdfUrl]);
  const safeTutorError = useMemo(
    () => sanitizeUiText(tutorError, "튜터 응답 처리 중 오류가 발생했습니다."),
    [tutorError]
  );
  const safeProfilePinError = useMemo(
    () => sanitizeUiText(profilePinError, "PIN 입력을 다시 확인해주세요."),
    [profilePinError]
  );
  const isNativePlatform = Capacitor.isNativePlatform();
  const shouldForceNativeAuthEntry = AUTH_ENABLED && isNativePlatform && authReady && !user;
  const shouldRenderAuthScreen = AUTH_ENABLED && !user && (showAuth || shouldForceNativeAuthEntry);
  const canReturnHomeFromAuth = showAuth && !shouldForceNativeAuthEntry;
  const shouldShowFreeBannerAd = isFreeTier && isNativePlatform && !shouldRenderAuthScreen && !showPayment;
  const { bannerHeight } = useAdMobBanner({ enabled: shouldShowFreeBannerAd });
  const appBannerOffset = shouldShowFreeBannerAd ? bannerHeight : 0;
  const buildHistoryState = useCallback(
    (override = null) => {
      if (override && typeof override === "object") {
        return { appNav: true, ...override };
      }
      if (selectedFileId) {
        return { appNav: true, view: "detail", fileId: selectedFileId };
      }
      return { appNav: true, view: "list" };
    },
    [selectedFileId]
  );
  const updateHistoryState = useCallback(
    (mode = "replace", override = null) => {
      if (typeof window === "undefined" || !window.history) return;
      const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const nextState = buildHistoryState(override);
      if (mode === "push") {
        window.history.pushState(nextState, "", url);
        return;
      }
      window.history.replaceState(nextState, "", url);
    },
    [buildHistoryState]
  );

  const computeFileHash = useCallback(async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }, []);
  const normalizeSupportedFile = useCallback((inputFile) => normalizeSupportedDocumentFile(inputFile), []);
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
    if (!AUTH_ENABLED) return;
    setShowAuth(true);
  }, []);

  const closeAuth = useCallback(() => {
    setShowAuth(false);
  }, []);

  const openBilling = useCallback(() => {
    setShowPayment(true);
  }, []);

  const handleOpenFeedbackDialog = useCallback(() => {
    if (!user) {
      setStatus("\uD53C\uB4DC\uBC31\uC744 \uBCF4\uB0B4\uB824\uBA74 \uB85C\uADF8\uC778\uD574 \uC8FC\uC138\uC694.");
      openAuth();
      return;
    }
    setFeedbackError("");
    setIsFeedbackDialogOpen(true);
  }, [openAuth, user]);

  const handleCloseFeedbackDialog = useCallback(() => {
    if (isSubmittingFeedback) return;
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
  }, [isSubmittingFeedback]);

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
  const getChapterRangeStorageKey = useCallback(
    (docId) =>
      buildChapterRangeStorageKey({
        userId: user?.id,
        scopeId: isPremiumTier ? premiumScopeProfileId : "default",
        docId,
      }),
    [isPremiumTier, premiumScopeProfileId, user?.id]
  );
  const loadSavedChapterRangeInput = useCallback(
    (docId) => {
      if (typeof window === "undefined") return "";
      const key = getChapterRangeStorageKey(docId);
      if (!key) return "";
      try {
        return String(window.localStorage.getItem(key) || "");
      } catch {
        return "";
      }
    },
    [getChapterRangeStorageKey]
  );
  const persistChapterRangeInput = useCallback(
    (docId, value) => {
      if (typeof window === "undefined") return;
      const key = getChapterRangeStorageKey(docId);
      if (!key) return;
      const normalized = String(value || "").trim();
      try {
        if (normalized) {
          window.localStorage.setItem(key, normalized);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch {
        // Ignore storage write errors.
      }
    },
    [getChapterRangeStorageKey]
  );

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
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setIsSavedPartialSummaryOpen(false);
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    tutorPageTextCacheRef.current.clear();
    tutorSectionRangeCacheRef.current.clear();
    chapterScopeTextCacheRef.current.clear();
    summaryContextCacheRef.current.clear();
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
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
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
          ? "怨듭쑀 ?숈뒿 紐⑤뱶媛 耳쒖죱?듬땲?? ?숈뒿 ?곗씠?곌? ?꾨━誘몄뾼 硫ㅻ쾭? 怨듭쑀?⑸땲??"
          : "媛쒖씤 ?숈뒿 紐⑤뱶媛 耳쒖죱?듬땲?? ?숈뒿 ?곗씠?곌? ?꾩옱 ?꾨줈?꾩뿉留???λ맗?덈떎."
      );
  }, [activePremiumProfileId, isPremiumTier, premiumSpaceMode, resetActiveDocumentState, user]);

  const handleSelectPremiumProfile = useCallback(
    (profileId, pinInput) => {
      const selected = premiumProfiles.find((profile) => profile.id === profileId);
      if (!selected) {
        return { ok: false, message: "?좏깮???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎." };
      }
      const inputPin = normalizePremiumProfilePinInput(pinInput);
      if (!inputPin) {
        return { ok: false, message: "4?먮━ PIN???낅젰?댁＜?몄슂." };
      }
      const expectedPin = sanitizePremiumProfilePin(selected.pin);
      if (inputPin !== expectedPin) {
        return { ok: false, message: "PIN???щ컮瑜댁? ?딆뒿?덈떎." };
      }
      resetActiveDocumentState();
      setSelectedFolderId("all");
      setSelectedUploadIds([]);
      setActivePremiumProfileId(selected.id);
      setShowPremiumProfilePicker(false);
      setStatus(`${selected.name} ?꾨줈?꾩씠 ?좏깮?섏뿀?듬땲??`);
      return { ok: true };
    },
    [premiumProfiles, resetActiveDocumentState]
  );

  const handleSubmitProfilePinChange = useCallback(
    (event) => {
      event.preventDefault();
      if (!activePremiumProfileId) {
        setProfilePinError("?좏깮???꾨줈?꾩씠 ?놁뒿?덈떎.");
        return;
      }
      const currentProfile = premiumProfiles.find((profile) => profile.id === activePremiumProfileId);
      if (!currentProfile) {
        setProfilePinError("?좏깮???꾨줈?꾩쓣 李얠쓣 ???놁뒿?덈떎.");
        return;
      }
      const currentPin = normalizePremiumProfilePinInput(profilePinInputs.currentPin);
      const nextPin = normalizePremiumProfilePinInput(profilePinInputs.nextPin);
      const confirmPin = normalizePremiumProfilePinInput(profilePinInputs.confirmPin);

      if (!currentPin || !nextPin || !confirmPin) {
        setProfilePinError("紐⑤뱺 PIN? 4?먮━ ?レ옄?ъ빞 ?⑸땲??");
        return;
      }
      if (currentPin !== sanitizePremiumProfilePin(currentProfile.pin)) {
        setProfilePinError("?꾩옱 PIN???쇱튂?섏? ?딆뒿?덈떎.");
        return;
      }
      if (nextPin !== confirmPin) {
        setProfilePinError("??PIN怨??뺤씤 PIN???쇱튂?섏? ?딆뒿?덈떎.");
        return;
      }
      if (nextPin === currentPin) {
        setProfilePinError("??PIN? ?꾩옱 PIN怨??щ씪???⑸땲??");
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
      setStatus("?꾨줈??PIN??蹂寃쎈릺?덉뒿?덈떎.");
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
    premiumProfileHydratedRef.current = false;
    if (!user?.id || !isPremiumTier) {
      setPremiumProfiles([]);
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(false);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      premiumProfileSyncSignatureRef.current = "";
      return;
    }
    const remoteState = getPremiumProfileStateFromUser(user);
    const remoteProfiles = normalizePremiumProfiles(remoteState?.profiles);
    const hasRemoteProfiles = remoteProfiles.length > 0;
    const remoteActiveProfileId = String(remoteState?.activeProfileId || "").trim();
    const remoteSpaceModeRaw = String(remoteState?.spaceMode || "").trim();
    const remoteSpaceMode =
      remoteSpaceModeRaw === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : remoteSpaceModeRaw === PREMIUM_SPACE_MODE_PROFILE
          ? PREMIUM_SPACE_MODE_PROFILE
          : "";

    let loadedProfiles = hasRemoteProfiles ? remoteProfiles : [];
    let storedActiveProfileId = "";
    let normalizedSpaceMode = remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE;

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);

      let localProfiles = [];
      try {
        const raw = window.localStorage.getItem(profilesKey);
        localProfiles = normalizePremiumProfiles(raw ? JSON.parse(raw) : []);
      } catch {
        localProfiles = [];
      }
      const shouldPreferLocalProfiles =
        localProfiles.length > loadedProfiles.length &&
        localProfiles.some((localProfile) => !loadedProfiles.some((remote) => remote.id === localProfile.id));

      if ((!loadedProfiles.length && localProfiles.length) || shouldPreferLocalProfiles) {
        loadedProfiles = localProfiles;
      }

      storedActiveProfileId = String(window.localStorage.getItem(activeProfileKey) || "").trim();

      const storedSpaceMode = String(window.localStorage.getItem(spaceModeKey) || "").trim();
      const localSpaceMode =
        storedSpaceMode === PREMIUM_SPACE_MODE_SHARED
          ? PREMIUM_SPACE_MODE_SHARED
          : PREMIUM_SPACE_MODE_PROFILE;
      if (!remoteSpaceMode) {
        normalizedSpaceMode = localSpaceMode;
      }
      if (storedSpaceMode && storedSpaceMode !== localSpaceMode) {
        window.localStorage.removeItem(spaceModeKey);
      }
    }

    if (loadedProfiles.length === 0) {
      const ownerName = sanitizePremiumProfileName(
        user?.user_metadata?.name || user?.email?.split("@")?.[0] || "공유 공간",
        "공유 공간"
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
    }

    const preferredActiveProfileId = remoteActiveProfileId || storedActiveProfileId;
    const hasPreferredActiveProfile = loadedProfiles.some(
      (profile) => profile.id === preferredActiveProfileId
    );
    const resolvedActiveProfileId = hasPreferredActiveProfile ? preferredActiveProfileId : "";

    setPremiumProfiles(loadedProfiles);
    setPremiumSpaceMode(normalizedSpaceMode);
    if (resolvedActiveProfileId) {
      setActivePremiumProfileId(resolvedActiveProfileId);
      setShowPremiumProfilePicker(false);
    } else {
      setActivePremiumProfileId(null);
      setShowPremiumProfilePicker(true);
    }

    if (typeof window !== "undefined") {
      const profilesKey = getPremiumProfilesStorageKey(user.id);
      const activeProfileKey = getPremiumActiveProfileStorageKey(user.id);
      const spaceModeKey = getPremiumSpaceModeStorageKey(user.id);
      try {
        window.localStorage.setItem(profilesKey, JSON.stringify(loadedProfiles));
        if (resolvedActiveProfileId) {
          window.localStorage.setItem(activeProfileKey, resolvedActiveProfileId);
        } else {
          window.localStorage.removeItem(activeProfileKey);
        }
        window.localStorage.setItem(spaceModeKey, normalizedSpaceMode);
      } catch {
        // Ignore local cache write errors.
      }
    }

    const syncSignature = JSON.stringify({
      profiles: loadedProfiles,
      activeProfileId: resolvedActiveProfileId || null,
      spaceMode: normalizedSpaceMode,
    });
    const remoteResolvedActiveProfileId = remoteProfiles.some(
      (profile) => profile.id === remoteActiveProfileId
    )
      ? remoteActiveProfileId
      : null;
    const remoteSignature = JSON.stringify({
      profiles: remoteProfiles,
      activeProfileId: remoteResolvedActiveProfileId,
      spaceMode: remoteSpaceMode || PREMIUM_SPACE_MODE_PROFILE,
    });
    premiumProfileSyncSignatureRef.current = syncSignature === remoteSignature ? syncSignature : "";
    premiumProfileHydratedRef.current = true;
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
    if (!user?.id || !isPremiumTier || !premiumProfileHydratedRef.current) return;
    const normalizedProfiles = normalizePremiumProfiles(premiumProfiles);
    if (!normalizedProfiles.length) return;
    const normalizedMode =
      premiumSpaceMode === PREMIUM_SPACE_MODE_SHARED
        ? PREMIUM_SPACE_MODE_SHARED
        : PREMIUM_SPACE_MODE_PROFILE;
    const resolvedActiveProfileId = normalizedProfiles.some(
      (profile) => profile.id === activePremiumProfileId
    )
      ? activePremiumProfileId
      : null;
    const syncSignature = JSON.stringify({
      profiles: normalizedProfiles,
      activeProfileId: resolvedActiveProfileId,
      spaceMode: normalizedMode,
    });
    if (syncSignature === premiumProfileSyncSignatureRef.current) return;

    premiumProfileSyncSignatureRef.current = syncSignature;
    let cancelled = false;
    (async () => {
      try {
        await savePremiumProfileState({
          profiles: normalizedProfiles,
          activeProfileId: resolvedActiveProfileId,
          spaceMode: normalizedMode,
        });
      } catch (err) {
        if (!cancelled) {
          premiumProfileSyncSignatureRef.current = "";
          // eslint-disable-next-line no-console
          console.warn("Failed to sync premium profile state", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activePremiumProfileId,
    isPremiumTier,
    premiumProfiles,
    premiumSpaceMode,
    user?.id,
  ]);

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
        setError(`?대뜑瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );

  const handleCreateFolder = useCallback(
    async (name) => {
      if (!isFolderFeatureEnabled) {
        setError("?대뜑 湲곕뒫? Pro ?먮뒗 Premium ?붽툑?쒖뿉?쒕쭔 ?ъ슜?????덉뒿?덈떎.");
        return;
      }
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (isPremiumTier && !premiumScopeProfileId) {
        setError("?대뜑瑜?留뚮뱾湲??꾩뿉 ?꾨━誘몄뾼 ?꾨줈?꾩쓣 ?좏깮?댁＜?몄슂.");
        return;
      }
      if (folders.some((f) => f.name === trimmed)) {
        setStatus("媛숈? ?대쫫???대뜑媛 ?대? ?덉뒿?덈떎.");
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
        setStatus("?대뜑瑜??앹꽦?덉뒿?덈떎.");
      } catch (err) {
        setError(`?대뜑 ?앹꽦???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [isFolderFeatureEnabled, user, folders, isPremiumTier, premiumScopeProfileId, premiumOwnerProfileId]
  );

  const handleRenameFolder = useCallback(
    async (folderId, name) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("먼저 로그인해 주세요.");
        return;
      }

      const trimmedFolderId = String(folderId || "").trim();
      const trimmedName = String(name || "").trim();
      if (!trimmedName) return;
      if (isPremiumTier && !premiumScopeProfileId) {
        setError("폴더 이름을 바꾸기 전에 프리미엄 프로필을 선택해 주세요.");
        return;
      }

      const targetFolder = folders.find((folder) => folder.id?.toString() === trimmedFolderId);
      if (!targetFolder) {
        setError("변경할 폴더를 찾지 못했습니다.");
        return;
      }
      if (targetFolder.name === trimmedName) {
        setStatus("폴더 이름이 이미 같습니다.");
        return;
      }
      if (folders.some((folder) => folder.id?.toString() !== trimmedFolderId && folder.name === trimmedName)) {
        setStatus("같은 이름의 폴더가 이미 있습니다.");
        return;
      }

      try {
        const storedName =
          isPremiumTier && premiumScopeProfileId
            ? encodePremiumScopeValue(trimmedName, premiumScopeProfileId)
            : trimmedName;
        const updated = await renameFolder({
          userId: user.id,
          folderId: trimmedFolderId,
          name: storedName,
        });
        const decoded = decodePremiumScopeValue(updated?.name || storedName);
        const ownerProfileId = isPremiumTier
          ? decoded.ownerProfileId || premiumOwnerProfileId || premiumScopeProfileId
          : null;
        setFolders((prev) =>
          prev.map((folder) =>
            folder.id?.toString() === trimmedFolderId
              ? {
                  ...folder,
                  ...updated,
                  name: decoded.value || trimmedName,
                  ownerProfileId,
                }
              : folder
          )
        );
        setStatus("폴더 이름을 변경했습니다.");
      } catch (err) {
        setError(`폴더 이름 변경에 실패했습니다: ${err.message}`);
      }
    },
    [folders, isFolderFeatureEnabled, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId, user]
  );

  const handleDeleteFolder = useCallback(
    async (folderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const hasFiles = uploadedFiles.some((u) => u.folderId === folderId);
      if (hasFiles) {
        setError("???대뜑瑜???젣?섍린 ?꾩뿉 ?뚯씪???대룞?섍굅????젣?댁＜?몄슂.");
        return;
      }
      try {
        await deleteFolder({ userId: user.id, folderId });
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (selectedFolderId === folderId) {
          setSelectedFolderId("all");
        }
      } catch (err) {
        setError(`?대뜑 ??젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
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
        if (!AUTH_ENABLED) {
          const uploadId = upload?.id || null;
          if (!uploadId) return;
          setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
          setSelectedUploadIds((prev) => prev.filter((id) => id !== uploadId));
          persistChapterRangeInput(uploadId, "");
          setStatus("Local upload removed.");
          return;
        }
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const uploadId = upload?.id || null;
      const storagePath = upload?.path || upload?.remotePath || null;
      if (!uploadId && !storagePath) {
        setError("?낅줈???앸퀎?먭? ?놁뒿?덈떎.");
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
        if (uploadId) {
          persistChapterRangeInput(uploadId, "");
        }
        setStatus("?낅줈?쒕? ??젣?덉뒿?덈떎.");
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`?낅줈????젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [persistChapterRangeInput, uploadedFiles, user]
  );

  const handleMoveUploadsToFolder = useCallback(
    async (uploadIds, targetFolderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!uploadIds || uploadIds.length === 0) return;
      if (!user) {
        setError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const normalizedIds = uploadIds.map((id) => id?.toString()).filter(Boolean);
      const target = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      if (isPremiumTier && target && !folders.some((folder) => folder.id?.toString() === target)) {
        setError("?꾩옱 ?꾨━誘몄뾼 ?꾨줈??踰붿쐞??????대뜑媛 ?놁뒿?덈떎.");
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
        setStatus("?좏깮???낅줈?쒕? ?대룞?덉뒿?덈떎.");
        // Sync with server to keep list and folder counts in sync with DB.
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`?낅줈???대룞???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
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
      return "?쒗꽣 梨꾪똿???ъ슜?섎젮硫?PDF瑜?癒쇱? ?댁뼱二쇱꽭??"
    }
    if (isLoadingText) {
      return "PDF ?띿뒪??異붿텧???꾩쭅 吏꾪뻾 以묒엯?덈떎. ?좎떆留?湲곕떎?ㅼ＜?몄슂."
    }
    const trimmed = (extractedText || "").trim();
    if (!trimmed) {
      return "??PDF?먯꽌 異붿텧???띿뒪?멸? ?놁뒿?덈떎."
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
    const hasPaymentReturnParams =
      params.get("pg_token") ||
      params.get("kakaoPay") ||
      params.get("nicePay") ||
      params.get("niceBilling") ||
      params.get("np_token");
    const pendingPaymentReturn = readPaymentReturnPending();

    if (hasPaymentReturnParams || pendingPaymentReturn) {
      setShowPayment(true);
      if (!hasPaymentReturnParams && pendingPaymentReturn) {
        clearPaymentReturnPending();
      }
    }
  }, []);

  useEffect(() => {
    if (!AUTH_ENABLED || !authReady || user || typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const authParam = String(url.searchParams.get("auth") || url.searchParams.get("login") || "")
      .trim()
      .toLowerCase();

    if (!["1", "true", "yes", "on"].includes(authParam)) return;

    setShowAuth(true);
    url.searchParams.delete("auth");
    url.searchParams.delete("login");

    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
    window.history.replaceState({}, document.title, nextUrl);
  }, [authReady, user]);

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
        const normalized = (Array.isArray(list) ? list : []).map((exam) => {
          const payload = exam?.payload || {};
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const answerSheet = buildMockExamAnswerSheet(items, payload?.answerSheet);
          return {
            ...exam,
            payload: {
              ...payload,
              items,
              answerSheet,
            },
          };
        });
        setMockExams(normalized);
      } catch (err) {
        setMockExamError(`모의고사 목록을 불러오지 못했습니다: ${err.message}`);
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
        setError(`?뚮옒?쒖뭅?쒕? 遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
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
        setError(`?낅줈??紐⑸줉??遺덈윭?ㅼ? 紐삵뻽?듬땲?? ${err.message}`);
      }
    },
    [user, supabase, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );
  useEffect(() => {
    loadUploadsRef.current = loadUploads;
  }, [loadUploads]);

  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    if (!user) {
      setStatus("濡쒓렇?????덈줈怨좎묠???ъ슜?????덉뒿?덈떎.");
      openAuth();
      return;
    }
    if (loadingTier) {
      setStatus("怨꾩젙 ?뺣낫瑜?遺덈윭?ㅻ뒗 以묒엯?덈떎. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.");
      return;
    }

    setIsManualSyncing(true);
    setError("");
    setStatus("?쒕쾭? ?숆린??以?..");
    try {
      await Promise.all([loadFolders(), loadUploads()]);
      if (selectedFileId) {
        await Promise.all([loadMockExams(selectedFileId), loadFlashcards(selectedFileId)]);
      }
      setStatus("?덈줈怨좎묠 ?꾨즺. 理쒖떊 ?곹깭濡??숆린?뷀뻽?듬땲??");
    } catch (err) {
      setError(`?덈줈怨좎묠???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      setStatus("");
    } finally {
      setIsManualSyncing(false);
    }
  }, [
    isManualSyncing,
    loadFlashcards,
    loadFolders,
    loadMockExams,
    loadUploads,
    loadingTier,
    openAuth,
    selectedFileId,
    user,
  ]);

  const loadArtifacts = useCallback(
    async (docId) => {
      const normalizedDocId = String(docId || "").trim();
      if (!supabase || !user || !normalizedDocId) {
        setArtifacts(null);
        return null;
      }
      try {
        const data = await fetchDocArtifacts({ userId: user.id, docId: normalizedDocId });
        const mapped = {
          summary: data?.summary || null,
          quiz: data?.quiz_json || null,
          ox: data?.ox_json || null,
          highlights: data?.highlights_json || null,
        };
        docArtifactsCacheRef.current.set(normalizedDocId, mapped);
        const partialBundle = readPartialSummaryBundleFromHighlights(mapped.highlights);
        setArtifacts(mapped);
        setPartialSummary(partialBundle.summary);
        setPartialSummaryRange(partialBundle.range);
        setSavedPartialSummaries(partialBundle.library);
        setIsSavedPartialSummaryOpen(false);
        if (mapped.summary) {
          setSummary(mapped.summary);
          summaryRequestedRef.current = true;
        }
        if (mapped.quiz) {
          const normalizedQuiz = normalizeQuizPayload(mapped.quiz);
          const cachedSet = {
            id: `quiz-cached-${normalizedDocId}`,
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
            const thumb = ensured.thumbnail || (await generateDocumentThumbnail(ensured.file));
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
    setStatus("濡쒓렇?꾩썐 以?..");
    try {
      setShowPremiumProfilePicker(false);
      setShowProfilePinDialog(false);
      setIsFeedbackDialogOpen(false);
      setFeedbackInput("");
      setFeedbackError("");
      setProfilePinInputs({ currentPin: "", nextPin: "", confirmPin: "" });
      setProfilePinError("");
      setActivePremiumProfileId(null);
      setPremiumProfiles([]);
      setPremiumSpaceMode(PREMIUM_SPACE_MODE_PROFILE);
      await authSignOut();
      await refreshSession();
      setStatus("濡쒓렇?꾩썐?섏뿀?듬땲??");
    } catch (err) {
      setError(`濡쒓렇?꾩썐???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
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
    } else if (AUTH_ENABLED) {
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
      if (!item.path && !item.remotePath) throw new Error("파일 스토리지 경로가 없습니다.");
      const storagePath = item.path || item.remotePath;

      // Reuse downloaded file/blob from memory cache when possible
      const cached = downloadCacheRef.current.get(storagePath);
      if (cached) {
        const enriched = { ...item, ...cached };
        setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
        return enriched;
      }

      const bucket = item.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
      const pathCandidates = buildStoragePathCandidates(storagePath);
      let signed = "";
      let resolvedStoragePath = storagePath;
      let lastFetchStatus = null;
      let lastErr = null;
      let blob = null;
      let headerType = "";

      for (const candidatePath of pathCandidates) {
        try {
          const signedUrl = await getSignedStorageUrl({
            bucket,
            path: candidatePath,
            expiresIn: 60 * 60 * 24,
          });
          const response = await fetch(signedUrl);
          if (!response.ok) {
            lastFetchStatus = response.status;
            continue;
          }
          signed = signedUrl;
          blob = await response.blob();
          headerType = String(response.headers.get("content-type") || "").toLowerCase();
          resolvedStoragePath = candidatePath;
          break;
        } catch (err) {
          lastErr = err;
        }
      }

      // Fallback to authenticated storage download when signed URL fetch fails.
      if (!blob && supabase) {
        for (const candidatePath of pathCandidates) {
          try {
            const { data, error } = await supabase.storage.from(bucket).download(candidatePath);
            if (error || !data) {
              if (error) lastErr = error;
              continue;
            }
            blob = data;
            headerType = String(data.type || "").toLowerCase();
            signed = "";
            resolvedStoragePath = candidatePath;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
      }

      if (!blob) {
        if (lastFetchStatus) {
          throw new Error(`스토리지에서 파일을 내려받지 못했습니다. (status: ${lastFetchStatus})`);
        }
        throw new Error(lastErr?.message || "스토리지에서 파일을 내려받지 못했습니다.");
      }

      if (headerType.includes("text/html")) {
        throw new Error("파일 대신 HTML 응답이 내려왔습니다. 서명 URL 또는 경로를 확인해주세요.");
      }
      const name = item.name || item.file?.name || "document.pdf";
      const fileObj = normalizeSupportedFile(new File([blob], name, { type: blob.type || "" }));
      const thumb = await generateDocumentThumbnail(fileObj);
      const enriched = {
        ...item,
        file: fileObj,
        thumbnail: item.thumbnail || thumb,
        remoteUrl: signed || null,
        path: resolvedStoragePath,
        bucket,
      };
      const cachePayload = {
        file: fileObj,
        thumbnail: item.thumbnail || thumb,
        remoteUrl: signed || null,
        path: resolvedStoragePath,
        bucket,
      };
      downloadCacheRef.current.set(storagePath, cachePayload);
      downloadCacheRef.current.set(resolvedStoragePath, cachePayload);
      setUploadedFiles((prev) => prev.map((p) => (p.id === item.id ? enriched : p)));
      return enriched;
    },
    [normalizeSupportedFile, setUploadedFiles]
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
      const isFolderAggregate = Boolean(resolvedItem?.folderAggregate);
      if (!isFolderAggregate && !resolvedItem.file) {
        try {
          resolvedItem = await ensureFileForItem(resolvedItem);
        } catch (err) {
          setError(`파일을 불러오지 못했습니다. ${err.message}`);
          return;
        }
      }
      if (!resolvedItem?.file) return;

      const targetFile = isFolderAggregate ? resolvedItem.file : normalizeSupportedFile(resolvedItem.file);
      if (!(targetFile instanceof File)) return;
      const targetFileKind = detectSupportedDocumentKind(targetFile);
      if (!targetFileKind) {
        setError("지원하지 않는 파일 형식입니다. PDF, DOCX, PPTX만 지원합니다.");
        return;
      }
      const nextDocId = resolvedItem.id;
      const savedChapterRangeInput = isPdfDocumentKind(targetFileKind)
        ? loadSavedChapterRangeInput(nextDocId)
        : "";

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
      const restoredPageProgress = isPdfDocumentKind(targetFileKind)
        ? loadPageProgressSnapshot({ docId: nextDocId })
        : { currentPage: 1, visitedPages: [] };

      if (pushState && selectedFileId !== nextDocId) {
        window.history.pushState({ view: "detail", fileId: nextDocId }, "", window.location.pathname);
      }

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(isPdfDocumentKind(targetFileKind) ? URL.createObjectURL(targetFile) : null);
      setDocumentRemoteUrl(isFolderAggregate ? "" : String(resolvedItem.remoteUrl || "").trim());
      setFile(targetFile);
      setSelectedFileId(nextDocId);
      setPanelTab("summary");
      resetQuizState();
      summaryRequestedRef.current = false;
      quizAutoRequestedRef.current = false;
      setError("");
      setSummary("");
      setPartialSummary("");
      setPartialSummaryRange("");
      setSavedPartialSummaries([]);
      setIsSavedPartialSummaryOpen(false);
      setQuizChapterSelectionInput("");
      setOxChapterSelectionInput("");
      setFlashcardChapterSelectionInput("");
      setMockExamChapterSelectionInput("");
      tutorPageTextCacheRef.current.clear();
      tutorSectionRangeCacheRef.current.clear();
      chapterScopeTextCacheRef.current.clear();
      setArtifacts(null);
      const extractStart =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      setStatus("문서 텍스트 추출 중...");
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
      setChapterRangeInput(savedChapterRangeInput);
      setChapterRangeError("");
      oxAutoRequestedRef.current = false;
      const artifactsPromise = loadArtifacts(nextDocId);

      try {
        let loaded = null;
        if (isFolderAggregate) {
          loaded = await artifactsPromise;
          const aggregateText = String(resolvedItem.aggregateText || "").trim();
          const aggregatePageInfo = resolvedItem.aggregatePageInfo || { used: 0, total: 0 };
          const aggregateThumbnail = resolvedItem.aggregateThumbnail || resolvedItem.thumbnail || null;
          setExtractedText(aggregateText);
          setPreviewText(aggregateText);
          setSummary(aggregateText);
          summaryRequestedRef.current = Boolean(aggregateText);
          setPageInfo({
            used: Number(aggregatePageInfo.used) || 0,
            total: Number(aggregatePageInfo.total) || 0,
          });
          setThumbnailUrl(aggregateThumbnail);
        } else {
          const [loadedArtifacts, textResult, thumb] = await Promise.all([
            artifactsPromise,
            extractDocumentText(targetFile, {
              pageLimit: 30,
              maxLength: 12000,
              useOcr: isPdfDocumentKind(targetFileKind),
              ocrLang: "kor+eng",
              onOcrProgress: (message) => setStatus(message),
            }),
            generateDocumentThumbnail(targetFile),
          ]);
          loaded = loadedArtifacts;
          const { text, pagesUsed, totalPages } = textResult;
          setExtractedText(text);
          setPreviewText(text);
          setPageInfo({ used: pagesUsed, total: totalPages });
          setThumbnailUrl(thumb);
        }
        const extractEnd =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const elapsedSeconds = Math.max(0, (extractEnd - extractStart) / 1000);
        setStatus(
          isFolderAggregate
            ? `폴더 전체 요약본 준비 완료 (${elapsedSeconds.toFixed(1)}s)`
            : `텍스트 추출 완료 (${elapsedSeconds.toFixed(1)}s)`
        );
        setError("");
        await Promise.all([loadMockExams(nextDocId), loadFlashcards(nextDocId)]);
        if (loaded?.summary) {
          setStatus(isFolderAggregate ? "저장된 폴더 요약을 불러왔습니다." : "Loaded saved summary.");
        }
      } catch (err) {
        setError(
          isFolderAggregate
            ? `폴더 전체 요약본을 준비하지 못했습니다: ${err.message}`
            : `문서 처리에 실패했습니다: ${err.message}`
        );
        setDocumentRemoteUrl("");
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
      loadSavedChapterRangeInput,
      loadArtifacts,
      loadFlashcards,
      loadMockExams,
      loadPageProgressSnapshot,
      normalizeSupportedFile,
      pdfUrl,
      savePageProgressSnapshot,
      selectedFileId,
      visitedPages,
    ]
  );

  const handleFileChange = useCallback(
    async (event, targetFolderId = null) => {
      if (AUTH_ENABLED && !user) {
        openAuth();
        return;
      }
      const fileInput = event.target;
      const files = Array.from(fileInput.files || []);
      if (!files.length) return;
      const activeFolderId = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      const activeProfileScopeId = isPremiumTier ? premiumScopeProfileId : null;
      if (isPremiumTier && !activeProfileScopeId) {
        setError("?뚯씪 ?낅줈???꾩뿉 ?꾨━誘몄뾼 ?꾨줈?꾩쓣 ?좏깮?댁＜?몄슂.");
        fileInput.value = "";
        return;
      }

      const invalidTypeFile = files.find((f) => !isSupportedUploadFile(f));
      if (invalidTypeFile) {
        setError(`지원 형식은 PDF/DOCX/PPTX 입니다. (${invalidTypeFile.name})`);
        fileInput.value = "";
        return;
      }

      const oversizedFile = files.find((f) => f.size > limits.maxPdfSizeBytes);
      if (oversizedFile) {
        setError(
          `${getTierLabel(tier)} tier allows up to ${formatSizeMB(limits.maxPdfSizeBytes)} per file. (${oversizedFile.name}: ${formatSizeMB(oversizedFile.size)})`
        );
        fileInput.value = "";
        return;
      }
      const nextCount = uploadedFiles.length + files.length;
      if (limits.maxUploads !== Infinity && nextCount > limits.maxUploads) {
        setError(`?낅줈???쒕룄瑜?珥덇낵?덉뒿?덈떎. ?낅줈??媛??理쒕? 媛쒖닔: ${limits.maxUploads}.`);
        fileInput.value = "";
        return;
      }

      const existingByHash = new Map();
      uploadedFiles.forEach((item) => {
        if (!item?.hash) return;
        const storagePath = item.remotePath || item.path;
        if (!storagePath) return;
        // Avoid reusing legacy encoded/non-ASCII paths that can fail signed URL fetch.
        if (!isSafeStoragePathForReuse(storagePath)) return;
        existingByHash.set(item.hash, item);
      });

      const withThumbs = await Promise.all(
        files.map(async (rawFile) => {
          const f = normalizeSupportedFile(rawFile);
          const [thumb, hash] = await Promise.all([generateDocumentThumbnail(f), computeFileHash(f)]);
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
          if (!user) {
            if (!AUTH_ENABLED) {
              return { ...item, remote: false };
            }
            return { ...item, uploadError: "?대씪?곕뱶 ?낅줈?쒕? ?ъ슜?????놁뒿?덈떎. ?ㅼ떆 濡쒓렇?명빐二쇱꽭??" };
          }
          if (!supabase) {
            return { ...item, uploadError: "Supabase client is not available." };
          }

          // Reuse existing remote upload by hash to avoid duplicate storage writes.
          const existing = item.hash ? existingByHash.get(item.hash) : null;
          let uploaded = null;
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

            uploaded = await uploadPdfToStorage(user.id, item.file);
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
            // Roll back orphaned storage files when metadata insert fails.
            if (uploaded?.bucket && uploaded?.path) {
              try {
                await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
              } catch {
                // Ignore rollback failures.
              }
            }
            return { ...item, uploadError: err?.message || "?낅줈?쒖뿉 ?ㅽ뙣?덉뒿?덈떎." };
          }
        })
      );

      const successfulUploads = withUploads.filter((item) => !item?.uploadError);
      const failedUploads = withUploads.filter((item) => item?.uploadError);

      if (failedUploads.length > 0) {
        const failedNames = failedUploads
          .slice(0, 2)
          .map((item) => item?.name)
          .filter(Boolean)
          .join(", ");
        const suffix = failedUploads.length > 2 ? "..." : "";
        setError(
          `업로드에 실패했습니다: ${failedUploads.length}개 파일${failedNames ? ` (${failedNames}${suffix})` : ""}.`
        );
      }

      if (successfulUploads.length > 0) {
        setUploadedFiles((prev) => {
          const nextById = new Map(prev.map((entry) => [entry.id?.toString(), entry]));
          successfulUploads.forEach((entry) => {
            const key = entry.id?.toString();
            if (!key) return;
            nextById.set(key, { ...(nextById.get(key) || {}), ...entry });
          });
          return Array.from(nextById.values());
        });
      }

      fileInput.value = "";
      if (successfulUploads.length > 0 && activeFolderId) {
        if (AUTH_ENABLED && user) {
          await loadUploadsRef.current?.();
        }
        setStatus(
          successfulUploads.length === 1
            ? "폴더에 파일을 추가했습니다."
            : `폴더에 ${successfulUploads.length}개 파일을 추가했습니다.`
        );
        return;
      }

      const firstReadyUpload = successfulUploads.find((item) => item?.file);
      if (firstReadyUpload) {
        await processSelectedFile(firstReadyUpload);
        if (AUTH_ENABLED && user) {
          await loadUploadsRef.current?.();
        }
      } else {
        setStatus("??λ맂 ?뚯씪???놁뒿?덈떎. ?낅줈???ㅻ쪟 硫붿떆吏瑜??뺤씤?댁＜?몄슂.");
      }
    },
    [
      user,
      openAuth,
      uploadedFiles,
      limits,
      supabase,
      computeFileHash,
      normalizeSupportedFile,
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
      setDocumentRemoteUrl("");
      setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setIsSavedPartialSummaryOpen(false);
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    tutorPageTextCacheRef.current.clear();
    tutorSectionRangeCacheRef.current.clear();
    chapterScopeTextCacheRef.current.clear();
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
    setIsFeedbackDialogOpen(false);
    setFeedbackCategory("general");
    setFeedbackInput("");
    setFeedbackError("");
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
    setStatus("?낅줈??紐⑸줉?쇰줈 ?뚯븘?붿뒿?덈떎.");
    setSelectedUploadIds([]);
    updateHistoryState("replace", { view: "list" });
  }, [currentPage, pdfUrl, savePageProgressSnapshot, selectedFileId, updateHistoryState, visitedPages]);

  const consumeOverlayBack = useCallback(() => {
    if (showPayment) {
      setShowPayment(false);
      return true;
    }
    if (showProfilePinDialog) {
      handleCloseProfilePinDialog();
      return true;
    }
    if (isFeedbackDialogOpen) {
      handleCloseFeedbackDialog();
      return true;
    }
    if (shouldShowPremiumProfilePicker) {
      handleCloseProfilePicker();
      return true;
    }
    if (isMockExamMenuOpen) {
      setIsMockExamMenuOpen(false);
      return true;
    }
    if (showMockExamAnswers) {
      setShowMockExamAnswers(false);
      return true;
    }
    if (isSavedPartialSummaryOpen) {
      setIsSavedPartialSummaryOpen(false);
      return true;
    }
    if (isPageSummaryOpen) {
      setIsPageSummaryOpen(false);
      return true;
    }
    if (isChapterRangeOpen) {
      setIsChapterRangeOpen(false);
      return true;
    }
    if (showAuth) {
      closeAuth();
      return true;
    }
    return false;
  }, [
    closeAuth,
    handleCloseFeedbackDialog,
    handleCloseProfilePicker,
    handleCloseProfilePinDialog,
    isChapterRangeOpen,
    isFeedbackDialogOpen,
    isMockExamMenuOpen,
    isPageSummaryOpen,
    isSavedPartialSummaryOpen,
    shouldShowPremiumProfilePicker,
    showAuth,
    showMockExamAnswers,
    showPayment,
    showProfilePinDialog,
  ]);

  const uploadedFilesRef = useRef(uploadedFiles);
  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);
  const ensureFileForItemRef = useRef(ensureFileForItem);
  const selectedFileIdRef = useRef(selectedFileId);

  const buildFolderAggregatePreviewItem = useCallback(
    async (folderId) => {
      const normalizedFolderId = String(folderId || "").trim();
      if (!normalizedFolderId) {
        throw new Error("폴더 ID가 없습니다.");
      }

      const cached = folderAggregateCacheRef.current.get(normalizedFolderId);
      if (cached?.item) {
        return cached.item;
      }

      const targetFolder = folders.find((folder) => folder.id?.toString() === normalizedFolderId);
      if (!targetFolder) {
        throw new Error("선택한 폴더를 찾지 못했습니다.");
      }

      const folderItems = (uploadedFilesRef.current || []).filter(
        (item) => item.folderId?.toString() === normalizedFolderId
      );
      if (!folderItems.length) {
        throw new Error("이 폴더에 문서가 없습니다.");
      }

      const folderName = String(targetFolder.name || "폴더").trim() || "폴더";
      const aggregateTitle = `${folderName} 전체 요약본`;
      const aggregateDocId = buildFolderAggregateDocId(normalizedFolderId);
      const totalSize = folderItems.reduce((sum, item) => sum + (Number(item?.size) || 0), 0);
      let savedArtifacts = docArtifactsCacheRef.current.get(aggregateDocId) || null;

      if (!savedArtifacts && user?.id) {
        try {
          const fetched = await fetchDocArtifacts({ userId: user.id, docId: aggregateDocId });
          savedArtifacts = {
            summary: fetched?.summary || null,
            quiz: fetched?.quiz_json || null,
            ox: fetched?.ox_json || null,
            highlights: fetched?.highlights_json || null,
          };
          docArtifactsCacheRef.current.set(aggregateDocId, savedArtifacts);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("folder aggregate preview artifact skipped", err);
        }
      }

      const savedSummary = String(savedArtifacts?.summary || "").trim();
      const placeholderFile = createPlaceholderPdfFile(`${aggregateTitle}.pdf`, [
        "Folder summary",
        savedSummary ? "Opening saved summary..." : "Preparing summary...",
      ]);
      return {
        id: aggregateDocId,
        file: placeholderFile,
        name: aggregateTitle,
        size: totalSize,
        thumbnail: buildFolderAggregateThumbnail(folderName),
        folderAggregate: true,
        folderId: normalizedFolderId,
        folderName,
        aggregateText: savedSummary || "폴더 전체 요약본을 준비 중입니다. 잠시만 기다려주세요.",
        aggregatePageInfo: { used: 1, total: 1 },
        aggregateThumbnail: buildFolderAggregateThumbnail(folderName),
        aggregateSourceCount: 0,
        aggregateTotalCount: folderItems.length,
        aggregateMissingSummaryCount: 0,
        aggregateTruncated: false,
      };
    },
    [folders, user?.id]
  );

  const buildFolderAggregateSelectionItem = useCallback(
    async (folderId) => {
      const normalizedFolderId = String(folderId || "").trim();
      if (!normalizedFolderId) {
        throw new Error("폴더 ID가 없습니다.");
      }

      const existingBuild = folderAggregateBuildRef.current.get(normalizedFolderId);
      if (existingBuild) {
        return existingBuild;
      }

      const buildPromise = (async () => {
        const targetFolder = folders.find((folder) => folder.id?.toString() === normalizedFolderId);
        if (!targetFolder) {
          throw new Error("선택한 폴더를 찾지 못했습니다.");
        }

        const folderItems = (uploadedFilesRef.current || []).filter(
          (item) => item.folderId?.toString() === normalizedFolderId
        );
        if (!folderItems.length) {
          throw new Error("이 폴더에 문서가 없습니다.");
        }

        const folderName = String(targetFolder.name || "폴더").trim() || "폴더";
        const aggregateTitle = `${folderName} 전체 요약본`;
        const aggregateDocId = buildFolderAggregateDocId(normalizedFolderId);
        const totalSize = folderItems.reduce((sum, item) => sum + (Number(item?.size) || 0), 0);
        const summarySections = [];
        const missingSummaryNames = [];
        let consumedLength = 0;
        let truncated = false;

        setStatus("파일별 요약을 불러오는 중...");
        const perFileArtifacts = await Promise.all(
          folderItems.map(async (sourceItem) => {
            const sourceDocId = String(sourceItem?.id || "").trim();
            if (!sourceDocId) return null;

            const cachedArtifacts = docArtifactsCacheRef.current.get(sourceDocId);
            if (cachedArtifacts) {
              return cachedArtifacts;
            }

            if (!user?.id) return null;
            try {
              const fetched = await fetchDocArtifacts({ userId: user.id, docId: sourceDocId });
              const mapped = {
                summary: fetched?.summary || null,
                quiz: fetched?.quiz_json || null,
                ox: fetched?.ox_json || null,
                highlights: fetched?.highlights_json || null,
              };
              docArtifactsCacheRef.current.set(sourceDocId, mapped);
              return mapped;
            } catch (err) {
              // eslint-disable-next-line no-console
              console.warn("folder aggregate summary artifact skipped", err);
              return null;
            }
          })
        );

        for (let index = 0; index < folderItems.length; index += 1) {
          const sourceItem = folderItems[index];
          const savedSummary = String(perFileArtifacts[index]?.summary || "").trim();
          if (!savedSummary) {
            missingSummaryNames.push(sourceItem?.name || `문서 ${index + 1}`);
            continue;
          }

          const remaining = FOLDER_AGGREGATE_MAX_LENGTH - consumedLength;
          if (remaining <= 0) {
            truncated = true;
            break;
          }

          let summaryText = savedSummary;
          if (summaryText.length > FOLDER_AGGREGATE_MAX_LENGTH_PER_FILE) {
            summaryText = `${summaryText.slice(0, FOLDER_AGGREGATE_MAX_LENGTH_PER_FILE).trim()}\n\n(이하 생략)`;
          }
          if (summaryText.length > remaining) {
            summaryText = summaryText.slice(0, remaining).trim();
            truncated = true;
          }
          if (!summaryText) continue;

          summarySections.push({
            id: sourceItem.id || `folder-summary-${index + 1}`,
            chapterNumber: summarySections.length + 1,
            chapterTitle: sourceItem.name || `문서 ${index + 1}`,
            pageStart: summarySections.length + 1,
            pageEnd: summarySections.length + 1,
            pagesPerChunk: 1,
            text: summaryText,
          });
          consumedLength += summaryText.length;
        }

        if (!summarySections.length) {
          throw new Error("폴더 전체 요약본을 만들려면 먼저 폴더 안 문서들에서 개별 요약을 생성해주세요.");
        }

        const signature = JSON.stringify({
          folderName,
          sections: summarySections.map((section) => ({
            id: section.id,
            title: section.chapterTitle,
            text: section.text,
          })),
          missingSummaryNames,
          truncated,
        });
        const cached = folderAggregateCacheRef.current.get(normalizedFolderId);
        if (cached?.signature === signature && cached?.item) {
          return cached.item;
        }

        let savedAggregateArtifacts = docArtifactsCacheRef.current.get(aggregateDocId) || null;
        if (!savedAggregateArtifacts && user?.id) {
          try {
            const fetched = await fetchDocArtifacts({
              userId: user.id,
              docId: aggregateDocId,
            });
            savedAggregateArtifacts = {
              summary: fetched?.summary || null,
              quiz: fetched?.quiz_json || null,
              ox: fetched?.ox_json || null,
              highlights: fetched?.highlights_json || null,
            };
            docArtifactsCacheRef.current.set(aggregateDocId, savedAggregateArtifacts);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.warn("folder aggregate artifact skipped", err);
          }
        }

        const savedFolderSummary = String(savedAggregateArtifacts?.summary || "").trim();
        const savedAggregateMeta =
          savedAggregateArtifacts?.highlights &&
          typeof savedAggregateArtifacts.highlights === "object" &&
          !Array.isArray(savedAggregateArtifacts.highlights)
            ? savedAggregateArtifacts.highlights?.[FOLDER_AGGREGATE_META_KEY]
            : null;
        const canReuseSavedFolderSummary =
          savedFolderSummary &&
          savedAggregateMeta &&
          String(savedAggregateMeta?.sourceSignature || "").trim() === signature;

        let aggregateText = savedFolderSummary;
        if (!canReuseSavedFolderSummary) {
          setStatus("파일별 요약을 바탕으로 폴더 전체 요약을 생성 중...");
          const { generateSummary } = await getOpenAiService();
          aggregateText = await generateSummary("", {
            scope: `${folderName} 폴더 전체`,
            chapterized: true,
            chapterSections: summarySections,
          });

          const coverageNotes = [];
          if (missingSummaryNames.length > 0) {
            const previewNames = missingSummaryNames.slice(0, 5).join(", ");
            const suffix = missingSummaryNames.length > 5 ? " 외" : "";
            coverageNotes.push(
              `이번 폴더 통합 요약에서는 저장된 개별 요약이 없는 파일 ${missingSummaryNames.length}개를 제외했습니다: ${previewNames}${suffix}`
            );
          }
          if (truncated) {
            coverageNotes.push("파일별 요약 길이가 길어 일부 내용은 축약해 반영했습니다.");
          }
          if (coverageNotes.length > 0) {
            aggregateText = `${String(aggregateText || "").trim()}\n\n---\n${coverageNotes.join("\n")}`.trim();
          }

          if (user?.id) {
            const preservedHighlights =
              savedAggregateArtifacts?.highlights &&
              typeof savedAggregateArtifacts.highlights === "object" &&
              !Array.isArray(savedAggregateArtifacts.highlights)
                ? { ...savedAggregateArtifacts.highlights }
                : {};
            preservedHighlights[FOLDER_AGGREGATE_META_KEY] = {
              sourceSignature: signature,
              sourceCount: summarySections.length,
              totalCount: folderItems.length,
              missingSummaryCount: missingSummaryNames.length,
              truncated,
              updatedAt: new Date().toISOString(),
            };
            await saveDocArtifacts({
              userId: user.id,
              docId: aggregateDocId,
              summary: aggregateText,
              highlights: preservedHighlights,
            });
            docArtifactsCacheRef.current.set(aggregateDocId, {
              ...(savedAggregateArtifacts || {}),
              summary: aggregateText,
              highlights: preservedHighlights,
            });
          }
        }

        let aggregatePdfResult;
        try {
          aggregatePdfResult = await createRichTextPdfFile(aggregateText, {
            filename: `${aggregateTitle}.pdf`,
            title: aggregateTitle,
          });
        } catch (richPdfError) {
          console.warn("rich summary PDF export failed, falling back to plain text PDF", richPdfError);
          aggregatePdfResult = await createTextPdfFile(aggregateText, {
            filename: `${aggregateTitle}.pdf`,
            title: aggregateTitle,
          });
        }

        const { file: aggregateFile, pageCount: aggregatePageCount } = aggregatePdfResult;
        const aggregateThumbnail = await generateDocumentThumbnail(aggregateFile);
        const aggregateItem = {
          id: aggregateDocId,
          file: aggregateFile,
          name: aggregateTitle,
          size: totalSize,
          thumbnail: aggregateThumbnail,
          folderAggregate: true,
          folderId: normalizedFolderId,
          folderName,
          aggregateText,
          aggregatePageInfo: {
            used: Number(aggregatePageCount) || 1,
            total: Number(aggregatePageCount) || 1,
          },
          aggregateThumbnail,
          aggregateSourceCount: summarySections.length,
          aggregateTotalCount: folderItems.length,
          aggregateMissingSummaryCount: missingSummaryNames.length,
          aggregateTruncated: truncated,
        };

        folderAggregateCacheRef.current.set(normalizedFolderId, {
          signature,
          item: aggregateItem,
        });
        return aggregateItem;
      })();

      folderAggregateBuildRef.current.set(normalizedFolderId, buildPromise);
      try {
        return await buildPromise;
      } finally {
        if (folderAggregateBuildRef.current.get(normalizedFolderId) === buildPromise) {
          folderAggregateBuildRef.current.delete(normalizedFolderId);
        }
      }
    },
    [folders, getOpenAiService, user?.id]
  );

  const handleSelectFile = useCallback(
    async (item) => {
      try {
        const ensured = await ensureFileForItemRef.current(item);
        await processSelectedFileRef.current(ensured);
      } catch (err) {
        setError(`?좏깮???뚯씪???щ뒗 ???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [ensureFileForItemRef, processSelectedFileRef]
  );

  const handleSelectFolderSummary = useCallback(
    async (folderId, { pushState = true } = {}) => {
      try {
        setError("");
        setStatus("폴더 전체 요약본을 여는 중...");
        const normalizedFolderId = String(folderId || "").trim();
        const aggregateDocId = buildFolderAggregateDocId(normalizedFolderId);
        const previewItem = await buildFolderAggregatePreviewItem(normalizedFolderId);
        await processSelectedFileRef.current(previewItem, { pushState });

        buildFolderAggregateSelectionItem(normalizedFolderId)
          .then(async (aggregateItem) => {
            if (!aggregateItem) return;
            if (selectedFileIdRef.current !== aggregateDocId) return;
            const isSameFile =
              aggregateItem.file === previewItem.file &&
              String(aggregateItem.aggregateText || "").trim() ===
                String(previewItem.aggregateText || "").trim();
            if (isSameFile) return;
            await processSelectedFileRef.current(aggregateItem, { pushState: false });
          })
          .catch((err) => {
            if (selectedFileIdRef.current === aggregateDocId) {
              setError(`폴더 전체 요약본을 준비하지 못했습니다: ${err.message}`);
            }
          });
      } catch (err) {
        setError(`폴더 전체 요약본을 여는 데 실패했습니다: ${err.message}`);
      }
    },
    [buildFolderAggregatePreviewItem, buildFolderAggregateSelectionItem]
  );


  const persistArtifacts = useCallback(
    async (partial) => {
      if (!user || !selectedFileId) return;
      const normalizedDocId = String(selectedFileId || "").trim();
      const merged = {
        ...(artifacts || {}),
        ...partial,
      };
      setArtifacts(merged);
      if (normalizedDocId) {
        docArtifactsCacheRef.current.set(normalizedDocId, merged);
      }
      if (Object.prototype.hasOwnProperty.call(partial || {}, "summary")) {
        folderAggregateCacheRef.current.clear();
        folderAggregateBuildRef.current.clear();
      }
      try {
        await saveDocArtifacts({
          userId: user.id,
          docId: normalizedDocId,
          summary: merged.summary,
          quiz: merged.quiz,
          ox: merged.ox,
          highlights: merged.highlights,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("??μ뿉 ?ㅽ뙣?덉뒿?덈떎: artifacts", err);
      }
    },
    [artifacts, selectedFileId, user]
  );

  const persistPartialSummaryBundle = useCallback(
    ({ summary = "", range = "", library = savedPartialSummaries } = {}) => {
      const nextHighlights = writePartialSummaryBundleToHighlights(artifacts?.highlights, {
        summary,
        range,
        library,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [artifacts?.highlights, persistArtifacts, savedPartialSummaries]
  );

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    folderAggregateCacheRef.current.clear();
    folderAggregateBuildRef.current.clear();
  }, [folders, uploadedFiles]);

  useEffect(() => {
    goBackToListRef.current = goBackToList;
  }, [goBackToList]);

  useEffect(() => {
    selectedFileIdRef.current = selectedFileId;
  }, [selectedFileId]);

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
    if (!isNativePlatform || typeof window === "undefined" || !window.history) return;
    const url = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({ appNav: true, view: "root" }, "", url);
    window.history.pushState({ appNav: true, view: "list" }, "", url);
  }, [isNativePlatform]);

  useEffect(() => {
    const handlePopState = (event) => {
      const state = event.state;

      if (isNativePlatform && consumeOverlayBack()) {
        updateHistoryState("push");
        return;
      }

      if (state?.view === "detail" && state.fileId) {
        if (isFolderAggregateDocId(state.fileId)) {
          const folderId = parseFolderAggregateDocId(state.fileId);
          if (folderId) {
            handleSelectFolderSummary(folderId, { pushState: false });
            return;
          }
        }
        const target = uploadedFilesRef.current.find((f) => f.id === state.fileId);
        if (target) {
          processSelectedFileRef.current(target, { pushState: false });
          return;
        }
      }

      if (showDetail) {
        goBackToListRef.current();
        return;
      }

      if (isNativePlatform && state?.view === "root") {
        updateHistoryState("push", { view: "list" });
        return;
      }

      if (!isNativePlatform) {
        goBackToListRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [consumeOverlayBack, handleSelectFolderSummary, isNativePlatform, showDetail, updateHistoryState]);

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

  const handlePageChange = useCallback(
    (nextPage) => {
      const parsed = Number.parseInt(nextPage, 10);
      if (!Number.isFinite(parsed)) return;
      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      const bounded = totalPages > 0 ? Math.min(Math.max(parsed, 1), totalPages) : Math.max(parsed, 1);
      setCurrentPage((prev) => (prev === bounded ? prev : bounded));
    },
    [pageInfo?.total, pageInfo?.used]
  );

  useEffect(() => {
    if (!selectedFileId) return;
    const normalizedPage = Number.parseInt(currentPage, 10);
    if (!Number.isFinite(normalizedPage) || normalizedPage <= 0) return;
    setVisitedPages((prev) => {
      if (prev.has(normalizedPage)) return prev;
      const next = new Set(prev);
      next.add(normalizedPage);
      return next;
    });
  }, [currentPage, selectedFileId]);

  useEffect(() => {
    if (!selectedFileId) return;
    savePageProgressSnapshot({
      docId: selectedFileId,
      visited: Array.from(visitedPages),
      page: currentPage,
    });
  }, [currentPage, savePageProgressSnapshot, selectedFileId, visitedPages]);

  const splitStyle = {
    "--split-basis": `${splitPercent}%`,
  };

  const resolveChapterOneStartPage = useCallback(async () => {
    if (!file || !isCurrentPdfDocument) return 1;
    const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return 1;

    const manualRangeRaw = String(chapterRangeInput || "").trim();
    if (manualRangeRaw) {
      const parsed = parseChapterRangeSelectionInput(manualRangeRaw, totalPages);
      if (!parsed.error && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
        const sorted = [...parsed.chapters].sort(
          (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
        );
        const chapterOne =
          sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
        const start = Number.parseInt(chapterOne?.pageStart, 10);
        if (Number.isFinite(start) && start > 0) {
          return Math.min(totalPages, Math.max(1, start));
        }
      }
    }

    const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    const cachedStart = Number(chapterOneStartPageCacheRef.current.get(docKey));
    if (Number.isFinite(cachedStart) && cachedStart > 0) {
      return Math.min(totalPages, Math.max(1, cachedStart));
    }

    try {
      const detected = await extractChapterRangesFromToc(file, {
        maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
      });
      const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
      if (chapters.length > 0) {
        const sorted = [...chapters].sort(
          (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
        );
        const chapterOne =
          sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
        const start = Number.parseInt(chapterOne?.pageStart, 10);
        if (Number.isFinite(start) && start > 0) {
          const normalizedStart = Math.min(totalPages, Math.max(1, start));
          chapterOneStartPageCacheRef.current.set(docKey, normalizedStart);
          return normalizedStart;
        }
      }
    } catch {
      // Ignore chapter detection failures and fallback to page 1.
    }

    chapterOneStartPageCacheRef.current.set(docKey, 1);
    return 1;
  }, [chapterRangeInput, file, isCurrentPdfDocument, pageInfo?.total, pageInfo?.used, selectedFileId]);

  const resolveQuestionSourceText = useCallback(
    async ({ featureLabel, chapterSelectionInput, baseText }) => {
      const chapterSelectionRaw = String(chapterSelectionInput || "").trim();
      if (chapterSelectionRaw) {
        const extractor = extractTextForChapterSelectionRef.current;
        if (typeof extractor !== "function") {
          throw new Error("챕터 범위 추출기가 아직 준비되지 않았습니다. 다시 시도해주세요.");
        }
        const scoped = await extractor({
          featureLabel,
          chapterSelectionInput: chapterSelectionRaw,
        });
        return {
          text: String(scoped?.text || "").trim(),
          scopeLabel: String(scoped?.scopeLabel || "").trim(),
        };
      }

      let sourceText = String(baseText || "").trim();
      if (!file || !isCurrentPdfDocument) {
        return { text: sourceText, scopeLabel: "" };
      }

      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      if (!Number.isFinite(totalPages) || totalPages <= 0) {
        return { text: sourceText, scopeLabel: "" };
      }

      const chapterOneStartPage = await resolveChapterOneStartPage();
      if (!Number.isFinite(chapterOneStartPage) || chapterOneStartPage <= 1) {
        return { text: sourceText, scopeLabel: "" };
      }

      const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
      const cacheKey = `${docKey}:chapter1:${chapterOneStartPage}`;
      const cachedText = questionSourceTextCacheRef.current.get(cacheKey);
      if (typeof cachedText === "string" && cachedText.trim().length > 80) {
        return {
          text: cachedText,
          scopeLabel: `chapter 1+ (p.${chapterOneStartPage}~)`,
        };
      }

      const pageEnd = Math.min(totalPages, chapterOneStartPage + 119);
      const pages = [];
      for (let page = chapterOneStartPage; page <= pageEnd; page += 1) {
        pages.push(page);
      }
      setStatus(`${featureLabel}: 챕터 1 이전 머릿말을 제외하고 텍스트를 준비 중...`);

      let extracted = await extractPdfTextFromPages(file, pages, 52000, {
        useOcr: false,
      });
      let filteredText = String(extracted?.text || "").trim();
      let filteredApplied = false;
      if (!filteredText) {
        extracted = await extractPdfTextFromPages(file, pages, 52000, {
          useOcr: true,
          ocrLang: "kor+eng",
          onOcrProgress: (message) => setStatus(message),
        });
        filteredText = String(extracted?.text || "").trim();
      }
      if (filteredText) {
        questionSourceTextCacheRef.current.set(cacheKey, filteredText);
        sourceText = filteredText;
        filteredApplied = true;
      }

      return {
        text: sourceText,
        scopeLabel: filteredApplied ? `chapter 1+ (p.${chapterOneStartPage}~)` : "",
      };
    },
    [file, isCurrentPdfDocument, pageInfo?.total, pageInfo?.used, resolveChapterOneStartPage, selectedFileId]
  );

  const requestQuestions = async ({ force = false } = {}) => {
    if (isLoadingQuiz && !force) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (isFreeTier && quizSets.length > 0) {
      setError("무료 플랜에서는 퀴즈 세트를 1개만 생성할 수 있습니다.");
      return;
    }
    if (!force && hasReached("maxQuiz")) {
      setError("현재 요금제의 퀴즈 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    const isPdfSource = isCurrentPdfDocument;

    if (!extractedText && !chapterSelectionRaw && !isPdfSource) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }

    setIsLoadingQuiz(true);
    setError("");
    setStatus("퀴즈 세트 생성 중...");

    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "퀴즈",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      const quizSourceText = String(scopedSource?.text || "").trim();
      const scopeLabel = String(scopedSource?.scopeLabel || "").trim();
      if (!quizSourceText) {
        throw new Error("챕터 1 이후 텍스트를 찾지 못했습니다. 챕터 범위를 먼저 설정해주세요.");
      }
      if (scopeLabel) {
        setStatus(`퀴즈 세트 생성 중... (${scopeLabel})`);
      }

      const historicalQuizTexts = collectQuestionTextsFromQuizSets(quizSets);
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidQuestionTexts = dedupeQuestionTexts([...historicalQuizTexts, ...historicalMockTexts]).slice(0, 80);
      const seenQuestionKeys = createQuestionKeySet(avoidQuestionTexts);

      const targetMcCount = Math.max(0, Number(quizMix.multipleChoice) || 0);
      const targetSaCount = Math.max(0, Number(quizMix.shortAnswer) || 0);
      const nextMultipleChoice = [];
      const nextShortAnswer = [];

      const { generateQuiz } = await getOpenAiService();
      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (nextMultipleChoice.length >= targetMcCount && nextShortAnswer.length >= targetSaCount) break;

        const requestMcCount = Math.min(5, Math.max(targetMcCount - nextMultipleChoice.length, 1) + 1);
        const requestSaCount = Math.min(5, Math.max(targetSaCount - nextShortAnswer.length, 0) + 1);

        const quiz = normalizeQuizPayload(
          await generateQuiz(quizSourceText, {
            multipleChoiceCount: requestMcCount,
            shortAnswerCount: requestSaCount,
            avoidQuestions: avoidQuestionTexts,
          })
        );

        pushUniqueByQuestionKey(
          nextMultipleChoice,
          Array.isArray(quiz.multipleChoice) ? quiz.multipleChoice : [],
          getQuizPromptText,
          seenQuestionKeys,
          targetMcCount
        );
        pushUniqueByQuestionKey(
          nextShortAnswer,
          Array.isArray(quiz.shortAnswer) ? quiz.shortAnswer : [],
          getQuizPromptText,
          seenQuestionKeys,
          targetSaCount
        );

        const mergedAvoidQuestions = mergeQuestionHistory(
          avoidQuestionTexts,
          [...nextMultipleChoice.map(getQuizPromptText), ...nextShortAnswer.map(getQuizPromptText)],
          120
        );
        avoidQuestionTexts.splice(0, avoidQuestionTexts.length, ...mergedAvoidQuestions);
      }

      if (nextMultipleChoice.length < targetMcCount || nextShortAnswer.length < targetSaCount) {
        throw new Error("중복 문항을 제외하느라 충분한 새 문항을 만들지 못했습니다. 범위를 바꿔 다시 시도해 주세요.");
      }

      const trimmedQuiz = {
        multipleChoice: nextMultipleChoice.slice(0, targetMcCount),
        shortAnswer: nextShortAnswer.slice(0, targetSaCount),
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
      setStatus(scopeLabel ? `퀴즈 세트가 생성되었습니다. (${scopeLabel})` : "퀴즈 세트가 생성되었습니다.");
      setUsageCounts((prev) => ({ ...prev, quiz: prev.quiz + 1 }));
      persistArtifacts({ quiz: trimmedQuiz });
    } catch (err) {
      setError(`퀴즈 세트 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const regenerateQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (isFreeTier) {
      setError("무료 플랜에서는 퀴즈 세트를 다시 생성할 수 없습니다.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("현재 요금제의 퀴즈 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isCurrentPdfDocument) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    quizAutoRequestedRef.current = true;
    resetQuizState();
    setStatus("퀴즈 세트를 초기화하고 다시 생성하는 중...");
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
          chapterTitle: `챕터 ${normalizedChapterNumber} (${pageStart}-${pageEnd}p)`,
          pagesPerChunk,
          pageStart,
          pageEnd,
        });
        sectionIndex += 1;
      }
    }

    return expanded;
  };

  const resolveChapterRangeLimit = useCallback(
    (rawInput) => {
      const pageLimit = Number(pageInfo.total || pageInfo.used || 0);
      if (isCurrentPdfDocument) {
        return pageLimit;
      }
      let inferredLimit = 0;

      String(rawInput || "")
        .split(/[\n,;]+/)
        .map((token) => token.trim())
        .filter(Boolean)
        .forEach((token) => {
          const compact = token.replace(/\s+/g, "");
          let matched =
            compact.match(/^(\d+)[:=](\d+)-(\d+)$/i) ||
            compact.match(/^ch(?:apter)?(\d+)[:=](\d+)-(\d+)$/i);
          if (matched) {
            inferredLimit = Math.max(inferredLimit, Number.parseInt(matched[3], 10) || 0);
            return;
          }

          matched = compact.match(/^(\d+)-(\d+)$/);
          if (matched) {
            inferredLimit = Math.max(inferredLimit, Number.parseInt(matched[2], 10) || 0);
          }
        });

      return Math.max(pageLimit, inferredLimit);
    },
    [isCurrentPdfDocument, pageInfo.total, pageInfo.used]
  );

  const extractNonPdfSlideSections = useCallback((sourceText) => {
    const normalizedText = String(sourceText || "").replace(/\r\n/g, "\n").trim();
    if (!normalizedText) return [];

    const matches = [...normalizedText.matchAll(/^\[Slide\s+(\d+)\]\s*$/gim)];
    if (!matches.length) return [];

    return matches
      .map((match, index) => {
        const slideNumber = Number.parseInt(match[1], 10);
        if (!Number.isFinite(slideNumber) || slideNumber <= 0) return null;
        const contentStart = (match.index || 0) + match[0].length;
        const nextMatchIndex = index + 1 < matches.length ? matches[index + 1].index : normalizedText.length;
        const contentEnd = Number.isFinite(nextMatchIndex) ? nextMatchIndex : normalizedText.length;
        const text = normalizedText.slice(contentStart, contentEnd).trim();
        if (!text) return null;
        return {
          slideNumber,
          text,
        };
      })
      .filter(Boolean);
  }, []);

  const loadExtendedNonPdfSourceText = useCallback(
    async ({ featureLabel = "문서", targetUnitCount = 0 } = {}) => {
      const baseText = String(extractedText || "").trim();
      if (!file || isCurrentPdfDocument) {
        return baseText;
      }

      const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
      const cachedText = String(summaryContextCacheRef.current.get(docKey) || "").trim();
      const currentText = cachedText.length > baseText.length ? cachedText : baseText;
      const hasExpandedCache = cachedText.length > baseText.length + 256;
      const slideSections = extractNonPdfSlideSections(currentText);
      const maxSlideNumber = slideSections.reduce(
        (maxNumber, section) => Math.max(maxNumber, Number(section?.slideNumber) || 0),
        0
      );
      const likelyInitialCap = !hasExpandedCache && baseText.length >= 11500;
      const needsMoreSlideCoverage =
        activeDocumentKind === "pptx" &&
        Number(targetUnitCount) > 0 &&
        maxSlideNumber > 0 &&
        maxSlideNumber < Number(targetUnitCount);

      if (!likelyInitialCap && !needsMoreSlideCoverage) {
        return currentText;
      }

      const normalizedTargetUnitCount = Math.max(
        1,
        Number(targetUnitCount) || 0,
        Number(pageInfo.total || pageInfo.used || 0)
      );
      const targetMaxLength =
        activeDocumentKind === "pptx"
          ? Math.min(240000, Math.max(24000, normalizedTargetUnitCount * 1800, currentText.length * 3))
          : Math.min(180000, Math.max(24000, normalizedTargetUnitCount * 1600, currentText.length * 3));

      setStatus(`${featureLabel}: 문서 전체 텍스트를 준비 중...`);
      try {
        const extended = await extractDocumentText(file, {
          maxLength: targetMaxLength,
        });
        const extendedText = String(extended?.text || "").trim();
        if (extendedText.length > currentText.length) {
          summaryContextCacheRef.current.set(docKey, extendedText);
          return extendedText;
        }
      } catch {
        // Fall back to the already extracted non-PDF text.
      }

      if (currentText && currentText.length > cachedText.length) {
        summaryContextCacheRef.current.set(docKey, currentText);
      }
      return currentText;
    },
    [
      activeDocumentKind,
      extractNonPdfSlideSections,
      extractedText,
      file,
      isCurrentPdfDocument,
      pageInfo.total,
      pageInfo.used,
      selectedFileId,
    ]
  );

  const buildNonPdfChapterSectionsFromText = useCallback((sourceText, ranges, totalUnits) => {
    const normalizedText = String(sourceText || "").replace(/\r\n/g, "\n").trim();
    if (!normalizedText) return [];

    const slideSections = extractNonPdfSlideSections(normalizedText);
    const list = Array.isArray(ranges) ? [...ranges] : [];
    list.sort((left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0));
    if (!list.length) return [];

    if (slideSections.length) {
      return list
        .map((range, index) => {
          const pageStart = Math.max(1, Number.parseInt(range?.pageStart, 10) || 1);
          const pageEnd = Math.max(pageStart, Number.parseInt(range?.pageEnd, 10) || pageStart);
          const text = slideSections
            .filter((section) => section.slideNumber >= pageStart && section.slideNumber <= pageEnd)
            .map((section) => `[Slide ${section.slideNumber}]\n${section.text}`)
            .join("\n\n")
            .trim();
          if (!text) return null;

          const chapterNumber = Number.parseInt(range?.chapterNumber, 10) || index + 1;
          return {
            ...range,
            chapterNumber,
            chapterTitle: String(range?.chapterTitle || `챕터 ${chapterNumber}`).trim(),
            pageStart,
            pageEnd,
            text,
          };
        })
        .filter(Boolean);
    }

    const safeTotalUnits = Math.max(
      1,
      Number(totalUnits) || 0,
      ...list.map((range) => Number.parseInt(range?.pageEnd, 10) || 0)
    );
    let previousEndOffset = 0;
    return list
      .map((range, index) => {
        const pageStart = Math.max(1, Number.parseInt(range?.pageStart, 10) || 1);
        const pageEnd = Math.max(pageStart, Number.parseInt(range?.pageEnd, 10) || pageStart);
        let startOffset = Math.floor(((pageStart - 1) / safeTotalUnits) * normalizedText.length);
        let endOffset = Math.ceil((pageEnd / safeTotalUnits) * normalizedText.length);

        startOffset = Math.max(previousEndOffset, Math.min(startOffset, Math.max(normalizedText.length - 1, 0)));
        endOffset = Math.max(startOffset + 1, Math.min(normalizedText.length, endOffset));

        if (index === list.length - 1) {
          endOffset = normalizedText.length;
        }

        const text = normalizedText.slice(startOffset, endOffset).trim();
        previousEndOffset = endOffset;
        if (!text) return null;

        const chapterNumber = Number.parseInt(range?.chapterNumber, 10) || index + 1;
        return {
          ...range,
          chapterNumber,
          chapterTitle: String(range?.chapterTitle || `챕터 ${chapterNumber}`).trim(),
          pageStart,
          pageEnd,
          text,
        };
      })
      .filter(Boolean);
  }, [extractNonPdfSlideSections]);

  const extractTextForChapterSelection = useCallback(
    async ({ featureLabel, chapterSelectionInput }) => {
      if (!file) {
        throw new Error("먼저 문서를 열어주세요.");
      }

      let chapterConfigRaw = String(chapterRangeInput || "").trim();
      if (!chapterConfigRaw) {
        let autoChapterInput = "";
        if (isCurrentPdfDocument) {
          const totalPages = pageInfo.total || pageInfo.used || 0;
          try {
            setStatus(`${featureLabel}: 챕터 범위를 자동 탐색 중...`);
            const detected = await extractChapterRangesFromToc(file, {
              maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
            });
            const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
            autoChapterInput = chapters
              .map((chapter, index) => {
                const start = Number.parseInt(chapter?.pageStart, 10);
                const end = Number.parseInt(chapter?.pageEnd, 10);
                if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return "";
                return `${index + 1}:${start}-${end}`;
              })
              .filter(Boolean)
              .join("\n");

            if (autoChapterInput) {
              const limit = totalPages || Number(detected?.totalPages) || 0;
              const parsedAuto = parseChapterRangeSelectionInput(autoChapterInput, limit);
              if (!parsedAuto.error && parsedAuto.chapters.length > 0) {
                setChapterRangeInput(autoChapterInput);
                setChapterRangeError("");
                const targetDocId = selectedFileId || file?.name || "";
                if (targetDocId) {
                  persistChapterRangeInput(targetDocId, autoChapterInput);
                }
              } else {
                autoChapterInput = "";
              }
            }
          } catch {
            autoChapterInput = "";
          }
        }

        if (!autoChapterInput) {
          throw new Error(
            isCurrentPdfDocument
              ? "먼저 챕터 범위를 설정해주세요. 요약 탭의 챕터 범위 설정에서 다시 시도해주세요."
              : "비PDF 문서는 자동 목차 추출이 없어 직접 챕터 범위를 입력해야 합니다."
          );
        }
        chapterConfigRaw = autoChapterInput;
      }

      if (!chapterConfigRaw) {
        throw new Error("먼저 챕터 범위를 설정해주세요.");
      }

      const totalPages = resolveChapterRangeLimit(chapterConfigRaw);
      const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
      if (parsedChapters.error) {
        setChapterRangeError(parsedChapters.error);
        throw new Error(parsedChapters.error);
      }
      if (!parsedChapters.chapters.length) {
        throw new Error("설정된 챕터 범위를 찾지 못했습니다.");
      }

      const selected = parseChapterNumberSelectionInput(chapterSelectionInput, parsedChapters.chapters);
      if (selected.error) {
        throw new Error(selected.error);
      }
      const selectedNumbers = selected.chapterNumbers;
      const selectedNumberSet = new Set(selectedNumbers);
      const targetChapters = parsedChapters.chapters.filter((chapter) =>
        selectedNumberSet.has(Number.parseInt(chapter?.chapterNumber, 10))
      );
      if (!targetChapters.length) {
        throw new Error("선택한 챕터에 해당하는 범위가 없습니다.");
      }

      const normalizedSelection = selectedNumbers.join(",");
      const scopeLabel = `chapter ${normalizedSelection}`;
      const cacheKey = `${selectedFileId || file?.name || "doc"}::${chapterConfigRaw}::${normalizedSelection}`;
      const cached = chapterScopeTextCacheRef.current.get(cacheKey);
      if (cached) {
        return { text: cached, scopeLabel };
      }

      setStatus(`${featureLabel}: 챕터 범위 텍스트 추출 중...`);
      const nonPdfSourceText = isCurrentPdfDocument
        ? ""
        : await loadExtendedNonPdfSourceText({
            featureLabel,
            targetUnitCount: totalPages,
          });
      const scopedSections = isCurrentPdfDocument
        ? (await extractPdfTextByRanges(file, targetChapters, {
            maxLengthPerRange: 14000,
            useOcr: true,
            ocrLang: "kor+eng",
            onOcrProgress: (message) => setStatus(message),
          }))?.chapters || []
        : buildNonPdfChapterSectionsFromText(nonPdfSourceText, targetChapters, totalPages);
      const scopedText = scopedSections
        .map((chapter) => {
          const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
          const title = chapterNumber > 0 ? `챕터 ${chapterNumber}` : "챕터";
          const text = String(chapter?.text || "").trim();
          if (!text) return "";
          return `## ${title}\n${text}`;
        })
        .filter(Boolean)
        .join("\n\n");
      if (!scopedText.trim()) {
        throw new Error("선택한 챕터 범위에서 텍스트를 추출하지 못했습니다.");
      }

      chapterScopeTextCacheRef.current.set(cacheKey, scopedText);
      return { text: scopedText, scopeLabel };
    },
    [
      chapterRangeInput,
      buildNonPdfChapterSectionsFromText,
      extractedText,
      file,
      isCurrentPdfDocument,
      loadExtendedNonPdfSourceText,
      pageInfo.total,
      pageInfo.used,
      persistChapterRangeInput,
      resolveChapterRangeLimit,
      selectedFileId,
    ]
  );
  useEffect(() => {
    extractTextForChapterSelectionRef.current = extractTextForChapterSelection;
  }, [extractTextForChapterSelection]);

  const requestSummary = async ({ force = false, replaceExisting = true } = {}) => {
    const hasExistingSummary = Boolean(String(summary || "").trim());
    const shouldReplaceExisting = replaceExisting && hasExistingSummary;
    if (isLoadingSummary || (!force && summaryRequestedRef.current && !shouldReplaceExisting)) return;
    const hasManualChapterConfig = Boolean(String(chapterRangeInput || "").trim());
    const isPdfSource = isCurrentPdfDocument;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!force && hasReached("maxSummary") && !shouldReplaceExisting) {
      setError("현재 요금제의 요약 생성 한도에 도달했습니다.");
      return;
    }
    if (!extractedText && !hasManualChapterConfig) {
      setError("추출된 텍스트가 없습니다. 챕터 범위를 입력하거나 PDF 텍스트 추출을 먼저 실행해주세요.");
      return;
    }

    if (shouldReplaceExisting) {
      summaryRequestedRef.current = false;
      setSummary("");
      setStatus("기존 요약을 지우는 중...");
      await persistArtifacts({ summary: null });
    }

    summaryRequestedRef.current = true;
    setIsLoadingSummary(true);
    setError("");
    setChapterRangeError("");
    setStatus("요약 생성 중...");
    try {
      const chapterConfigRaw = String(chapterRangeInput || "").trim();
      let customChapterSections = null;
      if (chapterConfigRaw) {
        const totalPages = resolveChapterRangeLimit(chapterConfigRaw);
        const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
        if (parsedChapters.error) {
          setChapterRangeError(parsedChapters.error);
          throw new Error(parsedChapters.error);
        }
        const chapterRangesForSummary = isPdfSource
          ? buildAdaptiveChapterSummaryRanges(parsedChapters.chapters)
          : parsedChapters.chapters;
        if (!chapterRangesForSummary.length) {
          throw new Error("요약에 사용할 수 있는 챕터 범위가 없습니다.");
        }
        const pagesPerChunkById = new Map(
          chapterRangesForSummary.map((range) => [
            String(range.id),
            Number(range.pagesPerChunk) ||
              Math.max(1, (Number(range?.pageEnd) || 0) - (Number(range?.pageStart) || 0) + 1),
          ])
        );
        setStatus("설정한 챕터 범위의 텍스트를 추출하는 중...");
        const nonPdfSourceText = isPdfSource
          ? ""
          : await loadExtendedNonPdfSourceText({
              featureLabel: "요약",
              targetUnitCount: totalPages,
            });
        const extractedChapters = isPdfSource
          ? (await extractPdfTextByRanges(file, chapterRangesForSummary, {
              maxLengthPerRange: 14000,
              useOcr: true,
              ocrLang: "kor+eng",
              onOcrProgress: (message) => setStatus(message),
            }))?.chapters || []
          : buildNonPdfChapterSectionsFromText(nonPdfSourceText, chapterRangesForSummary, totalPages);
        customChapterSections = extractedChapters
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
          throw new Error("설정한 챕터 범위에서 텍스트를 추출하지 못했습니다.");
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
        } else if (file && summaryCacheKey && isPdfSource) {
          try {
            setStatus("요약 정확도 향상을 위해 추출 범위를 확장하는 중...");
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

      setStatus("AI로 요약을 생성하는 중...");
      const { generateSummary } = await getOpenAiService();
      const summarized = customChapterSections
        ? await generateSummary("", {
            scope: "사용자 지정 챕터 범위",
            chapterized: true,
            chapterSections: customChapterSections,
          })
        : await generateSummary(summarySourceText);
      setSummary(summarized);
      setUsageCounts((prev) => ({ ...prev, summary: prev.summary + 1 }));
      setStatus("요약이 생성되었습니다.");
      persistArtifacts({ summary: summarized });
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
      setStatus("");
      summaryRequestedRef.current = false;
      setStatus("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleAutoDetectChapterRanges = useCallback(async () => {
    if (isDetectingChapterRanges || isLoadingSummary || isLoadingText) return;
    if (!file) {
      setChapterRangeError("먼저 문서를 열어주세요.");
      return;
    }
    if (!isCurrentPdfDocument) {
      setChapterRangeError("목차 자동 감지는 PDF에서만 지원됩니다. 비PDF 문서는 직접 범위를 입력해주세요.");
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
    isCurrentPdfDocument,
    isDetectingChapterRanges,
    isLoadingSummary,
    isLoadingText,
    pageInfo.total,
    pageInfo.used,
  ]);

  const handleConfirmChapterRanges = useCallback(() => {
    const raw = String(chapterRangeInput || "").trim();
    if (!raw) {
      setChapterRangeError("먼저 챕터 범위를 입력해주세요.");
      return;
    }
    const totalPages = resolveChapterRangeLimit(raw);
    const parsed = parseChapterRangeSelectionInput(raw, totalPages);
    if (parsed.error) {
      setChapterRangeError(parsed.error);
      return;
    }
    const targetDocId = selectedFileId || file?.name || "";
    if (!targetDocId) {
      setChapterRangeError("먼저 문서를 열어주세요.");
      return;
    }
    persistChapterRangeInput(targetDocId, raw);
    setChapterRangeError("");
    setStatus(`챕터 범위를 저장했습니다. (${parsed.chapters.length} sections)`);
    setIsChapterRangeOpen(false);
  }, [
    chapterRangeInput,
    file,
    isCurrentPdfDocument,
    pageInfo.total,
    pageInfo.used,
    persistChapterRangeInput,
    resolveChapterRangeLimit,
    selectedFileId,
  ]);

  const handleSummaryByPages = useCallback(async () => {
    if (isPageSummaryLoading || isLoadingSummary) return;
    if (!isCurrentPdfDocument) {
      setPageSummaryError("페이지 범위 요약은 PDF에서만 지원됩니다.");
      return;
    }
    if (!file || !selectedFileId) {
      setPageSummaryError("PDF를 먼저 열어주세요.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    if (!totalPages) {
      setPageSummaryError("총 페이지 수를 확인할 수 없습니다. PDF를 다시 열어주세요.");
      return;
    }
    const parsed = parsePageSelectionInput(pageSummaryInput, totalPages);
    if (parsed.error) {
      setPageSummaryError(parsed.error);
      return;
    }

    const selectionLabel = String(pageSummaryInput || "").replace(/\s+/g, "");
    setIsPageSummaryOpen(false);
    setPageSummaryError("");
    setError("");
    setStatus("부분 요약을 생성하고 있습니다...");
    setIsPageSummaryLoading(true);
    try {
      const extracted = await extractPdfTextFromPages(file, parsed.pages, 18000, {
        useOcr: true,
        ocrLang: "kor+eng",
        onOcrProgress: (message) => setStatus(message),
      });
      if (!extracted?.text) {
        const suffix = extracted?.ocrUsed
          ? " OCR까지 시도했지만 추출할 수 있는 텍스트가 없습니다."
          : "";
        throw new Error(`선택한 페이지에서 텍스트를 추출하지 못했습니다.${suffix}`);
      }
      if (extracted?.ocrUsed) {
        setStatus("OCR이 완료되었습니다. 부분 요약을 생성하고 있습니다...");
      }
      setStatus("선택 범위 부분 요약 생성 중...");
      const { generateSummary } = await getOpenAiService();
      const summarized = await generateSummary(extracted.text, {
        scope: "선택 범위에서 추출한 텍스트",
        chapterized: false,
      });
      setPartialSummary(summarized);
      setPartialSummaryRange(selectionLabel);
      const nowIso = new Date().toISOString();
      const currentSaved = Array.isArray(savedPartialSummaries) ? savedPartialSummaries : [];
      const duplicate = currentSaved.find(
        (item) =>
          String(item.summary || "").trim() === String(summarized || "").trim() &&
          String(item.range || "").trim() === selectionLabel
      );
      const nextSavedPartialSummaries = duplicate
        ? normalizeSavedPartialSummaryEntries(
            currentSaved.map((item) =>
              item.id === duplicate.id
                ? {
                    ...item,
                    updatedAt: nowIso,
                  }
                : item
            )
          )
        : normalizeSavedPartialSummaryEntries([
            {
              id: createPremiumProfileId(),
              name: formatPartialSummaryDefaultName(nowIso),
              summary: summarized,
              range: selectionLabel,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ...currentSaved,
          ]);
      setSavedPartialSummaries(nextSavedPartialSummaries);
      persistPartialSummaryBundle({
        summary: summarized,
        range: selectionLabel,
        library: nextSavedPartialSummaries,
      });
      setStatus("부분 요약이 생성되고 저장되었습니다.");
    } catch (err) {
      setPageSummaryError(`부분 요약 생성에 실패했습니다: ${err.message}`);
      setError(`부분 요약 생성에 실패했습니다: ${err.message}`);
      setStatus("");
    } finally {
      setIsPageSummaryLoading(false);
    }
  }, [
    file,
    getOpenAiService,
    isCurrentPdfDocument,
    isLoadingSummary,
    isPageSummaryLoading,
    pageInfo.total,
    pageInfo.used,
    pageSummaryInput,
    persistPartialSummaryBundle,
    savedPartialSummaries,
    selectedFileId,
  ]);

  const handleSaveCurrentPartialSummary = useCallback(() => {
    const docId = selectedFileId;
    const summaryText = String(partialSummary || "").trim();
    if (!docId) {
      setError("癒쇱? PDF瑜??댁뼱二쇱꽭??");
      return;
    }
    if (!summaryText) {
      setError("??ν븷 遺遺꾩슂?쎌씠 ?놁뒿?덈떎.");
      return;
    }

    const nowIso = new Date().toISOString();
    const newItem = {
      id: createPremiumProfileId(),
      name: formatPartialSummaryDefaultName(nowIso),
      summary: summaryText,
      range: String(partialSummaryRange || "").trim(),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const next = normalizeSavedPartialSummaryEntries([
      newItem,
      ...(Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []),
    ]);
    setSavedPartialSummaries(next);
    persistPartialSummaryBundle({
      summary: summaryText,
      range: String(partialSummaryRange || "").trim(),
      library: next,
    });
    setStatus("遺遺꾩슂?쎌씠 ??λ릺?덉뒿?덈떎.");
  }, [
    partialSummary,
    partialSummaryRange,
    persistPartialSummaryBundle,
    savedPartialSummaries,
    selectedFileId,
  ]);

  const handleLoadSavedPartialSummary = useCallback(
    (itemId) => {
      const found = (savedPartialSummaries || []).find((item) => item.id === itemId);
      if (!found) {
        setError("??λ맂 遺遺꾩슂?쎌쓣 李얠쓣 ???놁뒿?덈떎.");
        return;
      }
      setPartialSummary(String(found.summary || "").trim());
      setPartialSummaryRange(String(found.range || "").trim());
      persistPartialSummaryBundle({
        summary: String(found.summary || "").trim(),
        range: String(found.range || "").trim(),
        library: savedPartialSummaries,
      });
      setIsSavedPartialSummaryOpen(false);
      setStatus(`??λ맂 遺遺꾩슂?쎌쓣 遺덈윭?붿뒿?덈떎. (${found.name})`);
    },
    [persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleRenameSavedPartialSummary = useCallback(
    (itemId, nextName) => {
      const nowIso = new Date().toISOString();
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: String(nextName || ""),
              updatedAt: nowIso,
            }
          : item
      );
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleNormalizeSavedPartialSummaryName = useCallback(
    (itemId) => {
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).map((item) => {
        if (item.id !== itemId) return item;
        const fallback = formatPartialSummaryDefaultName(item.createdAt || new Date().toISOString());
        const normalizedName = String(item.name || "").trim() || fallback;
        return {
          ...item,
          name: normalizedName,
        };
      });
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleDeleteSavedPartialSummary = useCallback(
    (itemId) => {
      const next = (Array.isArray(savedPartialSummaries) ? savedPartialSummaries : []).filter(
        (item) => item.id !== itemId
      );
      setSavedPartialSummaries(next);
      persistPartialSummaryBundle({
        summary: partialSummary,
        range: partialSummaryRange,
        library: next,
      });
      setStatus("??λ맂 遺遺꾩슂?쎌쓣 ??젣?덉뒿?덈떎.");
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleExportSummaryPdf = useCallback(async () => {
    if (isExportingSummary) return;
    if (!summary) {
      setError("?대낫???붿빟???놁뒿?덈떎. 癒쇱? ?붿빟???앹꽦?댁＜?몄슂.");
      return;
    }
    if (!summaryRef.current) {
      setError("?붿빟 ?곸뿭??李얠쓣 ???놁뼱 PDF濡??대낫?????놁뒿?덈떎.");
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
        background: "#ffffff",
      });
      setStatus("요약 PDF 내보내기가 완료되었습니다.");
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
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!force && hasReached("maxOx")) {
      setError("현재 요금제의 O/X 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || "").trim();
    const isPdfSource = isCurrentPdfDocument;
    if (!extractedText && !chapterSelectionRaw && !isPdfSource) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    if (auto) oxAutoRequestedRef.current = true;
    setIsLoadingOx(true);
    setError("");
    setStatus("O/X 문제 생성 중...");
    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "O/X",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      const oxSourceText = String(scopedSource?.text || "").trim();
      const scopeLabel = String(scopedSource?.scopeLabel || "").trim();
      if (!oxSourceText) {
        throw new Error("챕터 1 이후 텍스트를 찾지 못했습니다. 챕터 범위를 먼저 설정해주세요.");
      }
      if (scopeLabel) {
        setStatus(`O/X 문제 생성 중... (${scopeLabel})`);
      }

      const historicalOxTexts = collectQuestionTextsFromOxItems(oxItems);
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidStatementTexts = dedupeQuestionTexts([...historicalOxTexts, ...historicalMockTexts]).slice(0, 80);
      const seenQuestionKeys = createQuestionKeySet(avoidStatementTexts);

      const { generateOxQuiz } = await getOpenAiService();
      const ox = await generateOxQuiz(oxSourceText, {
        avoidStatements: avoidStatementTexts,
      });
      const rawItems = Array.isArray(ox?.items) ? ox.items : [];
      const qualityRawItems = rawItems.filter(
        (item) => !isLowValueStudyPrompt(getOxPromptText(item))
      );
      const items = [];
      pushUniqueByQuestionKey(items, qualityRawItems, getOxPromptText, seenQuestionKeys, 10);

      if (ox?.debug || items.length === 0) {
        setOxItems([]);
        setStatus("");
        setError("유효한 O/X 문제가 생성되지 않았습니다.");
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
      setStatus(scopeLabel ? `O/X 문제가 생성되었습니다. (${scopeLabel})` : "O/X 문제가 생성되었습니다.");
      setUsageCounts((prev) => ({ ...prev, ox: prev.ox + 1 }));
      persistArtifacts({ ox });
    } catch (err) {
      setError(`O/X 문제 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingOx(false);
    }
  };

  const regenerateOxQuiz = async () => {
    if (isLoadingOx) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (hasReached("maxOx")) {
      setError("현재 요금제의 O/X 생성 한도에 도달했습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isCurrentPdfDocument) {
      setError("추출된 텍스트가 없습니다. 먼저 PDF 텍스트 추출을 실행해주세요.");
      return;
    }
    oxAutoRequestedRef.current = true;
    setOxItems(null);
      setOxSelections({});
    setStatus("O/X를 초기화하고 다시 생성하는 중...");
    setError("");
    await persistArtifacts({ ox: null });
    await requestOxQuiz({ auto: false, force: true });
  };

  const handleAddFlashcard = useCallback(
    async (front, back, hint) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          const deckId = selectedFileId || "default";
          const localCard = {
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front,
            back,
            hint: hint || "",
            created_at: new Date().toISOString(),
          };
          setFlashcardError("");
          setFlashcards((prev) => [localCard, ...prev]);
          setFlashcardStatus("Flashcard added (local mode).");
          return;
        }
        setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      const deckId = selectedFileId || "default";
      setFlashcardError("");
      setFlashcardStatus("?뚮옒?쒖뭅?????以?..");
      try {
        const saved = await addFlashcard({
          userId: user.id,
          deckId,
          front,
          back,
          hint,
        });
        setFlashcards((prev) => [saved, ...prev]);
        setFlashcardStatus("?뚮옒?쒖뭅?쒓? ??λ릺?덉뒿?덈떎.");
      } catch (err) {
        setFlashcardError(`?뚮옒?쒖뭅????μ뿉 ?ㅽ뙣?덉뒿?덈떎: ${err.message}`);
        setFlashcardStatus("");
      }
    },
    [user, selectedFileId]
  );

  const handleDeleteFlashcard = useCallback(
    async (cardId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setFlashcardError("");
          setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
          setFlashcardStatus("Flashcard removed (local mode).");
          return;
        }
        setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
        return;
      }
      setFlashcardError("");
      try {
        await deleteFlashcard({ userId: user.id, cardId });
        setFlashcards((prev) => prev.filter((c) => c.id !== cardId));
        setFlashcardStatus("?뚮옒?쒖뭅?쒕? ??젣?덉뒿?덈떎.");
      } catch (err) {
        setFlashcardError(`?뚮옒?쒖뭅????젣???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      }
    },
    [user]
  );

  const handleGenerateFlashcards = useCallback(async () => {
    if (isGeneratingFlashcards) return;
    if (AUTH_ENABLED && !user) {
      setFlashcardError("癒쇱? 濡쒓렇?명빐二쇱꽭??");
      return;
    }
    if (!file || !selectedFileId) {
      setFlashcardError("癒쇱? PDF瑜??댁뼱二쇱꽭??");
      return;
    }
    if (isLoadingText) {
      setFlashcardError("PDF ?띿뒪??異붿텧???꾩쭅 吏꾪뻾 以묒엯?덈떎. ?좎떆留?湲곕떎?ㅼ＜?몄슂.");
      return;
    }
    const chapterSelectionRaw = String(flashcardChapterSelectionInput || "").trim();
    let sourceText = (extractedText || "").trim();
    if (!sourceText && !chapterSelectionRaw) {
      setFlashcardError("?뚮옒?쒖뭅?쒕? ?앹꽦?섍린??異붿텧???띿뒪?멸? 遺議깊빀?덈떎.");
      return;
    }

    setFlashcardError("");
    setIsGeneratingFlashcards(true);
    try {
      let scopeLabel = "";
      if (chapterSelectionRaw) {
        const scoped = await extractTextForChapterSelection({
          featureLabel: "移대뱶",
          chapterSelectionInput: chapterSelectionRaw,
        });
        sourceText = String(scoped.text || "").trim();
        scopeLabel = scoped.scopeLabel;
      }
      if (sourceText.length < 80) {
        throw new Error("?뚮옒?쒖뭅?쒕? ?앹꽦?섍린??異붿텧???띿뒪?멸? 遺議깊빀?덈떎.");
      }

      setFlashcardStatus(
        scopeLabel ? `AI ?뚮옒?쒖뭅???앹꽦 以?(${scopeLabel})...` : "AI ?뚮옒?쒖뭅???앹꽦 以?.."
      );
      const { generateFlashcards } = await getOpenAiService();
      const result = await generateFlashcards(sourceText, { count: 8 });
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
        throw new Error("蹂몃Ц?먯꽌 ?좏슚???뚮옒?쒖뭅?쒕? ?앹꽦?섏? 紐삵뻽?듬땲??");
      }
      const deckId = selectedFileId || "default";
      const saved = user
        ? await addFlashcards({ userId: user.id, deckId, cards: cleaned })
        : cleaned.map((card) => ({
            id: createLocalEntityId("flashcard"),
            deck_id: deckId,
            front: card.front,
            back: card.back,
            hint: card.hint || "",
            created_at: new Date().toISOString(),
          }));
      if (!saved.length) {
        throw new Error("?앹꽦???뚮옒?쒖뭅????μ뿉 ?ㅽ뙣?덉뒿?덈떎.");
      }
      setFlashcards((prev) => [...saved, ...prev]);
      setFlashcardStatus(
        scopeLabel ? `${saved.length}媛쒖쓽 AI ?뚮옒?쒖뭅?쒕? ?앹꽦?덉뒿?덈떎 (${scopeLabel}).` : `${saved.length}媛쒖쓽 AI ?뚮옒?쒖뭅?쒕? ?앹꽦?덉뒿?덈떎.`
      );
    } catch (err) {
      setFlashcardError(`AI ?뚮옒?쒖뭅???앹꽦???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      setFlashcardStatus("");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  }, [
    isGeneratingFlashcards,
    user,
    file,
    selectedFileId,
    isLoadingText,
    extractedText,
    flashcardChapterSelectionInput,
    extractTextForChapterSelection,
    getOpenAiService,
  ]);

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
        setTutorError("癒쇱? PDF瑜??댁뼱二쇱꽭??");
        return;
      }
      if (!isCurrentPdfDocument) {
        setTutorError("AI 튜터의 페이지 근거 모드는 PDF에서만 지원됩니다.");
        return;
      }
      if (isLoadingText) {
        setTutorError("PDF ?띿뒪??異붿텧???꾩쭅 吏꾪뻾 以묒엯?덈떎. ?좎떆留?湲곕떎?ㅼ＜?몄슂.");
        return;
      }
      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      if (!totalPages) {
        setTutorError("?섏씠吏 ?뺣낫瑜??쎌? 紐삵뻽?듬땲?? PDF瑜??ㅼ떆 ?댁뼱二쇱꽭??");
        return;
      }

      const requestedPages = buildTutorPageCandidates(trimmed, totalPages);
      const sectionHints = extractTutorSectionCandidates(trimmed);
      const problemHints = extractTutorProblemTokenCandidates(trimmed);
      const targetTokens = [...new Set([...sectionHints, ...problemHints])];
      const primaryToken = targetTokens[0] || "";
      const tutorDocKey = String(selectedFileId || file?.name || "").trim();
      const currentKnownPage = Math.max(1, Number(currentPage || 1));
      const anchorPage = requestedPages.length
        ? requestedPages[0]
        : Math.max(1, Math.min(totalPages, currentKnownPage));

      const buildPageRange = (start, end, cap = 120) => {
        const lo = Math.max(1, Math.min(totalPages, Number.parseInt(start, 10) || 1));
        const hi = Math.max(lo, Math.min(totalPages, Number.parseInt(end, 10) || lo));
        const pages = [];
        for (let page = lo; page <= hi; page += 1) {
          pages.push(page);
          if (pages.length >= cap) break;
        }
        return pages;
      };
      const mergePages = (...lists) =>
        Array.from(
          new Set(
            lists
              .flat()
              .map((page) => Number.parseInt(page, 10))
              .filter((page) => Number.isFinite(page) && page > 0 && page <= totalPages)
          )
        ).sort((a, b) => a - b);
      const pageCacheKey = (pageNumber) => `${tutorDocKey}:${pageNumber}`;
      const loadPageEntries = async (pages, { useOcr = false, maxCharsPerPage = 5000 } = {}) => {
        const normalizedPages = mergePages(pages);
        if (!normalizedPages.length) return [];

        const missing = [];
        const entriesByPage = new Map();
        for (const pageNumber of normalizedPages) {
          const cached = tutorPageTextCacheRef.current.get(pageCacheKey(pageNumber));
          const shouldReloadForOcr =
            useOcr &&
            (!cached ||
              !cached.ocrUsed ||
              String(cached.text || "").trim().length < 220);
          if (!cached || !String(cached.text || "").trim() || shouldReloadForOcr) {
            missing.push(pageNumber);
            continue;
          }
          entriesByPage.set(pageNumber, {
            pageNumber,
            text: String(cached.text || "").trim(),
            ocrUsed: Boolean(cached.ocrUsed),
          });
        }

        if (missing.length) {
          const fetched = await extractPdfPageTexts(file, missing, {
            useOcr,
            ocrLang: "kor+eng",
            maxCharsPerPage,
          });
          for (const pageEntry of fetched?.pages || []) {
            const pageNumber = Number.parseInt(pageEntry?.pageNumber, 10);
            if (!Number.isFinite(pageNumber)) continue;
            const text = String(pageEntry?.text || "").trim();
            const payload = {
              pageNumber,
              text,
              ocrUsed: Boolean(pageEntry?.ocrUsed),
            };
            if (text) {
              tutorPageTextCacheRef.current.set(pageCacheKey(pageNumber), {
                text,
                ocrUsed: payload.ocrUsed,
              });
              entriesByPage.set(pageNumber, payload);
            }
          }
        }

        return mergePages(normalizedPages)
          .map((pageNumber) => entriesByPage.get(pageNumber))
          .filter((entry) => entry && entry.text);
      };

      setStatus("吏덈Ц 愿??蹂몃Ц ?섏씠吏瑜?寃?됲븯??以?..");
      const narrowScanPages = buildPageRange(anchorPage - 20, anchorPage + 90, 130);
      const broadScanPages = buildPageRange(anchorPage - 70, anchorPage + 220, 260);

      let scannedEntries = await loadPageEntries(narrowScanPages, {
        useOcr: false,
        maxCharsPerPage: 4200,
      });

      let detectedRange =
        primaryToken && tutorDocKey
          ? tutorSectionRangeCacheRef.current.get(`${tutorDocKey}:${primaryToken}:${anchorPage}`) || null
          : null;

      if (!detectedRange && primaryToken) {
        detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
      }

      if (!detectedRange && primaryToken) {
        const broadEntries = await loadPageEntries(broadScanPages, {
          useOcr: false,
          maxCharsPerPage: 4200,
        });
        if (broadEntries.length > scannedEntries.length) scannedEntries = broadEntries;
        detectedRange = detectTutorSectionPageRange(scannedEntries, primaryToken);
      }

      if (!detectedRange && primaryToken) {
        const ocrProbePages = requestedPages.length
          ? mergePages(requestedPages, buildPageRange(anchorPage - 10, anchorPage + 30, 60))
          : buildPageRange(anchorPage - 12, anchorPage + 45, 70);
        const ocrEntries = await loadPageEntries(ocrProbePages, {
          useOcr: true,
          maxCharsPerPage: 4200,
        });
        detectedRange = detectTutorSectionPageRange(ocrEntries, primaryToken);
      }

      if (detectedRange && tutorDocKey && primaryToken) {
        tutorSectionRangeCacheRef.current.set(
          `${tutorDocKey}:${primaryToken}:${anchorPage}`,
          detectedRange
        );
      }

      let finalPages = [];
      if (detectedRange?.startPage && detectedRange?.endPage) {
        finalPages = buildPageRange(detectedRange.startPage - 1, detectedRange.endPage + 1, 120);
      } else if (requestedPages.length) {
        const firstRequested = requestedPages[0];
        const lastRequested = requestedPages[requestedPages.length - 1];
        finalPages = buildPageRange(firstRequested - 1, Math.max(lastRequested + 18, firstRequested + 12), 120);
      } else {
        finalPages = buildPageRange(anchorPage - 3, anchorPage + 15, 40);
      }
      finalPages = mergePages(finalPages, requestedPages);

      const finalEntries = await loadPageEntries(finalPages, {
        useOcr: true,
        maxCharsPerPage: 5200,
      });
      if (!finalEntries.length) {
        setTutorError("吏덈Ц 愿??蹂몃Ц ?섏씠吏?먯꽌 ?띿뒪?몃? 李얠? 紐삵뻽?듬땲?? PDF瑜??ㅼ떆 ?댁뼱二쇱꽭??");
        setStatus("");
        return;
      }

      const loadedPages = finalEntries.map((entry) => entry.pageNumber);
      const tutorEvidence = finalEntries
        .map((entry) => `[p.${entry.pageNumber}]\n${entry.text}`)
        .join("\n\n")
        .slice(0, 180000);

      const tutorSourceText = [
        "[RAW PDF EVIDENCE]",
        `- query: ${trimmed}`,
        `- requested_pages: ${requestedPages.length ? requestedPages.join(", ") : "none"}`,
        `- requested_problem_or_section: ${primaryToken || "none"}`,
        detectedRange
          ? `- detected_range: p.${detectedRange.startPage}-${detectedRange.endPage}`
          : "- detected_range: not_found",
        `- loaded_pages: ${loadedPages.join(", ")}`,
        "",
        tutorEvidence,
      ].join("\n");

      setTutorError("");
      const history = tutorMessages
        .slice(-8)
        .map((msg) => ({
          ...msg,
          content: String(msg?.content || "").slice(0, 1200),
        }))
        .filter((msg) => msg.content.trim());
      const userMessage = { role: "user", content: trimmed };
      setTutorMessages((prev) => [...prev, userMessage]);
      setIsTutorLoading(true);
      try {
        const { generateTutorReply } = await getOpenAiService();
        const reply = await generateTutorReply({
          question: trimmed,
          extractedText: tutorSourceText,
          messages: history,
        });
        const safeReply = resolveTutorReplyText(reply, {
          question: trimmed,
          rawEvidenceText: tutorSourceText,
        });
        setTutorMessages((prev) => [...prev, { role: "assistant", content: safeReply }]);
      } catch (err) {
        setTutorError(`AI ?쒗꽣 ?듬? ?앹꽦???ㅽ뙣?덉뒿?덈떎: ${err.message}`);
      } finally {
        setIsTutorLoading(false);
        setStatus("");
      }
    },
    [
      currentPage,
      file,
      getOpenAiService,
      isLoadingText,
      isCurrentPdfDocument,
      isTutorLoading,
      pageInfo?.total,
      selectedFileId,
      tutorMessages,
    ]
  );

  const handleCreateMockExam = useCallback(async () => {
    if (isGeneratingMockExam) return;
    if (AUTH_ENABLED && !user) {
      setMockExamError("먼저 로그인해 주세요.");
      return;
    }
    if (!file || !selectedFileId) {
      setMockExamError("먼저 PDF를 열어 주세요.");
      return;
    }
    if (isLoadingText) {
      setMockExamError("PDF 텍스트 추출이 아직 진행 중입니다. 잠시만 기다려 주세요.");
      return;
    }

    const chapterSelectionRaw = String(mockExamChapterSelectionInput || "").trim();
    const hasChapterScope = Boolean(chapterSelectionRaw);
    const isPdfSource = isCurrentPdfDocument;
    let sourceText = "";
    let scopeLabel = "";
    try {
      const scopedSource = await resolveQuestionSourceText({
        featureLabel: "모의고사",
        chapterSelectionInput: chapterSelectionRaw,
        baseText: extractedText,
      });
      sourceText = String(scopedSource?.text || "").trim();
      scopeLabel = String(scopedSource?.scopeLabel || "").trim();
    } catch (err) {
      setMockExamError(String(err?.message || "모의고사 텍스트 추출에 실패했습니다."));
      return;
    }
    if (!sourceText) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }
    if (sourceText.length < 80) {
      setMockExamError("모의고사를 생성하기에 추출된 텍스트가 부족합니다.");
      return;
    }

    setMockExamStatus("모의고사 생성 중...");
    setMockExamError("");
    setIsGeneratingMockExam(true);

    try {
      const ai = await getOpenAiService();
      let oxPool = (Array.isArray(oxItems) ? oxItems : []).filter(
        (item) => !isLowValueStudyPrompt(getOxPromptText(item))
      );
      let quizPool = [];
      const historicalMockTexts = collectQuestionTextsFromMockExams(mockExams);
      const avoidMockQuestionTexts = dedupeQuestionTexts(historicalMockTexts).slice(0, 120);
      const usedMockQuestionKeys = createQuestionKeySet(avoidMockQuestionTexts);

      const shouldGeneratePoolsFromSource = hasChapterScope || isPdfSource || Boolean(sourceText);
      if (shouldGeneratePoolsFromSource) {
        if (scopeLabel) {
          setMockExamStatus(`모의고사 생성 중 (${scopeLabel})...`);
        }

        const [oxResult, quizResult] = await Promise.all([
          ai.generateOxQuiz(sourceText, {
            avoidStatements: avoidMockQuestionTexts,
          }),
          ai.generateQuiz(sourceText, {
            multipleChoiceCount: 4,
            shortAnswerCount: 1,
            avoidQuestions: avoidMockQuestionTexts,
          }),
        ]);

        oxPool = (Array.isArray(oxResult?.items) ? oxResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(getOxPromptText(item))
        );
        const normalizedQuiz = normalizeQuizPayload(quizResult);
        const scopedMultipleChoice = Array.isArray(normalizedQuiz?.multipleChoice)
          ? normalizedQuiz.multipleChoice
          : [];
        const scopedShortAnswers = Array.isArray(normalizedQuiz?.shortAnswer) ? normalizedQuiz.shortAnswer : [];

        scopedMultipleChoice.forEach((question) => {
          const prompt = String(question?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const choices = Array.isArray(question?.choices) ? question.choices : [];
          const explanation = String(question?.explanation || "").trim();
          quizPool.push({
            type: "quiz-mc",
            prompt,
            choices,
            answerIndex: resolveAnswerIndex({
              answerIndex: question?.answerIndex,
              explanation,
              choices,
            }),
            explanation,
          });
        });
        scopedShortAnswers.forEach((item) => {
          const prompt = String(item?.question || "").trim();
          if (!prompt) return;
          if (isLowValueStudyPrompt(prompt)) return;
          const explanation = String(item?.explanation || "").trim();
          quizPool.push({
            type: "quiz-short",
            prompt,
            answer: resolveShortAnswerText(item?.answer, explanation),
            explanation,
          });
        });
      } else {
        quizSets.forEach((set) => {
          const multipleChoice = set.questions?.multipleChoice || [];
          const shortAnswers = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
          multipleChoice.forEach((question) => {
            const prompt = String(question?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const choices = Array.isArray(question?.choices) ? question.choices : [];
            const explanation = String(question?.explanation || "").trim();
            quizPool.push({
              type: "quiz-mc",
              prompt,
              choices,
              answerIndex: resolveAnswerIndex({
                answerIndex: question?.answerIndex,
                explanation,
                choices,
              }),
              explanation,
            });
          });
          shortAnswers.forEach((item) => {
            const prompt = String(item?.question || "").trim();
            if (!prompt) return;
            if (isLowValueStudyPrompt(prompt)) return;
            const explanation = String(item?.explanation || "").trim();
            quizPool.push({
              type: "quiz-short",
              prompt,
              answer: resolveShortAnswerText(item?.answer, explanation),
              explanation,
            });
          });
        });
      }

      if (oxPool.length < 3) {
        throw new Error("모의고사를 만들려면 O/X 문항이 최소 3개 필요합니다.");
      }
      if (quizPool.length < 4) {
        throw new Error("모의고사를 만들려면 퀴즈 문항이 최소 4개 필요합니다.");
      }

      const pickedOx = pickRandomUniqueByQuestionKey(oxPool, 3, getOxPromptText, usedMockQuestionKeys);
      const pickedQuiz = pickRandomUniqueByQuestionKey(quizPool, 4, getMockExamPromptText, usedMockQuestionKeys);

      if (pickedOx.length < 3) {
        throw new Error("이미 출제된 문항을 제외하느라 O/X 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }
      if (pickedQuiz.length < 4) {
        throw new Error("이미 출제된 문항을 제외하느라 퀴즈 신규 문항이 부족합니다. 범위를 바꿔 다시 시도해 주세요.");
      }

      const mergedAvoidForMock = mergeQuestionHistory(
        avoidMockQuestionTexts,
        [...pickedOx.map((item) => getOxPromptText(item)), ...pickedQuiz.map((item) => getMockExamPromptText(item))],
        160
      );
      avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidForMock);

      const hardCount = Math.max(3, 10 - (pickedOx.length + pickedQuiz.length));
      const hardItems = [];
      const maxHardAttempts = 3;
      for (let attempt = 0; attempt < maxHardAttempts; attempt += 1) {
        if (hardItems.length >= hardCount) break;
        const requestCount = Math.min(10, hardCount + attempt * 2 + 1);
        const hardResult = await ai.generateHardQuiz(sourceText, {
          count: requestCount,
          avoidQuestions: avoidMockQuestionTexts,
        });
        const rawHardItems = (Array.isArray(hardResult?.items) ? hardResult.items : []).filter(
          (item) => !isLowValueStudyPrompt(String(item?.question || "").trim())
        );
        pushUniqueByQuestionKey(
          hardItems,
          rawHardItems,
          (item) => String(item?.question || "").trim(),
          usedMockQuestionKeys,
          hardCount
        );
        const mergedAvoidWithHard = mergeQuestionHistory(
          avoidMockQuestionTexts,
          hardItems.map((item) => String(item?.question || "").trim()),
          200
        );
        avoidMockQuestionTexts.splice(0, avoidMockQuestionTexts.length, ...mergedAvoidWithHard);
      }

      if (hardItems.length < hardCount) {
        throw new Error("고난도 문항을 충분히 생성하지 못했습니다.");
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
        answerIndex: resolveAnswerIndex({
          answerIndex: item?.answerIndex,
          explanation: String(item?.explanation || "").trim(),
          choices: Array.isArray(item?.choices) ? item.choices : [],
        }),
        explanation: String(item?.explanation || "").trim(),
      }));

      const examItems = [...mappedOx, ...mappedQuiz, ...mappedHard].map((item, idx) => ({
        ...item,
        order: idx + 1,
      }));

      if (examItems.length !== 10) {
        throw new Error("모의고사는 정확히 10문항이어야 합니다.");
      }

      const answerSheet = buildMockExamAnswerSheet(examItems);

      const now = new Date();
      const dateStamp = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
      const nextIndex = mockExams.length + 1;
      const title = `${dateStamp} 모의고사 ${nextIndex}`;
      const payload = {
        title,
        items: examItems,
        answerSheet,
        source: {
          oxCount: mappedOx.length,
          quizCount: mappedQuiz.length,
          hardCount: mappedHard.length,
        },
        generatedAt: new Date().toISOString(),
      };

      const saved = user
        ? await saveMockExam({
            userId: user.id,
            docId: selectedFileId,
            docName: file?.name || "",
            title,
            totalQuestions: examItems.length,
            payload,
          })
        : {
            id: createLocalEntityId("mock-exam"),
            doc_id: selectedFileId,
            doc_name: file?.name || "",
            title,
            total_questions: examItems.length,
            payload,
            created_at: new Date().toISOString(),
          };

      setMockExams((prev) => [saved, ...prev]);
      setActiveMockExamId(saved.id);
      setShowMockExamAnswers(true);
      setMockExamStatus(
        scopeLabel
          ? `모의고사와 답지가 저장되었습니다 (${scopeLabel}).`
          : "모의고사와 답지가 저장되었습니다."
      );
    } catch (err) {
      setMockExamError(`모의고사 생성에 실패했습니다: ${err.message}`);
      setMockExamStatus("");
    } finally {
      setIsGeneratingMockExam(false);
    }
  }, [
    extractedText,
    file,
    isCurrentPdfDocument,
    isGeneratingMockExam,
    isLoadingText,
    oxItems,
    mockExams,
    quizSets,
    mockExamChapterSelectionInput,
    selectedFileId,
    getOpenAiService,
    resolveQuestionSourceText,
    user,
  ]);

  const handleDeleteMockExam = useCallback(
    async (examId) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          setMockExams((prev) => prev.filter((item) => item.id !== examId));
          if (activeMockExamId === examId) {
            setActiveMockExamId(null);
          }
          setMockExamStatus("모의고사를 삭제했습니다. (로컬 모드)");
          return;
        }
        setMockExamError("먼저 로그인해 주세요.");
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
        setMockExamError(`모의고사 삭제에 실패했습니다: ${err.message}`);
      }
    },
    [activeMockExamId, user]
  );

  const handleExportMockExam = useCallback(
    async (exam) => {
      if (!exam) {
        setMockExamError("내보낼 모의고사가 선택되지 않았습니다.");
        return;
      }
      if (!mockExamPrintRef.current) {
        setMockExamError("모의고사 출력 영역을 찾을 수 없습니다.");
        return;
      }
      setMockExamError("");
      try {
        const examIndex = mockExams.findIndex((item) => item.id === exam.id);
        const displayTitle = formatMockExamTitle(exam, examIndex >= 0 ? examIndex : 0);
        const safeTitle = (displayTitle || "mock-exam").replace(/[^\w-]+/g, "-");
        const answerSheet = buildMockExamAnswerSheet(
          Array.isArray(exam?.payload?.items) ? exam.payload.items : [],
          exam?.payload?.answerSheet
        );

        await exportPagedElementToPdf(mockExamPrintRef.current, {
          filename: `${safeTitle}.pdf`,
          margin: 0,
          pageSelector: ".mock-exam-page",
        });
        await exportMockAnswerSheetToPdf({
          title: `${displayTitle} 답지`,
          entries: answerSheet,
          filename: `${safeTitle}-answers.pdf`,
        });
        setMockExamStatus("모의고사 문제지와 답지 PDF를 함께 저장했습니다.");
      } catch (err) {
        setMockExamError(`PDF 내보내기에 실패했습니다: ${err.message}`);
      }
    },
    [mockExamPrintRef, mockExams]
  );

  const handleSubmitFeedback = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSubmittingFeedback) return;
      const trimmedFeedback = String(feedbackInput || "").trim();
      if (!trimmedFeedback) {
        setFeedbackError("\uD53C\uB4DC\uBC31 \uB0B4\uC6A9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
        return;
      }
      if (!user?.id) {
        setFeedbackError("\uB85C\uADF8\uC778 \uD6C4 \uD53C\uB4DC\uBC31\uC744 \uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        return;
      }

      setIsSubmittingFeedback(true);
      setFeedbackError("");
      try {
        const feedbackPayload = {
          userId: user.id,
          category: feedbackCategory,
          content: trimmedFeedback,
          docId: selectedFileId || null,
          docName: file?.name || "",
          panel: panelTab || "",
          metadata: {
            currentPage,
            totalPages: pageInfo?.total || pageInfo?.used || null,
            tier,
          },
        };
        let savedFeedback = false;
        let emailedFeedback = false;
        let skippedEmail = false;
        let saveError = null;
        let notifyError = null;

        try {
          await saveUserFeedback(feedbackPayload);
          savedFeedback = true;
        } catch (error) {
          saveError = error;
          console.warn("Feedback database save failed:", error);
        }

        try {
          const notifyResult = await notifyFeedbackEmail({
            userId: user.id,
            userEmail: user.email || "",
            category: feedbackCategory,
            content: trimmedFeedback,
            docId: selectedFileId || null,
            docName: file?.name || "",
            panel: panelTab || "",
            metadata: {
              currentPage,
              totalPages: pageInfo?.total || pageInfo?.used || null,
              tier,
            },
          });
          emailedFeedback = Boolean(notifyResult?.ok);
          skippedEmail = Boolean(notifyResult?.skipped);
        } catch (error) {
          notifyError = error;
          console.warn("Feedback email notification failed:", error);
        }

        if (!savedFeedback && !emailedFeedback) {
          if (isMissingFeedbackTableError(saveError) && skippedEmail) {
            throw new Error(
              "Supabase에 user_feedback 테이블이 아직 없습니다. 테이블을 먼저 만들거나 메일 알림을 설정해주세요."
            );
          }
          throw saveError || notifyError || new Error("피드백 저장 또는 메일 전송에 실패했습니다.");
        }

        setIsFeedbackDialogOpen(false);
        setFeedbackCategory("general");
        setFeedbackInput("");
        if (savedFeedback && emailedFeedback) {
          setStatus("\uD53C\uB4DC\uBC31\uC774 \uC800\uC7A5\uB418\uACE0 \uBA54\uC77C\uB85C \uC804\uB2EC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        } else if (savedFeedback) {
          setStatus("\uD53C\uB4DC\uBC31\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAC10\uC0AC\uD569\uB2C8\uB2E4.");
        } else {
          setStatus(
            "\uD53C\uB4DC\uBC31\uC774 \uBA54\uC77C\uB85C \uC804\uB2EC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. DB \uC800\uC7A5\uC740 \uAC74\uB108\uB6F0\uC5C8\uC2B5\uB2C8\uB2E4."
          );
        }
      } catch (err) {
        setFeedbackError(`\uD53C\uB4DC\uBC31 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4: ${err.message}`);
      } finally {
        setIsSubmittingFeedback(false);
      }
    },
    [
      feedbackCategory,
      feedbackInput,
      file?.name,
      isSubmittingFeedback,
      pageInfo?.total,
      pageInfo?.used,
      panelTab,
      currentPage,
      selectedFileId,
      saveUserFeedback,
      tier,
      user?.id,
    ]
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
    onSelectFolderSummary: handleSelectFolderSummary,
    onCreateFolder: handleCreateFolder,
    onRenameFolder: handleRenameFolder,
    onDeleteFolder: handleDeleteFolder,
    selectedUploadIds,
    onToggleUploadSelect: handleToggleUploadSelect,
    onMoveUploads: handleMoveUploadsToFolder,
    onClearSelection: handleClearSelection,
    isFolderFeatureEnabled,
    onDeleteUpload: handleDeleteUpload,
    isGuest: AUTH_ENABLED && !user,
    showIntro: !AUTH_ENABLED && !user && showGuestIntro,
    onIntroDone: () => setShowGuestIntro(false),
    onRequireAuth: openAuth,
    currentTier: tier,
    maxPdfSizeBytes: limits.maxPdfSizeBytes,
  };
  const detailPageProps = {
    detailContainerRef,
    splitStyle,
    pdfUrl,
    documentRemoteUrl,
    file,
    pageInfo,
    currentPage,
    handlePageChange,
    handleDragStart,
    panelTab,
    setPanelTab,
    requestSummary,
    isLoadingSummary,
    isLoadingText,
    isFreeTier,
    isPdfDocument: isCurrentPdfDocument,
    summary,
    partialSummary,
    partialSummaryRange,
    savedPartialSummaries,
    isSavedPartialSummaryOpen,
    setIsPageSummaryOpen,
    setIsSavedPartialSummaryOpen,
    setPageSummaryError,
    isPageSummaryOpen,
    pageSummaryInput,
    setPageSummaryInput,
    pageSummaryError: safePageSummaryError,
    handleSummaryByPages,
    handleSaveCurrentPartialSummary,
    handleLoadSavedPartialSummary,
    handleRenameSavedPartialSummary,
    handleNormalizeSavedPartialSummaryName,
    handleDeleteSavedPartialSummary,
    isPageSummaryLoading,
    isChapterRangeOpen,
    setIsChapterRangeOpen,
    chapterRangeInput,
    setChapterRangeInput,
    chapterRangeError: safeChapterRangeError,
    setChapterRangeError,
    handleAutoDetectChapterRanges,
    isDetectingChapterRanges,
    handleConfirmChapterRanges,
    handleExportSummaryPdf,
    isExportingSummary,
    status: safeStatus,
    error: safeError,
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
    mockExamChapterSelectionInput,
    setMockExamChapterSelectionInput,
    isGeneratingMockExam,
    selectedFileId,
    handleExportMockExam,
    mockExamOrderedItems,
    mockExamPrintRef,
    mockExamPages,
    showMockExamAnswers,
    setShowMockExamAnswers,
    mockExamStatus: safeMockExamStatus,
    mockExamError: safeMockExamError,
    setActiveMockExamId,
    isLoadingQuiz,
    shortPreview,
    requestQuestions,
    quizChapterSelectionInput,
    setQuizChapterSelectionInput,
    quizMix,
    setQuizMix,
    quizSets,
    handleChoiceSelect,
    handleShortAnswerChange,
    handleShortAnswerCheck,
    regenerateQuiz,
    isLoadingOx,
    requestOxQuiz,
    oxChapterSelectionInput,
    setOxChapterSelectionInput,
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
    flashcardChapterSelectionInput,
    setFlashcardChapterSelectionInput,
    isGeneratingFlashcards,
    extractedText,
    flashcardStatus: safeFlashcardStatus,
    flashcardError: safeFlashcardError,
    tutorMessages,
    isTutorLoading,
    tutorError: safeTutorError,
    tutorNotice,
    handleSendTutorMessage,
    handleResetTutor,
  };

  if (AUTH_ENABLED && isNativePlatform && !authReady) {
    return <div className="min-h-screen bg-black" />;
  }

  if (shouldRenderAuthScreen) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <LoginBackground theme={theme}>
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-8">
          {canReturnHomeFromAuth && (
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
          )}
          <AuthPanel user={user} onAuth={refreshSession} />
        </div>
        </LoginBackground>
      </Suspense>
    );
  }

  const isGuestFreeMode = !AUTH_ENABLED && !user;
  const showHeader = Boolean(user || showDetail || (isGuestFreeMode && !showGuestIntro));
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
            onClose={() => {
              clearPaymentReturnPending();
              setShowPayment(false);
            }}
            currentTier={tier}
            currentTierExpiresAt={tierExpiresAt}
            currentTierRemainingDays={tierRemainingDays}
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
            aria-label="PIN 변경 창 닫기"
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
            <p className="text-sm font-semibold">{activePremiumProfile.name} PIN 변경</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              현재 PIN을 입력하고 새 4자리 PIN을 설정해주세요.
            </p>
            <div className="mt-4 space-y-2">
              <input
                name="current-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.currentPin}
                onChange={(event) => handleChangeProfilePinInput("currentPin", event.target.value)}
                placeholder="현재 PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                name="new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.nextPin}
                onChange={(event) => handleChangeProfilePinInput("nextPin", event.target.value)}
                placeholder="새 PIN"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <input
                name="confirm-new-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={profilePinInputs.confirmPin}
                onChange={(event) => handleChangeProfilePinInput("confirmPin", event.target.value)}
                placeholder="새 PIN 확인"
                className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light" ? "border-slate-300 bg-white text-slate-900" : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
            </div>
            {safeProfilePinError && <p className="mt-2 text-xs text-rose-300">{safeProfilePinError}</p>}
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
      {isFeedbackDialogOpen && (
        <div className="fixed inset-0 z-[165] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="\uD53C\uB4DC\uBC31 \uCC3D \uB2EB\uAE30"
            onClick={handleCloseFeedbackDialog}
            className={`absolute inset-0 ${
              theme === "light" ? "bg-slate-900/25" : "bg-black/75"
            } backdrop-blur-[2px]`}
          />
          <form
            onSubmit={handleSubmitFeedback}
            className={`relative z-[166] w-full max-w-lg rounded-2xl border p-5 ${
              theme === "light"
                ? "border-slate-200 bg-white text-slate-900 shadow-[0_20px_80px_rgba(15,23,42,0.2)]"
                : "border-white/10 bg-slate-950/[0.97] text-slate-100 shadow-[0_20px_80px_rgba(0,0,0,0.72)]"
            }`}
          >
            <p className="text-sm font-semibold">{"\uD53C\uB4DC\uBC31 \uBCF4\uB0B4\uAE30"}</p>
            <p className={`mt-1 text-xs ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              {"\uBC84\uADF8, \uAE30\uB2A5 \uC81C\uC548, \uC0AC\uC6A9\uC131 \uAC1C\uC120 \uC758\uACAC\uC744 \uC790\uC720\uB86D\uAC8C \uB0A8\uACA8 \uC8FC\uC138\uC694."}
            </p>
            <p className={`mt-2 text-[11px] leading-5 ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
              {"\uD53C\uB4DC\uBC31\uC740 \uD604\uC7AC \uB0B4\uBD80 \uC218\uC9D1\uD568\uC5D0 \uC800\uC7A5\uB418\uACE0, \uAD00\uB9AC\uC790 \uBA54\uC77C \uC54C\uB9BC\uC774 \uC124\uC815\uB41C \uACBD\uC6B0 \uBA54\uC77C\uB85C\uB3C4 \uC804\uB2EC\uB429\uB2C8\uB2E4."}
            </p>
            <div className="mt-4 space-y-3">
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label={"\uD53C\uB4DC\uBC31 \uBD84\uB958"}
              >
                {FEEDBACK_CATEGORY_OPTIONS.map((option) => {
                  const isActive = feedbackCategory === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFeedbackCategory(option.value)}
                      aria-pressed={isActive}
                      className={`rounded-xl border px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/45 ${
                        isActive
                          ? theme === "light"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-950"
                            : "border-emerald-300/70 bg-emerald-400/12 text-emerald-100"
                          : theme === "light"
                            ? "border-slate-300 bg-white text-slate-700 hover:border-emerald-300 hover:text-slate-900"
                            : "border-white/15 bg-white/5 text-slate-200 hover:border-emerald-300/35 hover:text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <textarea
                name="feedback-message"
                value={feedbackInput}
                onChange={(event) => setFeedbackInput(event.target.value)}
                rows={7}
                maxLength={2000}
                placeholder={"\uC5B4\uB5A4 \uBB38\uC81C\uB97C \uACAA\uC73C\uC168\uB294\uC9C0, \uC5B4\uB5BB\uAC8C \uAC1C\uC120\uD558\uBA74 \uC88B\uC744\uC9C0 \uC791\uC131\uD574 \uC8FC\uC138\uC694."}
                className={`w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40 ${
                  theme === "light"
                    ? "border-slate-300 bg-white text-slate-900"
                    : "border-white/15 bg-white/5 text-slate-100"
                }`}
              />
              <div className="flex items-center justify-between text-[11px]">
                <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                  {"\uBB38\uB9E5: "}{file?.name || "\uC120\uD0DD\uB41C \uBB38\uC11C \uC5C6\uC74C"}
                </span>
                <span className={theme === "light" ? "text-slate-500" : "text-slate-400"}>
                  {feedbackInput.length}/2000
                </span>
              </div>
            </div>
            {feedbackError && <p className="mt-2 text-xs text-rose-300">{feedbackError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseFeedbackDialog}
                disabled={isSubmittingFeedback}
                className={`ghost-button text-xs ${theme === "light" ? "text-slate-700" : "text-slate-200"}`}
                data-ghost-size="sm"
                style={{ "--ghost-color": "148, 163, 184" }}
              >
                {"\uCDE8\uC18C"}
              </button>
              <button
                type="submit"
                disabled={isSubmittingFeedback}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                {isSubmittingFeedback ? "\uC804\uC1A1 \uC911..." : "\uC804\uC1A1"}
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

      <main
        className="app-banner-offset relative z-10 mx-auto flex w-full max-w-none flex-col gap-4 px-3 py-3 sm:px-4 sm:py-4 lg:px-6"
        style={{ "--app-banner-offset": `${appBannerOffset}px` }}
      >
        {showHeader && (
          <Suspense fallback={null}>
            <Header
              user={user}
              onSignOut={handleSignOut}
              signingOut={isSigningOut}
              theme={theme}
              onGoHome={showDetail ? goBackToList : null}
              onOpenFeedbackDialog={AUTH_ENABLED ? handleOpenFeedbackDialog : null}
              onOpenBilling={openBilling}
              showBilling={AUTH_ENABLED}
              onToggleTheme={toggleTheme}
              onOpenLogin={openAuth}
              authEnabled={AUTH_ENABLED}
              isPremiumTier={isPremiumTier}
              loadingTier={loadingTier}
              onRefresh={handleManualSync}
              isRefreshing={isManualSyncing}
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






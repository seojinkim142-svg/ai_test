import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useLayoutEffect } from "react";
import StartPage from "./pages/StartPage";
import ProfilePinDialog from "./components/ProfilePinDialog";
import FeedbackDialog from "./components/FeedbackDialog";
import DiagnosticModal from "./components/diagnostic/DiagnosticModal";
import { useSupabaseAuth } from "./hooks/useSupabaseAuth";
import { useAdMobBanner } from "./hooks/useAdMobBanner";
import { useUserTier } from "./hooks/useUserTier";
import { usePageProgressCache } from "./hooks/usePageProgressCache";
import { useMindmap } from "./hooks/useMindmap";
import { useFolders } from "./hooks/useFolders";
import { useUploads } from "./hooks/useUploads";
import { useMockExams } from "./hooks/useMockExams";
import { useFlashcards } from "./hooks/useFlashcards";
import { useFlashcardActions } from "./hooks/useFlashcardActions";
import { useMockExamActions } from "./hooks/useMockExamActions";
import { useTutorActions } from "./hooks/useTutorActions";
import { usePremiumProfile } from "./hooks/usePremiumProfile";
import { AUTH_ENABLED } from "./config/auth";
import {
  supabase,
  uploadPdfToStorage,
  getAccessToken,
  saveMockExam,
  fetchMockExams,
  deleteMockExam,
  addFlashcard,
  addFlashcards,
  listFlashcards,
  deleteFlashcard,
  updateFlashcard,
  updateFlashcardSrs,
  deleteFlashcards,
  deleteAllFlashcardsForDeck,
  saveFlashcardScore,
  listFlashcardScores,
  createFolder,
  renameFolder,
  listFolders,
  deleteFolder,
  deleteUpload,
  saveUploadMetadata,
  listUploads,
  getSignedStorageUrl,
  updateUploadThumbnail,
  fetchDocArtifacts,
  fetchMultipleDocArtifacts,
  saveDocArtifacts,
  updateUploadFolder,
  updateUploadVocabulary,
  saveUserFeedback,
  getPremiumProfileStateFromUser,
  savePremiumProfileState,
  fetchExtractedText,
  getThemeFromUser,
  saveTheme,
  fetchLatestDiagnosticResult,
} from "./services/supabase";
import { ensureUploadPreviewPdf as ensureUploadPreviewPdfRequest } from "./services/document";
import {
  extractPdfTextByRanges,
  extractChapterRangesFromToc,
  extractPdfTextFromPages,
  extractPdfPageTexts,
  generatePdfThumbnail,
  extractPdfTextWithCaching,
} from "./utils/pdf";
import {
  detectSupportedDocumentKind,
  generateDocumentThumbnail,
  isPdfDocumentKind,
  isSupportedUploadFile,
  normalizeSupportedDocumentFile,
} from "./utils/document";
import { exportMockAnswerSheetToPdf, exportMockExamCombinedPdf, exportPagedElementToPdf } from "./utils/pdfExport";
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
import {
  resolveAnswerIndex,
  resolveShortAnswerText,
  buildMockExamAnswerSheet,
} from "./utils/mockExamUtils";
import { notifyFeedbackEmail } from "./services/feedback";
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
  EXAM_CRAM_PREVIEW_LIMIT,
  REVIEW_NOTE_MOCK_EXAM_LIMIT,
  collectExamCramQuizItems,
  createQuizSetState,
  isMissingFeedbackTableError,
  sortReviewNotesByRecentWrong,
} from "./utils/appFeatureHelpers";
import {
  normalizeReviewNoteEntries,
  readExamCramFromHighlights,
  readQuestionStyleProfileFromHighlights,
  readReviewNotesFromHighlights,
  writeQuestionStyleProfileToHighlights,
  writeConceptTagsToHighlights,
  readConceptTagsFromHighlights,
  readTopicStructureFromHighlights,
  writeTopicStructureToHighlights,
} from "./utils/studyArtifacts";
import {
  clearPaymentReturnPending,
  readPaymentReturnPending,
  extractPaymentReturnParams,
  isNativePaymentCallbackUrl,
  PAYMENT_RETURN_QUERY_KEYS as PAYMENT_RETURN_QUERY_KEYS_FROM_MODULE,
} from "./utils/paymentReturn";
import { getTutorCopy } from "./utils/tutorCopy";
import {
  useAuthStore,
  useUiStore,
  useDocumentStore,
  useSummaryStore,
  useQuizStore,
  useFlashcardStore,
  useMockExamStore,
  usePremiumStore,
  useTutorStore,
  useDiagnosticStore,
} from "./stores";
import {
  buildFolderAggregateDocId,
  isFolderAggregateDocId,
  parseFolderAggregateDocId,
} from "./utils/appShared";
import { buildStoragePathCandidates, isSafeStoragePathForReuse } from "./utils/storageHelpers";
import { hasMojibakeText, containsInternalAiDetail, sanitizeUiText, extractUserVisibleErrorPrefix } from "./utils/errorHandler";
import {
  formatTutorEvidenceLabel,
  normalizeTutorRequestPayload,
  buildTutorHistoryMessageContent,
  buildTutorImageEvidenceBlock,
  buildTutorHistoryStorageKey,
  buildChapterRangeStorageKey,
  TUTOR_HISTORY_STORAGE_PREFIX,
  TUTOR_HISTORY_MAX_MESSAGES,
  CHAPTER_RANGE_STORAGE_PREFIX,
} from "./utils/tutorHelpers";
import {
  isDbId,
  createLocalEntityId,
  getChapterRangeSourceLabel,
  buildDetectedChapterRangeNotice,
  AUTO_CHAPTER_FALLBACK_NOTICE,
  formatPartialSummaryDefaultName,
  parseChapterNumberSelectionInput,
  normalizeUsageCountValue,
  normalizeFreeUsageCounts,
  buildFreeUsageFallback,
  normalizeQuestionKey,
  DEFAULT_QUIZ_MIX,
  DEFAULT_QUIZ_MIX_INPUT,
  parseQuizMixInput,
  LIMIT_USAGE_KEY_MAP,
} from "./utils/appStateHelpers";
import { normalizeDiagnosticResultRow, isDiagnosticSkipped } from "./utils/diagnosticUtils";
import { normalizeFlashcardFront } from "./utils/flashcardUtils";
import { computeNextSrsState } from "./utils/spacedRepetition";
import {
  normalizeInstructorEmphasisInput,
  normalizeSavedPartialSummaryEntries,
  normalizeSavedInstructorEmphasisEntries,
  readFreeUsageCountsFromHighlights,
  writeFreeUsageCountsToHighlights,
  bumpFreeUsageCount,
  readPartialSummaryBundleFromHighlights,
  writePartialSummaryBundleToHighlights,
  writeReviewNotesBundleToHighlights,
  writeExamCramBundleToHighlights,
  FREE_USAGE_ARTIFACT_KEY,
  INSTRUCTOR_EMPHASIS_MAX_LENGTH,
} from "./utils/studyArtifacts";

const AuthPanel = lazy(() => import("./components/AuthPanel"));
const Header = lazy(() => import("./components/Header"));
const LoginBackground = lazy(() => import("./components/LoginBackground"));
const PaymentPage = lazy(() => import("./components/PaymentPage"));
const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const DetailPage = lazy(() => import("./pages/DetailPage"));
const PremiumProfilePicker = lazy(() => import("./components/PremiumProfilePicker"));
const NavRail = lazy(() => import("./components/NavRail"));

const NativeAppPlugin =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("App")
    ? Capacitor.registerPlugin("App")
    : null;

const PAYMENT_RETURN_QUERY_KEYS = PAYMENT_RETURN_QUERY_KEYS_FROM_MODULE;
const NATIVE_PAYMENT_RETURN_FALLBACK_MS = 1200;
const trimSchemeSeparators = (value) => String(value || "").trim().replace(/:\/*$/, "");
const revokeObjectUrlIfNeeded = (value) => {
  const normalized = String(value || "").trim();
  if (normalized.startsWith("blob:")) {
    URL.revokeObjectURL(normalized);
  }
};
const isConvertibleOfficeDocumentKind = (kind) => kind === "docx" || kind === "pptx";
const hasOfficePlaceholderThumbnail = (thumbnail) =>
  String(thumbnail || "").trim().startsWith("data:image/svg+xml");
const toPreviewPdfFileName = (fileName) => {
  const normalized = String(fileName || "document").trim();
  return normalized.replace(/\.[^.]+$/, "") + ".pdf";
};
const NATIVE_PAYMENT_RETURN_SCHEME = trimSchemeSeparators(
  import.meta.env.VITE_NATIVE_APP_SCHEME || "com.tjwls.examstudyai"
);
function App() {
  // ─── Store subscriptions ────────────────────────────────────────────────────
  const {
    isSigningOut, setIsSigningOut,
    showPayment, setShowPayment,
    paymentReturnSignal, setPaymentReturnSignal,
    showSettings, setShowSettings,
    showAuth, setShowAuth,
    showGuestIntro, setShowGuestIntro,
    skipPromoSplash, setSkipPromoSplash,
    allowGuestLandingAfterSignOut, setAllowGuestLandingAfterSignOut,
    setUser, setAuthReady, setTierInfo,
  } = useAuthStore();

  const {
    theme, setTheme,
    outputLanguage, setOutputLanguage,
    panelTab, setPanelTab,
    splitPercent, setSplitPercent,
    isResizingSplit, setIsResizingSplit,
    isFeedbackDialogOpen, setIsFeedbackDialogOpen,
    feedbackCategory, setFeedbackCategory,
    feedbackInput, setFeedbackInput,
    feedbackError, setFeedbackError,
    isSubmittingFeedback, setIsSubmittingFeedback,
    isManualSyncing, setIsManualSyncing,
    usageCounts, setUsageCounts,
    folderTutorMode, setFolderTutorMode,
    semanticSearchResults, setSemanticSearchResults,
    isSemanticSearching, setIsSemanticSearching,
    compareResult, setCompareResult,
    isComparing, setIsComparing,
    compareError, setCompareError,
    folderQuizQuestions, setFolderQuizQuestions,
    isLoadingFolderQuiz, setIsLoadingFolderQuiz,
    folderQuizError, setFolderQuizError,
    folderSelectedChoices, setFolderSelectedChoices,
    folderRevealedChoices, setFolderRevealedChoices,
    folderShortAnswerInput, setFolderShortAnswerInput,
    folderShortAnswerResult, setFolderShortAnswerResult,
    sidebarOpen, setSidebarOpen,
    showPremiumProfilePicker, setShowPremiumProfilePicker,
    showProfilePinDialog, setShowProfilePinDialog,
    profilePinInputs, setProfilePinInputs,
    profilePinError, setProfilePinError,
  } = useUiStore();

  const {
    file, setFile,
    extractedText, setExtractedText,
    previewText, setPreviewText,
    pageInfo, setPageInfo,
    pdfUrl, setPdfUrl,
    status, setStatus,
    error, setError,
    isLoadingText, setIsLoadingText,
    thumbnailUrl, setThumbnailUrl,
    currentPage, setCurrentPage,
    visitedPages, setVisitedPages,
    uploadedFiles, setUploadedFiles,
    selectedFileId, setSelectedFileId,
    pendingDocumentOpen, setPendingDocumentOpen,
    folders, setFolders,
    selectedFolderId, setSelectedFolderId,
    selectedUploadIds, setSelectedUploadIds,
    isFolderLoading, setIsFolderLoading,
    artifacts, setArtifacts,
    allArtifacts, setAllArtifacts,
  } = useDocumentStore();

  const {
    summary, setSummary,
    isLoadingSummary, setIsLoadingSummary,
    isExportingSummary, setIsExportingSummary,
    partialSummary, setPartialSummary,
    partialSummaryRange, setPartialSummaryRange,
    savedPartialSummaries, setSavedPartialSummaries,
    isSavedPartialSummaryOpen, setIsSavedPartialSummaryOpen,
    isPageSummaryOpen, setIsPageSummaryOpen,
    pageSummaryInput, setPageSummaryInput,
    pageSummaryError, setPageSummaryError,
    isPageSummaryLoading, setIsPageSummaryLoading,
    instructorEmphasisInput, setInstructorEmphasisInput,
    savedInstructorEmphases, setSavedInstructorEmphases,
    activeInstructorEmphasisId, setActiveInstructorEmphasisId,
    chapterRangeInput, setChapterRangeInput,
    autoChapterRangeInput, setAutoChapterRangeInput,
    chapterRangeError, setChapterRangeError,
    chapterRangeNotice, setChapterRangeNotice,
    isChapterRangeOpen, setIsChapterRangeOpen,
    isDetectingChapterRanges, setIsDetectingChapterRanges,
    topicStructure, setTopicStructure,
    isLoadingTopicStructure, setIsLoadingTopicStructure,
    topicStructureError, setTopicStructureError,
  } = useSummaryStore();

  const {
    questionStyleProfileContent, setQuestionStyleProfileContent,
    questionStyleProfileScopeLabel, setQuestionStyleProfileScopeLabel,
    quizSets, setQuizSets,
    isLoadingQuiz, setIsLoadingQuiz,
    quizMixInput, setQuizMixInput,
    oxItems, setOxItems,
    oxSelections, setOxSelections,
    oxExplanationOpen, setOxExplanationOpen,
    isLoadingOx, setIsLoadingOx,
    quizChapterSelectionInput, setQuizChapterSelectionInput,
    quizPromptAddonInput, setQuizPromptAddonInput,
    quizDifficulty, setQuizDifficulty,
    oxChapterSelectionInput, setOxChapterSelectionInput,
  } = useQuizStore();

  const {
    flashcards, setFlashcards,
    isLoadingFlashcards, setIsLoadingFlashcards,
    isGeneratingFlashcards, setIsGeneratingFlashcards,
    flashcardStatus, setFlashcardStatus,
    flashcardError, setFlashcardError,
    flashcardScores, setFlashcardScores,
    vocabQuizScores, setVocabQuizScores,
    flashcardChapterSelectionInput, setFlashcardChapterSelectionInput,
    flashcardGenerateCount, setFlashcardGenerateCount,
  } = useFlashcardStore();

  const {
    mockExams, setMockExams,
    isLoadingMockExams, setIsLoadingMockExams,
    isGeneratingMockExam, setIsGeneratingMockExam,
    mockExamStatus, setMockExamStatus,
    mockExamError, setMockExamError,
    activeMockExamId, setActiveMockExamId,
    showMockExamAnswers, setShowMockExamAnswers,
    isMockExamMenuOpen, setIsMockExamMenuOpen,
    mockExamChapterSelectionInput, setMockExamChapterSelectionInput,
    mockExamPromptAddonInput, setMockExamPromptAddonInput,
    examCramContent, setExamCramContent,
    examCramUpdatedAt, setExamCramUpdatedAt,
    examCramScopeLabel, setExamCramScopeLabel,
    isGeneratingExamCram, setIsGeneratingExamCram,
    examCramStatus, setExamCramStatus,
    examCramError, setExamCramError,
    reviewNotes, setReviewNotes,
    reviewNotesChapterSelectionInput, setReviewNotesChapterSelectionInput,
  } = useMockExamStore();

  const {
    premiumProfiles, setPremiumProfiles,
    activePremiumProfileId, setActivePremiumProfileId,
    premiumSpaceMode, setPremiumSpaceMode,
  } = usePremiumStore();

  const {
    tutorMessages, setTutorMessages,
    isTutorLoading, setIsTutorLoading,
    tutorError, setTutorError,
  } = useTutorStore();

  const {
    diagnosticResult,
    setIsDiagnosticModalOpen,
    setDiagnosticStatus,
    setDiagnosticError,
    setDiagnosticItems,
    setDiagnosticCurrentIndex,
    setDiagnosticResult,
    resetDiagnostic,
  } = useDiagnosticStore();
  const downloadCacheRef = useRef(new Map()); // storagePath -> { file, thumbnail, remoteUrl, bucket }
  const backfillInProgressRef = useRef(false);
  const summaryRequestedRef = useRef(false);
  const topicStructureRequestedRef = useRef(false);
  const summaryContextCacheRef = useRef(new Map()); // fileId -> extended summary text
  const tutorPageTextCacheRef = useRef(new Map()); // docId:page -> { text, ocrUsed }
  const tutorSectionRangeCacheRef = useRef(new Map()); // docId:section:anchor -> range
  const chapterScopeTextCacheRef = useRef(new Map()); // scoped key -> text
  const extractTextForChapterSelectionRef = useRef(null);
  const chapterOneStartPageCacheRef = useRef(new Map()); // docId -> chapter 1 start page
  const questionSourceTextCacheRef = useRef(new Map()); // docId:chapter1 -> source text
  const quizAutoRequestedRef = useRef(false);
  const oxAutoRequestedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activeDragPointerIdRef = useRef(null);
  const dragHandleElementRef = useRef(null);
  const fileOpenRequestSeqRef = useRef(0);
  const detailContainerRef = useRef(null);
  const summaryRef = useRef(null);
  const reviewNotesRef = useRef([]);
  const mockExamPrintRef = useRef(null);
  const mockExamMenuRef = useRef(null);
  const mockExamMenuButtonRef = useRef(null);
  const openAiModulePromiseRef = useRef(null);
  const tutorRequestInFlightRef = useRef(false);
  const paymentAbortFallbackTimerRef = useRef(null);
  const { user, authReady, refreshSession, handleSignOut: authSignOut } = useSupabaseAuth();
  const { tier, tierExpiresAt, tierRemainingDays, loadingTier, refreshTier } = useUserTier(user);
  const isFreeTier = tier === "free";
  const isPremiumTier = tier === "premium";
  const isFolderFeatureEnabled = !isFreeTier;
  const usageCountsByDocRef = useRef(new Map());

  // ─── Sync hooks → stores ────────────────────────────────────────────────────
  // showGuestIntro 초기화 (AUTH_ENABLED=false 이면 true)
  useEffect(() => {
    if (!AUTH_ENABLED) setShowGuestIntro(true);
  }, []);
  // useSupabaseAuth → authStore sync
  useEffect(() => { setUser(user); }, [user, setUser]);
  useEffect(() => { setAuthReady(authReady); }, [authReady, setAuthReady]);
  // useUserTier → authStore sync
  useEffect(() => {
    setTierInfo({ tier, tierExpiresAt, tierRemainingDays, loadingTier });
  }, [tier, tierExpiresAt, tierRemainingDays, loadingTier, setTierInfo]);

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
  const safeChapterRangeNotice = useMemo(
    () => sanitizeUiText(chapterRangeNotice, ""),
    [chapterRangeNotice]
  );

  useEffect(() => {
    setChapterRangeNotice("");
  }, [file, selectedFileId]);
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
  const safeExamCramStatus = useMemo(
    () => sanitizeUiText(examCramStatus, "시험 직전 정리가 준비되었습니다."),
    [examCramStatus]
  );
  const safeExamCramError = useMemo(
    () => sanitizeUiText(examCramError, "시험 직전 정리 처리 중 오류가 발생했습니다."),
    [examCramError]
  );
  const safeTutorError = useMemo(
    () => sanitizeUiText(tutorError, "튜터 응답 처리 중 오류가 발생했습니다."),
    [tutorError]
  );
  const isNativePlatform = Capacitor.isNativePlatform();
  const shouldForceNativeAuthEntry =
    AUTH_ENABLED && isNativePlatform && authReady && !user && !allowGuestLandingAfterSignOut;
  const shouldRenderAuthScreen = AUTH_ENABLED && !user && (showAuth || shouldForceNativeAuthEntry);
  const shouldShowAdBanner = !loadingTier && tier === "free" && !shouldRenderAuthScreen;
  const { bannerHeight } = useAdMobBanner({ enabled: shouldShowAdBanner });
  const appShellStyle = useMemo(
    () => ({
      "--app-banner-offset": `${Math.max(0, Number(bannerHeight) || 0)}px`,
    }),
    [bannerHeight]
  );
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
  const requestPreviewPdfConversion = useCallback(
    async (item, { force = false } = {}) => {
      const uploadId = item?.id;
      const storagePath = item?.remotePath || item?.path;
      const fileName = item?.name || item?.file?.name || "";
      const documentKind = detectSupportedDocumentKind(item?.file || fileName);

      if (!user || !supabase || !AUTH_ENABLED) return item;
      if (!uploadId || !storagePath || !isConvertibleOfficeDocumentKind(documentKind)) return item;

      const accessToken = await getAccessToken();
      if (!accessToken) return item;

      const result = await ensureUploadPreviewPdfRequest(
        {
          uploadId,
          bucket: item?.bucket,
          storagePath,
          fileName,
          force,
        },
        { accessToken }
      );

      const nextItem = {
        ...item,
        previewPdfPath: result?.previewPdfPath || item?.previewPdfPath || null,
        previewPdfBucket: result?.previewPdfBucket || item?.previewPdfBucket || item?.bucket || null,
        previewPdfUrl: result?.signedUrl || item?.previewPdfUrl || "",
      };

      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id?.toString() === uploadId?.toString()
            ? { ...entry, ...nextItem }
            : entry
        )
      );
      return nextItem;
    },
    [user, supabase]
  );
  const resolvePreviewPdfUrlForItem = useCallback(async (item) => {
    const previewPdfPath = String(item?.previewPdfPath || "").trim();
    if (!previewPdfPath) return "";

    const cachedUrl = String(item?.previewPdfUrl || "").trim();
    if (cachedUrl) return cachedUrl;

    const previewPdfBucket = item?.previewPdfBucket || item?.bucket || import.meta.env.VITE_SUPABASE_BUCKET;
    const signedUrl = await getSignedStorageUrl({
      bucket: previewPdfBucket,
      path: previewPdfPath,
      expiresIn: 60 * 60 * 24,
    });

    setUploadedFiles((prev) =>
      prev.map((entry) =>
        entry.id?.toString() === item?.id?.toString()
          ? {
              ...entry,
              previewPdfPath,
              previewPdfBucket,
              previewPdfUrl: signedUrl,
            }
          : entry
      )
    );
    return signedUrl;
  }, []);
  const refreshUploadThumbnailFromPreviewPdf = useCallback(
    async (item) => {
      const documentKind = detectSupportedDocumentKind(item?.file || item?.name || "");
      if (!isConvertibleOfficeDocumentKind(documentKind)) return item;
      if (!item?.id || !String(item?.previewPdfPath || "").trim()) return item;
      if (item?.thumbnail && !hasOfficePlaceholderThumbnail(item.thumbnail)) return item;

      const previewPdfUrl = await resolvePreviewPdfUrlForItem(item);
      if (!previewPdfUrl) return item;

      const response = await fetch(previewPdfUrl);
      if (!response.ok) {
        throw new Error(`Preview PDF thumbnail fetch failed. (status: ${response.status})`);
      }

      const blob = await response.blob();
      const previewPdfFile = new File([blob], toPreviewPdfFileName(item?.name), {
        type: "application/pdf",
      });
      const thumbnail = await generatePdfThumbnail(previewPdfFile);
      if (!thumbnail) return item;

      await updateUploadThumbnail({ id: item.id, userId: user?.id, thumbnail });
      const updatedItem = { ...item, thumbnail, previewPdfUrl };
      setUploadedFiles((prev) =>
        prev.map((entry) =>
          entry.id?.toString() === item.id?.toString()
            ? { ...entry, thumbnail, previewPdfUrl }
            : entry
        )
      );
      return updatedItem;
    },
    [resolvePreviewPdfUrlForItem, user?.id]
  );

  const limits = useMemo(() => {
    if (tier === "free") {
      return {
        maxUploads: 4,
        maxSummary: 1,
        maxQuiz: 1,
        maxOx: 1,
        maxFlashcards: 1,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.free,
      };
    }
    if (tier === "pro") {
      return {
        maxUploads: Infinity,
        maxSummary: Infinity,
        maxQuiz: Infinity,
        maxOx: Infinity,
        maxFlashcards: Infinity,
        maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.pro,
      };
    }
    return {
      maxUploads: Infinity,
      maxSummary: Infinity,
      maxQuiz: Infinity,
      maxOx: Infinity,
      maxFlashcards: Infinity,
      maxPdfSizeBytes: PDF_MAX_SIZE_BY_TIER.premium,
    };
  }, [tier]);

  const hasReached = useCallback(
    (type) => {
      const usageKey = LIMIT_USAGE_KEY_MAP[type];
      if (!limits || !usageKey) return false;
      if (limits[type] === Infinity) return false;
      return Number(usageCounts?.[usageKey] || 0) >= limits[type];
    },
    [limits, usageCounts]
  );
  const applyUsageCountsForDoc = useCallback((docId, counts) => {
    const docKey = String(docId || "").trim();
    const normalizedCounts = normalizeFreeUsageCounts(counts);
    if (docKey) {
      usageCountsByDocRef.current.set(docKey, normalizedCounts);
    }
    setUsageCounts(normalizedCounts);
    return normalizedCounts;
  }, []);
  const bumpUsageCountForActiveDoc = useCallback(
    (feature) => {
      const docKey = String(selectedFileId || file?.name || "").trim();
      const currentCounts = docKey
        ? usageCountsByDocRef.current.get(docKey) || usageCounts
        : usageCounts;
      const nextCounts = bumpFreeUsageCount(currentCounts, feature);
      if (docKey) {
        usageCountsByDocRef.current.set(docKey, nextCounts);
      }
      setUsageCounts(nextCounts);
      return nextCounts;
    },
    [selectedFileId, file?.name, usageCounts]
  );

  const openAuth = useCallback(() => {
    if (!AUTH_ENABLED) return;
    setShowAuth(true);
  }, []);

  const closeAuth = useCallback(() => {
    setShowAuth(false);
  }, []);

  const clearPaymentAbortFallback = useCallback(() => {
    if (paymentAbortFallbackTimerRef.current != null && typeof window !== "undefined") {
      window.clearTimeout(paymentAbortFallbackTimerRef.current);
      paymentAbortFallbackTimerRef.current = null;
    }
  }, []);

  const closePayment = useCallback(() => {
    clearPaymentAbortFallback();
    clearPaymentReturnPending();
    setShowPayment(false);
  }, [clearPaymentAbortFallback]);

  const openBilling = useCallback(() => {
    setShowPayment(true);
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
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

  const loadTutorHistory = useCallback(
    (docId) => {
      if (typeof window === "undefined") return [];
      const key = buildTutorHistoryStorageKey({ userId: user?.id, docId });
      if (!key) return [];
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    [user?.id]
  );

  const persistTutorHistory = useCallback(
    (docId, messages) => {
      if (typeof window === "undefined") return;
      const key = buildTutorHistoryStorageKey({ userId: user?.id, docId });
      if (!key) return;
      try {
        if (!messages || messages.length === 0) {
          window.localStorage.removeItem(key);
        } else {
          const trimmed = messages.slice(-TUTOR_HISTORY_MAX_MESSAGES);
          window.localStorage.setItem(key, JSON.stringify(trimmed));
        }
      } catch {
        // Ignore storage write errors.
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (!selectedFileId) return;
    persistTutorHistory(selectedFileId, tutorMessages);
  }, [tutorMessages, selectedFileId, persistTutorHistory]);

  const resetActiveDocumentState = useCallback(() => {
    fileOpenRequestSeqRef.current += 1;
    if (pdfUrl) {
      revokeObjectUrlIfNeeded(pdfUrl);
    }
    setSelectedFileId(null);
    setPendingDocumentOpen(null);
    setFile(null);
    setPdfUrl(null);
    setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setReviewNotes([]);
    reviewNotesRef.current = [];
    setInstructorEmphasisInput("");
    setSavedInstructorEmphases([]);
    setActiveInstructorEmphasisId("");
    setIsSavedPartialSummaryOpen(false);
    setReviewNotesChapterSelectionInput("");
    setExamCramContent("");
    setExamCramUpdatedAt("");
    setExamCramScopeLabel("");
    setExamCramStatus("");
    setExamCramError("");
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    setAutoChapterRangeInput("");
    tutorPageTextCacheRef.current.clear();
    tutorSectionRangeCacheRef.current.clear();
    chapterScopeTextCacheRef.current.clear();
    summaryContextCacheRef.current.clear();
    setQuizSets([]);
    setOxItems(null);
    setOxSelections({});
    setOxExplanationOpen({});
    setThumbnailUrl(null);
    setIsLoadingText(false);
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

  const { handleOpenProfilePicker, handleOpenProfilePinDialog, handleCloseProfilePinDialog, handleCloseProfilePicker, handleTogglePremiumSpaceMode, handleSelectPremiumProfile, handleRenamePremiumProfile, handleChangePremiumProfilePin, handleDisablePremiumProfilePin, handleCreatePremiumProfile } = usePremiumProfile({
    user, isPremiumTier, activePremiumProfileId, resetActiveDocumentState,
  });

  useEffect(() => {
    if (user) {
      setShowAuth(false);
      setSkipPromoSplash(false);
      setAllowGuestLandingAfterSignOut(false);
    }
  }, [user]);

  const { loadFolders, handleCreateFolder, handleRenameFolder, handleDeleteFolder, handleSelectFolder, handleSelectFolderSummary } = useFolders({
    user, loadingTier, isPremiumTier, isFolderFeatureEnabled, premiumOwnerProfileId, premiumScopeProfileId,
  });

  const { loadUploads, loadUploadsRef, handleDeleteUpload, handleToggleVocabulary, handleToggleUploadSelect, handleClearSelection, handleMoveUploadsToFolder } = useUploads({
    user, loadingTier, isPremiumTier, isFolderFeatureEnabled, premiumOwnerProfileId, premiumScopeProfileId, persistChapterRangeInput,
  });

  const uploadedFilesRef = useRef(uploadedFiles);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      if (user) saveTheme(next).catch(() => {});
      return next;
    });
  }, [user]);

  const shortPreview = useMemo(
    () => (previewText.length > 700 ? `${previewText.slice(0, 700)}...` : previewText),
    [previewText]
  );
  const parsedQuizMix = useMemo(() => parseQuizMixInput(quizMixInput), [quizMixInput]);
  const quizMix = parsedQuizMix.mix;
  const quizMixError = parsedQuizMix.error;
  const tutorCopy = useMemo(() => getTutorCopy(outputLanguage), [outputLanguage]);

  const tutorNotice = useMemo(() => {
    const selectedKind = detectSupportedDocumentKind(file);
    if (!file || !selectedFileId) {
      return tutorCopy.notices.openFileOrAttach;
    }
    if (!isPdfDocumentKind(selectedKind)) {
      return tutorCopy.notices.pdfOnlyForPageGrounded;
    }
    if (isLoadingText) {
      return tutorCopy.notices.extractingText;
    }
    const summaryCacheKey = selectedFileId || file?.name || null;
    const docCacheKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    const cachedRecoveredText = [
      extractedText,
      summaryCacheKey ? summaryContextCacheRef.current.get(summaryCacheKey) : "",
      questionSourceTextCacheRef.current.get(`${docCacheKey}:full-doc`),
    ]
      .map((value) => String(value || "").trim())
      .find(Boolean);
    const trimmed = String(cachedRecoveredText || "").trim();
    if (!trimmed) {
      return tutorCopy.notices.scannedPdfFallback;
    }
    return "";
  }, [extractedText, file, isLoadingText, selectedFileId, tutorCopy]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("theme-light");
    } else {
      root.classList.remove("theme-light");
    }
  }, [theme]);

  // 로그인한 유저의 저장된 테마 불러오기
  useEffect(() => {
    if (!user) return;
    const saved = getThemeFromUser(user);
    if (saved) setTheme(saved);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("pg_token") || params.get("kakaoPay") || params.get("nicePay") || params.get("np_token")) {
      setShowPayment(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !isNativePlatform || !NativeAppPlugin) return undefined;

    const applyPaymentReturnUrl = (rawUrl) => {
      clearPaymentAbortFallback();
      const nextPaymentParams = extractPaymentReturnParams(rawUrl);
      if (!nextPaymentParams) {
        if (isNativePaymentCallbackUrl(rawUrl, NATIVE_PAYMENT_RETURN_SCHEME) && readPaymentReturnPending()) {
          paymentAbortFallbackTimerRef.current = window.setTimeout(() => {
            paymentAbortFallbackTimerRef.current = null;
            if (!readPaymentReturnPending()) return;
            const currentParams = new URLSearchParams(window.location.search);
            const hasPaymentReturnParams = PAYMENT_RETURN_QUERY_KEYS.some((key) => {
              const value = currentParams.get(key);
              return value != null && value !== "";
            });
            if (hasPaymentReturnParams) return;
            clearPaymentReturnPending();
            setShowPayment(false);
          }, NATIVE_PAYMENT_RETURN_FALLBACK_MS);
          return true;
        }
        return false;
      }

      const currentUrl = new URL(window.location.href);
      PAYMENT_RETURN_QUERY_KEYS.forEach((key) => currentUrl.searchParams.delete(key));
      nextPaymentParams.forEach((value, key) => currentUrl.searchParams.set(key, value));

      const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
      const nextState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : buildHistoryState();

      window.history.replaceState(nextState, "", nextUrl);
      setShowPayment(true);
      setPaymentReturnSignal((prev) => prev + 1);
      return true;
    };

    let cancelled = false;
    let listenerHandle = null;

    (async () => {
      try {
        if (typeof NativeAppPlugin.getLaunchUrl === "function") {
          const launchData = await NativeAppPlugin.getLaunchUrl();
          if (!cancelled) {
            applyPaymentReturnUrl(launchData?.url);
          }
        }

        listenerHandle = await NativeAppPlugin.addListener("appUrlOpen", ({ url }) => {
          if (cancelled) return;
          applyPaymentReturnUrl(url);
        });
      } catch (err) {
        console.warn("Native payment appUrlOpen listener setup failed:", err);
      }
    })();

    return () => {
      cancelled = true;
      clearPaymentAbortFallback();
      listenerHandle?.remove?.();
    };
  }, [buildHistoryState, clearPaymentAbortFallback, isNativePlatform]);

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

  const { loadMockExams } = useMockExams({ user });

  const { loadFlashcards } = useFlashcards({ user, selectedFileId });

  const handleManualSync = useCallback(async () => {
    if (isManualSyncing) return;
    if (!user) {
      setStatus("로그인 후 새로고침을 사용할 수 있습니다.");
      openAuth();
      return;
    }
    if (loadingTier) {
      setStatus("구독 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    setIsManualSyncing(true);
    setError("");
    setStatus("동기화 중입니다...");
    try {
      await Promise.all([loadFolders(), loadUploads()]);
      if (selectedFileId) {
        await Promise.all([loadMockExams(selectedFileId), loadFlashcards(selectedFileId)]);
      }
      setStatus("새로고침 완료. 최신 상태로 업데이트됐습니다.");
    } catch (err) {
      setError(`새로고침에 실패했습니다: ${err.message}`);
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
      if (!supabase || !user || !docId) {
        setArtifacts(null);
        setReviewNotes([]);
        reviewNotesRef.current = [];
        setReviewNotesChapterSelectionInput("");
        setExamCramContent("");
        setExamCramUpdatedAt("");
        setExamCramScopeLabel("");
        setExamCramStatus("");
        setExamCramError("");
        setQuestionStyleProfileContent("");
        setQuestionStyleProfileScopeLabel("");
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
        const freeUsageCounts = readFreeUsageCountsFromHighlights(
          mapped.highlights,
          buildFreeUsageFallback(mapped)
        );
        const partialBundle = readPartialSummaryBundleFromHighlights(mapped.highlights);
        const reviewNoteEntries = readReviewNotesFromHighlights(mapped.highlights);
        const examCramBundle = readExamCramFromHighlights(mapped.highlights);
        const questionStyleBundle = readQuestionStyleProfileFromHighlights(mapped.highlights);
        const storedTopicStructure = readTopicStructureFromHighlights(mapped.highlights);
        const activeInstructorText = normalizeInstructorEmphasisInput(
          partialBundle.instructorEmphasisLibrary.find(
            (item) => item.id === partialBundle.activeInstructorEmphasisId
          )?.text
        );
        const storedExtractedText = String(data?.extracted_text || "").trim();
        const storedExtractedMetadata =
          data?.extracted_text_metadata && typeof data.extracted_text_metadata === "object"
            ? data.extracted_text_metadata
            : {};
        const storedPagesUsed = Number.parseInt(storedExtractedMetadata?.pages_used, 10) || 0;
        const storedTotalPages = Number.parseInt(storedExtractedMetadata?.total_pages, 10) || 0;
        const docCacheKey = String(docId || "").trim();
        setArtifacts(mapped);
        setPartialSummary(partialBundle.summary);
        setPartialSummaryRange(partialBundle.range);
        setSavedPartialSummaries(partialBundle.library);
        setReviewNotes(reviewNoteEntries);
        setInstructorEmphasisInput(activeInstructorText);
        setSavedInstructorEmphases(partialBundle.instructorEmphasisLibrary);
        setActiveInstructorEmphasisId(partialBundle.activeInstructorEmphasisId);
        setIsSavedPartialSummaryOpen(false);
        setReviewNotesChapterSelectionInput("");
        setExamCramContent(examCramBundle.content);
        setExamCramUpdatedAt(examCramBundle.updatedAt || "");
        setExamCramScopeLabel(examCramBundle.scopeLabel);
        setExamCramStatus("");
        setExamCramError("");
        setQuestionStyleProfileContent(questionStyleBundle.content);
        setQuestionStyleProfileScopeLabel(questionStyleBundle.scopeLabel);
        reviewNotesRef.current = reviewNoteEntries;
        if (storedExtractedText) {
          if (docCacheKey) {
            summaryContextCacheRef.current.set(docCacheKey, storedExtractedText);
            questionSourceTextCacheRef.current.set(`${docCacheKey}:full-doc`, storedExtractedText);
          }
          setExtractedText((prev) =>
            String(prev || "").trim().length >= storedExtractedText.length ? prev : storedExtractedText
          );
          setPreviewText((prev) =>
            String(prev || "").trim().length >= storedExtractedText.length ? prev : storedExtractedText
          );
          if (storedPagesUsed || storedTotalPages) {
            setPageInfo((prev) => ({
              used: Math.max(Number(prev?.used || 0), storedPagesUsed),
              total: Math.max(Number(prev?.total || 0), storedTotalPages),
            }));
          }
        }
        if (storedTopicStructure) {
          setTopicStructure(storedTopicStructure);
          topicStructureRequestedRef.current = true;
        }
        if (mapped.summary) {
          setSummary(mapped.summary);
          summaryRequestedRef.current = true;
        }
        if (mapped.quiz) {
          const normalizedQuiz = normalizeQuizPayload(mapped.quiz);
          const cachedSet = createQuizSetState(
            {
              multipleChoice: normalizedQuiz.multipleChoice,
              shortAnswer: normalizedQuiz.shortAnswer,
              ox: [],
            },
            `quiz-cached-${docId}`,
            {
              questionStyleProfile: questionStyleBundle.content,
              questionStyleScopeLabel: questionStyleBundle.scopeLabel,
            }
          );
          setQuizSets([cachedSet]);
          quizAutoRequestedRef.current = true;
        }
        if (mapped.ox) {
          setOxItems(mapped.ox?.items || []);
          oxAutoRequestedRef.current = true;
        }
        return {
          ...mapped,
          freeUsageCounts,
        };
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
            await updateUploadThumbnail({ id: item.id, userId: user?.id, thumbnail: thumb });
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
    [user?.id]
  );
  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    setIsSigningOut(true);
    setError("");
    setStatus("로그아웃 중...");
    try {
      setShowSettings(false);
      setShowAuth(false);
      setSkipPromoSplash(true);
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
      if (pdfUrl) {
        revokeObjectUrlIfNeeded(pdfUrl);
      }
      setAllowGuestLandingAfterSignOut(true);
      setSelectedFileId(null);
      setPendingDocumentOpen(null);
      setFile(null);
      setPdfUrl(null);
      setCurrentPage(1);
      setVisitedPages(new Set());
      setPanelTab("summary");
      updateHistoryState("replace", { view: "list" });
      await refreshSession();
      setStatus("로그아웃되었습니다.");
    } catch (err) {
      setError(`로그아웃에 실패했습니다: ${err.message}`);
      setStatus("");
    } finally {
      setIsSigningOut(false);
    }
  }, [authSignOut, pdfUrl, refreshSession, updateHistoryState]);

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
        const fetchAbort = new AbortController();
        const fetchTimeout = setTimeout(() => fetchAbort.abort(), 60_000);
        try {
          const signedUrl = await getSignedStorageUrl({
            bucket,
            path: candidatePath,
            expiresIn: 60 * 60 * 24,
          });
          const response = await fetch(signedUrl, { signal: fetchAbort.signal });
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
          lastErr = err.name === "AbortError" ? new Error("파일 다운로드 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.") : err;
        } finally {
          clearTimeout(fetchTimeout);
        }
      }

      // Fallback to authenticated storage download when signed URL fetch fails.
      if (!blob && supabase) {
        for (const candidatePath of pathCandidates) {
          const dlAbort = new AbortController();
          const dlTimeout = setTimeout(() => dlAbort.abort(), 60_000);
          try {
            const { data, error } = await supabase.storage.from(bucket).download(candidatePath, { signal: dlAbort.signal });
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
            lastErr = err.name === "AbortError" ? new Error("파일 다운로드 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.") : err;
          } finally {
            clearTimeout(dlTimeout);
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
        revokeObjectUrlIfNeeded(pdfUrl);
      }
    };
  }, [pdfUrl]);

  const resetQuizState = () => {
    setQuizSets([]);
  };

  const processSelectedFile = useCallback(
    async (item, { pushState = true } = {}) => {
      if (!item) return;
      const requestSeq = fileOpenRequestSeqRef.current + 1;
      fileOpenRequestSeqRef.current = requestSeq;
      let resolvedItem = item;
      const nextDocId = resolvedItem.id;
      setPendingDocumentOpen({
        id: nextDocId,
        name: String(resolvedItem?.name || resolvedItem?.file?.name || "문서").trim() || "문서",
      });
      if (!resolvedItem.file) {
        try {
          resolvedItem = await ensureFileForItem(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
        } catch (err) {
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
          setPendingDocumentOpen(null);
          setError(`파일을 불러오지 못했습니다. ${err.message}`);
          return;
        }
      }
      if (!resolvedItem?.file) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        return;
      }

      const targetFile = normalizeSupportedFile(resolvedItem.file);
      if (!(targetFile instanceof File)) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        return;
      }
      const targetFileKind = detectSupportedDocumentKind(targetFile);
      if (!targetFileKind) {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
        }
        setError("지원하지 않는 파일 형식입니다. PDF, DOCX, PPTX만 지원합니다.");
        return;
      }
      let previewPdfSourceUrl = "";
      if (isConvertibleOfficeDocumentKind(targetFileKind)) {
        try {
          if (!resolvedItem?.previewPdfPath) {
            resolvedItem = await requestPreviewPdfConversion(resolvedItem);
            if (fileOpenRequestSeqRef.current !== requestSeq) return;
          }
          resolvedItem = await refreshUploadThumbnailFromPreviewPdf(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
          previewPdfSourceUrl = await resolvePreviewPdfUrlForItem(resolvedItem);
          if (fileOpenRequestSeqRef.current !== requestSeq) return;
        } catch (previewError) {
          console.warn("Office preview PDF preparation failed", previewError);
        }
      }
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
        revokeObjectUrlIfNeeded(pdfUrl);
      }
      setPdfUrl(
        isPdfDocumentKind(targetFileKind)
          ? URL.createObjectURL(targetFile)
          : previewPdfSourceUrl || null
      );
      setFile(targetFile);
      setSelectedFileId(nextDocId);
      setPanelTab("topicStructure");
      resetQuizState();
      summaryRequestedRef.current = false;
      topicStructureRequestedRef.current = false;
      quizAutoRequestedRef.current = false;
      setError("");
      setTopicStructure(null);
      setTopicStructureError("");
      setSummary("");
      setPartialSummary("");
      setPartialSummaryRange("");
      setSavedPartialSummaries([]);
      setReviewNotes([]);
      reviewNotesRef.current = [];
      setInstructorEmphasisInput("");
      setSavedInstructorEmphases([]);
      setActiveInstructorEmphasisId("");
      setIsSavedPartialSummaryOpen(false);
      setReviewNotesChapterSelectionInput("");
      setExamCramContent("");
      setExamCramUpdatedAt("");
      setExamCramScopeLabel("");
      setExamCramStatus("");
      setExamCramError("");
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
      setTutorMessages(loadTutorHistory(nextDocId));
      setTutorError("");
      setIsTutorLoading(false);
      setIsPageSummaryOpen(false);
      setPageSummaryInput("");
      setPageSummaryError("");
      setIsPageSummaryLoading(false);
      setIsChapterRangeOpen(false);
      setChapterRangeInput(savedChapterRangeInput);
      setAutoChapterRangeInput("");
      setChapterRangeError("");
      oxAutoRequestedRef.current = false;
      resetDiagnostic();
      applyUsageCountsForDoc(nextDocId, usageCountsByDocRef.current.get(String(nextDocId || "").trim()));
      const artifactsPromise = loadArtifacts(nextDocId);

      try {
        const [textResult, thumb, loaded] = await Promise.all([
          extractPdfTextWithCaching(targetFile, nextDocId, user?.id, {
            pageLimit: 30,
            maxLength: 12000,
            useOcr: true, // OCR을 사용하여 텍스트 추출
            ocrLang: "kor+eng",
          }),
          generateDocumentThumbnail(targetFile),
          artifactsPromise,
        ]);
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        const { text, pagesUsed, totalPages } = textResult;
        const normalizedInitialText = String(text || "").trim();
        setExtractedText(text);
        setPreviewText(text);
        setPageInfo({ used: pagesUsed, total: totalPages });
        setThumbnailUrl(thumb);
        const extractEnd =
          typeof performance !== "undefined" && typeof performance.now === "function"
            ? performance.now()
            : Date.now();
        const elapsedSeconds = Math.max(0, (extractEnd - extractStart) / 1000);
        const extractionStatusSuffix = normalizedInitialText
          ? ""
          : isPdfDocumentKind(detectSupportedDocumentKind(targetFile))
            ? ", 텍스트 없음 - 요약 시 OCR 자동 시도"
            : ", 텍스트 없음";
        setStatus(`텍스트 추출 완료 (${elapsedSeconds.toFixed(1)}s${extractionStatusSuffix})`);
        setError("");
        await Promise.all([loadMockExams(nextDocId), loadFlashcards(nextDocId)]);
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        if (loaded?.freeUsageCounts) {
          applyUsageCountsForDoc(nextDocId, loaded.freeUsageCounts);
        }
        if (loaded?.summary) {
          setStatus("Loaded saved summary.");
        }

        if (user?.id) {
          try {
            const diagnosticRow = await fetchLatestDiagnosticResult({ userId: user.id, docId: nextDocId });
            if (fileOpenRequestSeqRef.current !== requestSeq) return;
            if (diagnosticRow) {
              setDiagnosticResult(normalizeDiagnosticResultRow(diagnosticRow));
              setDiagnosticStatus("completed");
            } else if (normalizedInitialText && !isDiagnosticSkipped(user.id, nextDocId)) {
              setIsDiagnosticModalOpen(true);
              setDiagnosticStatus("generating");
              try {
                const { generateDiagnosticQuiz } = await getOpenAiService();
                const diagnosticData = await generateDiagnosticQuiz(normalizedInitialText, { outputLanguage });
                if (fileOpenRequestSeqRef.current !== requestSeq) return;
                if (diagnosticData?.items?.length) {
                  setDiagnosticItems(diagnosticData.items);
                  setDiagnosticCurrentIndex(0);
                  setDiagnosticStatus("in-progress");
                } else {
                  setDiagnosticStatus("error");
                }
              } catch (diagErr) {
                if (fileOpenRequestSeqRef.current !== requestSeq) return;
                setDiagnosticError(diagErr.message);
                setDiagnosticStatus("error");
              }
            }
          } catch (diagCheckErr) {
            console.warn("diagnostic result check failed", diagCheckErr);
          }
        }
      } catch (err) {
        if (fileOpenRequestSeqRef.current !== requestSeq) return;
        setError(`문서 처리에 실패했습니다: ${err.message}`);
        setExtractedText("");
        setPreviewText("");
        setPageInfo({ used: 0, total: 0 });
      } finally {
        if (fileOpenRequestSeqRef.current === requestSeq) {
          setPendingDocumentOpen(null);
          setIsLoadingText(false);
        }
      }
    },
    [
      currentPage,
      ensureFileForItem,
      loadSavedChapterRangeInput,
      loadArtifacts,
      applyUsageCountsForDoc,
      loadFlashcards,
      loadMockExams,
      loadPageProgressSnapshot,
      normalizeSupportedFile,
      pdfUrl,
      refreshUploadThumbnailFromPreviewPdf,
      requestPreviewPdfConversion,
      resolvePreviewPdfUrlForItem,
      savePageProgressSnapshot,
      selectedFileId,
      visitedPages,
    ]
  );

  const handleRetakeDiagnostic = useCallback(async () => {
    const sourceText = String(extractedText || "").trim();
    if (!sourceText) return;
    resetDiagnostic();
    setIsDiagnosticModalOpen(true);
    setDiagnosticStatus("generating");
    try {
      const { generateDiagnosticQuiz } = await getOpenAiService();
      const diagnosticData = await generateDiagnosticQuiz(sourceText, { outputLanguage });
      if (diagnosticData?.items?.length) {
        setDiagnosticItems(diagnosticData.items);
        setDiagnosticCurrentIndex(0);
        setDiagnosticStatus("in-progress");
      } else {
        setDiagnosticStatus("error");
      }
    } catch (err) {
      setDiagnosticError(err.message);
      setDiagnosticStatus("error");
    }
  }, [
    extractedText,
    outputLanguage,
    getOpenAiService,
    resetDiagnostic,
    setIsDiagnosticModalOpen,
    setDiagnosticStatus,
    setDiagnosticItems,
    setDiagnosticCurrentIndex,
    setDiagnosticError,
  ]);

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
        setError("파일 업로드 전에 프리미엄 프로필을 선택해주세요.");
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
        setError(`파일 업로드 한도를 초과했습니다. 최대 업로드 수: ${limits.maxUploads}.`);
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
            return { ...item, uploadError: "유효하지 않은 파일을 사용할 수 없습니다. 다시 로그인해주세요." };
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
                previewPdfPath: existing.previewPdfPath || existing.preview_pdf_path || null,
                previewPdfBucket: existing.previewPdfBucket || existing.preview_pdf_bucket || null,
                previewPdfUrl: existing.previewPdfUrl || "",
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
            const uploadedItem = {
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
            if (!isConvertibleOfficeDocumentKind(detectSupportedDocumentKind(item.file))) {
              return uploadedItem;
            }
            try {
              const convertedItem = await requestPreviewPdfConversion(uploadedItem);
              return await refreshUploadThumbnailFromPreviewPdf(convertedItem);
            } catch (previewError) {
              console.warn("Upload preview PDF conversion failed", previewError);
              return uploadedItem;
            }
          } catch (err) {
            // Roll back orphaned storage files when metadata insert fails.
            if (uploaded?.bucket && uploaded?.path) {
              try {
                await supabase.storage.from(uploaded.bucket).remove([uploaded.path]);
              } catch {
                // Ignore rollback failures.
              }
            }
            return { ...item, uploadError: err?.message || "업로드에 실패했습니다." };
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
      const firstReadyUpload = successfulUploads.find((item) => item?.file);
      if (firstReadyUpload) {
        await processSelectedFile(firstReadyUpload);
        if (AUTH_ENABLED && user) {
          await loadUploadsRef.current?.();
        }
        setStatus("업로드된 파일이 없습니다. 업로드 오류 메시지를 확인해주세요.");
        setStatus("업로드된 파일이 없습니다. 업로드 오류 메시지를 확인해주세요.");
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
      refreshUploadThumbnailFromPreviewPdf,
      requestPreviewPdfConversion,
      tier,
      processSelectedFile,
    ]
  );

  const showDetail = Boolean(selectedFileId || pendingDocumentOpen?.id);
  const shouldShowPremiumProfilePicker = Boolean(
    user && isPremiumTier && !loadingTier && showPremiumProfilePicker
  );
  const activeUploadItem = useMemo(() => {
    if (!selectedFileId) return null;
    return uploadedFiles.find((item) => String(item?.id || "") === String(selectedFileId)) || null;
  }, [selectedFileId, uploadedFiles]);
  const activeDocumentUrl = useMemo(
    () => String(activeUploadItem?.remoteUrl || "").trim(),
    [activeUploadItem]
  );

  const goBackToList = useCallback(() => {
    fileOpenRequestSeqRef.current += 1;
    if (selectedFileId) {
      savePageProgressSnapshot({
        docId: selectedFileId,
        visited: Array.from(visitedPages),
        page: currentPage,
      });
    }
    if (pdfUrl) {
      revokeObjectUrlIfNeeded(pdfUrl);
    }
    setSelectedFileId(null);
    setPendingDocumentOpen(null);
    setFile(null);
      setPdfUrl(null);
      setExtractedText("");
    setPreviewText("");
    setPageInfo({ used: 0, total: 0 });
    setSummary("");
    setPartialSummary("");
    setPartialSummaryRange("");
    setSavedPartialSummaries([]);
    setReviewNotes([]);
    reviewNotesRef.current = [];
    setInstructorEmphasisInput("");
    setSavedInstructorEmphases([]);
    setActiveInstructorEmphasisId("");
    setIsSavedPartialSummaryOpen(false);
    setReviewNotesChapterSelectionInput("");
    setExamCramContent("");
    setExamCramUpdatedAt("");
    setExamCramScopeLabel("");
    setExamCramStatus("");
    setExamCramError("");
    setQuizChapterSelectionInput("");
    setOxChapterSelectionInput("");
    setFlashcardChapterSelectionInput("");
    setMockExamChapterSelectionInput("");
    setAutoChapterRangeInput("");
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
    setAutoChapterRangeInput("");
    setChapterRangeError("");
    setOxItems(null);
    setOxSelections({});
    setPanelTab("summary");
    summaryRequestedRef.current = false;
    topicStructureRequestedRef.current = false;
    quizAutoRequestedRef.current = false;
    oxAutoRequestedRef.current = false;
    setTopicStructure(null);
    setTopicStructureError("");
    setArtifacts(null);
    setIsLoadingText(false);
    resetQuizState();
    setStatus("파일 목록으로 돌아갑니다.");
    setSelectedUploadIds([]);
    updateHistoryState("replace", { view: "list" });
  }, [currentPage, pdfUrl, savePageProgressSnapshot, selectedFileId, updateHistoryState, visitedPages]);

  const consumeOverlayBack = useCallback(() => {
    if (showPayment) {
      closePayment();
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
    closePayment,
  ]);

  const goBackToListRef = useRef(goBackToList);
  const processSelectedFileRef = useRef(processSelectedFile);
  const ensureFileForItemRef = useRef(ensureFileForItem);

  const handleSelectFile = useCallback(
    async (item) => {
      try {
        await processSelectedFileRef.current(item);
      } catch (err) {
        setError(`선택한 파일을 여는 데 실패했습니다: ${err.message}`);
      }
    },
    [processSelectedFileRef]
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
        // Only persist the fields explicitly included in partial.
        // Passing merged.* would overwrite DB fields with stale state when
        // called from a background task that captured an old artifacts closure.
        await saveDocArtifacts({
          userId: user.id,
          docId: selectedFileId,
          ...("summary" in partial && { summary: partial.summary }),
          ...("quiz" in partial && { quiz: partial.quiz }),
          ...("ox" in partial && { ox: partial.ox }),
          ...("highlights" in partial && { highlights: partial.highlights }),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("저장에 실패했습니다: artifacts", err);
      }
    },
    [artifacts, selectedFileId, user]
  );

  // ─── 학습 현황: 모든 파일의 artifact 일괄 로드 ───────────────────────────
  const loadAllArtifacts = useCallback(
    async (files) => {
      if (!user || !files?.length) return;
      try {
        const docIds = files.map((f) => f.id).filter(Boolean);
        if (!docIds.length) return;
        const data = await fetchMultipleDocArtifacts({ userId: user.id, docIds });
        setAllArtifacts(data || []);
      } catch {
        // 실패해도 무시
      }
    },
    [user]
  );

  // ─── 의미론적 검색 ─────────────────────────────────────────────────────────
  const handleSemanticSearch = useCallback(
    async (query, files) => {
      if (!query) {
        setSemanticSearchResults(null);
        return;
      }
      setIsSemanticSearching(true);
      try {
        const { generateSemanticSearch } = await getOpenAiService();
        const docsInfo = (files || uploadedFiles).map((f) => {
          const art = allArtifacts.find((a) => String(a.doc_id) === String(f.id));
          const tags = readConceptTagsFromHighlights(art?.highlights_json);
          return { id: f.id, name: f.name, summary: art?.summary || "", tags };
        });
        const results = await generateSemanticSearch(query, docsInfo, { outputLanguage });
        setSemanticSearchResults(results);
      } catch {
        setSemanticSearchResults([]);
      } finally {
        setIsSemanticSearching(false);
      }
    },
    [allArtifacts, getOpenAiService, outputLanguage, uploadedFiles]
  );

  // ─── 문서 간 비교 분석 ─────────────────────────────────────────────────────
  const handleCompareDocuments = useCallback(
    async (selectedFiles) => {
      if (!selectedFiles?.length || selectedFiles.length < 2) return;
      setIsComparing(true);
      setCompareError("");
      setCompareResult("");
      try {
        const { generateDocComparison } = await getOpenAiService();
        // 각 문서의 extractedText 가져오기
        const docsWithText = await Promise.all(
          selectedFiles.map(async (f) => {
            const art = allArtifacts.find((a) => String(a.doc_id) === String(f.id));
            let text = art?.extracted_text || art?.summary || "";
            if (!text && user) {
              try {
                const fetched = await fetchExtractedText({ userId: user.id, docId: f.id });
                text = fetched?.extracted_text || "";
              } catch {
                // 무시
              }
            }
            return { name: f.name, text: text || `(${f.name} 내용 없음)` };
          })
        );
        const result = await generateDocComparison(docsWithText, { outputLanguage });
        setCompareResult(result);
      } catch (err) {
        setCompareError(`비교 분석 실패: ${err.message}`);
      } finally {
        setIsComparing(false);
      }
    },
    [allArtifacts, getOpenAiService, outputLanguage, user]
  );

  // ─── 폴더 모드 튜터: 폴더 내 모든 문서 텍스트 합치기 ────────────────────────
  const buildFolderTutorContext = useCallback(
    async (folderId) => {
      if (!user || !folderId || folderId === "all") return null;
      const folderFiles = uploadedFiles.filter(
        (f) => String(f.folderId || "") === String(folderId)
      );
      if (!folderFiles.length) return null;
      const docIds = folderFiles.map((f) => f.id);
      let arts = allArtifacts.filter((a) => docIds.includes(String(a.doc_id)));
      if (!arts.length) {
        try {
          arts = await fetchMultipleDocArtifacts({ userId: user.id, docIds });
        } catch {
          return null;
        }
      }
      const blocks = arts
        .map((a) => {
          const file = folderFiles.find((f) => String(f.id) === String(a.doc_id));
          const text = a.extracted_text || a.summary || "";
          if (!text) return null;
          return `### ${file?.name || a.doc_id}\n${text.slice(0, 20000)}`;
        })
        .filter(Boolean);
      if (!blocks.length) return null;
      return blocks.join("\n\n---\n\n");
    },
    [allArtifacts, uploadedFiles, user]
  );

  // ─── 폴더 모드 computed ───────────────────────────────────────────────────────
  const isFolderMode = isFolderAggregateDocId(selectedFileId);
  const currentFolderInfo = useMemo(() => {
    if (!isFolderMode) return null;
    const folderId = parseFolderAggregateDocId(selectedFileId);
    const folder = folders.find((f) => String(f.id) === String(folderId));
    const files = uploadedFiles.filter((f) => String(f.folderId) === String(folderId));
    return { folderId, folderName: folder?.label || folder?.name || folderId, files };
  }, [isFolderMode, selectedFileId, folders, uploadedFiles]);

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

  const persistInstructorEmphasisState = useCallback(
    ({ library = savedInstructorEmphases, activeId = activeInstructorEmphasisId } = {}) => {
      const nextHighlights = writePartialSummaryBundleToHighlights(artifacts?.highlights, {
        instructorEmphasisLibrary: library,
        activeInstructorEmphasisId: activeId,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [activeInstructorEmphasisId, artifacts?.highlights, persistArtifacts, savedInstructorEmphases]
  );

  const persistReviewNotes = useCallback(
    (updater) => {
      const base = Array.isArray(reviewNotesRef.current) ? reviewNotesRef.current : [];
      const nextRaw = typeof updater === "function" ? updater(base) : updater;
      const next = normalizeReviewNoteEntries(nextRaw);
      reviewNotesRef.current = next;
      setReviewNotes(next);
      const nextHighlights = writeReviewNotesBundleToHighlights(artifacts?.highlights, next);
      persistArtifacts({ highlights: nextHighlights });
      return next;
    },
    [artifacts?.highlights, persistArtifacts]
  );

  const persistExamCramBundle = useCallback(
    ({ content = "", scopeLabel = "", updatedAt = new Date().toISOString() } = {}) => {
      const nextHighlights = writeExamCramBundleToHighlights(artifacts?.highlights, {
        content,
        scopeLabel,
        updatedAt,
      });
      persistArtifacts({ highlights: nextHighlights });
    },
    [artifacts?.highlights, persistArtifacts]
  );

  const handleSaveInstructorEmphasis = useCallback(
    ({ value } = {}) => {
      const nextValue =
        value === undefined
          ? normalizeInstructorEmphasisInput(instructorEmphasisInput)
          : normalizeInstructorEmphasisInput(value);
      if (!nextValue) {
        setStatus("\uC800\uC7A5\uD560 \uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
        return;
      }

      const existing = savedInstructorEmphases.find((item) => item.text === nextValue);
      if (existing) {
        setActiveInstructorEmphasisId(existing.id);
        setInstructorEmphasisInput("");
        persistInstructorEmphasisState({
          library: savedInstructorEmphases,
          activeId: existing.id,
        });
        setStatus("\uC774\uBBF8 \uC800\uC7A5\uB41C \uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }

      const nowIso = new Date().toISOString();
      const newItem = {
        id: createPremiumProfileId(),
        text: nextValue,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const nextLibrary = normalizeSavedInstructorEmphasisEntries([
        newItem,
        ...(Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []),
      ]);
      setSavedInstructorEmphases(nextLibrary);
      setActiveInstructorEmphasisId(newItem.id);
      setInstructorEmphasisInput("");
      persistInstructorEmphasisState({ library: nextLibrary, activeId: newItem.id });
      setStatus("\uAC15\uC870 \uD3EC\uC778\uD2B8\uB97C \uBCC4\uB3C4 \uD56D\uBAA9\uC73C\uB85C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
    },
    [instructorEmphasisInput, persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const handleSelectInstructorEmphasis = useCallback(
    (itemId) => {
      const targetId = String(itemId || "").trim();
      if (!targetId) return;
      const found = savedInstructorEmphases.find((item) => item.id === targetId);
      if (!found) return;
      setActiveInstructorEmphasisId(targetId);
      setInstructorEmphasisInput(found.text);
      persistInstructorEmphasisState({ library: savedInstructorEmphases, activeId: targetId });
    },
    [persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const handleDeleteInstructorEmphasis = useCallback(
    (itemId) => {
      const targetId = String(itemId || "").trim();
      if (!targetId) return;
      const nextLibrary = (Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : []).filter(
        (item) => item.id !== targetId
      );
      const nextActiveId =
        targetId === activeInstructorEmphasisId ? nextLibrary[0]?.id || "" : activeInstructorEmphasisId;
      const nextActiveItem = nextLibrary.find((item) => item.id === nextActiveId) || null;
      setSavedInstructorEmphases(nextLibrary);
      setActiveInstructorEmphasisId(nextActiveId);
      setInstructorEmphasisInput(nextActiveItem?.text || "");
      persistInstructorEmphasisState({ library: nextLibrary, activeId: nextActiveId });
      setStatus("\uAC15\uC870 \uD3EC\uC778\uD2B8 \uD56D\uBAA9\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
    },
    [activeInstructorEmphasisId, persistInstructorEmphasisState, savedInstructorEmphases]
  );

  const cycleActiveInstructorEmphasis = useCallback(
    (direction = 1) => {
      const list = Array.isArray(savedInstructorEmphases) ? savedInstructorEmphases : [];
      if (list.length <= 1) return;
      const currentIndex = list.findIndex((item) => item.id === activeInstructorEmphasisId);
      const start = currentIndex >= 0 ? currentIndex : 0;
      const step = Number(direction) >= 0 ? 1 : -1;
      const nextIndex = (start + step + list.length) % list.length;
      const nextId = list[nextIndex]?.id || "";
      if (!nextId) return;
      handleSelectInstructorEmphasis(nextId);
    },
    [activeInstructorEmphasisId, handleSelectInstructorEmphasis, savedInstructorEmphases]
  );

  const getEffectiveInstructorEmphasisText = useCallback(() => {
    return "";
  }, []);

  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  useEffect(() => {
    if (user && uploadedFiles.length > 0) {
      void loadAllArtifacts(uploadedFiles);
    }
  }, [uploadedFiles, user, loadAllArtifacts]);

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
  }, [consumeOverlayBack, isNativePlatform, showDetail, updateHistoryState]);

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

  const buildChapterRangeInputFromChapters = useCallback((chapters = []) => {
    return (Array.isArray(chapters) ? chapters : [])
      .map((chapter, index) => {
        const start = Number.parseInt(chapter?.pageStart, 10);
        const end = Number.parseInt(chapter?.pageEnd, 10);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return "";
        return `${index + 1}:${start}-${end}`;
      })
      .filter(Boolean)
      .join("\n");
  }, []);

  const buildAutomaticChapterRangeInput = useCallback((totalPages, startPage = 1) => {
    const normalizedTotalPages = Number.parseInt(totalPages, 10);
    if (!Number.isFinite(normalizedTotalPages) || normalizedTotalPages <= 0) return "";

    const normalizedStartPage = Math.min(
      normalizedTotalPages,
      Math.max(1, Number.parseInt(startPage, 10) || 1)
    );
    const remainingPages = normalizedTotalPages - normalizedStartPage + 1;
    if (remainingPages <= 0) return "";

    const targetSectionCount = Math.max(1, Math.min(8, Math.ceil(remainingPages / 18)));
    const pagesPerSection = Math.max(1, Math.ceil(remainingPages / targetSectionCount));
    const sections = [];
    let index = 1;

    for (let currentPage = normalizedStartPage; currentPage <= normalizedTotalPages; currentPage += pagesPerSection) {
      const endPage = Math.min(normalizedTotalPages, currentPage + pagesPerSection - 1);
      sections.push(`${index}:${currentPage}-${endPage}`);
      index += 1;
    }

    return sections.join("\n");
  }, []);

  const resolveChapterOneStartPage = useCallback(async () => {
    if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) return 1;
    const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return 1;

    const manualRangeRaw = String(chapterRangeInput || autoChapterRangeInput || "").trim();
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
  }, [autoChapterRangeInput, chapterRangeInput, file, pageInfo?.total, pageInfo?.used, selectedFileId]);

  useEffect(() => {
    if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setAutoChapterRangeInput("");
      return;
    }
    if (String(chapterRangeInput || "").trim()) {
      setAutoChapterRangeInput("");
      return;
    }
    if (String(autoChapterRangeInput || "").trim()) return;

    const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
    if (!Number.isFinite(totalPages) || totalPages <= 0) return;

    const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
    let cancelled = false;

    (async () => {
      let resolvedInput = "";
      try {
        const detected = await extractChapterRangesFromToc(file, {
          maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
        });
        const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
        const detectedInput = buildChapterRangeInputFromChapters(chapters);
        const parsed = detectedInput
          ? parseChapterRangeSelectionInput(detectedInput, totalPages || Number(detected?.totalPages) || 0)
          : { error: "empty", chapters: [] };

        if (!parsed.error && parsed.chapters.length > 0) {
          resolvedInput = detectedInput;
          setChapterRangeNotice(buildDetectedChapterRangeNotice(detected));
          const sorted = [...parsed.chapters].sort(
            (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
          );
          const chapterOne =
            sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
          const start = Number.parseInt(chapterOne?.pageStart, 10);
          if (Number.isFinite(start) && start > 0) {
            chapterOneStartPageCacheRef.current.set(docKey, Math.min(totalPages, Math.max(1, start)));
          }
        }
      } catch {
        resolvedInput = "";
      }

      if (!resolvedInput) {
        const cachedStartPage = Number(chapterOneStartPageCacheRef.current.get(docKey));
        resolvedInput = buildAutomaticChapterRangeInput(totalPages, cachedStartPage);
        if (resolvedInput && !cancelled) {
          setChapterRangeNotice(AUTO_CHAPTER_FALLBACK_NOTICE);
        }
      }

      if (!cancelled) {
        setAutoChapterRangeInput(resolvedInput);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    autoChapterRangeInput,
    buildAutomaticChapterRangeInput,
    buildChapterRangeInputFromChapters,
    chapterRangeInput,
    file,
    pageInfo?.total,
    pageInfo?.used,
    selectedFileId,
  ]);

  const recoverSummarySourceText = useCallback(
    async (sourceText) => {
      let nextSourceText = String(sourceText || "").trim();
      let attemptedOcr = false;
      let lastOcrError = null;

      if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        return { text: nextSourceText, attemptedOcr, lastOcrError };
      }

      const summaryCacheKey = selectedFileId || file?.name || null;
      const cachedSummaryText = summaryCacheKey
        ? summaryContextCacheRef.current.get(summaryCacheKey)
        : null;
      if (
        typeof cachedSummaryText === "string" &&
        String(cachedSummaryText).trim().length > nextSourceText.length
      ) {
        nextSourceText = String(cachedSummaryText).trim();
      }

      if (nextSourceText.length < 120) {
        try {
          setStatus("요약 정확도 향상을 위해 전체 본문을 다시 확인하는 중...");
          const extended = await extractPdfTextWithCaching(file, selectedFileId, user?.id, {
            pageLimit: 80,
            maxLength: 50000,
            useOcr: false,
          });
          const extendedText = String(extended?.text || "").trim();
          if (extendedText.length > nextSourceText.length) {
            nextSourceText = extendedText;
          }
        } catch (error) {
          console.warn("Failed to refresh summary source text:", error);
        }
      }

      if (nextSourceText.length < 120) {
        attemptedOcr = true;
        try {
          setStatus("텍스트가 부족해 OCR로 다시 추출하는 중...");
          const ocrExtracted = await extractPdfTextWithCaching(file, selectedFileId, user?.id, {
            pageLimit: 80,
            maxLength: 28000,
            useOcr: true,
            forceRefresh: true,
            ocrLang: "kor+eng",
            ocrScale: 2,
            ocrMaxPixels: 2200000,
            ocrPageOrder: "spread",
            maxOcrPages: 24,
            onOcrProgress: (message) => setStatus(message),
          });
          const ocrText = String(ocrExtracted?.text || "").trim();
          if (ocrText.length > nextSourceText.length) {
            nextSourceText = ocrText;
          }
        } catch (error) {
          lastOcrError = error;
          console.warn("Failed to recover summary source text with OCR:", error);
        }
      }

      if (nextSourceText) {
        if (summaryCacheKey) {
          summaryContextCacheRef.current.set(summaryCacheKey, nextSourceText);
        }
        setExtractedText((prev) =>
          String(prev || "").trim().length >= nextSourceText.length ? prev : nextSourceText
        );
        setPreviewText((prev) =>
          String(prev || "").trim().length >= nextSourceText.length ? prev : nextSourceText
        );
      }

      return { text: nextSourceText, attemptedOcr, lastOcrError };
    },
    [file, selectedFileId, user]
  );

  const recoverQuestionSourceText = useCallback(
    async ({ featureLabel, sourceText }) => {
      let nextSourceText = String(sourceText || "").trim();
      
      // 파일이 없거나 PDF가 아닌 경우 기본 텍스트 반환
      if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        return nextSourceText;
      }

      const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
      const cacheKey = `${docKey}:full-doc`;
      const cachedText = questionSourceTextCacheRef.current.get(cacheKey);
      if (typeof cachedText === "string" && cachedText.trim().length > nextSourceText.length) {
        nextSourceText = cachedText.trim();
      }

      if (nextSourceText.length >= 80) {
        return nextSourceText;
      }

      try {
        setStatus(`${featureLabel}: 전체 본문을 다시 확인하는 중...`);
        const extended = await extractPdfTextWithCaching(file, selectedFileId, user?.id, {
          pageLimit: 80,
          maxLength: 50000,
          useOcr: false,
        });
        const extendedText = String(extended?.text || "").trim();
        if (extendedText.length > nextSourceText.length) {
          nextSourceText = extendedText;
        }
      } catch (error) {
        console.warn('Failed to extract PDF text:', error);
        // Keep the currently available text.
      }

      if (nextSourceText.length < 80) {
        try {
          setStatus(`${featureLabel}: 텍스트가 부족해 OCR로 다시 추출하는 중...`);
          const ocrExtracted = await extractPdfTextWithCaching(file, selectedFileId, user?.id, {
            pageLimit: 80,
            maxLength: 28000,
            useOcr: true,
            ocrLang: "kor+eng",
            ocrScale: 1.35,
            ocrMaxPixels: 1000000,
            ocrPageOrder: "spread",
            maxOcrPages: 16,
            onOcrProgress: (message) => setStatus(message),
          });
          const ocrText = String(ocrExtracted?.text || "").trim();
          if (ocrText.length > nextSourceText.length) {
            nextSourceText = ocrText;
          }
        } catch (error) {
          console.warn('Failed to extract OCR text:', error);
          // Keep the currently available text.
        }
      }

      if (nextSourceText) {
        questionSourceTextCacheRef.current.set(cacheKey, nextSourceText);
        setExtractedText((prev) =>
          String(prev || "").trim().length >= nextSourceText.length ? prev : nextSourceText
        );
        setPreviewText((prev) =>
          String(prev || "").trim().length >= nextSourceText.length ? prev : nextSourceText
        );
      }

      return nextSourceText;
    },
    [file, selectedFileId, user]
  );

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

      let sourceText = String(baseText || previewText || "").trim();
      if (!file || !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        return { text: sourceText, scopeLabel: "" };
      }

      const totalPages = Number(pageInfo?.total || pageInfo?.used || 0);
      if (!Number.isFinite(totalPages) || totalPages <= 0) {
        sourceText = await recoverQuestionSourceText({ featureLabel, sourceText });
        return { text: sourceText, scopeLabel: "" };
      }

      const chapterOneStartPage = await resolveChapterOneStartPage();
      if (!Number.isFinite(chapterOneStartPage) || chapterOneStartPage <= 1) {
        sourceText = await recoverQuestionSourceText({ featureLabel, sourceText });
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
      if (sourceText.length < 80) {
        sourceText = await recoverQuestionSourceText({ featureLabel, sourceText });
      }

      return {
        text: sourceText,
        scopeLabel: filteredApplied ? `chapter 1+ (p.${chapterOneStartPage}~)` : "",
      };
    },
    [
      file,
      pageInfo?.total,
      pageInfo?.used,
      previewText,
      recoverQuestionSourceText,
      resolveChapterOneStartPage,
      selectedFileId,
    ]
  );

  const requestQuestions = async ({ force = false } = {}) => {
    if (isLoadingQuiz && !force) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!quizMix) {
      setError(quizMixError || "문항 비율을 다시 확인해주세요.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("무료 플랜에서는 파일당 퀴즈를 1회만 생성할 수 있습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    const additionalRequest = String(quizPromptAddonInput || "").trim();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));

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
        throw new Error("문서에서 퀴즈에 사용할 본문 텍스트를 찾지 못했습니다.");
      }
      if (scopeLabel) {
        setStatus(`퀴즈 세트 생성 중... (${scopeLabel})`);
      }

      const historicalQuizTexts = collectQuestionTextsFromQuizSets(quizSets);
      const canReuseHistoricalQuizPrompts = historicalQuizTexts.length > 0;
      const avoidQuestionTexts = dedupeQuestionTexts(historicalQuizTexts).slice(0, 80);
      const seenQuestionKeys = createQuestionKeySet(avoidQuestionTexts);

      const targetMcCount = Math.max(0, Number(quizMix.multipleChoice) || 0);
      const targetSaCount = Math.max(0, Number(quizMix.shortAnswer) || 0);
      const targetTotalCount = targetMcCount + targetSaCount;
      if (targetTotalCount <= 0) {
        throw new Error("최소 1문항 이상 입력해주세요.");
      }
      const nextMultipleChoice = [];
      const nextShortAnswer = [];
      let questionStyleProfile = "";
      let reusedPreviousQuizPrompts = false;

      const { generateQuiz } = await getOpenAiService();
      const maxAttempts = Math.max(
        3,
        Math.ceil(targetMcCount / 5) + 1,
        Math.ceil(targetSaCount / 5) + 1
      );
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (nextMultipleChoice.length >= targetMcCount && nextShortAnswer.length >= targetSaCount) {
          break;
        }

        const requestMcCount =
          targetMcCount > nextMultipleChoice.length
            ? Math.min(5, targetMcCount - nextMultipleChoice.length + 1)
            : 0;
        const requestSaCount =
          targetSaCount > nextShortAnswer.length
            ? Math.min(5, targetSaCount - nextShortAnswer.length + 1)
            : 0;
        const rawQuizResult = await generateQuiz(quizSourceText, {
          multipleChoiceCount: requestMcCount,
          shortAnswerCount: requestSaCount,
          avoidQuestions: avoidQuestionTexts,
          scopeLabel,
          questionStyleProfile: questionStyleProfileContent,
          additionalRequest,
          outputLanguage,
          difficulty: quizDifficulty,
        });
        if (!questionStyleProfile) {
          questionStyleProfile = String(rawQuizResult?.questionStyleProfile || "").trim();
        }
        const quiz = normalizeQuizPayload(rawQuizResult);

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
        const relaxedSeenQuestionKeys = createQuestionKeySet([
          ...nextMultipleChoice.map(getQuizPromptText),
          ...nextShortAnswer.map(getQuizPromptText),
        ]);
        const relaxedAvoidQuestions = dedupeQuestionTexts([
          ...nextMultipleChoice.map(getQuizPromptText),
          ...nextShortAnswer.map(getQuizPromptText),
        ]).slice(0, 40);
        const relaxedAttempts = 2;

        for (let attempt = 0; attempt < relaxedAttempts; attempt += 1) {
          if (nextMultipleChoice.length >= targetMcCount && nextShortAnswer.length >= targetSaCount) {
            break;
          }

          const remainingMcCount = Math.max(0, targetMcCount - nextMultipleChoice.length);
          const remainingSaCount = Math.max(0, targetSaCount - nextShortAnswer.length);
          const requestMcCount = remainingMcCount > 0 ? Math.min(8, remainingMcCount + 2 + attempt) : 0;
          const requestSaCount = remainingSaCount > 0 ? Math.min(6, remainingSaCount + 1 + attempt) : 0;
          const rawQuizResult = await generateQuiz(quizSourceText, {
            multipleChoiceCount: requestMcCount,
            shortAnswerCount: requestSaCount,
            avoidQuestions: relaxedAvoidQuestions,
            scopeLabel,
            questionStyleProfile: questionStyleProfile || questionStyleProfileContent,
            additionalRequest,
            outputLanguage,
            difficulty: quizDifficulty,
          });
          if (!questionStyleProfile) {
            questionStyleProfile = String(rawQuizResult?.questionStyleProfile || "").trim();
          }
          const quiz = normalizeQuizPayload(rawQuizResult);
          const prevMcLength = nextMultipleChoice.length;
          const prevSaLength = nextShortAnswer.length;

          pushUniqueByQuestionKey(
            nextMultipleChoice,
            Array.isArray(quiz.multipleChoice) ? quiz.multipleChoice : [],
            getQuizPromptText,
            relaxedSeenQuestionKeys,
            targetMcCount
          );
          pushUniqueByQuestionKey(
            nextShortAnswer,
            Array.isArray(quiz.shortAnswer) ? quiz.shortAnswer : [],
            getQuizPromptText,
            relaxedSeenQuestionKeys,
            targetSaCount
          );

          if (
            canReuseHistoricalQuizPrompts &&
            (nextMultipleChoice.length > prevMcLength || nextShortAnswer.length > prevSaLength)
          ) {
            reusedPreviousQuizPrompts = true;
          }

          const mergedRelaxedAvoidQuestions = mergeQuestionHistory(
            relaxedAvoidQuestions,
            [...nextMultipleChoice.map(getQuizPromptText), ...nextShortAnswer.map(getQuizPromptText)],
            60
          );
          relaxedAvoidQuestions.splice(0, relaxedAvoidQuestions.length, ...mergedRelaxedAvoidQuestions);
        }
      }

      if (nextMultipleChoice.length < targetMcCount || nextShortAnswer.length < targetSaCount) {
        throw new Error("충분한 퀴즈 문항을 만들지 못했습니다. 챕터 범위나 페이지 범위를 바꿔 다시 시도해 주세요.");
      }

      const trimmedQuiz = {
        multipleChoice: nextMultipleChoice.slice(0, targetMcCount),
        shortAnswer: nextShortAnswer.slice(0, targetSaCount),
      };
      const newSet = createQuizSetState(trimmedQuiz, undefined, {
        questionStyleProfile,
        questionStyleScopeLabel: scopeLabel || questionStyleProfileScopeLabel,
      });
      setQuizSets((prev) => [...prev, newSet]);
      const quizStatusLabel = reusedPreviousQuizPrompts
        ? scopeLabel
          ? `퀴즈 세트가 생성되었습니다. 일부 문항은 기존 세트와 겹칠 수 있습니다. (${scopeLabel})`
          : "퀴즈 세트가 생성되었습니다. 일부 문항은 기존 세트와 겹칠 수 있습니다."
        : scopeLabel
          ? `퀴즈 세트가 생성되었습니다. (${scopeLabel})`
          : "퀴즈 세트가 생성되었습니다.";
      const nextUsageCounts = bumpUsageCountForActiveDoc("quiz");
      const nextHighlights = writeFreeUsageCountsToHighlights(artifacts?.highlights, nextUsageCounts);
      setStatus(quizStatusLabel);
      persistArtifacts({ quiz: trimmedQuiz, highlights: nextHighlights });
    } catch (err) {
      setError(`퀴즈 세트 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingQuiz(false);
    }
  };

  const handleDeleteQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!quizSets.length) {
      setError("삭제할 퀴즈가 없습니다.");
      return;
    }
    quizAutoRequestedRef.current = false;
    resetQuizState();
    setStatus("퀴즈를 삭제했습니다.");
    setError("");
    await persistArtifacts({ quiz: null });
  };

  const handleDeleteQuizItem = useCallback(
    async (setId, section, questionIndex) => {
      const normalizedSection = String(section || "").trim();
      const normalizedIndex = Number.parseInt(questionIndex, 10);
      if (!setId || !["multipleChoice", "shortAnswer"].includes(normalizedSection)) return;
      if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0) return;

      let nextPersistedQuiz = null;
      let deleted = false;

      setQuizSets((prev) => {
        const nextSets = (Array.isArray(prev) ? prev : [])
          .map((set) => {
            if (set.id !== setId) return set;

            const questions = normalizeQuizPayload(set?.questions || {});
            const sourceItems = Array.isArray(questions?.[normalizedSection])
              ? questions[normalizedSection]
              : [];
            if (normalizedIndex >= sourceItems.length) return set;

            deleted = true;
            return {
              ...set,
              questions: {
                ...questions,
                [normalizedSection]: sourceItems.filter((_, idx) => idx !== normalizedIndex),
              },
            };
          })
          .filter((set) => {
            const questions = normalizeQuizPayload(set?.questions || {});
            return (
              questions.multipleChoice.length > 0 ||
              questions.shortAnswer.length > 0 ||
              questions.ox.length > 0
            );
          });

        nextPersistedQuiz = nextSets.length > 0 ? normalizeQuizPayload(nextSets[0]?.questions || {}) : null;
        return nextSets;
      });

      if (!deleted) return;

      setStatus("퀴즈 문항을 삭제했습니다.");
      setError("");
      await persistArtifacts({ quiz: nextPersistedQuiz });
    },
    [persistArtifacts]
  );

  const regenerateQuiz = async () => {
    if (isLoadingQuiz) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (hasReached("maxQuiz")) {
      setError("무료 플랜에서는 파일당 퀴즈를 1회만 생성할 수 있습니다.");
      return;
    }
    const chapterSelectionRaw = String(quizChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
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

  const createBaseReviewNote = useCallback(
    ({
      sourceType,
      sourceLabel,
      prompt,
      explanation = "",
      evidencePages = [],
      evidenceSnippet = "",
      evidenceLabel = "",
    }) => {
      const promptText = String(prompt || "").trim();
      const questionKey = normalizeQuestionKey(promptText);
      const now = new Date().toISOString();
      return {
        id: `${sourceType}:${questionKey}`,
        sourceType,
        sourceLabel,
        questionKey,
        prompt: promptText,
        explanation: String(explanation || "").trim(),
        evidencePages: Array.isArray(evidencePages) ? evidencePages : [],
        evidenceSnippet: String(evidenceSnippet || "").trim(),
        evidenceLabel: String(evidenceLabel || "").trim(),
        wrongCount: 1,
        reviewCount: 0,
        resolved: false,
        createdAt: now,
        updatedAt: now,
        lastWrongAt: now,
        lastCorrectAt: null,
        hiddenAt: null,
      };
    },
    []
  );

  const upsertWrongReviewNote = useCallback(
    (note) => {
      if (!note?.questionKey || !note?.sourceType) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const existingIndex = list.findIndex(
          (item) => item?.sourceType === note.sourceType && item?.questionKey === note.questionKey
        );
        if (existingIndex < 0) {
          return [
            {
              ...note,
              createdAt: note.createdAt || now,
              updatedAt: now,
              lastWrongAt: now,
              lastCorrectAt: note.lastCorrectAt || null,
            },
            ...list,
          ];
        }

        const existing = list[existingIndex];
        const next = [...list];
        next[existingIndex] = {
          ...existing,
          ...note,
          id: existing.id || note.id,
          createdAt: existing.createdAt || note.createdAt || now,
          updatedAt: now,
          lastWrongAt: now,
          wrongCount: Math.max(1, Number(existing?.wrongCount || 0) + 1),
          reviewCount: Number(existing?.reviewCount || 0),
          resolved: false,
          hiddenAt: null,
        };
        return next;
      });
    },
    [persistReviewNotes]
  );

  const markReviewNoteCorrectByPrompt = useCallback(
    (sourceType, prompt, userAnswerText = "", userAnswerValue = "") => {
      const questionKey = normalizeQuestionKey(prompt);
      if (!questionKey) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item?.sourceType === sourceType && item?.questionKey === questionKey
            ? {
                ...item,
                userAnswerText: String(userAnswerText || "").trim() || item.userAnswerText,
                userAnswerValue:
                  userAnswerValue !== undefined && userAnswerValue !== null && userAnswerValue !== ""
                    ? userAnswerValue
                    : item.userAnswerValue,
                resolved: true,
                updatedAt: now,
                lastCorrectAt: now,
              }
            : item
        )
      );
    },
    [persistReviewNotes]
  );

  const handleReviewNoteAttempt = useCallback(
    (item, attempt) => {
      if (!item?.id || !attempt) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((note) => {
          if (note?.id !== item.id) return note;
          if (attempt.isCorrect) {
            return {
              ...note,
              userAnswerText: String(attempt.userAnswerText || "").trim() || note.userAnswerText,
              userAnswerValue:
                attempt.userAnswerValue !== undefined ? attempt.userAnswerValue : note.userAnswerValue,
              resolved: true,
              reviewCount: Number(note?.reviewCount || 0) + 1,
              updatedAt: now,
              lastCorrectAt: now,
            };
          }
          return {
            ...note,
            userAnswerText: String(attempt.userAnswerText || "").trim() || note.userAnswerText,
            userAnswerValue:
              attempt.userAnswerValue !== undefined ? attempt.userAnswerValue : note.userAnswerValue,
            resolved: false,
            wrongCount: Math.max(1, Number(note?.wrongCount || 0) + 1),
            reviewCount: Number(note?.reviewCount || 0) + 1,
            updatedAt: now,
            lastWrongAt: now,
          };
        })
      );
    },
    [persistReviewNotes]
  );

  const handleDeleteReviewNote = useCallback(
    (noteId) => {
      if (!noteId) return;
      const now = new Date().toISOString();
      persistReviewNotes((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          item?.id === noteId
            ? {
                ...item,
                hiddenAt: now,
                updatedAt: now,
              }
            : item
        )
      );
    },
    [persistReviewNotes]
  );

  const handleQuizOxSelect = useCallback(
    (setId, qIdx, choice) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const currentSelection = targetSet?.oxSelections?.[qIdx];
      if (currentSelection === "o" || currentSelection === "x") return;

      setQuizSets((prev) =>
        prev.map((set) =>
          set.id === setId
            ? {
                ...set,
                oxSelections: { ...set.oxSelections, [qIdx]: choice },
              }
            : set
        )
      );

      const items = Array.isArray(targetSet?.questions?.ox) ? targetSet.questions.ox : [];
      const item = items[qIdx];
      if (!item || (choice !== "o" && choice !== "x")) return;

      const expected = item.answer === true ? "o" : "x";
      const userAnswerText = choice === "o" ? "O" : "X";
      const prompt = String(item?.statement || item?.prompt || item?.question || "").trim();
      if (choice === expected) {
        markReviewNoteCorrectByPrompt("ox", prompt, userAnswerText, choice === "o");
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "ox",
          sourceLabel: "O/X",
          prompt,
          explanation: item?.explanation,
          evidencePages: item?.evidencePages,
          evidenceSnippet: item?.evidenceSnippet || item?.evidence,
          evidenceLabel: item?.evidenceLabel || "",
        }),
        correctAnswerText: item.answer ? "O" : "X",
        correctAnswerValue: Boolean(item.answer),
        userAnswerText,
        userAnswerValue: choice === "o",
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const handleToggleQuizOxExplanation = useCallback((setId, qIdx) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? {
              ...set,
              oxExplanationOpen: {
                ...set.oxExplanationOpen,
                [qIdx]: !set?.oxExplanationOpen?.[qIdx],
              },
            }
          : set
      )
    );
  }, []);

  const handleChoiceSelect = useCallback(
    (setId, qIdx, choiceIdx) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const multipleChoice = Array.isArray(targetSet?.questions?.multipleChoice)
        ? targetSet.questions.multipleChoice
        : [];
      const question = multipleChoice[qIdx];
      if (targetSet?.revealedChoices?.[qIdx]) return;

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

      if (!question) return;

      const choices = Array.isArray(question?.choices) ? question.choices : [];
      const prompt = String(question?.question || question?.prompt || "").trim();
      const selectedChoiceText = String(choices?.[choiceIdx] || "").trim();
      const answerIndex = Number.isFinite(question?.answerIndex) ? question.answerIndex : -1;
      const correctChoiceText = String(choices?.[answerIndex] || "").trim();
      if (choiceIdx === answerIndex) {
        markReviewNoteCorrectByPrompt("quiz_multiple_choice", prompt, selectedChoiceText, choiceIdx);
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "quiz_multiple_choice",
          sourceLabel: "객관식",
          prompt,
          explanation: question?.explanation,
          evidencePages: question?.evidencePages,
          evidenceSnippet: question?.evidenceSnippet,
          evidenceLabel: question?.evidenceLabel,
        }),
        choices,
        answerIndex,
        correctAnswerText: correctChoiceText,
        correctAnswerValue: answerIndex,
        userAnswerText: selectedChoiceText,
        userAnswerValue: choiceIdx,
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const handleShortAnswerChange = useCallback((setId, idx, value) => {
    setQuizSets((prev) =>
      prev.map((set) =>
        set.id === setId
          ? { ...set, shortAnswerInput: { ...set.shortAnswerInput, [idx]: value } }
          : set
      )
    );
  }, []);

  const handleShortAnswerCheck = useCallback(
    (setId, idx) => {
      const targetSet = quizSets.find((set) => set.id === setId);
      const shortAnswers = Array.isArray(targetSet?.questions?.shortAnswer)
        ? targetSet.questions.shortAnswer
        : [];
      const target = shortAnswers[idx];
      if (!target?.answer) return;

      const userRaw = String(targetSet?.shortAnswerInput?.[idx] || "").trim();
      const normalizedUser = userRaw.toLowerCase().replace(/\s+/g, "").replace(/[()（）[\]{}]/g, "");
      const existingResult = targetSet?.shortAnswerResult?.[idx];
      if (existingResult?.submittedValue === normalizedUser) return;

      // 정답 필드에 "A / B" 또는 "A, B" 형태로 복수 정답이 올 수 있음
      const answerCandidates = String(target.answer || "")
        .split(/[/,]/)
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, "").replace(/[()（）[\]{}]/g, ""))
        .filter(Boolean);
      const isCorrect = answerCandidates.some((a) => a === normalizedUser);

      setQuizSets((prev) =>
        prev.map((set) => {
          const shortAnswerList = Array.isArray(set.questions?.shortAnswer) ? set.questions.shortAnswer : [];
          const shortTarget = shortAnswerList[idx];
          if (set.id !== setId || !shortTarget?.answer) return set;
          return {
            ...set,
            shortAnswerResult: {
              ...set.shortAnswerResult,
              [idx]: { isCorrect, answer: shortTarget.answer, submittedValue: normalizedUser },
            },
          };
        })
      );

      const prompt = String(target?.question || target?.prompt || "").trim();
      const userAnswerText = String(targetSet?.shortAnswerInput?.[idx] || "").trim();
      if (isCorrect) {
        markReviewNoteCorrectByPrompt("quiz_short_answer", prompt, userAnswerText, userAnswerText);
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "quiz_short_answer",
          sourceLabel: "주관식",
          prompt,
          explanation: target?.explanation,
          evidencePages: target?.evidencePages,
          evidenceSnippet: target?.evidenceSnippet,
          evidenceLabel: target?.evidenceLabel,
        }),
        correctAnswerText: String(target?.answer || "").trim(),
        correctAnswerValue: String(target?.answer || "").trim(),
        userAnswerText,
        userAnswerValue: userAnswerText,
      });
    },
    [createBaseReviewNote, markReviewNoteCorrectByPrompt, quizSets, upsertWrongReviewNote]
  );

  const resolveChapterRangeLimit = useCallback(
    (rawInput) => {
      const pageLimit = Number(pageInfo.total || pageInfo.used || 0);
      if (isPdfDocumentKind(detectSupportedDocumentKind(file))) {
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
    [file, pageInfo.total, pageInfo.used]
  );

  const effectiveChapterRangeInput = useMemo(() => {
    const manualInput = String(chapterRangeInput || "").trim();
    if (manualInput) return manualInput;

    const autoInput = String(autoChapterRangeInput || "").trim();
    if (autoInput) return autoInput;
    return "";
  }, [
    autoChapterRangeInput,
    chapterRangeInput,
  ]);

  const configuredReviewSections = useMemo(() => {
    const raw = String(effectiveChapterRangeInput || "").trim();
    if (!raw) return [];
    const limit = resolveChapterRangeLimit(raw);
    if (!limit) return [];
    const parsed = parseChapterRangeSelectionInput(raw, limit);
    if (parsed.error) return [];
    const isAutoGenerated = !String(chapterRangeInput || "").trim();
    return (Array.isArray(parsed.chapters) ? parsed.chapters : [])
      .map((chapter, index) => {
        const chapterNumber = Number.parseInt(chapter?.chapterNumber, 10);
        const pageStart = Number.parseInt(chapter?.pageStart, 10);
        const pageEnd = Number.parseInt(chapter?.pageEnd, 10);
        if (!Number.isFinite(pageStart) || !Number.isFinite(pageEnd) || pageStart <= 0 || pageEnd < pageStart) {
          return null;
        }
        const normalizedChapterNumber =
          Number.isFinite(chapterNumber) && chapterNumber > 0 ? chapterNumber : index + 1;
        return {
          id: String(chapter?.id || `review-section-${normalizedChapterNumber}`),
          chapterNumber: normalizedChapterNumber,
          pageStart,
          pageEnd,
          label: `${isAutoGenerated ? "자동 섹션" : "섹션"} ${normalizedChapterNumber}`,
          detailLabel: `${isAutoGenerated ? "자동 섹션" : "섹션"} ${normalizedChapterNumber} · ${pageStart}-${pageEnd}p`,
        };
      })
      .filter(Boolean);
  }, [chapterRangeInput, effectiveChapterRangeInput, resolveChapterRangeLimit]);

  const reviewNotesWithSections = useMemo(() => {
    const notes = Array.isArray(reviewNotes) ? reviewNotes : [];
    return notes.map((item) => {
      const evidencePages = Array.isArray(item?.evidencePages) ? item.evidencePages : [];
      const matchedSections = configuredReviewSections.filter((section) =>
        evidencePages.some((pageNumber) => pageNumber >= section.pageStart && pageNumber <= section.pageEnd)
      );
      return {
        ...item,
        sectionNumbers: matchedSections.map((section) => section.chapterNumber),
        sectionLabels: matchedSections.map((section) => section.detailLabel),
      };
    });
  }, [configuredReviewSections, reviewNotes]);

  const selectReviewNotesBySection = useCallback(
    (items, chapterSelectionInput = "") => {
      const list = (Array.isArray(items) ? items : []).filter((item) => !item?.hiddenAt);
      const cleaned = String(chapterSelectionInput || "").trim();
      if (!cleaned) {
        return {
          items: list,
          error: "",
          selectedSectionNumbers: [],
        };
      }
      if (!configuredReviewSections.length) {
        return {
          items: list,
          error: "문서 범위를 아직 준비하지 못했습니다. 잠시 후 다시 시도해주세요.",
          selectedSectionNumbers: [],
        };
      }

      const selected = parseChapterNumberSelectionInput(cleaned, configuredReviewSections);
      if (selected.error) {
        return {
          items: list,
          error: "섹션 범위를 다시 확인해주세요. (예: 1-3,5)",
          selectedSectionNumbers: [],
        };
      }

      const selectedNumberSet = new Set(selected.chapterNumbers);
      return {
        items: list.filter(
          (item) =>
            Array.isArray(item?.sectionNumbers) &&
            item.sectionNumbers.some((chapterNumber) => selectedNumberSet.has(chapterNumber))
        ),
        error: "",
        selectedSectionNumbers: selected.chapterNumbers,
      };
    },
    [configuredReviewSections]
  );

  const reviewNotesPanelState = useMemo(() => {
    const filtered = selectReviewNotesBySection(reviewNotesWithSections, reviewNotesChapterSelectionInput);
    return {
      ...filtered,
      items: sortReviewNotesByRecentWrong(filtered.items),
    };
  }, [reviewNotesChapterSelectionInput, reviewNotesWithSections, selectReviewNotesBySection]);

  const examCramQuizItems = useMemo(() => collectExamCramQuizItems(quizSets), [quizSets]);

  const examCramState = useMemo(() => {
    const filtered = selectReviewNotesBySection(reviewNotesWithSections, reviewNotesChapterSelectionInput);
    const pendingNotes = sortReviewNotesByRecentWrong(filtered.items.filter((item) => !item?.resolved));
    return {
      ...filtered,
      items: pendingNotes.slice(0, EXAM_CRAM_PREVIEW_LIMIT),
      pendingCount: pendingNotes.length,
      referenceCounts: {
        summary: String(summary || partialSummary || "").trim() ? 1 : 0,
        quiz: examCramQuizItems.length,
        ox: Array.isArray(oxItems) ? oxItems.length : 0,
        reviewNotes: pendingNotes.length,
      },
      hasAnySource:
        Boolean(String(summary || partialSummary || "").trim()) ||
        examCramQuizItems.length > 0 ||
        (Array.isArray(oxItems) ? oxItems.length : 0) > 0 ||
        pendingNotes.length > 0,
    };
  }, [
    examCramQuizItems,
    oxItems,
    partialSummary,
    reviewNotesChapterSelectionInput,
    reviewNotesWithSections,
    selectReviewNotesBySection,
    summary,
  ]);

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

  const extractTextForChapterSelection = useCallback(
    async ({ featureLabel, chapterSelectionInput }) => {
      if (!file) {
        throw new Error("먼저 PDF를 열어주세요.");
      }
      if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
        throw new Error("챕터/페이지 범위 기능은 PDF에서만 지원됩니다.");
      }

      let chapterConfigRaw = String(effectiveChapterRangeInput || "").trim();
      if (!chapterConfigRaw) {
        const totalPages = pageInfo.total || pageInfo.used || 0;
        let autoChapterInput = "";
        try {
          setStatus(`${featureLabel}: 챕터 범위를 자동 탐색 중...`);
          const detected = await extractChapterRangesFromToc(file, {
            maxScanPages: totalPages ? Math.min(totalPages, 30) : 24,
          });
          const chapters = Array.isArray(detected?.chapters) ? detected.chapters : [];
          autoChapterInput = buildChapterRangeInputFromChapters(chapters);

          if (autoChapterInput) {
            const limit = totalPages || Number(detected?.totalPages) || 0;
            const parsedAuto = parseChapterRangeSelectionInput(autoChapterInput, limit);
            if (!parsedAuto.error && parsedAuto.chapters.length > 0) {
              setAutoChapterRangeInput(autoChapterInput);
              setChapterRangeError("");
              setChapterRangeNotice(buildDetectedChapterRangeNotice(detected));
              const sorted = [...parsedAuto.chapters].sort(
                (left, right) => (Number(left?.pageStart) || 0) - (Number(right?.pageStart) || 0)
              );
              const chapterOne =
                sorted.find((chapter) => Number.parseInt(chapter?.chapterNumber, 10) === 1) || sorted[0];
              const start = Number.parseInt(chapterOne?.pageStart, 10);
              if (Number.isFinite(start) && start > 0) {
                const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
                chapterOneStartPageCacheRef.current.set(docKey, Math.min(limit, Math.max(1, start)));
              }
            } else {
              autoChapterInput = "";
            }
          }
        } catch {
          autoChapterInput = "";
        }

        if (!autoChapterInput) {
          const docKey = String(selectedFileId || file?.name || "").trim() || "__active__";
          const cachedStartPage = Number(chapterOneStartPageCacheRef.current.get(docKey));
          autoChapterInput = buildAutomaticChapterRangeInput(totalPages, cachedStartPage);
          if (autoChapterInput) {
            setAutoChapterRangeInput(autoChapterInput);
            setChapterRangeError("");
            setChapterRangeNotice(AUTO_CHAPTER_FALLBACK_NOTICE);
          }
        }
        chapterConfigRaw = autoChapterInput;
      }

      if (!chapterConfigRaw) {
        throw new Error("문서 범위를 자동으로 준비하지 못했습니다.");
      }

      const totalPages = pageInfo.total || pageInfo.used || 0;
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
      const chapterExtraction = await extractPdfTextByRanges(file, targetChapters, {
        maxLengthPerRange: 14000,
        useOcr: true,
        ocrLang: "kor+eng",
        onOcrProgress: (message) => setStatus(message),
      });
      const scopedText = (chapterExtraction?.chapters || [])
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
      buildAutomaticChapterRangeInput,
      buildChapterRangeInputFromChapters,
      effectiveChapterRangeInput,
      file,
      pageInfo.total,
      pageInfo.used,
      selectedFileId,
    ]
  );
  useEffect(() => {
    extractTextForChapterSelectionRef.current = extractTextForChapterSelection;
  }, [extractTextForChapterSelection]);

  const requestTopicStructure = async ({ force = false } = {}) => {
    if (isLoadingTopicStructure || (!force && topicStructureRequestedRef.current)) return;
    if (!file) {
      setTopicStructureError("먼저 PDF를 열어주세요.");
      return;
    }
    const textToAnalyze = String(extractedText || "").trim();
    if (!textToAnalyze) {
      setTopicStructureError("텍스트 추출을 기다리는 중입니다.");
      return;
    }

    topicStructureRequestedRef.current = true;
    setIsLoadingTopicStructure(true);
    setTopicStructureError("");

    try {
      const { generateTopicStructure } = await getOpenAiService();
      const result = await generateTopicStructure(textToAnalyze);
      setTopicStructure(result);
      const nextHighlights = writeTopicStructureToHighlights(artifacts?.highlights, result);
      await persistArtifacts({ highlights: nextHighlights });
    } catch (err) {
      setTopicStructureError(`학습 구조 분석에 실패했습니다: ${err.message}`);
      topicStructureRequestedRef.current = false;
    } finally {
      setIsLoadingTopicStructure(false);
    }
  };

  const explainConceptForPanel = async (concept, topicTitle) => {
    const textToAnalyze = String(extractedText || "").trim();
    const { explainConcept } = await getOpenAiService();
    return explainConcept(concept, topicTitle, textToAnalyze);
  };

  // ─── 폴더 통합 퀴즈 ──────────────────────────────────────────────────────────
  const requestFolderQuiz = async (folderId) => {
    if (!folderId || isLoadingFolderQuiz) return;
    setIsLoadingFolderQuiz(true);
    setFolderQuizError("");
    setFolderQuizQuestions(null);
    setFolderSelectedChoices({});
    setFolderRevealedChoices({});
    setFolderShortAnswerInput({});
    setFolderShortAnswerResult({});
    try {
      const context = await buildFolderTutorContext(folderId);
      if (!context) throw new Error("폴더에 분석 가능한 파일이 없습니다.");
      const { generateQuiz } = await getOpenAiService();
      const rawResult = await generateQuiz(context, {
        multipleChoiceCount: 5,
        shortAnswerCount: 2,
        scopeLabel: "폴더 통합",
      });
      const quiz = normalizeQuizPayload(rawResult);
      setFolderQuizQuestions({
        multipleChoice: Array.isArray(quiz.multipleChoice) ? quiz.multipleChoice : [],
        shortAnswer: Array.isArray(quiz.shortAnswer) ? quiz.shortAnswer : [],
      });
    } catch (err) {
      setFolderQuizError(`통합 퀴즈 생성에 실패했습니다: ${err.message}`);
    } finally {
      setIsLoadingFolderQuiz(false);
    }
  };

  const handleFolderStudy = useCallback(
    (folderId) => {
      if (!folderId || folderId === "all") return;
      const folderDocId = buildFolderAggregateDocId(folderId);
      window.history.pushState({ view: "detail", fileId: folderDocId }, "", window.location.pathname);
      setSelectedFileId(folderDocId);
      setFile(null);
      setPdfUrl(null);
      resetQuizState();
      requestFolderQuiz(folderId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildFolderTutorContext, getOpenAiService]
  );

  const handleFolderSelectChoice = (questionIdx, choiceIdx) => {
    setFolderRevealedChoices((prev) => ({ ...prev, [questionIdx]: true }));
    setFolderSelectedChoices((prev) => ({ ...prev, [questionIdx]: choiceIdx }));
  };

  const handleFolderShortAnswerChange = (idx, value) => {
    setFolderShortAnswerInput((prev) => ({ ...prev, [idx]: value }));
  };

  const handleFolderShortAnswerCheck = (question, idx) => {
    const userInput = String(folderShortAnswerInput[idx] || "").trim().toLowerCase().replace(/\s+/g, "");
    const correct = String(question.correctAnswer || question.answer || "").trim().toLowerCase().replace(/\s+/g, "");
    setFolderShortAnswerResult((prev) => ({
      ...prev,
      [idx]: { isCorrect: userInput === correct, correctAnswer: question.correctAnswer || question.answer },
    }));
  };

  const requestSummary = async ({ force = false, replaceExisting = true } = {}) => {
    const hasExistingSummary = Boolean(String(summary || "").trim());
    const shouldReplaceExisting = replaceExisting && hasExistingSummary;
    if (isLoadingSummary || (!force && summaryRequestedRef.current && !shouldReplaceExisting)) return;
    const instructorEmphasisText = getEffectiveInstructorEmphasisText();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (hasReached("maxSummary")) {
      setError("무료 플랜에서는 파일당 요약을 1회만 생성할 수 있습니다.");
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
        if (!isPdfSource) {
          throw new Error("챕터 범위 요약은 PDF에서만 지원됩니다. 챕터 범위를 비우고 다시 시도해주세요.");
        }
        const totalPages = pageInfo.total || pageInfo.used || 0;
        const parsedChapters = parseChapterRangeSelectionInput(chapterConfigRaw, totalPages);
        if (parsedChapters.error) {
          setChapterRangeError(parsedChapters.error);
          throw new Error(parsedChapters.error);
        }
        const adaptiveChapterRanges = buildAdaptiveChapterSummaryRanges(parsedChapters.chapters);
        if (!adaptiveChapterRanges.length) {
          throw new Error("적응형 분할에 사용할 수 있는 챕터 범위가 없습니다.");
        }
        const pagesPerChunkById = new Map(
          adaptiveChapterRanges.map((range) => [String(range.id), Number(range.pagesPerChunk) || 1])
        );
        setStatus("설정한 챕터 범위의 텍스트를 추출하는 중...");
        const chapterExtraction = await extractPdfTextByRanges(file, adaptiveChapterRanges, {
          maxLengthPerRange: 14000,
          useOcr: true,
          ocrLang: "kor+eng",
          ocrScale: 1.35,
          ocrMaxPixels: 1000000,
          ocrPageOrder: "spread",
          maxOcrPagesPerRange: 4,
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
          throw new Error("설정한 챕터 범위에서 텍스트를 추출하지 못했습니다.");
        }
      }

      let summarySourceText = String(extractedText || previewText || "").trim();
      let summaryRecoveryMeta = {
        attemptedOcr: false,
        lastOcrError: null,
      };
      if (!customChapterSections) {
        summaryRecoveryMeta = await recoverSummarySourceText(summarySourceText);
        summarySourceText = String(summaryRecoveryMeta?.text || "").trim();
      }

      if (!customChapterSections && !summarySourceText) {
        if (isPdfSource) {
          if (summaryRecoveryMeta?.lastOcrError?.message) {
            throw new Error(`OCR 중 오류가 발생했습니다: ${summaryRecoveryMeta.lastOcrError.message}`);
          }
          if (summaryRecoveryMeta?.attemptedOcr) {
            throw new Error(
              "문서에서 요약할 텍스트를 찾지 못했습니다. OCR도 비어 있습니다. 문서를 다시 열거나 더 선명한 PDF로 시도해주세요."
            );
          }
          throw new Error("문서에서 요약할 텍스트를 찾지 못했습니다.");
        }
        throw new Error("문서에서 요약할 텍스트를 찾지 못했습니다.");
      }

      setStatus("AI로 요약을 생성하는 중...");
      const { generateSummary, generateQuestionStyleProfile } = await getOpenAiService();
      const questionStyleScopeLabel = customChapterSections ? "사용자 지정 챕터 범위" : "문서 전체";
      const questionStyleSourceText = customChapterSections
        ? customChapterSections
            .map((chapter) => {
              const title = String(chapter?.chapterTitle || chapter?.id || "").trim();
              const text = String(chapter?.text || "").trim();
              return [title ? `[${title}]` : "", text].filter(Boolean).join("\n");
            })
            .filter(Boolean)
            .join("\n\n")
        : summarySourceText;

      // Build page-tagged text for PDF sources so AI can emit inline [p.N] citations
      let pageTaggedText = null;
      if (isPdfSource && file && !customChapterSections) {
        try {
          const totalPages = pageInfo.total || pageInfo.used || 0;
          if (totalPages > 0) {
            const allPageNumbers = Array.from({ length: Math.min(totalPages, 80) }, (_, i) => i + 1);
            const pageResult = await extractPdfPageTexts(file, allPageNumbers, { maxCharsPerPage: 2500 });
            const pageEntries = Array.isArray(pageResult?.pages) ? pageResult.pages : [];
            const tagged = pageEntries
              .filter((p) => String(p?.text || "").trim())
              .map((p) => `[p.${p.pageNumber}]\n${String(p.text).trim()}`)
              .join("\n\n");
            if (tagged) pageTaggedText = tagged.slice(0, 50000);
          }
        } catch {
          // non-critical — summary still works without page tags
        }
      }

      const summaryPromise = customChapterSections
        ? generateSummary(questionStyleSourceText, {
            scope: "사용자 지정 챕터 범위",
            chapterized: true,
            chapterSections: customChapterSections,
            instructorEmphasis: instructorEmphasisText,
            outputLanguage,
          })
        : generateSummary(summarySourceText, {
            instructorEmphasis: instructorEmphasisText,
            outputLanguage,
            pageTaggedText,
          });
      const questionStyleProfilePromise = generateQuestionStyleProfile(questionStyleSourceText, {
        scopeLabel: questionStyleScopeLabel,
      });
      const [summaryResult, questionStyleProfileResult] = await Promise.allSettled([
        summaryPromise,
        questionStyleProfilePromise,
      ]);

      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason;
      }

      const summarized = summaryResult.value;
      const nextQuestionStyleProfile =
        questionStyleProfileResult.status === "fulfilled"
          ? String(questionStyleProfileResult.value || "").trim()
          : "";
      const nextHighlights = writeQuestionStyleProfileToHighlights(artifacts?.highlights, {
        content: nextQuestionStyleProfile,
        scopeLabel: questionStyleScopeLabel,
        updatedAt: new Date().toISOString(),
      });
      const nextUsageCounts = bumpUsageCountForActiveDoc("summary");
      const nextHighlightsWithUsage = writeFreeUsageCountsToHighlights(nextHighlights, nextUsageCounts);
      setSummary(summarized);
      setQuestionStyleProfileContent(nextQuestionStyleProfile);
      setQuestionStyleProfileScopeLabel(nextQuestionStyleProfile ? questionStyleScopeLabel : "");
      setStatus("요약이 생성되었습니다.");
      persistArtifacts({ summary: summarized, highlights: nextHighlightsWithUsage });
      // 핵심 개념 자동 태그 추출 (백그라운드)
      void (async () => {
        try {
          const { generateConceptTags } = await getOpenAiService();
          const sourceForTags = summarySourceText || summarized || "";
          if (sourceForTags.length < 50) return;
          const tags = await generateConceptTags(sourceForTags, { outputLanguage });
          if (tags?.length) {
            const currentHighlights = nextHighlightsWithUsage;
            const tagsHighlights = writeConceptTagsToHighlights(currentHighlights, tags);
            persistArtifacts({ highlights: tagsHighlights });
            // allArtifacts 업데이트
            setAllArtifacts((prev) => {
              const idx = prev.findIndex((a) => String(a.doc_id) === String(selectedFileId));
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], highlights_json: tagsHighlights };
                return next;
              }
              return prev;
            });
          }
        } catch {
          // 태그 추출 실패는 무시
        }
      })();
    } catch (err) {
      setError(`요약 생성에 실패했습니다: ${err.message}`);
      setStatus("");
      summaryRequestedRef.current = false;
      setStatus("");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const { mindmapData, isLoadingMindmap, requestMindMap } = useMindmap({
    summary,
    userId: user?.id,
    docId: selectedFileId,
    outputLanguage,
    getOpenAiService,
  });

  const handleAutoDetectChapterRanges = useCallback(async () => {
    if (isDetectingChapterRanges || isLoadingSummary || isLoadingText) return;
    if (!file) {
      setChapterRangeError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setChapterRangeError("목차 자동 감지는 PDF에서만 지원됩니다.");
      return;
    }

    setIsDetectingChapterRanges(true);
    setChapterRangeError("");
    setChapterRangeNotice("");
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
      setChapterRangeNotice(buildDetectedChapterRangeNotice(detected));
      const sourceLabel = getChapterRangeSourceLabel(detected?.source);
      setStatus(`${sourceLabel}에서 챕터 범위 ${parsed.chapters.length}개를 자동 설정했습니다.`);
      setIsChapterRangeOpen(true);
    } catch (err) {
      setChapterRangeError(err?.message || "목차 자동 추출에 실패했습니다.");
      setChapterRangeNotice("");
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
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
      setChapterRangeError("챕터 범위 설정은 PDF에서만 지원됩니다.");
      return;
    }
    const raw = String(chapterRangeInput || autoChapterRangeInput || "").trim();
    if (!raw) {
      setChapterRangeError("먼저 챕터 범위를 입력해주세요.");
      return;
    }
    const totalPages = pageInfo.total || pageInfo.used || 0;
    const parsed = parseChapterRangeSelectionInput(raw, totalPages);
    if (parsed.error) {
      setChapterRangeError(parsed.error);
      return;
    }
    const targetDocId = selectedFileId || file?.name || "";
    if (!targetDocId) {
      setChapterRangeError("먼저 PDF를 열어주세요.");
      return;
    }
    if (!String(chapterRangeInput || "").trim()) {
      setChapterRangeInput(raw);
    }
    persistChapterRangeInput(targetDocId, raw);
    setChapterRangeError("");
    setStatus(`챕터 범위를 저장했습니다. (${parsed.chapters.length} sections)`);
    setIsChapterRangeOpen(false);
  }, [
    autoChapterRangeInput,
    chapterRangeInput,
    file,
    pageInfo.total,
    pageInfo.used,
    persistChapterRangeInput,
    selectedFileId,
  ]);

  const handleSummaryByPages = useCallback(async () => {
    if (isPageSummaryLoading || isLoadingSummary) return;
    if (!isPdfDocumentKind(detectSupportedDocumentKind(file))) {
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
        instructorEmphasis: getEffectiveInstructorEmphasisText(),
        outputLanguage,
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
    isLoadingSummary,
    isPageSummaryLoading,
    pageInfo.total,
    pageInfo.used,
    pageSummaryInput,
    getEffectiveInstructorEmphasisText,
    outputLanguage,
    persistPartialSummaryBundle,
    savedPartialSummaries,
    selectedFileId,
  ]);

  const handleSaveCurrentPartialSummary = useCallback(() => {
    const docId = selectedFileId;
    const summaryText = String(partialSummary || "").trim();
    if (!docId) {
      setError("먼저 PDF를 선택해주세요.");
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
        setError("저장된 요약본을 찾을 수 없습니다.");
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
      setStatus("저장된 요약본을 삭제했습니다.");
    },
    [partialSummary, partialSummaryRange, persistPartialSummaryBundle, savedPartialSummaries]
  );

  const handleExportSummaryPdf = useCallback(async () => {
    if (isExportingSummary) return;
    if (!summary) {
      setError("먼저 요약을 생성해주세요.");
      return;
    }
    if (!summaryRef.current) {
      setError("뷰어 영역을 찾을 수 없어 PDF로 내보낼 수 없습니다.");
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

  const handleOxSelect = useCallback(
    (qIdx, choice) => {
      const currentSelection = oxSelections?.[qIdx];
      if (currentSelection === "o" || currentSelection === "x") return;

      setOxSelections((prev) => ({
        ...prev,
        [qIdx]: choice,
      }));

      const item = Array.isArray(oxItems) ? oxItems[qIdx] : null;
      if (!item || (choice !== "o" && choice !== "x")) return;

      const expected = item.answer === true ? "o" : "x";
      const userAnswerText = choice === "o" ? "O" : "X";
      const prompt = String(item?.statement || item?.prompt || item?.question || "").trim();
      if (choice === expected) {
        markReviewNoteCorrectByPrompt("ox", prompt, userAnswerText, choice === "o");
        return;
      }

      upsertWrongReviewNote({
        ...createBaseReviewNote({
          sourceType: "ox",
          sourceLabel: "O/X",
          prompt,
          explanation: item?.explanation,
          evidencePages: item?.evidencePages,
          evidenceSnippet: item?.evidenceSnippet || item?.evidence,
          evidenceLabel: item?.evidenceLabel || "",
        }),
        correctAnswerText: item.answer ? "O" : "X",
        correctAnswerValue: Boolean(item.answer),
        userAnswerText,
        userAnswerValue: choice === "o",
      });
    },
    [
      createBaseReviewNote,
      markReviewNoteCorrectByPrompt,
      oxItems,
      oxSelections,
      upsertWrongReviewNote,
    ]
  );

  const requestOxQuiz = async ({ auto = false, force = false } = {}) => {
    if (isLoadingOx && !force) return;
    if (!file) {
      setError("먼저 PDF를 열어주세요.");
      return;
    }
    if (hasReached("maxOx")) {
      setError("무료 플랜에서는 파일당 O/X를 1회만 생성할 수 있습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || quizChapterSelectionInput || "").trim();
    const isPdfSource = isPdfDocumentKind(detectSupportedDocumentKind(file));
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
        throw new Error("문서에서 O/X 문제에 사용할 본문 텍스트를 찾지 못했습니다.");
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
        scopeLabel,
        outputLanguage,
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
      const nextUsageCounts = bumpUsageCountForActiveDoc("ox");
      const nextHighlights = writeFreeUsageCountsToHighlights(artifacts?.highlights, nextUsageCounts);
      setStatus(scopeLabel ? `O/X 문제가 생성되었습니다. (${scopeLabel})` : "O/X 문제가 생성되었습니다.");
      persistArtifacts({ ox, highlights: nextHighlights });
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
      setError("무료 플랜에서는 파일당 O/X를 1회만 생성할 수 있습니다.");
      return;
    }
    const chapterSelectionRaw = String(oxChapterSelectionInput || quizChapterSelectionInput || "").trim();
    if (!extractedText && !chapterSelectionRaw && !isPdfDocumentKind(detectSupportedDocumentKind(file))) {
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

  const {
    handleAddFlashcard,
    handleDeleteFlashcard,
    handleUpdateFlashcard,
    handleDeduplicateFlashcards,
    handleDeleteAllFlashcards,
    handleSaveFlashcardScore,
    handleSaveVocabQuizScore,
    handleUpdateFlashcardSrs,
    handleGenerateFlashcards,
    handleGenerateVocabularyFlashcards,
    handleReextractVocabulary,
    handleRegenerateFlashcards,
  } = useFlashcardActions({
    user,
    selectedFileId,
    extractedText,
    file,
    isLoadingText,
    hasReached,
    flashcardChapterSelectionInput,
    flashcardGenerateCount,
    outputLanguage,
    topicStructure,
    activeUploadItem,
    artifacts,
    bumpUsageCountForActiveDoc,
    persistArtifacts,
    resolveQuestionSourceText,
    getOpenAiService,
  });

  const {
    handleResetTutor,
    handleSendTutorMessage,
  } = useTutorActions({
    user,
    selectedFileId,
    extractedText,
    file,
    isLoadingText,
    outputLanguage,
    currentPage,
    pageInfo,
    previewText,
    selectedFolderId,
    folderTutorMode,
    tutorCopy,
    tutorRequestInFlightRef,
    tutorPageTextCacheRef,
    tutorSectionRangeCacheRef,
    summaryContextCacheRef,
    questionSourceTextCacheRef,
    persistTutorHistory,
    buildFolderTutorContext,
    recoverQuestionSourceText,
    getOpenAiService,
  });

  const {
    handleCreateMockExam,
    handleGenerateExamCram,
    handleCreateReviewNotesMockExam,
    handleDeleteMockExam,
    handleExportMockExam,
  } = useMockExamActions({
    user,
    selectedFileId,
    extractedText,
    file,
    isLoadingText,
    outputLanguage,
    oxItems,
    quizSets,
    mockExamChapterSelectionInput,
    mockExamPromptAddonInput,
    reviewNotesWithSections,
    examCramQuizItems,
    partialSummary,
    summary,
    questionStyleProfileContent,
    mockExamPrintRef,
    getOpenAiService,
    getEffectiveInstructorEmphasisText,
    resolveQuestionSourceText,
    selectReviewNotesBySection,
    persistExamCramBundle,
  });

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
        const feedbackUserName =
          String(
            user?.user_metadata?.name ||
              user?.user_metadata?.full_name ||
              user?.user_metadata?.nickname ||
              user?.email ||
              ""
          ).trim() || "";
        const feedbackPayload = {
          userId: user.id,
          userEmail: user?.email || "",
          userName: feedbackUserName,
          category: feedbackCategory,
          content: trimmedFeedback,
          docId: selectedFileId || null,
          docName: file?.name || "",
          panel: panelTab || "",
          metadata: {
            currentPage,
            totalPages: pageInfo?.total || pageInfo?.used || null,
            tier,
            platform: Capacitor.getPlatform(),
          },
        };
        let savedFeedback = null;
        let saveError = null;
        let notifyError = null;

        try {
          savedFeedback = await saveUserFeedback({
            ...feedbackPayload,
          });
        } catch (error) {
          saveError = error;
          console.warn("Feedback DB save failed.", error);
        }

        try {
          await notifyFeedbackEmail({
            ...feedbackPayload,
            feedbackId: savedFeedback?.id || null,
          });
        } catch (error) {
          notifyError = error;
          console.warn("Feedback email notification failed.", error);
        }

        const saveSucceeded = Boolean(savedFeedback);
        const notifySucceeded = !notifyError;

        if (!saveSucceeded && !notifySucceeded) {
          if (isMissingFeedbackTableError(saveError)) {
            throw new Error(
              `피드백 저장 테이블이 준비되지 않았고 메일 발송도 실패했습니다. ${notifyError?.message || ""}`.trim()
            );
          }
          throw new Error(saveError?.message || notifyError?.message || "알 수 없는 오류가 발생했습니다.");
        }

        setIsFeedbackDialogOpen(false);
        setFeedbackCategory("general");
        setFeedbackInput("");
        if (saveSucceeded && notifySucceeded) {
          setStatus("\uD53C\uB4DC\uBC31\uC774 \uC804\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAC10\uC0AC\uD569\uB2C8\uB2E4.");
        } else if (notifySucceeded) {
          setStatus(
            "\uD53C\uB4DC\uBC31 \uBA54\uC77C\uC740 \uC804\uC1A1\uB418\uC5C8\uC9C0\uB9CC \uC571 \uC800\uC7A5\uC740 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
          );
        } else {
          setStatus(
            "\uD53C\uB4DC\uBC31\uC740 \uC800\uC7A5\uB418\uC5C8\uC9C0\uB9CC \uBA54\uC77C \uC54C\uB9BC \uC804\uC1A1\uC740 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
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
      user?.email,
      user?.id,
      user?.user_metadata,
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
    isFolderLoading,
    onRenameFolder: handleRenameFolder,
    onDeleteFolder: handleDeleteFolder,
    selectedUploadIds,
    onToggleUploadSelect: handleToggleUploadSelect,
    onMoveUploads: handleMoveUploadsToFolder,
    onClearSelection: handleClearSelection,
    isFolderFeatureEnabled,
    onDeleteUpload: handleDeleteUpload,
    onToggleVocabulary: handleToggleVocabulary,
    isGuest: AUTH_ENABLED && !user,
    showIntro: !AUTH_ENABLED && !user && showGuestIntro,
    skipPromoSplash,
    onIntroDone: () => setShowGuestIntro(false),
    onRequireAuth: openAuth,
    currentTier: tier,
    maxPdfSizeBytes: limits.maxPdfSizeBytes,
    outputLanguage,
    setOutputLanguage,
    // Ponder-style features
    onSemanticSearch: handleSemanticSearch,
    semanticSearchResults,
    isSemanticSearching,
    onCompare: handleCompareDocuments,
    compareResult,
    isComparing,
    compareError,
    allArtifacts,
    sidebarOpen,
    onFolderStudy: handleFolderStudy,
  };
  const detailPageProps = {
    // Layout / navigation
    detailContainerRef,
    splitStyle,
    documentUrl: activeDocumentUrl,
    pendingDocumentOpen,
    handlePageChange,
    handleDragStart,
    outputLanguage,
    // Summary callbacks
    requestSummary,
    requestMindMap,
    mindmapData,
    isLoadingMindmap,
    onJumpToSummaryPage: handlePageChange,
    diagnosticResult,
    onRetakeDiagnostic: handleRetakeDiagnostic,
    isFreeTier,
    hasReachedSummaryLimit: hasReached("maxSummary"),
    hasReachedQuizLimit: hasReached("maxQuiz"),
    hasReachedOxLimit: hasReached("maxOx"),
    hasReachedFlashcardLimit: hasReached("maxFlashcards"),
    handleSaveInstructorEmphasis,
    handleSelectInstructorEmphasis,
    handleDeleteInstructorEmphasis,
    cycleActiveInstructorEmphasis,
    handleSaveCurrentPartialSummary,
    handleLoadSavedPartialSummary,
    handleDeleteSavedPartialSummary,
    handleSummaryByPages,
    handleAutoDetectChapterRanges,
    handleConfirmChapterRanges,
    handleExportSummaryPdf,
    summaryRef,
    // MockExam callbacks
    mockExamMenuRef,
    mockExamMenuButtonRef,
    activeMockExam,
    activeMockExamTitle,
    formatMockExamTitle: getMockExamTitle,
    handleDeleteMockExam,
    handleCreateMockExam,
    handleExportMockExam,
    mockExamOrderedItems,
    mockExamPrintRef,
    mockExamPages,
    // Quiz callbacks
    shortPreview,
    requestQuestions,
    deleteQuiz: handleDeleteQuiz,
    deleteQuizItem: handleDeleteQuizItem,
    handleChoiceSelect,
    handleShortAnswerChange,
    handleShortAnswerCheck,
    handleQuizOxSelect,
    handleToggleQuizOxExplanation,
    regenerateQuiz,
    // ReviewNotes callbacks
    reviewNoteSections: configuredReviewSections,
    reviewNotesSectionSelectionInput: reviewNotesChapterSelectionInput,
    setReviewNotesSectionSelectionInput: setReviewNotesChapterSelectionInput,
    reviewNotesSectionError: reviewNotesPanelState.error,
    examCramItems: examCramState.items,
    examCramPendingCount: examCramState.pendingCount,
    examCramSectionError: examCramState.error,
    examCramReferenceCounts: examCramState.referenceCounts,
    examCramHasAnySource: examCramState.hasAnySource,
    handleReviewNoteAttempt,
    handleDeleteReviewNote,
    handleGenerateExamCram,
    handleCreateReviewNotesMockExam,
    // OX callbacks
    requestOxQuiz,
    regenerateOxQuiz,
    handleOxSelect,
    // Flashcard callbacks
    handleAddFlashcard,
    handleDeleteFlashcard,
    handleDeleteAllFlashcards,
    handleUpdateFlashcard,
    handleUpdateFlashcardSrs,
    handleDeduplicateFlashcards,
    handleSaveFlashcardScore,
    handleSaveVocabQuizScore,
    handleGenerateFlashcards,
    handleGenerateVocabularyFlashcards,
    handleReextractVocabulary,
    handleRegenerateFlashcards,
    isVocabularyFile: Boolean(activeUploadItem?.isVocabulary),
    // Tutor callbacks
    tutorNotice,
    handleSendTutorMessage,
    handleResetTutor,
    // 폴더 튜터 모드
    onToggleFolderTutorMode: () => setFolderTutorMode((v) => !v),
    canUseFolderTutorMode: Boolean(selectedFolderId && selectedFolderId !== "all" && uploadedFiles.some((f) => String(f.folderId || "") === String(selectedFolderId))),
    folderName: folders.find((f) => String(f.id) === String(selectedFolderId))?.name || "",
    // 학습 구조 callbacks
    onRequestTopicStructure: requestTopicStructure,
    onExplainConcept: explainConceptForPanel,
    // 폴더 통합 퀴즈
    isFolderMode,
    currentFolderInfo,
    onRequestFolderQuiz: () => currentFolderInfo && requestFolderQuiz(currentFolderInfo.folderId),
    onFolderSelectChoice: handleFolderSelectChoice,
    onFolderShortAnswerChange: handleFolderShortAnswerChange,
    onFolderShortAnswerCheck: handleFolderShortAnswerCheck,
  };

  if (AUTH_ENABLED && isNativePlatform && !authReady) {
    return <div className="min-h-screen bg-black" />;
  }

  if (shouldRenderAuthScreen) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <LoginBackground theme={theme}>
          <div className="relative z-10 min-h-screen px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex min-h-screen items-center justify-center">
              <AuthPanel user={user} onAuth={refreshSession} theme={theme} outputLanguage={outputLanguage} />
            </div>
          </div>
        </LoginBackground>
      </Suspense>
    );
  }

  const isGuestFreeMode = !AUTH_ENABLED && !user;
  const isGuestPromo = !user && !showDetail && (AUTH_ENABLED || showGuestIntro);
  const showHeader = Boolean(user || showDetail || (isGuestFreeMode && !showGuestIntro));
  const showAmbient = showHeader;

  return (
    <div
      style={appShellStyle}
      className={`relative min-h-screen overflow-hidden ${
        theme === "light" ? "text-slate-900" : "text-slate-100"
      } ${isGuestPromo ? "bg-[#FBFBF9]" : showAmbient ? "" : "bg-black"} app-banner-offset`}
    >
      {showPayment && (
        <Suspense fallback={null}>
          <PaymentPage
            onClose={closePayment}
            currentTier={tier}
            currentTierExpiresAt={tierExpiresAt}
            currentTierRemainingDays={tierRemainingDays}
            theme={theme}
            user={user}
            authReady={authReady}
            onTierUpdated={refreshTier}
            paymentReturnSignal={paymentReturnSignal}
          />
        </Suspense>
      )}
      {showSettings && (
        <Suspense fallback={null}>
          <SettingsDialog
            onClose={closeSettings}
            theme={theme}
            onThemeChange={setTheme}
            outputLanguage={outputLanguage}
            onOutputLanguageChange={setOutputLanguage}
            user={user}
            authEnabled={AUTH_ENABLED}
            currentTier={tier}
            currentTierExpiresAt={tierExpiresAt}
            currentTierRemainingDays={tierRemainingDays}
            loadingTier={loadingTier}
            activeProfile={activePremiumProfile}
            premiumSpaceMode={premiumSpaceMode}
            onOpenBilling={() => {
              closeSettings();
              openBilling();
            }}
            onOpenFeedbackDialog={() => {
              closeSettings();
              handleOpenFeedbackDialog();
            }}
            onOpenLogin={() => {
              closeSettings();
              openAuth();
            }}
            onSignOut={handleSignOut}
            signingOut={isSigningOut}
            onRefresh={handleManualSync}
            isRefreshing={isManualSyncing}
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
            onRenameProfile={handleRenamePremiumProfile}
            onChangePin={handleChangePremiumProfilePin}
            onDisablePin={handleDisablePremiumProfilePin}
            onClose={handleCloseProfilePicker}
            canClose={Boolean(activePremiumProfileId)}
          />
        </Suspense>
      )}
      <ProfilePinDialog
        onChangePin={(profileId, newPin) => {
          setPremiumProfiles((prev) =>
            prev.map((p) => (p.id === profileId ? { ...p, pin: newPin } : p))
          );
          setStatus("프로필 PIN이 변경됐습니다.");
        }}
        onDisablePin={(profileId) => {
          setPremiumProfiles((prev) =>
            prev.map((p) => (p.id === profileId ? { ...p, pinDisabled: true } : p))
          );
          setStatus("PIN 보호가 해제되었습니다.");
        }}
      />
      <FeedbackDialog
        onSubmitFeedback={handleSubmitFeedback}
        fileName={file?.name}
      />
      <DiagnosticModal
        userId={user?.id}
        docId={selectedFileId}
        onGoToQuiz={() => setPanelTab("quiz")}
        onGoToSummary={() => setPanelTab("summary")}
      />
      {isResizingSplit && showDetail && (
        <div className="pointer-events-none fixed inset-0 z-[160] cursor-col-resize" aria-hidden="true" />
      )}
      {showAmbient && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute right-0 top-32 h-80 w-80 translate-x-1/3 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute bottom-[-120px] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>
      )}

      <div className="relative z-10 flex min-h-screen flex-col">
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
              onOpenSettings={openSettings}
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
              outputLanguage={outputLanguage}
            />
          </Suspense>
        )}
        <div className="flex flex-1">
          {showHeader && (
            <Suspense fallback={null}>
              <NavRail
                showDetail={showDetail}
                panelTab={panelTab}
                onGoHome={goBackToList}
                onSelectPanelTab={setPanelTab}
                onOpenSettings={openSettings}
                isVocabularyFile={Boolean(activeUploadItem?.isVocabulary)}
                user={user}
                onSignOut={handleSignOut}
                uploadedFiles={uploadedFiles}
                allArtifacts={allArtifacts}
                onSemanticSearch={handleSemanticSearch}
                semanticSearchResults={semanticSearchResults}
                isSemanticSearching={isSemanticSearching}
                outputLanguage={outputLanguage}
                onSelectFile={handleSelectFile}
                searchOpen={sidebarOpen}
                onToggleSearch={(next) => {
                  setSidebarOpen(next);
                  try { localStorage.setItem("sidebarOpen", String(next)); } catch {}
                }}
              />
            </Suspense>
          )}
          <main className="flex min-w-0 flex-1 flex-col gap-4 py-4">
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
      </div>
    </div>
  );
}

export default App;







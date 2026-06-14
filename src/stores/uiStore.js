import { create } from "zustand";

const OUTPUT_LANGUAGE_STORAGE_KEY = "zeusian-output-language";
const DEFAULT_OUTPUT_LANGUAGE = "ko";
const AVAILABLE_OUTPUT_LANGUAGES = ["en", "zh", "ja", "hi", "ko"];

function getInitialOutputLanguage() {
  if (typeof window === "undefined") return DEFAULT_OUTPUT_LANGUAGE;
  const stored = String(window.localStorage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY) || "")
    .trim()
    .toLowerCase();
  if (AVAILABLE_OUTPUT_LANGUAGES.includes(stored)) return stored;
  const browserLang = (navigator.language || "").slice(0, 2).toLowerCase();
  return AVAILABLE_OUTPUT_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_OUTPUT_LANGUAGE;
}

function getInitialSidebarOpen() {
  try {
    const saved = localStorage.getItem("sidebarOpen");
    return saved === null ? false : saved === "true";
  } catch {
    return false;
  }
}

export const useUiStore = create((set) => ({
  theme: "light",
  outputLanguage: getInitialOutputLanguage(),

  // Panel layout
  panelTab: "summary",
  splitPercent: 50,
  isResizingSplit: false,
  sidebarOpen: getInitialSidebarOpen(),

  // Premium profile picker
  showPremiumProfilePicker: false,

  // Profile PIN dialog
  showProfilePinDialog: false,
  profilePinInputs: { currentPin: "", nextPin: "", confirmPin: "" },
  profilePinError: "",

  // Feedback dialog
  isFeedbackDialogOpen: false,
  feedbackCategory: "general",
  feedbackInput: "",
  feedbackError: "",
  isSubmittingFeedback: false,

  // Manual sync
  isManualSyncing: false,

  // Usage counts
  usageCounts: { summary: 0, quiz: 0, ox: 0, flashcards: 0 },

  // Folder tutor mode
  folderTutorMode: false,

  // Semantic search
  semanticSearchResults: null,
  isSemanticSearching: false,

  // Doc compare
  compareResult: "",
  isComparing: false,
  compareError: "",

  // Folder quiz state
  folderQuizQuestions: null,
  isLoadingFolderQuiz: false,
  folderQuizError: "",
  folderSelectedChoices: {},
  folderRevealedChoices: {},
  folderShortAnswerInput: {},
  folderShortAnswerResult: {},

  // Actions
  setTheme: (fn) =>
    set((state) => ({
      theme: typeof fn === "function" ? fn(state.theme) : fn,
    })),
  setOutputLanguage: (lang) => {
    set({ outputLanguage: lang });
    try {
      localStorage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, lang);
    } catch {}
  },

  setPanelTab: (panelTab) => set({ panelTab }),
  setSplitPercent: (splitPercent) => set({ splitPercent }),
  setIsResizingSplit: (isResizingSplit) => set({ isResizingSplit }),
  setSidebarOpen: (v) => {
    const val = typeof v === "function" ? v : () => v;
    set((state) => {
      const next = val(state.sidebarOpen);
      try {
        localStorage.setItem("sidebarOpen", String(next));
      } catch {}
      return { sidebarOpen: next };
    });
  },

  setShowPremiumProfilePicker: (v) => set({ showPremiumProfilePicker: v }),

  setShowProfilePinDialog: (v) => set({ showProfilePinDialog: v }),
  setProfilePinInputs: (fn) =>
    set((state) => ({
      profilePinInputs: typeof fn === "function" ? fn(state.profilePinInputs) : fn,
    })),
  setProfilePinError: (profilePinError) => set({ profilePinError }),

  setIsFeedbackDialogOpen: (v) => set({ isFeedbackDialogOpen: v }),
  setFeedbackCategory: (feedbackCategory) => set({ feedbackCategory }),
  setFeedbackInput: (feedbackInput) => set({ feedbackInput }),
  setFeedbackError: (feedbackError) => set({ feedbackError }),
  setIsSubmittingFeedback: (v) => set({ isSubmittingFeedback: v }),

  setIsManualSyncing: (v) => set({ isManualSyncing: v }),

  setUsageCounts: (fn) =>
    set((state) => ({
      usageCounts: typeof fn === "function" ? fn(state.usageCounts) : fn,
    })),

  setFolderTutorMode: (fn) =>
    set((state) => ({
      folderTutorMode: typeof fn === "function" ? fn(state.folderTutorMode) : fn,
    })),

  setSemanticSearchResults: (v) => set({ semanticSearchResults: v }),
  setIsSemanticSearching: (v) => set({ isSemanticSearching: v }),

  setCompareResult: (v) => set({ compareResult: v }),
  setIsComparing: (v) => set({ isComparing: v }),
  setCompareError: (v) => set({ compareError: v }),

  setFolderQuizQuestions: (v) => set({ folderQuizQuestions: v }),
  setIsLoadingFolderQuiz: (v) => set({ isLoadingFolderQuiz: v }),
  setFolderQuizError: (v) => set({ folderQuizError: v }),
  setFolderSelectedChoices: (fn) =>
    set((state) => ({
      folderSelectedChoices: typeof fn === "function" ? fn(state.folderSelectedChoices) : fn,
    })),
  setFolderRevealedChoices: (fn) =>
    set((state) => ({
      folderRevealedChoices: typeof fn === "function" ? fn(state.folderRevealedChoices) : fn,
    })),
  setFolderShortAnswerInput: (fn) =>
    set((state) => ({
      folderShortAnswerInput: typeof fn === "function" ? fn(state.folderShortAnswerInput) : fn,
    })),
  setFolderShortAnswerResult: (fn) =>
    set((state) => ({
      folderShortAnswerResult: typeof fn === "function" ? fn(state.folderShortAnswerResult) : fn,
    })),
}));

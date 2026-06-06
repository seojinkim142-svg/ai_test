import { create } from "zustand";

export const useMockExamStore = create((set) => ({
  mockExams: [],
  isLoadingMockExams: false,
  isGeneratingMockExam: false,
  mockExamStatus: "",
  mockExamError: "",
  activeMockExamId: null,
  showMockExamAnswers: false,
  isMockExamMenuOpen: false,
  mockExamChapterSelectionInput: "",
  mockExamPromptAddonInput: "",

  // Exam cram
  examCramContent: "",
  examCramUpdatedAt: "",
  examCramScopeLabel: "",
  isGeneratingExamCram: false,
  examCramStatus: "",
  examCramError: "",

  // Review notes
  reviewNotes: [],
  reviewNotesChapterSelectionInput: "",

  // Actions
  setMockExams: (fn) =>
    set((state) => ({
      mockExams: typeof fn === "function" ? fn(state.mockExams) : fn,
    })),
  setIsLoadingMockExams: (v) => set({ isLoadingMockExams: v }),
  setIsGeneratingMockExam: (v) => set({ isGeneratingMockExam: v }),
  setMockExamStatus: (v) => set({ mockExamStatus: v }),
  setMockExamError: (v) => set({ mockExamError: v }),
  setActiveMockExamId: (v) => set({ activeMockExamId: v }),
  setShowMockExamAnswers: (v) => set({ showMockExamAnswers: v }),
  setIsMockExamMenuOpen: (v) => set({ isMockExamMenuOpen: v }),
  setMockExamChapterSelectionInput: (v) => set({ mockExamChapterSelectionInput: v }),
  setMockExamPromptAddonInput: (v) => set({ mockExamPromptAddonInput: v }),

  setExamCramContent: (v) => set({ examCramContent: v }),
  setExamCramUpdatedAt: (v) => set({ examCramUpdatedAt: v }),
  setExamCramScopeLabel: (v) => set({ examCramScopeLabel: v }),
  setIsGeneratingExamCram: (v) => set({ isGeneratingExamCram: v }),
  setExamCramStatus: (v) => set({ examCramStatus: v }),
  setExamCramError: (v) => set({ examCramError: v }),

  setReviewNotes: (fn) =>
    set((state) => ({
      reviewNotes: typeof fn === "function" ? fn(state.reviewNotes) : fn,
    })),
  setReviewNotesChapterSelectionInput: (v) => set({ reviewNotesChapterSelectionInput: v }),
}));

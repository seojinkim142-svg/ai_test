import { create } from "zustand";

export const useSummaryStore = create((set) => ({
  summary: "",
  isLoadingSummary: false,
  isExportingSummary: false,

  // Partial summary
  partialSummary: "",
  partialSummaryRange: "",
  savedPartialSummaries: [],
  isSavedPartialSummaryOpen: false,

  // Page summary
  isPageSummaryOpen: false,
  pageSummaryInput: "",
  pageSummaryError: "",
  isPageSummaryLoading: false,

  // Instructor emphasis
  instructorEmphasisInput: "",
  savedInstructorEmphases: [],
  activeInstructorEmphasisId: "",

  // Chapter range
  chapterRangeInput: "",
  autoChapterRangeInput: "",
  chapterRangeError: "",
  chapterRangeNotice: "",
  isChapterRangeOpen: false,
  isDetectingChapterRanges: false,

  // Topic structure
  topicStructure: null,
  isLoadingTopicStructure: false,
  topicStructureError: "",

  // Actions
  setSummary: (summary) => set({ summary }),
  setIsLoadingSummary: (v) => set({ isLoadingSummary: v }),
  setIsExportingSummary: (v) => set({ isExportingSummary: v }),

  setPartialSummary: (v) => set({ partialSummary: v }),
  setPartialSummaryRange: (v) => set({ partialSummaryRange: v }),
  setSavedPartialSummaries: (fn) =>
    set((state) => ({
      savedPartialSummaries: typeof fn === "function" ? fn(state.savedPartialSummaries) : fn,
    })),
  setIsSavedPartialSummaryOpen: (v) => set({ isSavedPartialSummaryOpen: v }),

  setIsPageSummaryOpen: (v) => set({ isPageSummaryOpen: v }),
  setPageSummaryInput: (v) => set({ pageSummaryInput: v }),
  setPageSummaryError: (v) => set({ pageSummaryError: v }),
  setIsPageSummaryLoading: (v) => set({ isPageSummaryLoading: v }),

  setInstructorEmphasisInput: (v) => set({ instructorEmphasisInput: v }),
  setSavedInstructorEmphases: (fn) =>
    set((state) => ({
      savedInstructorEmphases: typeof fn === "function" ? fn(state.savedInstructorEmphases) : fn,
    })),
  setActiveInstructorEmphasisId: (v) => set({ activeInstructorEmphasisId: v }),

  setChapterRangeInput: (v) => set({ chapterRangeInput: v }),
  setAutoChapterRangeInput: (v) => set({ autoChapterRangeInput: v }),
  setChapterRangeError: (v) => set({ chapterRangeError: v }),
  setChapterRangeNotice: (v) => set({ chapterRangeNotice: v }),
  setIsChapterRangeOpen: (v) => set({ isChapterRangeOpen: v }),
  setIsDetectingChapterRanges: (v) => set({ isDetectingChapterRanges: v }),

  setTopicStructure: (fn) =>
    set((state) => ({
      topicStructure: typeof fn === "function" ? fn(state.topicStructure) : fn,
    })),
  setIsLoadingTopicStructure: (v) => set({ isLoadingTopicStructure: v }),
  setTopicStructureError: (v) => set({ topicStructureError: v }),
}));

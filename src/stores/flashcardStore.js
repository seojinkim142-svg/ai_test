import { create } from "zustand";

export const useFlashcardStore = create((set) => ({
  flashcards: [],
  isLoadingFlashcards: false,
  isGeneratingFlashcards: false,
  flashcardStatus: "",
  flashcardError: "",
  flashcardScores: [],
  vocabQuizScores: [],
  flashcardChapterSelectionInput: "",
  flashcardGenerateCount: 8,

  // Actions
  setFlashcards: (fn) =>
    set((state) => ({
      flashcards: typeof fn === "function" ? fn(state.flashcards) : fn,
    })),
  setIsLoadingFlashcards: (v) => set({ isLoadingFlashcards: v }),
  setIsGeneratingFlashcards: (v) => set({ isGeneratingFlashcards: v }),
  setFlashcardStatus: (v) => set({ flashcardStatus: v }),
  setFlashcardError: (v) => set({ flashcardError: v }),
  setFlashcardScores: (fn) =>
    set((state) => ({
      flashcardScores: typeof fn === "function" ? fn(state.flashcardScores) : fn,
    })),
  setVocabQuizScores: (fn) =>
    set((state) => ({
      vocabQuizScores: typeof fn === "function" ? fn(state.vocabQuizScores) : fn,
    })),
  setFlashcardChapterSelectionInput: (v) => set({ flashcardChapterSelectionInput: v }),
  setFlashcardGenerateCount: (v) => set({ flashcardGenerateCount: v }),
}));

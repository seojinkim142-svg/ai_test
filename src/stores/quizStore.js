import { create } from "zustand";
import { DEFAULT_QUIZ_MIX_INPUT } from "../utils/appStateHelpers";

export const useQuizStore = create((set) => ({
  questionStyleProfileContent: "",
  questionStyleProfileScopeLabel: "",

  quizSets: [],
  isLoadingQuiz: false,
  quizMixInput: DEFAULT_QUIZ_MIX_INPUT,
  quizChapterSelectionInput: "",
  quizPromptAddonInput: "",
  quizDifficulty: (() => {
    try {
      const saved = localStorage.getItem("quizDifficulty");
      return ["하", "중", "상"].includes(saved) ? saved : null;
    } catch {
      return null;
    }
  })(),

  // OX quiz
  oxItems: null,
  oxSelections: {},
  oxExplanationOpen: {},
  isLoadingOx: false,
  oxChapterSelectionInput: "",

  // Actions
  setQuestionStyleProfileContent: (v) => set({ questionStyleProfileContent: v }),
  setQuestionStyleProfileScopeLabel: (v) => set({ questionStyleProfileScopeLabel: v }),

  setQuizSets: (fn) =>
    set((state) => ({
      quizSets: typeof fn === "function" ? fn(state.quizSets) : fn,
    })),
  setIsLoadingQuiz: (v) => set({ isLoadingQuiz: v }),
  setQuizMixInput: (v) => set({ quizMixInput: v }),
  setQuizChapterSelectionInput: (v) => set({ quizChapterSelectionInput: v }),
  setQuizPromptAddonInput: (v) => set({ quizPromptAddonInput: v }),
  setQuizDifficulty: (value) => {
    const normalized = ["하", "중", "상"].includes(value) ? value : null;
    set({ quizDifficulty: normalized });
    try {
      if (normalized) {
        localStorage.setItem("quizDifficulty", normalized);
      } else {
        localStorage.removeItem("quizDifficulty");
      }
    } catch {}
  },

  setOxItems: (fn) =>
    set((state) => ({
      oxItems: typeof fn === "function" ? fn(state.oxItems) : fn,
    })),
  setOxSelections: (fn) =>
    set((state) => ({
      oxSelections: typeof fn === "function" ? fn(state.oxSelections) : fn,
    })),
  setOxExplanationOpen: (fn) =>
    set((state) => ({
      oxExplanationOpen: typeof fn === "function" ? fn(state.oxExplanationOpen) : fn,
    })),
  setIsLoadingOx: (v) => set({ isLoadingOx: v }),
  setOxChapterSelectionInput: (v) => set({ oxChapterSelectionInput: v }),
}));

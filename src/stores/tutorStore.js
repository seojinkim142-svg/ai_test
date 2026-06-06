import { create } from "zustand";

export const useTutorStore = create((set) => ({
  tutorMessages: [],
  isTutorLoading: false,
  tutorError: "",

  // Actions
  setTutorMessages: (fn) =>
    set((state) => ({
      tutorMessages: typeof fn === "function" ? fn(state.tutorMessages) : fn,
    })),
  setIsTutorLoading: (v) => set({ isTutorLoading: v }),
  setTutorError: (v) => set({ tutorError: v }),
}));

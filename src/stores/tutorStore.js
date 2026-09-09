import { create } from "zustand";

export const useTutorStore = create((set) => ({
  tutorMessages: [],
  isTutorLoading: false,
  tutorError: "",

  // 문서별 AI 튜터 대화 세션 목록(DB의 artifacts.highlights_json 에 저장됨)
  tutorConversations: [],
  activeTutorConversationId: "",

  // Actions
  setTutorMessages: (fn) =>
    set((state) => ({
      tutorMessages: typeof fn === "function" ? fn(state.tutorMessages) : fn,
    })),
  setIsTutorLoading: (v) => set({ isTutorLoading: v }),
  setTutorError: (v) => set({ tutorError: v }),
  setTutorConversations: (fn) =>
    set((state) => ({
      tutorConversations: typeof fn === "function" ? fn(state.tutorConversations) : fn,
    })),
  setActiveTutorConversationId: (v) => set({ activeTutorConversationId: v }),
}));

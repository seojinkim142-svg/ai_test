import { create } from "zustand";

const initialState = {
  isDiagnosticModalOpen: false,
  diagnosticStatus: "idle", // idle | generating | in-progress | completed | error | skipped
  diagnosticError: "",
  diagnosticItems: [],
  diagnosticAnswers: {},
  diagnosticCurrentIndex: 0,
  diagnosticResult: null,
};

export const useDiagnosticStore = create((set) => ({
  ...initialState,

  setIsDiagnosticModalOpen: (v) => set({ isDiagnosticModalOpen: v }),
  setDiagnosticStatus: (v) => set({ diagnosticStatus: v }),
  setDiagnosticError: (v) => set({ diagnosticError: v }),
  setDiagnosticItems: (v) => set({ diagnosticItems: v }),
  setDiagnosticAnswer: (index, choiceIndex) =>
    set((state) => ({
      diagnosticAnswers: { ...state.diagnosticAnswers, [index]: choiceIndex },
    })),
  setDiagnosticCurrentIndex: (v) => set({ diagnosticCurrentIndex: v }),
  setDiagnosticResult: (v) => set({ diagnosticResult: v }),
  resetDiagnostic: () =>
    set({
      diagnosticStatus: "idle",
      diagnosticError: "",
      diagnosticItems: [],
      diagnosticAnswers: {},
      diagnosticCurrentIndex: 0,
      diagnosticResult: null,
    }),
}));

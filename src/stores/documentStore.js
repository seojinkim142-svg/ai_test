import { create } from "zustand";

export const useDocumentStore = create((set) => ({
  // Active document
  file: null,
  extractedText: "",
  previewText: "",
  pageInfo: { used: 0, total: 0 },
  pdfUrl: null,
  status: "",
  error: "",
  isLoadingText: false,
  thumbnailUrl: null,

  // Pagination
  currentPage: 1,
  visitedPages: new Set(),

  // Document list
  uploadedFiles: [],
  selectedFileId: null,
  pendingDocumentOpen: null,

  // Folders
  folders: [],
  selectedFolderId: "all",
  selectedUploadIds: [],
  isFolderLoading: false,

  // Artifacts
  artifacts: null,
  allArtifacts: [],

  // Actions
  setFile: (file) => set({ file }),
  setExtractedText: (extractedText) => set({ extractedText }),
  setPreviewText: (previewText) => set({ previewText }),
  setPageInfo: (fn) =>
    set((state) => ({
      pageInfo: typeof fn === "function" ? fn(state.pageInfo) : fn,
    })),
  setPdfUrl: (pdfUrl) => set({ pdfUrl }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setIsLoadingText: (isLoadingText) => set({ isLoadingText }),
  setThumbnailUrl: (thumbnailUrl) => set({ thumbnailUrl }),

  setCurrentPage: (currentPage) => set({ currentPage }),
  setVisitedPages: (fn) =>
    set((state) => ({
      visitedPages: typeof fn === "function" ? fn(state.visitedPages) : fn,
    })),

  setUploadedFiles: (fn) =>
    set((state) => ({
      uploadedFiles: typeof fn === "function" ? fn(state.uploadedFiles) : fn,
    })),
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
  setPendingDocumentOpen: (pendingDocumentOpen) => set({ pendingDocumentOpen }),

  setFolders: (fn) =>
    set((state) => ({
      folders: typeof fn === "function" ? fn(state.folders) : fn,
    })),
  setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId }),
  setSelectedUploadIds: (fn) =>
    set((state) => ({
      selectedUploadIds: typeof fn === "function" ? fn(state.selectedUploadIds) : fn,
    })),
  setIsFolderLoading: (isFolderLoading) => set({ isFolderLoading }),

  setArtifacts: (fn) =>
    set((state) => ({
      artifacts: typeof fn === "function" ? fn(state.artifacts) : fn,
    })),
  setAllArtifacts: (fn) =>
    set((state) => ({
      allArtifacts: typeof fn === "function" ? fn(state.allArtifacts) : fn,
    })),
}));

import { create } from "zustand";

export const useDocumentStore = create((set) => ({
  // Active document
  file: null,
  extractedText: "",
  previewText: "",
  pageInfo: { used: 0, total: 0 },
  // PDF 물리 페이지 번호 -> 책에 인쇄된 쪽수. 표지/서문 때문에 둘이 다른 책
  // PDF에서, 인용 배지에 "물리 페이지 대신 인쇄 쪽수"를 보여주기 위한 것.
  // 라벨 없는 PDF는 빈 Map이고, 그럴 땐 물리 페이지 번호를 그대로 보여준다.
  pageLabelMap: new Map(),
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
  setExtractedText: (fn) =>
    set((state) => ({
      extractedText: typeof fn === "function" ? fn(state.extractedText) : fn,
    })),
  setPreviewText: (fn) =>
    set((state) => ({
      previewText: typeof fn === "function" ? fn(state.previewText) : fn,
    })),
  setPageInfo: (fn) =>
    set((state) => ({
      pageInfo: typeof fn === "function" ? fn(state.pageInfo) : fn,
    })),
  setPageLabelMap: (fn) =>
    set((state) => ({
      pageLabelMap: typeof fn === "function" ? fn(state.pageLabelMap) : fn,
    })),
  setPdfUrl: (pdfUrl) => set({ pdfUrl }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setIsLoadingText: (isLoadingText) => set({ isLoadingText }),
  setThumbnailUrl: (thumbnailUrl) => set({ thumbnailUrl }),

  setCurrentPage: (fn) =>
    set((state) => ({
      currentPage: typeof fn === "function" ? fn(state.currentPage) : fn,
    })),
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
  setSelectedFolderId: (fn) =>
    set((state) => ({
      selectedFolderId: typeof fn === "function" ? fn(state.selectedFolderId) : fn,
    })),
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

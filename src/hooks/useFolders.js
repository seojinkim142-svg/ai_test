import { useCallback, useRef } from "react";
import { supabase, listFolders, createFolder, renameFolder, deleteFolder } from "../services/supabase";
import { decodePremiumScopeValue, encodePremiumScopeValue } from "../utils/appStateHelpers";
import { useDocumentStore, useUiStore } from "../stores";

export function useFolders({ user, loadingTier, isPremiumTier, isFolderFeatureEnabled, premiumOwnerProfileId, premiumScopeProfileId }) {
  const {
    folders, setFolders,
    uploadedFiles,
    selectedFolderId, setSelectedFolderId,
    setSelectedUploadIds,
    setIsFolderLoading,
    setError, setStatus,
  } = useDocumentStore();

  const { setFolderTutorMode } = useUiStore();

  const loadFoldersRequestSeqRef = useRef(0);

  const loadFolders = useCallback(
    async () => {
      const requestSeq = loadFoldersRequestSeqRef.current + 1;
      loadFoldersRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadFoldersRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      try {
        const list = await listFolders({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((folder) => {
          const decoded = decodePremiumScopeValue(folder?.name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            ...folder,
            name: decoded.value || folder?.name || "",
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((folder) => folder.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setFolders(scoped);
        setSelectedFolderId((prev) => {
          if (prev === "all") return "all";
          const hasFolder = scoped.some((folder) => folder.id?.toString() === prev?.toString());
          return hasFolder ? prev : "all";
        });
      } catch (err) {
        setError(`폴더를 불러오지 못했습니다: ${err.message}`);
      }
    },
    [user, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );

  const handleCreateFolder = useCallback(
    async (name) => {
      if (!isFolderFeatureEnabled) {
        setError("폴더 기능은 Pro 또는 Premium 구독에서만 사용됩니다.");
        return;
      }
      if (!user) {
        setError("먼저 로그인해주세요.");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (isPremiumTier && !premiumScopeProfileId) {
        setError("폴더를 만들기 전에 프리미엄 프로필을 선택해주세요.");
        return;
      }
      if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
        setError("같은 이름의 폴더가 이미 있습니다.");
        return;
      }
      setIsFolderLoading(true);
      try {
        const storedName =
          isPremiumTier && premiumScopeProfileId
            ? encodePremiumScopeValue(trimmed, premiumScopeProfileId)
            : trimmed;
        const created = await createFolder({ userId: user.id, name: storedName });
        if (created) {
          const decoded = decodePremiumScopeValue(created?.name || trimmed);
          const ownerProfileId = isPremiumTier
            ? decoded.ownerProfileId || premiumOwnerProfileId || premiumScopeProfileId
            : null;
          setFolders((prev) => [
            ...prev,
            {
              ...created,
              name: decoded.value || trimmed,
              ownerProfileId,
            },
          ]);
        }
        setSelectedFolderId("all");
        setSelectedUploadIds([]);
        setStatus("폴더를 생성했습니다.");
      } catch (err) {
        setError(`폴더 생성에 실패했습니다: ${err.message}`);
      } finally {
        setIsFolderLoading(false);
      }
    },
    [isFolderFeatureEnabled, user, folders, isPremiumTier, premiumScopeProfileId, premiumOwnerProfileId]
  );

  const handleRenameFolder = useCallback(
    async (folderId, name) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("먼저 로그인해주세요.");
        return;
      }
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (folders.some((f) => f.id !== folderId && f.name.toLowerCase() === lower)) {
        setError("같은 이름의 폴더가 이미 있습니다.");
        return;
      }
      setIsFolderLoading(true);
      try {
        const storedName =
          isPremiumTier && premiumScopeProfileId
            ? encodePremiumScopeValue(trimmed, premiumScopeProfileId)
            : trimmed;
        await renameFolder({ userId: user.id, folderId, name: storedName });
        setFolders((prev) =>
          prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
        );
        setStatus("폴더 이름을 변경했습니다.");
      } catch (err) {
        setError(`폴더 이름 변경에 실패했습니다: ${err.message}`);
      } finally {
        setIsFolderLoading(false);
      }
    },
    [isFolderFeatureEnabled, user, folders, isPremiumTier, premiumScopeProfileId]
  );

  const handleDeleteFolder = useCallback(
    async (folderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!folderId || folderId === "all") return;
      if (!user) {
        setError("먼저 로그인해주세요.");
        return;
      }
      const hasFiles = uploadedFiles.some((u) => String(u.folderId || "") === String(folderId || ""));
      if (hasFiles) {
        setError("폴더 안의 파일을 먼저 이동하거나 삭제해주세요.");
        return;
      }
      setIsFolderLoading(true);
      try {
        await deleteFolder({ userId: user.id, folderId });
        setFolders((prev) => prev.filter((f) => f.id !== folderId));
        if (String(selectedFolderId || "") === String(folderId || "")) {
          setSelectedFolderId("all");
        }
      } catch (err) {
        setError(`폴더 삭제에 실패했습니다: ${err.message}`);
      } finally {
        setIsFolderLoading(false);
      }
    },
    [isFolderFeatureEnabled, uploadedFiles, selectedFolderId, user]
  );

  const handleSelectFolder = useCallback((folderId) => {
    setSelectedFolderId(folderId);
    setSelectedUploadIds([]);
  }, []);

  const handleSelectFolderSummary = useCallback((folderId) => {
    if (!folderId || folderId === "all") return;
    setSelectedFolderId(folderId);
    setSelectedUploadIds([]);
    setFolderTutorMode(true);
  }, []);

  return { loadFolders, handleCreateFolder, handleRenameFolder, handleDeleteFolder, handleSelectFolder, handleSelectFolderSummary };
}

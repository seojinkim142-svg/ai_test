import { useCallback, useEffect, useRef } from "react";
import {
  supabase,
  deleteUpload,
  listUploads,
  updateUploadFolder,
  updateUploadVocabulary,
} from "../services/supabase";
import { decodePremiumScopeValue } from "../utils/appStateHelpers";
import { AUTH_ENABLED } from "../config/auth";
import { useDocumentStore } from "../stores";

export function useUploads({ user, loadingTier, isPremiumTier, isFolderFeatureEnabled, premiumOwnerProfileId, premiumScopeProfileId, persistChapterRangeInput }) {
  const {
    uploadedFiles, setUploadedFiles,
    folders,
    setFolders,
    setSelectedFolderId,
    setSelectedUploadIds,
    setIsFolderLoading,
    setError, setStatus,
  } = useDocumentStore();

  const loadUploadsRef = useRef(null);
  const loadUploadsRequestSeqRef = useRef(0);
  const uploadedFilesRef = useRef(uploadedFiles);

  // Keep uploadedFilesRef in sync with store
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  const loadUploads = useCallback(
    async () => {
      const requestSeq = loadUploadsRequestSeqRef.current + 1;
      loadUploadsRequestSeqRef.current = requestSeq;
      const isLatestRequest = () => loadUploadsRequestSeqRef.current === requestSeq;

      if (!supabase || !user) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setFolders([]);
        setSelectedFolderId("all");
        return;
      }
      if (loadingTier) {
        if (!isLatestRequest()) return;
        setUploadedFiles([]);
        setSelectedUploadIds([]);
        return;
      }
      try {
        const list = await listUploads({ userId: user.id });
        if (!isLatestRequest()) return;
        const normalized = (list || []).map((u) => {
          const decoded = decodePremiumScopeValue(u.file_name || "");
          const ownerProfileId = isPremiumTier ? decoded.ownerProfileId || premiumOwnerProfileId || null : null;
          return {
            id: u.id || `${u.storage_path}`,
            file: null,
            name: decoded.value || u.file_name,
            size: u.file_size,
            path: u.storage_path,
            bucket: u.bucket,
            previewPdfPath: u.preview_pdf_path || null,
            previewPdfBucket: u.preview_pdf_bucket || null,
            previewPdfUrl: "",
            thumbnail: u.thumbnail || null,
            remote: true,
            hash: u.file_hash || null,
            folderId: u.folder_id || null,
            infolder: Number(u.infolder ?? (u.folder_id ? 1 : 0)) || 0,
            isVocabulary: Boolean(u.is_vocabulary),
            ownerProfileId,
          };
        });

        const scoped =
          isPremiumTier && premiumScopeProfileId
            ? normalized.filter((item) => item.ownerProfileId === premiumScopeProfileId)
            : isPremiumTier
              ? []
              : normalized;

        setUploadedFiles(scoped);
        setSelectedUploadIds((prev) =>
          prev.filter((id) => scoped.some((item) => item.id?.toString() === id?.toString()))
        );
      } catch (err) {
        setError(`파일 목록을 불러오지 못했습니다: ${err.message}`);
      }
    },
    [user, loadingTier, isPremiumTier, premiumOwnerProfileId, premiumScopeProfileId]
  );

  useEffect(() => {
    loadUploadsRef.current = loadUploads;
  }, [loadUploads]);

  const handleToggleUploadSelect = useCallback(
    (uploadId) => {
      if (!isFolderFeatureEnabled) return;
      setSelectedUploadIds((prev) =>
        prev.includes(uploadId) ? prev.filter((id) => id !== uploadId) : [...prev, uploadId]
      );
    },
    [isFolderFeatureEnabled]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedUploadIds([]);
  }, []);

  const handleDeleteUpload = useCallback(
    async (upload) => {
      if (!user) {
        if (!AUTH_ENABLED) {
          const uploadId = upload?.id || null;
          if (!uploadId) return;
          setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
          setSelectedUploadIds((prev) => prev.filter((id) => id !== uploadId));
          persistChapterRangeInput(uploadId, "");
          setStatus("Local upload removed.");
          return;
        }
        setError("먼저 로그인해주세요.");
        return;
      }
      const uploadId = upload?.id || null;
      const storagePath = upload?.path || upload?.remotePath || null;
      if (!uploadId && !storagePath) {
        setError("파일을 찾을 수 없습니다.");
        return;
      }
      const before = uploadedFiles;
      setUploadedFiles((prev) => prev.filter((u) => u.id !== uploadId));
      try {
        await deleteUpload({
          userId: user.id,
          uploadId,
          bucket: upload.bucket,
          path: storagePath,
          previewPdfBucket: upload.previewPdfBucket,
          previewPdfPath: upload.previewPdfPath,
        });
        if (uploadId) {
          persistChapterRangeInput(uploadId, "");
        }
        setStatus("파일을 삭제했습니다.");
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`파일 삭제에 실패했습니다: ${err.message}`);
      }
    },
    [persistChapterRangeInput, uploadedFiles, user]
  );

  const handleToggleVocabulary = useCallback(
    async (upload) => {
      const uploadId = upload?.id || null;
      if (!uploadId) return;
      const next = !upload.isVocabulary;
      setUploadedFiles((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, isVocabulary: next } : u))
      );
      if (user) {
        try {
          await updateUploadVocabulary({ userId: user.id, uploadId, isVocabulary: next });
        } catch (err) {
          setUploadedFiles((prev) =>
            prev.map((u) => (u.id === uploadId ? { ...u, isVocabulary: !next } : u))
          );
          setError(`단어장 설정 실패: ${err.message}`);
        }
      }
    },
    [user]
  );

  const handleMoveUploadsToFolder = useCallback(
    async (uploadIds, targetFolderId) => {
      if (!isFolderFeatureEnabled) return;
      if (!uploadIds || uploadIds.length === 0) return;
      if (!user) {
        setError("먼저 로그인해주세요.");
        return;
      }
      const normalizedIds = uploadIds.map((id) => id?.toString()).filter(Boolean);
      const target = targetFolderId && targetFolderId !== "all" ? targetFolderId.toString() : null;
      if (isPremiumTier && target && !folders.some((folder) => folder.id?.toString() === target)) {
        setError("현재 프리미엄 프로필에 해당 폴더가 없습니다.");
        return;
      }
      const before = uploadedFilesRef.current;
      const targetEntries = before.filter((item) => normalizedIds.includes(item.id?.toString()));
      const remoteIds = targetEntries.map((item) => item.id).filter(Boolean);
      const remotePaths = targetEntries.map((item) => item.path || item.remotePath).filter(Boolean);
      setIsFolderLoading(true);
      try {
        if (remoteIds.length > 0 || remotePaths.length > 0) {
          const updated = await updateUploadFolder({
            userId: user.id,
            uploadIds: remoteIds,
            storagePaths: remotePaths,
            folderId: target,
          });
          const updatedMap = new Map();
          (updated || []).forEach((u) => {
            const folderVal = u.folder_id || null;
            const infolderVal = Number(u.infolder ?? (folderVal ? 1 : 0));
            if (u.id) updatedMap.set(u.id.toString(), { folderId: folderVal, infolder: infolderVal });
            if (u.storage_path) updatedMap.set(u.storage_path, { folderId: folderVal, infolder: infolderVal });
          });
          setUploadedFiles((prev) =>
            prev.map((item) => {
              const key = item.id?.toString();
              if (!normalizedIds.includes(key)) return item;
              const mapped = updatedMap.get(key) || updatedMap.get(item.path || item.remotePath);
              const nextFolder = mapped?.folderId ?? target;
              const nextInFolder = Number(mapped?.infolder ?? (nextFolder ? 1 : 0));
              return { ...item, folderId: nextFolder, infolder: nextInFolder };
            })
          );
        } else {
          // Local-only items without remote IDs: update folder fields in memory.
          setUploadedFiles((prev) =>
            prev.map((item) =>
              normalizedIds.includes(item.id?.toString())
                ? { ...item, folderId: target, infolder: target ? 1 : 0 }
                : item
            )
          );
        }
        setSelectedUploadIds([]);
        setStatus("선택한 파일을 이동했습니다.");
        // Sync with server to keep list and folder counts in sync with DB.
        await loadUploadsRef.current?.();
      } catch (err) {
        setUploadedFiles(before);
        setError(`파일 이동에 실패했습니다: ${err.message}`);
      } finally {
        setIsFolderLoading(false);
      }
    },
    [isFolderFeatureEnabled, user, uploadedFilesRef, isPremiumTier, folders]
  );

  return { loadUploads, loadUploadsRef, handleDeleteUpload, handleToggleVocabulary, handleToggleUploadSelect, handleClearSelection, handleMoveUploadsToFolder };
}

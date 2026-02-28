import { memo, useEffect, useMemo, useRef, useState } from "react";
import FolderDialog from "./FolderDialog";
import UploadTile from "./UploadTile";
import PdfTile from "./PdfTile";
import FolderTile from "./FolderTile";

const MB = 1024 * 1024;
const TIER_LABEL = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

const formatUploadLimitText = (tier, maxPdfSizeBytes) => {
  const safeBytes = Number(maxPdfSizeBytes) || 0;
  const sizeLabel = `${Math.max(1, Math.round(safeBytes / MB))}MB`;
  return `${TIER_LABEL[tier] || "Free"} 요금제: PDF 1개당 최대 ${sizeLabel}`;
};

const FileUpload = memo(function FileUpload({
  file,
  pageInfo,
  isLoadingText,
  thumbnailUrl,
  uploadedFiles = [],
  onFileChange,
  onSelectFile,
  selectedFileId,
  folders = [],
  selectedFolderId = "all",
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  selectedUploadIds = [],
  onToggleUploadSelect,
  onMoveUploads,
  onClearSelection,
  isFolderFeatureEnabled = false,
  onDeleteUpload,
  isGuest = false,
  onRequireAuth,
  currentTier = "free",
  maxPdfSizeBytes = 0,
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderModalId, setFolderModalId] = useState(null);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState(null); // 업로드 시 적용할 폴더 ID
  const [contextMenu, setContextMenu] = useState(null); // { x, y, uploadId }
  const contextMenuRef = useRef(null);
  const selectedFolderIdStr = selectedFolderId?.toString() || null;
  const normalizeFolderId = (fid) => (fid ? fid.toString() : null);

  const folderItems = useMemo(
    () => folders.map((f) => ({ id: f.id, label: f.name || f.id })),
    [folders]
  );

  const handleOpenFolderModal = (folderId) => {
    setFolderModalId(folderId);
  };

  const handleCloseFolderModal = () => {
    setFolderModalId(null);
    onSelectFolder?.("all");
    setUploadTargetFolderId(null);
  };

  const visibleUploads = useMemo(() => {
    if (!isFolderFeatureEnabled) return uploadedFiles;
    const selected = selectedFolderIdStr;
    return uploadedFiles.filter((u) => {
      const fid = normalizeFolderId(u.folderId);
      if (selected === "all") return !fid;
      return fid === selected;
    });
  }, [uploadedFiles, isFolderFeatureEnabled, selectedFolderIdStr]);
  const hasAnyUploads = uploadedFiles.length > 0;
  const showEmptyState = visibleUploads.length === 0 && (selectedFolderIdStr !== "all" || !hasAnyUploads);

  const folderItemsList = useMemo(() => {
    if (!folderModalId) return [];
    const target = normalizeFolderId(folderModalId);
    return uploadedFiles.filter((u) => {
      const fid = normalizeFolderId(u.folderId);
      return fid === target;
    });
  }, [uploadedFiles, folderModalId]);
  const hasFolderItems = folderItemsList.length > 0;
  const folderModalName = useMemo(
    () => folderItems.find((f) => f.id === folderModalId)?.label || folderModalId,
    [folderItems, folderModalId]
  );

  const folderCounts = useMemo(() => {
    const map = new Map();
    uploadedFiles.forEach((u) => {
      if (!u.folderId) return;
      const key = u.folderId.toString();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [uploadedFiles]);

  const requestAuth = () => {
    onRequireAuth?.();
  };

  const uploadLimitText = useMemo(
    () => formatUploadLimitText(currentTier, maxPdfSizeBytes),
    [currentTier, maxPdfSizeBytes]
  );

  const handleOpenAddMenu = () => {
    if (isGuest) {
      requestAuth();
      return;
    }
    setShowAddMenu((prev) => !prev);
  };

  const handleFileSelect = (event) => {
    if (isGuest) {
      requestAuth();
      return;
    }
    setShowAddMenu(false);
    const target = uploadTargetFolderId && uploadTargetFolderId !== "all" ? uploadTargetFolderId : null;
    setUploadTargetFolderId(null);
    onFileChange?.(event, target);
  };

  const handleTriggerFileInput = () => {
    if (isGuest) {
      requestAuth();
      return;
    }
    fileInputRef.current?.click();
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      // 오른쪽 클릭으로 띄운 컨텍스트 메뉴가 즉시 닫히지 않도록 우클릭은 무시
      if (e.button === 2) return;
      if (addMenuRef.current && !addMenuRef.current.contains(e.target)) {
        setShowAddMenu(false);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setShowAddMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const handleContextMenuUpload = (event, item) => {
    if (!isFolderFeatureEnabled) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, uploadId: item.id });
  };

  const handleContextAction = (folderId) => {
    if (!contextMenu?.uploadId) return;
    onMoveUploads?.([contextMenu.uploadId], folderId || null);
    setContextMenu(null);
  };

  const isInFolder = (uploadId) => {
    const target = uploadedFiles.find((u) => u.id === uploadId);
    const fid = target?.folderId ? target.folderId.toString() : null;
    return Boolean(fid);
  };

  return (
    <div className="col-span-2 flex flex-col gap-4">
      <div className="rounded-2xl bg-transparent px-0 py-0 text-sm text-slate-100">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-300">{uploadLimitText}</p>
          {!isFolderFeatureEnabled && <p className="text-xs text-slate-300">폴더 기능은 Pro/Premium에서 제공됩니다.</p>}
        </div>
      </div>

      <div className="relative mt-2 flex flex-wrap gap-3">
        <div className="relative" ref={addMenuRef}>
          <UploadTile
            onFileChange={handleFileSelect}
            onOpenMenu={handleOpenAddMenu}
            inputRef={fileInputRef}
          />
          {showAddMenu && (
            <div className="absolute left-0 top-full z-10 mt-2 flex w-48 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/90 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
              <button
                type="button"
                className="px-4 py-3 text-left hover:bg-white/5"
                onClick={() => {
                  setShowAddMenu(false);
                  handleTriggerFileInput();
                }}
              >
                PDF 추가
              </button>
              <button
                type="button"
                className="px-4 py-3 text-left hover:bg-white/5 disabled:opacity-40"
                disabled={!isFolderFeatureEnabled}
                onClick={() => {
                  if (!isFolderFeatureEnabled) return;
                  setShowFolderDialog(true);
                  setUploadTargetFolderId(null);
                  setShowAddMenu(false);
                }}
              >
                폴더 생성
              </button>
            </div>
          )}
        </div>
        {isFolderFeatureEnabled &&
          folderItems.map((folder) => {
            const active = selectedFolderId?.toString() === folder.id?.toString();
            return (
              <FolderTile
                key={folder.id}
                name={folder.label}
                count={folderCounts.get(folder.id) || 0}
                active={active}
                canDrop={false}
                onClick={() => handleOpenFolderModal(folder.id)}
                onDelete={() => onDeleteFolder?.(folder.id)}
                onAdd={() => fileInputRef.current?.click()}
                dragHighlight={false}
              />
            );
          })}

        {showEmptyState && (
          <div className="flex min-h-[170px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300 ring-1 ring-white/5 sm:w-[260px] sm:flex-shrink-0">
            {selectedFolderId === "all"
              ? "파일이 없습니다."
              : "이 폴더에 파일이 없습니다."}
          </div>
        )}
        {visibleUploads.map((item) => {
          const isSelected = selectedUploadIds.includes(item.id);
          const isActive = selectedFileId === item.id;
          const isCurrent = selectedFileId === item.id;
          return (
            <PdfTile
              key={item.id}
              file={item.file || { name: item.name, size: item.size, id: item.id }}
              thumbnailUrl={item.thumbnail || thumbnailUrl}
              pageInfo={isCurrent ? pageInfo : null}
              isLoadingText={isCurrent && isLoadingText}
              active={isActive}
              selectable={false}
              selected={false}
              onToggleSelect={undefined}
              draggable={isFolderFeatureEnabled}
              onDragStart={undefined}
              onDragEnd={undefined}
              onProceed={() => onSelectFile?.(item)}
              onContextMenu={(e) => handleContextMenuUpload(e, item)}
              onDelete={() => onDeleteUpload?.(item)}
            />
          );
        })}
      </div>
      <FolderDialog
        open={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onSubmit={(name) => {
          try {
            onCreateFolder?.(name);
            onSelectFolder?.("all");
          } finally {
            setShowFolderDialog(false);
          }
        }}
      />

      {folderModalId && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
          <div className="relative flex w-full max-w-6xl flex-col rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-slate-100 shadow-2xl shadow-black/40 max-h-[80vh] min-h-[320px]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-300/80">Folder</p>
                <h3 className="text-xl font-semibold">{folderModalName}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadTargetFolderId(folderModalId);
                    handleTriggerFileInput();
                  }}
                  className="ghost-button text-sm text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  이 폴더에 PDF 추가
                </button>
                <button
                  type="button"
                  onClick={handleCloseFolderModal}
                  className="ghost-button text-sm text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto pr-1">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {!hasFolderItems && (
                  <div className="col-span-full flex w-full items-start justify-start rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-300 aspect-[4/3]">
                    이 폴더에 파일이 없습니다.
                  </div>
                )}
                {folderItemsList.map((item) => {
                    const isSelected = selectedUploadIds.includes(item.id);
                    const isActive = selectedFileId === item.id;
                    const isCurrent = selectedFileId === item.id;
                  return (
                    <PdfTile
                      key={item.id}
                      file={item.file || { name: item.name, size: item.size, id: item.id }}
                      thumbnailUrl={item.thumbnail || thumbnailUrl}
                        pageInfo={isCurrent ? pageInfo : null}
                        isLoadingText={isCurrent && isLoadingText}
                        active={isActive}
                        selectable={false}
                        selected={false}
                        onToggleSelect={undefined}
                        draggable={isFolderFeatureEnabled}
                        onDragStart={undefined}
                        onDragEnd={undefined}
                      onProceed={() => onSelectFile?.(item)}
                      onContextMenu={(e) => handleContextMenuUpload(e, item)}
                      onDelete={() => onDeleteUpload?.(item)}
                      fullWidth
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[180px] rounded-xl border border-white/10 bg-slate-900/95 py-2 text-sm text-slate-100 shadow-2xl ring-1 ring-white/10"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {isInFolder(contextMenu.uploadId) && (
            <>
              <button
                type="button"
                className="flex w-full items-center px-4 py-2 text-left hover:bg-white/10"
                onClick={() => handleContextAction(null)}
              >
                폴더 밖으로 이동
              </button>
              <div className="my-1 h-px bg-white/10" />
            </>
          )}
          {folderItems.length === 0 && (
            <div className="px-4 py-2 text-xs text-slate-400">폴더가 없습니다.</div>
          )}
          {folderItems.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="flex w-full items-center px-4 py-2 text-left hover:bg-white/10"
              onClick={() => handleContextAction(folder.id)}
            >
              {folder.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default FileUpload;

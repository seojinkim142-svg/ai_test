import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import FolderDialog from "./FolderDialog";
import { SUPPORTED_UPLOAD_ACCEPT } from "../utils/document";
import { buildFolderAggregateDocId, buildFolderAggregateThumbnail } from "../utils/appShared";
import { getUiCopy } from "../utils/uiCopy";
import UploadTile from "./UploadTile";
import PdfTile from "./PdfTile";
import FolderTile from "./FolderTile";

const MB = 1024 * 1024;
const TIER_LABEL = {
  free: "Free",
  pro: "Pro",
  premium: "Family",
};

const formatUploadLimitText = (tier, maxPdfSizeBytes, copy) => {
  const safeBytes = Number(maxPdfSizeBytes) || 0;
  const sizeLabel = `${Math.max(1, Math.round(safeBytes / MB))}MB`;
  const tierLabel = copy?.planNames?.[tier] || TIER_LABEL[tier] || "Free";
  return copy?.upload?.limitText?.(tierLabel, sizeLabel) || `${tierLabel}: ${sizeLabel}`;
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
  onSelectFolderSummary,
  onCreateFolder,
  onRenameFolder,
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
  outputLanguage = "ko",
}) {
  const copy = getUiCopy(outputLanguage);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderFileInputRef = useRef(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState("create");
  const [folderModalId, setFolderModalId] = useState(null);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState(null); // 업로드 시 적용할 폴더 ID
  const [contextMenu, setContextMenu] = useState(null); // { x, y, uploadId }
  const contextMenuRef = useRef(null);
  const selectedFolderIdStr = selectedFolderId?.toString() || null;
  const normalizeFolderId = (fid) => (fid ? fid.toString() : null);
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);

  const folderItems = useMemo(
    () => folders.map((f) => ({ id: f.id, label: f.name || f.id })),
    [folders]
  );

  const handleOpenFolderModal = (folderId) => {
    setFolderModalId(folderId);
  };

  const handleOpenCreateFolderDialog = () => {
    setFolderDialogMode("create");
    setShowFolderDialog(true);
  };

  const handleOpenRenameFolderDialog = () => {
    if (!folderModalId) return;
    setFolderDialogMode("rename");
    setShowFolderDialog(true);
  };

  const handleCloseFolderDialog = () => {
    setShowFolderDialog(false);
    setFolderDialogMode("create");
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
  const folderAggregateDocId = useMemo(
    () => (folderModalId ? buildFolderAggregateDocId(folderModalId) : ""),
    [folderModalId]
  );
  const folderAggregateSize = useMemo(
    () => folderItemsList.reduce((sum, item) => sum + (Number(item?.size) || 0), 0),
    [folderItemsList]
  );
  const folderAggregateThumbnail = useMemo(
    () => buildFolderAggregateThumbnail(folderModalName),
    [folderModalName]
  );
  const folderDialogTitle = folderDialogMode === "rename" ? copy.upload.folderRenameTitle : copy.upload.folderCreateTitle;
  const folderDialogDescription =
    folderDialogMode === "rename" ? copy.upload.folderRenameDescription : copy.upload.folderCreateDescription;
  const folderDialogSubmitLabel = folderDialogMode === "rename" ? copy.upload.folderRenameSubmit : copy.upload.folderCreateSubmit;
  const folderDialogInitialValue = folderDialogMode === "rename" ? String(folderModalName || "") : "";

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
    () => formatUploadLimitText(currentTier, maxPdfSizeBytes, copy),
    [currentTier, maxPdfSizeBytes, copy]
  );
  const uploadGridClassName = isNativePlatform
    ? "relative mt-1 grid grid-cols-2 gap-3 sm:mt-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    : "relative mt-1 grid grid-cols-2 gap-3 sm:mt-2 sm:flex sm:flex-wrap";
  const emptyStateClassName = isNativePlatform
    ? "col-span-full flex min-h-[170px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-center text-sm text-slate-300 ring-1 ring-white/5"
    : "col-span-2 flex min-h-[170px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 text-center text-sm text-slate-300 ring-1 ring-white/5 sm:w-[260px] sm:flex-shrink-0";
  const folderModalGridClassName = isNativePlatform
    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
    : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

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
    const fallbackFolderId =
      folderModalId && folderModalId !== "all" && uploadTargetFolderId == null ? folderModalId : null;
    const resolvedFolderId = uploadTargetFolderId || fallbackFolderId;
    const target = resolvedFolderId && resolvedFolderId !== "all" ? resolvedFolderId : null;
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

  const handleTriggerFolderFileInput = () => {
    if (isGuest) {
      requestAuth();
      return;
    }
    folderFileInputRef.current?.click();
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      // 오른쪽 클릭으로 열린 컨텍스트 메뉴가 즉시 닫히지 않도록 우클릭은 무시
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
      <div className="px-1 text-sm text-slate-100">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-300">{uploadLimitText}</p>
          {!isFolderFeatureEnabled && (
            <p className="text-xs text-slate-400">{copy.upload.folderFeatureLocked}</p>
          )}
        </div>
      </div>

      <div className={uploadGridClassName}>
        <div className="relative h-full" ref={addMenuRef}>
          <UploadTile
            onFileChange={handleFileSelect}
            onOpenMenu={handleOpenAddMenu}
            inputRef={fileInputRef}
            compactGrid={isNativePlatform}
            title={copy.upload.addDocument}
            description={copy.upload.uploadPrompt}
            caption={copy.upload.previewPdfOnly}
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
                {copy.upload.addDocument}
              </button>
              <button
                type="button"
                className="px-4 py-3 text-left hover:bg-white/5 disabled:opacity-40"
                disabled={!isFolderFeatureEnabled}
                onClick={() => {
                  if (!isFolderFeatureEnabled) return;
                  handleOpenCreateFolderDialog();
                  setUploadTargetFolderId(null);
                  setShowAddMenu(false);
                }}
              >
                {copy.upload.createFolder}
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
                folderLabel={copy.upload.folderLabel}
                countLabel={copy.upload.filesCount(folderCounts.get(folder.id) || 0)}
                active={active}
                compactGrid={isNativePlatform}
                canDrop={false}
                onClick={() => handleOpenFolderModal(folder.id)}
                onDelete={() => onDeleteFolder?.(folder.id)}
                onAdd={() => fileInputRef.current?.click()}
                addButtonLabel={copy.upload.addNewFileHere}
                dragHighlight={false}
              />
            );
          })}

        {showEmptyState && (
          <div className={emptyStateClassName}>
            {selectedFolderId === "all"
              ? copy.upload.noFiles
              : copy.upload.noFilesInFolder}
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
              compactGrid={isNativePlatform}
              onProceed={() => onSelectFile?.(item)}
              onContextMenu={(e) => handleContextMenuUpload(e, item)}
              onDelete={() => onDeleteUpload?.(item)}
            />
          );
        })}
      </div>
      <FolderDialog
        open={showFolderDialog}
        onClose={handleCloseFolderDialog}
        title={folderDialogTitle}
        description={folderDialogDescription}
        submitLabel={folderDialogSubmitLabel}
        initialValue={folderDialogInitialValue}
        placeholder={copy.upload.folderPlaceholder}
        cancelLabel={copy.upload.cancel}
        onSubmit={(name) => {
          try {
            if (folderDialogMode === "rename" && folderModalId) {
              onRenameFolder?.(folderModalId, name);
            } else {
              onCreateFolder?.(name);
              onSelectFolder?.("all");
            }
          } finally {
            handleCloseFolderDialog();
          }
        }}
      />
      <input
        ref={folderFileInputRef}
        id="folder-document-upload"
        name="folder-document-upload"
        type="file"
        accept={SUPPORTED_UPLOAD_ACCEPT}
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {folderModalId && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"
          onClick={handleCloseFolderModal}
        >
          <div
            className="relative flex w-full max-w-6xl flex-col rounded-[1.75rem] border border-white/10 bg-slate-900/95 p-4 text-slate-100 shadow-2xl shadow-black/40 max-h-[88svh] min-h-[320px] sm:rounded-3xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleCloseFolderModal}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-lg text-slate-100 transition hover:border-white/30 hover:bg-white/10 hover:text-white sm:right-6 sm:top-6"
              aria-label={copy.upload.closeFolderAria}
              title={copy.upload.close}
            >
              ×
            </button>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold">{folderModalName}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 pr-12 sm:pr-14">
                <button
                  type="button"
                  onClick={handleOpenRenameFolderDialog}
                  className="ghost-button text-sm text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  {copy.upload.rename}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadTargetFolderId(folderModalId);
                    handleTriggerFolderFileInput();
                  }}
                  className="ghost-button text-sm text-emerald-100"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "52, 211, 153" }}
                >
                  {copy.upload.addDocumentToFolder}
                </button>
                <button
                  type="button"
                  onClick={handleCloseFolderModal}
                  className="ghost-button text-sm text-slate-200"
                  data-ghost-size="sm"
                  style={{ "--ghost-color": "148, 163, 184" }}
                >
                  {copy.upload.close}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto pr-1">
              <div className={folderModalGridClassName}>
                {!hasFolderItems && (
                  <button
                    type="button"
                    className="col-span-full flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-emerald-300/20 bg-white/5 p-6 text-center text-sm text-slate-300 transition hover:border-emerald-300/60 hover:bg-emerald-400/5"
                    onClick={() => {
                      setUploadTargetFolderId(folderModalId);
                      handleTriggerFolderFileInput();
                    }}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-200">
                      +
                    </div>
                    <p className="text-base font-semibold text-white">{copy.upload.addFileToFolder}</p>
                    <p className="max-w-md text-sm text-slate-300">
                      {copy.upload.emptyFolderDescription}
                    </p>
                  </button>
                )}
                {hasFolderItems && (
                  <PdfTile
                    key={folderAggregateDocId}
                    file={{
                      id: folderAggregateDocId,
                      name: copy.upload.folderSummaryName(folderModalName),
                      size: folderAggregateSize,
                    }}
                    thumbnailUrl={folderAggregateThumbnail}
                    active={selectedFileId === folderAggregateDocId}
                    selectable={false}
                    selected={false}
                    onToggleSelect={undefined}
                    draggable={false}
                    onDragStart={undefined}
                    onDragEnd={undefined}
                    compactGrid={isNativePlatform}
                    onProceed={() => {
                      handleCloseFolderModal();
                      onSelectFolderSummary?.(folderModalId);
                    }}
                    fullWidth
                    metaText={copy.upload.folderSummaryMeta(folderItemsList.length)}
                  />
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
                        compactGrid={isNativePlatform}
                      onProceed={() => {
                        handleCloseFolderModal();
                        onSelectFile?.(item);
                      }}
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
                {copy.upload.moveOutOfFolder}
              </button>
              <div className="my-1 h-px bg-white/10" />
            </>
          )}
          {folderItems.length === 0 && (
            <div className="px-4 py-2 text-xs text-slate-400">{copy.upload.noFolders}</div>
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

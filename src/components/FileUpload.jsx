import { useEffect, useMemo, useRef, useState } from "react";
import FolderDialog from "./FolderDialog";
import UploadTile from "./UploadTile";
import PdfTile from "./PdfTile";
import FolderTile from "./FolderTile";

const UNSORTED_ID = "unsorted";

function FileUpload({
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
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [draggingUploadId, setDraggingUploadId] = useState(null);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [folderModalId, setFolderModalId] = useState(null);

  const folderItems = useMemo(
    () => folders.map((f) => ({ id: f, label: f })),
    [folders]
  );

  const handleDrop = (event, folderId) => {
    event.preventDefault();
    event.stopPropagation();
    const uploadId =
      event.dataTransfer.getData("text/upload-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggingUploadId;
    if (!uploadId) return;
    const target = folderId === UNSORTED_ID ? null : folderId;
    onMoveUploads?.([uploadId], target);
    setDragOverFolder(null);
    setDraggingUploadId(null);
  };

  const handleOpenFolderModal = (folderId) => {
    setFolderModalId(folderId);
    onSelectFolder?.(folderId);
  };

  const handleCloseFolderModal = () => {
    setFolderModalId(null);
  };

  const handleDragStartUpload = (uploadId) => {
    setDraggingUploadId(uploadId);
  };

  const handleDragEndUpload = () => {
    setDraggingUploadId(null);
    setDragOverFolder(null);
  };

  const visibleUploads = useMemo(() => {
    if (!isFolderFeatureEnabled) return uploadedFiles;
    if (selectedFolderId === "all") return uploadedFiles.filter((u) => !u.folderId);
    // 기본 리스트에서는 폴더 항목을 숨김
    return [];
  }, [uploadedFiles, isFolderFeatureEnabled, selectedFolderId]);

  const folderItemsList = useMemo(
    () => (folderModalId ? uploadedFiles.filter((u) => u.folderId === folderModalId) : []),
    [uploadedFiles, folderModalId]
  );
  const hasFolderItems = folderItemsList.length > 0;

  const folderCounts = useMemo(() => {
    const map = new Map();
    uploadedFiles.forEach((u) => {
      if (!u.folderId) return;
      map.set(u.folderId, (map.get(u.folderId) || 0) + 1);
    });
    return map;
  }, [uploadedFiles]);

  return (
    <div className="col-span-2 flex flex-col gap-4">
      <div className="rounded-2xl bg-transparent px-0 py-0 text-sm text-slate-100">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!isFolderFeatureEnabled && <p className="text-xs text-slate-300">폴더 기능은 Pro/Premium에서 제공됩니다.</p>}
        </div>
      </div>

      <div className="relative mt-2 flex flex-wrap gap-3">
        <div className="relative">
          <UploadTile
            onFileChange={(e) => {
              setShowAddMenu(false);
              onFileChange?.(e);
            }}
            onOpenMenu={() => setShowAddMenu((prev) => !prev)}
            inputRef={fileInputRef}
          />
          {showAddMenu && (
            <div className="absolute left-0 top-full z-10 mt-2 flex w-48 flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/90 text-sm text-slate-100 shadow-lg ring-1 ring-white/10">
              <button
                type="button"
                className="px-4 py-3 text-left hover:bg-white/5"
                onClick={() => {
                  setShowAddMenu(false);
                  fileInputRef.current?.click();
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
            const active = selectedFolderId === folder.id;
            return (
              <FolderTile
                key={folder.id}
                name={folder.label}
                count={folderCounts.get(folder.id) || 0}
                active={active}
                canDrop
                onClick={() => handleOpenFolderModal(folder.id)}
                onDelete={() => onDeleteFolder?.(folder.id)}
                onDragEnter={() => setDragOverFolder(folder.id)}
                onDragLeave={() => setDragOverFolder(null)}
                onDrop={(e) => handleDrop(e, folder.id)}
                onAdd={() => fileInputRef.current?.click()}
                dragHighlight={dragOverFolder === folder.id}
              />
            );
          })}

        {visibleUploads.length === 0 && uploadedFiles.length === 0 && (
          <div className="flex min-h-[170px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300 ring-1 ring-white/5 sm:w-[260px] sm:flex-shrink-0">
            업로드한 PDF가 카드로 표시됩니다.
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
              onDragStart={(uploadId) => handleDragStartUpload(uploadId)}
              onDragEnd={handleDragEndUpload}
              onProceed={() => onSelectFile?.(item)}
            />
          );
        })}
      </div>
      <FolderDialog
        open={showFolderDialog}
        onClose={() => setShowFolderDialog(false)}
        onSubmit={(name) => {
          onCreateFolder?.(name);
          handleSelectFolder(name);
          setShowFolderDialog(false);
        }}
      />

      {folderModalId && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 py-8 backdrop-blur-sm">
          <div className="relative flex w-full max-w-6xl flex-col rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-slate-100 shadow-2xl shadow-black/40 aspect-[4/3] max-h-[80vh]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-300/80">Folder</p>
                <h3 className="text-xl font-semibold">{folderModalId}</h3>
              </div>
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
                        onDragStart={(uploadId) => handleDragStartUpload(uploadId)}
                        onDragEnd={handleDragEndUpload}
                        onProceed={() => onSelectFile?.(item)}
                        fullWidth
                      />
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileUpload;

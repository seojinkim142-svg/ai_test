import { useEffect, useMemo, useRef, useState } from "react";
import FolderDialog from "./FolderDialog";

const UNSORTED_ID = "unsorted";

function UploadTile({ onFileChange, onOpenMenu, inputRef }) {
  return (
    <div className="relative flex h-full min-h-[170px] w-full sm:w-[260px] sm:flex-shrink-0">
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 text-center transition hover:-translate-y-1 hover:border-emerald-300/60 hover:bg-emerald-400/5"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-2xl font-bold text-emerald-200">
          +
        </div>
        <p className="text-base font-semibold text-white">새 PDF 추가</p>
        <p className="max-w-xs text-sm text-slate-200">클릭하거나 끌어와서 업로드</p>
        <p className="max-w-xs text-xs text-slate-400">최대 30페이지까지 읽습니다(추가 페이지는 무시)</p>
      </button>
      <input
        ref={inputRef}
        id="pdf"
        name="pdf"
        type="file"
        accept="application/pdf"
        multiple
        onChange={onFileChange}
        className="hidden"
      />
    </div>
  );
}

function PdfTile({
  file,
  thumbnailUrl,
  pageInfo,
  isLoadingText,
  onProceed,
  active = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  draggable = false,
  onDragStart,
}) {
  return (
    <div
      className={`group flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-2xl border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 sm:w-[260px] sm:flex-shrink-0 ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      } ${selectable ? "cursor-pointer" : ""}`}
      onClick={onProceed}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData("text/upload-id", file?.id || file?.name || "");
        onDragStart?.(e);
      }}
    >
      <div className="relative h-32 w-full bg-slate-800">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="PDF 썸네일 미리보기" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-300">썸네일 생성 중...</div>
        )}
        {isLoadingText && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-500/80 px-2 py-1 text-[11px] font-semibold text-emerald-950">
            추출 중...
          </span>
        )}
        {selectable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition ${
              selected
                ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                : "border-white/30 bg-black/40 text-white/80 hover:border-emerald-300 hover:text-emerald-100"
            }`}
          >
            {selected ? "✓" : "□"}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <p className="truncate text-sm font-semibold text-white">{file?.name}</p>
        <p className="text-xs text-slate-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · PDF` : "PDF"}</p>
        {pageInfo?.total > 0 && (
          <p className="text-xs text-emerald-200">
            {pageInfo.used} / {pageInfo.total} 페이지 사용
          </p>
        )}
      </div>
    </div>
  );
}

function FolderTile({ name, count, active, onClick, onDelete, onDragOver, onDrop, canDrop, onAdd }) {
  return (
    <div
      className={`group flex h-full min-h-[190px] w-full flex-col overflow-hidden rounded-2xl border bg-slate-900/70 text-left shadow-lg shadow-black/30 ring-1 transition hover:-translate-y-1 hover:border-emerald-300/50 hover:ring-emerald-300/40 sm:w-[260px] sm:flex-shrink-0 ${
        active ? "border-emerald-300/60 ring-emerald-300/50" : "border-white/10 ring-white/5"
      } ${canDrop ? "cursor-pointer" : ""}`}
      onClick={onClick}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        if (!canDrop) return;
        onDrop?.(e);
      }}
    >
      <div className="flex flex-1 flex-col justify-between px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-xl text-emerald-200">
            📁
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[11px] text-slate-200 opacity-80 transition hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
        <div className="mt-4">
          <p className="truncate text-base font-semibold text-white">{name}</p>
          <p className="text-xs text-slate-300">{count}개 파일</p>
          {active && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAdd?.();
              }}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-100 underline underline-offset-4 hover:text-emerald-50"
            >
              이 폴더에 파일 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [moveTarget, setMoveTarget] = useState(UNSORTED_ID);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);

  const folderItems = useMemo(
    () => folders.map((f) => ({ id: f, label: f })),
    [folders]
  );

  const handleDrop = (event, folderId) => {
    event.preventDefault();
    const uploadId = event.dataTransfer.getData("text/upload-id");
    if (!uploadId) return;
    const target = folderId === UNSORTED_ID ? null : folderId;
    onMoveUploads?.([uploadId], target);
  };

  const handleSelectFolder = (folderId) => {
    const next = selectedFolderId === folderId ? "all" : folderId;
    onSelectFolder?.(next);
    onClearSelection?.();
  };

  const visibleUploads = useMemo(() => uploadedFiles, [uploadedFiles]);

  const folderCounts = useMemo(() => {
    const map = new Map();
    uploadedFiles.forEach((u) => {
      if (!u.folderId) return;
      map.set(u.folderId, (map.get(u.folderId) || 0) + 1);
    });
    return map;
  }, [uploadedFiles]);

  useEffect(() => {
    if (selectedFolderId && selectedFolderId !== "all") {
      setMoveTarget(selectedFolderId);
    } else if (folders.length > 0) {
      setMoveTarget(folders[0]);
    } else {
      setMoveTarget(UNSORTED_ID);
    }
  }, [selectedFolderId, folders]);

  const hasSelection = selectedUploadIds.length > 0;

  return (
    <div className="col-span-2 flex flex-col gap-4">
      <div className="rounded-2xl bg-transparent px-0 py-0 text-sm text-slate-100">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!isFolderFeatureEnabled && <p className="text-xs text-slate-300">폴더 기능은 Pro/Premium에서 제공됩니다.</p>}
        </div>

        {hasSelection && isFolderFeatureEnabled && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
            <span className="font-semibold">{selectedUploadIds.length}개 선택됨</span>
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-slate-100 outline-none focus:border-emerald-300/60 focus:ring-1 focus:ring-emerald-300/40"
            >
              <option value={UNSORTED_ID}>정리 안 됨</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onMoveUploads?.(selectedUploadIds, moveTarget === UNSORTED_ID ? null : moveTarget)}
              className="ghost-button text-xs text-emerald-100"
              data-ghost-size="sm"
              style={{ "--ghost-color": "16, 185, 129" }}
            >
              선택 이동
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              className="ghost-button text-xs text-slate-200"
              data-ghost-size="sm"
              style={{ "--ghost-color": "148, 163, 184" }}
            >
              선택 해제
            </button>
          </div>
        )}
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
                onClick={() => handleSelectFolder(folder.id)}
                onDelete={() => onDeleteFolder?.(folder.id)}
                onDrop={(e) => handleDrop(e, folder.id)}
                onAdd={() => fileInputRef.current?.click()}
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
          return (
            <PdfTile
              key={item.id}
              file={item.file || { name: item.name, size: item.size, id: item.id }}
              thumbnailUrl={item.thumbnail || thumbnailUrl}
              pageInfo={file && item.file && file.name === item.file.name ? pageInfo : null}
              isLoadingText={isLoadingText && file && item.file && file.name === item.file.name}
              active={isActive}
              selectable={isFolderFeatureEnabled}
              selected={isSelected}
              onToggleSelect={() => onToggleUploadSelect?.(item.id)}
              draggable={isFolderFeatureEnabled}
              onDragStart={(e) => e.dataTransfer.setData("text/upload-id", item.id)}
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
    </div>
  );
}

export default FileUpload;

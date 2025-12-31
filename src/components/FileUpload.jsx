import { useMemo, useRef, useState } from "react";
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
  const [newFolder, setNewFolder] = useState("");
  const [moveTarget, setMoveTarget] = useState(UNSORTED_ID);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const fileInputRef = useRef(null);
  const [showFolderDialog, setShowFolderDialog] = useState(false);

  const folderItems = useMemo(
    () => [
      { id: "all", label: "전체" },
      { id: UNSORTED_ID, label: "정리 안 됨" },
      ...folders.map((f) => ({ id: f, label: f })),
    ],
    [folders]
  );

  const handleDrop = (event, folderId) => {
    event.preventDefault();
    const uploadId = event.dataTransfer.getData("text/upload-id");
    if (!uploadId) return;
    const target = folderId === UNSORTED_ID ? null : folderId;
    onMoveUploads?.([uploadId], target);
  };

  const hasSelection = selectedUploadIds.length > 0;

  return (
    <div className="col-span-2 flex flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 ring-1 ring-white/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {folderItems.map((folder) => {
              const active = selectedFolderId === folder.id;
              const canDrop = isFolderFeatureEnabled && folder.id !== "all";
              return (
                <div
                  key={folder.id}
                  onClick={() => onSelectFolder?.(folder.id)}
                  onDragOver={(e) => {
                    if (!canDrop) return;
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    if (!canDrop) return;
                    handleDrop(e, folder.id);
                  }}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    active ? "border-emerald-300 bg-emerald-500/10 text-emerald-100" : "border-white/10 bg-white/5 text-slate-200"
                  } ${canDrop ? "cursor-pointer" : ""}`}
                >
                  <span>{folder.label}</span>
                  {folder.id !== "all" && folder.id !== UNSORTED_ID && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder?.(folder.id);
                      }}
                      className="text-[10px] text-slate-300 hover:text-red-300"
                    >
                      삭제
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isFolderFeatureEnabled ? (
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                placeholder="새 폴더 이름"
                className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-xs text-slate-100 outline-none ring-1 ring-transparent transition focus:border-emerald-300/60 focus:ring-emerald-300/40"
              />
              <button
                type="button"
                onClick={() => {
                  onCreateFolder?.(newFolder);
                  setNewFolder("");
                }}
                className="ghost-button text-xs text-emerald-100"
                data-ghost-size="sm"
                style={{ "--ghost-color": "52, 211, 153" }}
              >
                폴더 생성
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-300">폴더 기능은 Pro/Premium에서 제공됩니다.</p>
          )}
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
        {uploadedFiles.length === 0 && (
          <div className="flex min-h-[170px] w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-slate-300 ring-1 ring-white/5 sm:w-[260px] sm:flex-shrink-0">
            업로드한 PDF가 카드로 표시됩니다.
          </div>
        )}
        {uploadedFiles.map((item) => {
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
          setShowFolderDialog(false);
        }}
      />
    </div>
  );
}

export default FileUpload;

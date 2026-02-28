import { Suspense, lazy, memo, useCallback, useRef } from "react";
import PromoIntro from "../components/PromoIntro";

const FileUpload = lazy(() => import("../components/FileUpload"));

const StartPage = memo(function StartPage({
  file,
  pageInfo,
  isLoadingText,
  thumbnailUrl,
  uploadedFiles,
  onSelectFile,
  onFileChange,
  selectedFileId,
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  selectedUploadIds,
  onToggleUploadSelect,
  onMoveUploads,
  onClearSelection,
  isFolderFeatureEnabled,
  onDeleteUpload,
  isGuest = false,
  onRequireAuth,
  currentTier = "free",
  maxPdfSizeBytes = 0,
}) {
  const uploadRef = useRef(null);

  const handleStart = useCallback(() => {
    if (isGuest) {
      onRequireAuth?.();
      return;
    }
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isGuest, onRequireAuth]);

  return (
    <section className="grid grid-cols-1 gap-6">
      {isGuest && <PromoIntro onStart={handleStart} />}
      {!isGuest && (
        <Suspense fallback={<div className="min-h-[40vh]" />}>
          <div ref={uploadRef} className="scroll-mt-24">
            <FileUpload
              file={file}
              pageInfo={pageInfo}
              isLoadingText={isLoadingText}
              thumbnailUrl={thumbnailUrl}
              uploadedFiles={uploadedFiles}
              onSelectFile={onSelectFile}
              onFileChange={onFileChange}
              selectedFileId={selectedFileId}
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              selectedUploadIds={selectedUploadIds}
              onToggleUploadSelect={onToggleUploadSelect}
              onMoveUploads={onMoveUploads}
              onClearSelection={onClearSelection}
              isFolderFeatureEnabled={isFolderFeatureEnabled}
              onDeleteUpload={onDeleteUpload}
              isGuest={isGuest}
              onRequireAuth={onRequireAuth}
              currentTier={currentTier}
              maxPdfSizeBytes={maxPdfSizeBytes}
            />
          </div>
        </Suspense>
      )}
    </section>
  );
});

export default StartPage;

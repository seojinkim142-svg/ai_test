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
  onSelectFolderSummary,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  selectedUploadIds,
  onToggleUploadSelect,
  onMoveUploads,
  onClearSelection,
  isFolderFeatureEnabled,
  isFolderLoading = false,
  onDeleteUpload,
  isGuest = false,
  showIntro = false,
  skipPromoSplash = false,
  onIntroDone,
  onRequireAuth,
  currentTier = "free",
  maxPdfSizeBytes = 0,
  outputLanguage = "ko",
  setOutputLanguage,
  // 의미론적 검색
  onSemanticSearch,
  semanticSearchResults,
  isSemanticSearching,
  // 문서 비교
  onCompare,
  compareResult,
  isComparing,
  compareError,
  // 학습 현황
  allArtifacts,
  sidebarOpen = false,
  // 폴더 통합 퀴즈
  onFolderStudy,
}) {
  const uploadRef = useRef(null);
  const showPromo = isGuest || showIntro;

  const handleStart = useCallback(() => {
    if (isGuest) {
      onRequireAuth?.();
      return;
    }
    onIntroDone?.();
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isGuest, onIntroDone, onRequireAuth]);

  return (
    <section className="grid grid-cols-1 gap-6">
      {showPromo && (
        <PromoIntro
          onStart={handleStart}
          skipSplash={skipPromoSplash}
          outputLanguage={outputLanguage}
          setOutputLanguage={setOutputLanguage}
        />
      )}
      {!isGuest && !showPromo && (
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
              onSelectFolderSummary={onSelectFolderSummary}
              onCreateFolder={onCreateFolder}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              selectedUploadIds={selectedUploadIds}
              onToggleUploadSelect={onToggleUploadSelect}
              onMoveUploads={onMoveUploads}
              onClearSelection={onClearSelection}
              isFolderFeatureEnabled={isFolderFeatureEnabled}
              isFolderLoading={isFolderLoading}
              onDeleteUpload={onDeleteUpload}
              isGuest={isGuest}
              onRequireAuth={onRequireAuth}
              currentTier={currentTier}
              maxPdfSizeBytes={maxPdfSizeBytes}
              outputLanguage={outputLanguage}
              onSemanticSearch={onSemanticSearch}
              semanticSearchResults={semanticSearchResults}
              isSemanticSearching={isSemanticSearching}
              onCompare={onCompare}
              compareResult={compareResult}
              isComparing={isComparing}
              compareError={compareError}
              allArtifacts={allArtifacts}
              sidebarOpen={sidebarOpen}
              onFolderStudy={onFolderStudy}
            />
          </div>
        </Suspense>
      )}
    </section>
  );
});

export default StartPage;

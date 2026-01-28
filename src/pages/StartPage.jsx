import FileUpload from "../components/FileUpload";

export default function StartPage({
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
}) {
  return (
    <section className="grid grid-cols-1 gap-4">
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
      />
    </section>
  );
}

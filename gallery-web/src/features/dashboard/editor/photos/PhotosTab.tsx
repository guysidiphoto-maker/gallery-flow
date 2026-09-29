import { useEditor } from '../EditorContext'
import { UploadProgressStrip } from '../UploadProgressStrip'
import { usePhotoGridUI } from './usePhotoGridUI'
import { PhotosToolbar } from './PhotosToolbar'
import { BulkActionsBar } from './BulkActionsBar'
import { PhotoGrid } from './PhotoGrid'
import { PhotosEmptyState } from './PhotosEmptyState'

// Photos tab: the whole pane accepts drag-dropped files for upload.
export function PhotosTab() {
  const { session, upload, photos } = useEditor()
  const { galleryImages, activeSectionId, editingGallery } = session
  const { uploading, uploadBatch, handleFileUpload } = upload
  const ui = usePhotoGridUI({ activeSectionId, selectMode: photos.selectMode, galleryId: editingGallery?.id })

  return (
    <div
      onDragOver={e => { e.preventDefault() }}
      onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files) }}
      className="min-h-full"
    >
      <PhotosToolbar />

      {photos.selectMode && <BulkActionsBar />}

      {uploading && uploadBatch && (
        <UploadProgressStrip
          label={<span>מעלה {uploadBatch.completed} / {uploadBatch.total}</span>}
          aside={uploadBatch.failed > 0 && (
            <span className="text-amber">{uploadBatch.failed} נכשלו</span>
          )}
          pct={Math.round((uploadBatch.completed / Math.max(1, uploadBatch.total)) * 100)}
        />
      )}

      <PhotoGrid ui={ui} />
      {galleryImages.length === 0 && !uploading && <PhotosEmptyState />}
    </div>
  )
}

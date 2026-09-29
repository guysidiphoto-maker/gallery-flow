import { Viewer } from '@/features/viewer/components/Lightbox'
import { useEditor } from '../EditorContext'

// Full-screen preview of a photo; mounted only while open.
export function PhotoLightbox() {
  const { photos } = useEditor()
  const { viewerImages, viewerIndex, setViewerImages, setViewerIndex, downloadOriginal } = photos
  if (!viewerImages) return null
  return (
    <Viewer
      images={viewerImages}
      index={viewerIndex}
      imgBucket="gallery-images"
      allowDownloads
      downloadLabel="הורד"
      onClose={() => setViewerImages(null)}
      onNavigate={(i) => setViewerIndex(i)}
      onDownload={(img) => { void downloadOriginal(img.id) }}
    />
  )
}

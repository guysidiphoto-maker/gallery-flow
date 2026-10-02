import { signedStorageUrl } from '@/shared/lib/signedStorage'

// Resolves a (signed) URL for the image and triggers a browser download.
// storage_path is a display copy, so the original wins whenever the row has one.
export async function downloadImage(img: {
  storage_path: string
  original_path?: string | null
  filename: string
}): Promise<void> {
  const url = await signedStorageUrl('gallery-images', img.original_path || img.storage_path)
  const a = document.createElement('a')
  a.href = url; a.download = img.filename || 'photo.jpg'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

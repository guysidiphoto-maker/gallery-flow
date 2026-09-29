import { signedStorageUrl } from '@/shared/lib/signedStorage'

// Resolves a (signed) URL for the image and triggers a browser download.
export async function downloadImage(img: { storage_path: string; filename: string }): Promise<void> {
  const url = await signedStorageUrl('gallery-images', img.storage_path)
  const a = document.createElement('a')
  a.href = url; a.download = img.filename || 'photo.jpg'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

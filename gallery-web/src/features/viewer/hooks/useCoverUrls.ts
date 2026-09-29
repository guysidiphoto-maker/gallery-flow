import { useEffect, useState } from 'react'
import { storageUrl } from '@/shared/lib/supabase'
import { signedStorageUrl } from '@/shared/lib/signedStorage'
import type { GalleryImage } from '@/shared/types'
import { findCoverImage } from '../lib/galleryImages'

/**
 * Cover URLs for the welcome screen and hero: the dashboard-picked coverImageUrl
 * (or its image by id/filename), and the strict id match. Both honour the cover toggle.
 */
export function useCoverUrls(rec: Record<string, unknown>, images: GalleryImage[], imgBucket: string, coverEnabled: boolean) {
  const coverImageId = (rec.coverImageId as string | null | undefined) ?? null
  const coverImageUrlSetting = (rec.coverImageUrl as string | null | undefined) ?? null
  const coverImage = coverImageId ? images.find(img => img.id === coverImageId) ?? null : null
  const coverImgForResolve = findCoverImage(images, coverImageId)

  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | null>(
    coverImageUrlSetting
      ?? (coverImgForResolve ? storageUrl(imgBucket, coverImgForResolve.storage_path) : null),
  )
  useEffect(() => {
    if (coverImageUrlSetting) {
      setResolvedCoverUrl(coverImageUrlSetting); return
    }
    if (!coverImgForResolve) { setResolvedCoverUrl(null); return }
    let cancelled = false
    signedStorageUrl(imgBucket, coverImgForResolve.storage_path)
      .then(url => { if (!cancelled) setResolvedCoverUrl(url) })
      .catch(() => { /* fallback handled by helper */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgBucket, coverImgForResolve?.storage_path, coverImageUrlSetting])

  const [coverUrl, setCoverUrl] = useState<string | null>(
    coverImage ? storageUrl(imgBucket, coverImage.storage_path) : null,
  )
  useEffect(() => {
    if (!coverImage) { setCoverUrl(null); return }
    let cancelled = false
    signedStorageUrl(imgBucket, coverImage.storage_path)
      .then(url => { if (!cancelled) setCoverUrl(url) })
      .catch(() => { /* fallback handled by helper */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgBucket, coverImage?.storage_path])

  return {
    resolvedCoverUrl: coverEnabled ? resolvedCoverUrl : null,
    coverUrl: coverEnabled ? coverUrl : null,
  }
}

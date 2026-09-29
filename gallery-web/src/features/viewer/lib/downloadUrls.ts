import { storageUrl } from '@/shared/lib/supabase'
import { isPublicViewerSignedUrlsEnabled, readPublicSessionToken } from '@/shared/lib/publicSession'
import { signedStorageUrl, signedWatermarkedUrl } from '@/shared/lib/signedStorage'
import { getStoredToken } from '@/shared/gallery/galleryClient'
import type { GalleryImage } from '@/shared/types'

export interface DownloadUrlContext {
  imgBucket: string
  /** downloadQuality === 'original' */
  wantsHd: boolean
  watermarkEnabled: boolean
  businessId: string | undefined
  galleryId: string | undefined
}

export interface ResolvedDownload { url: string; downgraded: boolean }

/**
 * Pre-signed-URL download URL (public storage or watermark engine). Only used by
 * the client-side ZIP fallback while the signed-URL flag is off.
 */
export function legacyDownloadUrl(img: GalleryImage, ctx: DownloadUrlContext): string {
  const path = ctx.wantsHd
    ? (img.original_uploaded && img.original_path ? img.original_path : img.storage_path)
    : img.storage_path
  if (ctx.watermarkEnabled && ctx.businessId) return signedWatermarkedUrl(path, ctx.businessId)
  if (ctx.wantsHd && img.original_path && img.original_uploaded) return storageUrl(ctx.imgBucket, img.original_path)
  return storageUrl(ctx.imgBucket, img.storage_path)
}

/**
 * Authorized download URL for one image. Trusts storage over the stale
 * `original_uploaded` flag: HD only downgrades to the web copy when the
 * original is genuinely missing. Watermarked galleries route through /api/watermark.
 */
export async function resolveDownloadUrl(img: GalleryImage, ctx: DownloadUrlContext): Promise<ResolvedDownload> {
  const { imgBucket, wantsHd, galleryId } = ctx
  const businessId = ctx.businessId ?? ''
  // pvt proves a real viewer, unlockToken a password unlock; passed explicitly
  // so the download path is deterministic.
  const signedOpts = galleryId
    ? {
        pvt: readPublicSessionToken(galleryId) ?? undefined,
        unlockToken: getStoredToken(galleryId) ?? undefined,
      }
    : {}
  const watermarkUrl = (path: string): string =>
    ctx.watermarkEnabled && businessId
      ? signedWatermarkedUrl(path, businessId, signedOpts.pvt, signedOpts.unlockToken)
      : ''
  const sign = (path: string, extra?: { fallbackToPublic: boolean }) =>
    signedStorageUrl(imgBucket, path, extra ? { ...signedOpts, ...extra } : signedOpts)
  const direct = async (path: string): Promise<ResolvedDownload> =>
    ({ url: watermarkUrl(path) || await sign(path), downgraded: false })
  const webCopy = async (): Promise<ResolvedDownload> =>
    ({ url: await sign(img.storage_path), downgraded: true })

  if (!wantsHd || !img.original_path) {
    return direct(wantsHd ? (img.original_uploaded ? img.original_path! : img.storage_path) : img.storage_path)
  }

  const original = img.original_path
  const wm = watermarkUrl(original)
  if (wm) return { url: wm, downgraded: false }

  if (isPublicViewerSignedUrlsEnabled()) {
    // Never HEAD the public URL here: on a private bucket it always 403s and
    // would wrongly downgrade. Only a real sign failure falls back.
    try {
      return { url: await sign(original, { fallbackToPublic: false }), downgraded: false }
    } catch {
      return webCopy()
    }
  }

  // Flag off: HEAD the public original; a network blip counts as present.
  let present: boolean
  try {
    present = (await fetch(storageUrl(imgBucket, original), { method: 'HEAD' })).ok
  } catch {
    present = true
  }
  return present ? { url: await sign(original), downgraded: false } : webCopy()
}

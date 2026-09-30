import { isPublicViewerSignedUrlsEnabled, readPublicSessionToken } from '@/shared/lib/publicSession'
import { getStoredToken } from '@/shared/data/publicGallery'
import type { GalleryImage } from '@/shared/types'
import { legacyDownloadUrl, resolveDownloadUrl, type DownloadUrlContext } from './downloadUrls'
import { anchorDownload } from './fileSave'

export interface BatchDownloadUi {
  setLabel: (label: string | null) => void
  setProgress: (p: { current: number; total: number } | null) => void
  notice: (msg: string) => void
}

interface BatchOptions {
  ctx: DownloadUrlContext
  isMobile: boolean
  galleryTitle: string
  watermarkEnabled: boolean
  someOriginalsStillUploading?: string
}

/**
 * Mobile: one multi-file share sheet ("Save N images"). Otherwise a ZIP: built
 * server-side by /api/gallery-zip when signed URLs are on, else with JSZip.
 */
export async function runBatchDownload(imgs: GalleryImage[], opts: BatchOptions, ui: BatchDownloadUi) {
  const { ctx, isMobile, galleryTitle } = opts
  // Resolve (and HEAD-check) every URL up front so stale flags can't silently downgrade.
  ui.setLabel(`Checking ${imgs.length} files...`)
  const resolved = await Promise.all(imgs.map(img => resolveDownloadUrl(img, ctx)))
  const downgradedCount = resolved.filter(r => r.downgraded).length
  if (downgradedCount > 0) {
    ui.notice(opts.someOriginalsStillUploading ?? `${downgradedCount} HD originals are still uploading — those photos saved as web-quality. Try the batch again in a few minutes for full HD.`)
  }

  if (isMobile && navigator.share) {
    ui.setLabel(`Preparing ${imgs.length} photos...`)
    ui.setProgress({ current: 0, total: imgs.length })
    try {
      const files: File[] = []
      for (let i = 0; i < imgs.length; i++) {
        ui.setLabel(`Loading ${i + 1} / ${imgs.length}...`)
        ui.setProgress({ current: i + 1, total: imgs.length })
        try {
          const res = await fetch(resolved[i].url)
          const blob = await res.blob()
          const cleanName = imgs[i].filename.replace(/\.[^.]+$/, '') + '.jpg'
          files.push(new File([blob], cleanName, { type: 'image/jpeg' }))
        } catch { /* skip failed image */ }
      }
      if (files.length > 0) {
        ui.setLabel(null)
        ui.setProgress(null)
        if (navigator.canShare && navigator.canShare({ files })) {
          await navigator.share({ files, title: galleryTitle })
          return
        }
      }
    } catch {
      // Cancelled or failed: fall through to the ZIP.
    } finally {
      ui.setLabel(null)
      ui.setProgress(null)
    }
  }

  ui.setLabel(`Preparing ${imgs.length} photos...`)
  ui.setProgress({ current: 0, total: imgs.length })
  const safeTitle = (galleryTitle || 'gallery').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'gallery'

  if (isPublicViewerSignedUrlsEnabled() && ctx.galleryId) {
    try {
      const pvt = readPublicSessionToken(ctx.galleryId) ?? ''
      if (!pvt) throw new Error('no_pvt')
      const res = await fetch('/api/gallery-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          galleryId: ctx.galleryId,
          imageIds: imgs.map(i => i.id),
          pvt,
          unlockToken: getStoredToken(ctx.galleryId) ?? undefined,
          quality: ctx.wantsHd ? 'original' : 'web',
          filenameStem: safeTitle,
          watermark: opts.watermarkEnabled,
        }),
      })
      if (!res.ok) throw new Error(`zip_${res.status}`)
      const blob = await res.blob()
      anchorDownload(URL.createObjectURL(blob), `${safeTitle}.zip`)
      return
    } catch (err) {
      // The JSZip fallback below keeps the progress UI, so don't clear it here.
      console.warn('[gallery-zip] server-side failed, falling back to JSZip:', err)
    }
  }

  try {
    // Dynamic import keeps JSZip out of the LCP-critical viewer bundle.
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (let i = 0; i < imgs.length; i++) {
      ui.setLabel(`Downloading ${i + 1} / ${imgs.length}...`)
      ui.setProgress({ current: i + 1, total: imgs.length })
      try {
        const fetchUrl = isPublicViewerSignedUrlsEnabled()
          ? (await resolveDownloadUrl(imgs[i], ctx)).url
          : legacyDownloadUrl(imgs[i], ctx)
        const res = await fetch(fetchUrl)
        const blob = await res.blob()
        let name = imgs[i].filename || `photo-${i + 1}.jpg`
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf('.')
          const base = dot > 0 ? name.slice(0, dot) : name
          const ext = dot > 0 ? name.slice(dot) : ''
          name = `${base}-${i + 1}${ext}`
        }
        usedNames.add(name)
        zip.file(name, blob)
      } catch { /* skip failed image */ }
    }
    ui.setLabel(`Creating ZIP...`)
    const zipBlob = await zip.generateAsync(
      { type: 'blob' },
      (meta) => ui.setLabel(`Creating ZIP ${Math.round(meta.percent)}%...`),
    )
    anchorDownload(URL.createObjectURL(zipBlob), `${safeTitle}.zip`)
  } catch (err) {
    console.error('ZIP download failed:', err)
    ui.notice(document.documentElement.dir === 'rtl'
      ? 'הורדת ה-ZIP נכשלה. נסה שוב, ואם זה חוזר, פנה לצלם.'
      : 'ZIP download failed. Try again — if it keeps failing, contact the photographer.')
  } finally {
    ui.setLabel(null)
    ui.setProgress(null)
  }
}

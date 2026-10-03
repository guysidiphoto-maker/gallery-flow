import { useEffect, useRef, useState } from 'react'
import { logDownload, logBatchDownload } from '@/features/dashboard/lib/activityLog'
import type { Gallery, GalleryImage } from '@/shared/types'
import type { t } from '@/shared/i18n/viewerStrings'
import {
  downloadFileName, downloadCacheKey, pickDownloadPath, shouldWarmDownload, classifyDownloadError, keysOverCap,
  type DownloadQuality,
} from '../lib/mobileViewer'
import { resolveDownloadUrl, type DownloadUrlContext } from '../lib/downloadUrls'
import { fetchAndSave, shareOrSaveFile } from '../lib/fileSave'
import { runBatchDownload } from '../lib/batchDownload'
import type { ViewerSettings } from '../lib/viewerSettings'
import { useDownloadGate } from './useDownloadGate'

// Bounds memory for Files kept for a repeat tap.
const MAX_DOWNLOAD_CACHE = 12

type ViewerTexts = ReturnType<typeof t>

/**
 * Single + batch downloads. The download file is only fetched once a finger
 * lands on a download button, never while guests browse. iOS needs
 * navigator.share() called synchronously in the tap, so a slow first fetch may
 * need a second tap, which then opens the share sheet from the cached File.
 */
export function useDownloads(opts: {
  gallery: Gallery | null
  settings: ViewerSettings
  viewerIndex: number | null
  isMobile: boolean
  txt: ViewerTexts
}) {
  const { gallery, settings, viewerIndex, isMobile, txt } = opts
  const { downloadsEnabled, downloadQuality, galleryTitle } = settings
  const gate = useDownloadGate(gallery?.id, settings.trackDownloads)

  const [savingPhoto, setSavingPhoto] = useState(false)
  const [photoSaved, setPhotoSaved] = useState(false)
  const [hdNotice, setHdNotice] = useState<string | null>(null)
  const [dlProgress, setDlProgress] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null)

  // Files keyed by downloadCacheKey. The tap awaits an in-flight warm instead of fetching the file twice.
  const downloadFileCache = useRef<Map<string, { file: File }>>(new Map())
  const downloadPrefetchInflight = useRef<Map<string, Promise<File | null>>>(new Map())
  const downloadPrefetchAborts = useRef<Map<string, AbortController>>(new Map())

  const urlCtx: DownloadUrlContext = {
    imgBucket: settings.imgBucket,
    wantsHd: downloadQuality === 'original',
    watermarkEnabled: settings.watermarkEnabled,
    businessId: gallery?.business_id,
    galleryId: gallery?.id,
  }
  const currentQuality = (): DownloadQuality => (downloadQuality === 'original' ? 'original' : 'web')

  function showHdNotice(msg: string) {
    setHdNotice(msg)
    setTimeout(() => setHdNotice(prev => prev === msg ? null : prev), 4000)
  }

  function flashSaved() {
    setPhotoSaved(true)
    setTimeout(() => setPhotoSaved(false), 1600)
  }

  /** Map keeps insertion order, so the oldest warmed File is evicted first. */
  function cacheDownloadFile(key: string, file: File) {
    downloadFileCache.current.set(key, { file })
    for (const stale of keysOverCap([...downloadFileCache.current.keys()], MAX_DOWNLOAD_CACHE)) {
      downloadFileCache.current.delete(stale)
    }
  }

  /** Best-effort warm; the cached File holds the bytes, so it outlives the signed URL. */
  function prefetchDownloadFile(img: GalleryImage): Promise<File | null> {
    const key = downloadCacheKey(img.id, currentQuality())
    const cached = downloadFileCache.current.get(key)
    if (cached) return Promise.resolve(cached.file)
    const inflight = downloadPrefetchInflight.current.get(key)
    if (inflight) return inflight
    const controller = new AbortController()
    downloadPrefetchAborts.current.set(key, controller)
    const warm = (async () => {
      try {
        const { url } = await resolveDownloadUrl(img, urlCtx)
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) return null
        const blob = await res.blob()
        if (controller.signal.aborted) return null
        const file = new File([blob], downloadFileName(img.filename), { type: 'image/jpeg' })
        cacheDownloadFile(key, file)
        return file
      } catch {
        return null // best-effort (incl. AbortError): the tap fetches on demand
      } finally {
        downloadPrefetchInflight.current.delete(key)
        downloadPrefetchAborts.current.delete(key)
      }
    })()
    downloadPrefetchInflight.current.set(key, warm)
    return warm
  }

  /** A finger landed on a download button: start fetching ahead of the tap. */
  function warmDownload(img: GalleryImage) {
    if (!img?.id || !shouldWarmDownload({ isMobile, downloadsEnabled })) return
    void prefetchDownloadFile(img)
  }

  // On lightbox close, abort warms still in flight and drop cached Files.
  useEffect(() => {
    if (viewerIndex !== null) return
    downloadPrefetchAborts.current.forEach(c => c.abort())
    downloadPrefetchAborts.current.clear()
    downloadPrefetchInflight.current.clear()
    downloadFileCache.current.clear()
  }, [viewerIndex])

  const saveFailed = () => showHdNotice(txt.saveFailed ?? 'Save failed — tap Save to try again.')
  const originalStillUploading = () =>
    showHdNotice(txt.originalStillUploading ?? 'HD copy still uploading — saved web-quality version. Try again in a few minutes.')

  function handleImageDownload(img: GalleryImage) {
    if (savingPhoto) return
    if (!gate.ensureDownloaderEmail(() => handleImageDownload(img))) return
    const quality = currentQuality()
    const cached = isMobile ? downloadFileCache.current.get(downloadCacheKey(img.id, quality)) : undefined
    const canShareFiles = !!cached && !!navigator.share && !!navigator.canShare?.({ files: [cached.file] })

    if (pickDownloadPath({ isMobile, canShareFiles, hasPrefetchedFile: !!cached }) === 'share-sync' && cached) {
      // No await before share(): the sheet must open from the original tap gesture.
      setSavingPhoto(true)
      navigator.share({ files: [cached.file], title: galleryTitle })
        .then(() => {
          flashSaved()
          if (gallery) void logDownload(gallery.id, img.id, quality, 'single', gate.downloaderRef.current)
        })
        .catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return
          saveFailed()
        })
        .finally(() => setSavingPhoto(false))
      return
    }
    void handleImageDownloadAsync(img, quality)
  }

  /** Desktop, or a mobile tap before the File warmed: caching it makes the next tap instant. */
  async function handleImageDownloadAsync(img: GalleryImage, quality: DownloadQuality) {
    if (savingPhoto) return
    setSavingPhoto(true)
    try {
      const key = downloadCacheKey(img.id, quality)
      const cached = downloadFileCache.current.get(key)
      if (isMobile) {
        let file = cached?.file ?? (await downloadPrefetchInflight.current.get(key)) ?? undefined
        if (!file) {
          const { url, downgraded } = await resolveDownloadUrl(img, urlCtx)
          if (downgraded) originalStillUploading()
          const res = await fetch(url)
          if (!res.ok) throw new Error(`download_http_${res.status}`)
          const blob = await res.blob()
          file = new File([blob], downloadFileName(img.filename), { type: 'image/jpeg' })
          cacheDownloadFile(key, file)
        }
        await shareOrSaveFile(file, galleryTitle)
      } else {
        const { url, downgraded } = await resolveDownloadUrl(img, urlCtx)
        if (downgraded) originalStillUploading()
        await fetchAndSave(url, img.filename, isMobile, galleryTitle)
      }
      flashSaved()
      if (gallery) void logDownload(gallery.id, img.id, quality, 'single', gate.downloaderRef.current)
    } catch (err) {
      // A dismissed sheet stays silent. If the tap's gesture lapsed during the fetch,
      // the File is cached now, so the next tap opens the share sheet at once.
      const kind = classifyDownloadError(err)
      if (kind === 'failure') saveFailed()
      else if (kind === 'preparation') showHdNotice(txt.tapAgainToSave)
    } finally {
      setSavingPhoto(false)
    }
  }

  async function handleBatchDownload(imgs: GalleryImage[]) {
    if (imgs.length > 0 && !gate.ensureDownloaderEmail(() => { void handleBatchDownload(imgs) })) return
    if (gallery && imgs.length > 0) {
      void logBatchDownload(gallery.id, imgs.map(i => i.id), urlCtx.wantsHd ? 'original' : 'web', gate.downloaderRef.current)
    }
    await runBatchDownload(imgs, {
      ctx: urlCtx,
      isMobile,
      galleryTitle,
      watermarkEnabled: settings.watermarkEnabled,
      someOriginalsStillUploading: txt.someOriginalsStillUploading,
    }, { setLabel: setDlProgress, setProgress: setDownloadProgress, notice: showHdNotice })
  }

  return {
    savingPhoto,
    photoSaved,
    hdNotice,
    dismissHdNotice: () => setHdNotice(null),
    dlProgress,
    downloadProgress,
    emailGateOpen: gate.emailGateOpen,
    submitEmail: gate.submitEmail,
    closeEmailGate: gate.closeGate,
    handleImageDownload,
    handleBatchDownload,
    warmDownload,
  }
}

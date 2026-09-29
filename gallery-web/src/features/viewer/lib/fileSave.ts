import { downloadFileName } from './mobileViewer'

/**
 * Click a temporary anchor to download `url`. The anchor must be in the DOM for
 * Safari/Firefox; blob URLs are revoked after `revokeAfterMs` (or immediately).
 */
export function anchorDownload(url: string, filename: string, revokeAfterMs?: number) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  if (revokeAfterMs === undefined) URL.revokeObjectURL(url)
  else setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs)
}

/** Share a ready File (mobile) or fall back to an anchor download. Rejections (incl. AbortError) propagate. */
export async function shareOrSaveFile(file: File, title: string) {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return
  }
  anchorDownload(URL.createObjectURL(file), file.name, 4000)
}

/** Fetch `url` and hand it to the share sheet (mobile) or save it under the original filename. */
export async function fetchAndSave(url: string, filename: string, isMobile: boolean, title: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  if (isMobile) {
    await shareOrSaveFile(new File([blob], downloadFileName(filename), { type: 'image/jpeg' }), title)
    return
  }
  anchorDownload(URL.createObjectURL(blob), filename, 4000)
}

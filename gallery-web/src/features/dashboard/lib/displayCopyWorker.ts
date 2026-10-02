// Off-main-thread resize: decodes one upload and returns the stored display
// copies, so the viewer serves them directly instead of paying for a Supabase
// image transform per photo per billing cycle.

import { DISPLAY_COPY_SIZES, type DisplayCopyResult } from './displayCopySizes'

function drawScaled(src: CanvasImageSource, srcW: number, srcH: number, width: number): OffscreenCanvas {
  // Never upscale: a small source keeps its own size.
  const w = Math.min(width, srcW)
  const h = Math.max(1, Math.round((srcH * w) / srcW))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  // JPEG has no alpha; a transparent PNG/WebP would otherwise turn black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return canvas
}

self.onmessage = async (e: MessageEvent<File>) => {
  let bitmap: ImageBitmap | null = null
  try {
    // createImageBitmap applies EXIF orientation by default.
    bitmap = await createImageBitmap(e.data)
    const { web, thumb } = DISPLAY_COPY_SIZES
    const webCanvas = drawScaled(bitmap, bitmap.width, bitmap.height, web.width)
    bitmap.close()
    bitmap = null
    // Thumb from the web copy: a two-step downscale looks sharper than one big jump.
    const thumbCanvas = drawScaled(webCanvas, webCanvas.width, webCanvas.height, thumb.width)
    const [webBlob, thumbBlob] = await Promise.all([
      webCanvas.convertToBlob({ type: 'image/jpeg', quality: web.quality }),
      thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: thumb.quality }),
    ])
    const result: DisplayCopyResult = { ok: true, web: webBlob, thumb: thumbBlob }
    self.postMessage(result)
  } catch (err) {
    bitmap?.close()
    const result: DisplayCopyResult = { ok: false, error: err instanceof Error ? err.message : String(err) }
    self.postMessage(result)
  }
}

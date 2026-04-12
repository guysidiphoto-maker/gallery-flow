/**
 * StoryGenerator v2 — renders a cinematic Ken Burns story video in-browser.
 * Supports 3 styles (Clean/Dynamic/Vintage) and configurable duration.
 * Uses Canvas + MediaRecorder. Output: WebM.
 */

export interface StoryConfig {
  photos: string[]
  style: 'clean' | 'dynamic' | 'vintage'
  duration: number  // total seconds
  onProgress: (pct: number, stage: string) => void
  onComplete: (url: string) => void
  onError: (msg: string) => void
}

const W = 1080, H = 1920, FPS = 30

// Easing
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// Style-specific Ken Burns parameters
function getKBParams(style: string, idx: number) {
  if (style === 'dynamic') {
    // Faster, more dramatic zoom + pan
    const dirs = [
      { startScale: 1.0, endScale: 1.25, panX: [-20, 30], panY: [-15, 25] },
      { startScale: 1.2, endScale: 1.0, panX: [25, -20], panY: [20, -10] },
      { startScale: 1.05, endScale: 1.3, panX: [-30, 15], panY: [10, -25] },
    ]
    return dirs[idx % dirs.length]
  }
  if (style === 'vintage') {
    // Slow, gentle, nostalgic
    return { startScale: 1.0, endScale: 1.08, panX: [-8, 8], panY: [-5, 5] }
  }
  // Clean: subtle, smooth
  const dirs = [
    { startScale: 1.0, endScale: 1.12, panX: [0, -15], panY: [0, -10] },
    { startScale: 1.1, endScale: 1.0, panX: [-10, 10], panY: [5, -5] },
    { startScale: 1.0, endScale: 1.1, panX: [10, -5], panY: [-8, 8] },
  ]
  return dirs[idx % dirs.length]
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export async function generateStory(config: StoryConfig) {
  const { photos, style, duration, onProgress, onComplete, onError } = config
  if (photos.length < 2) { onError('Need at least 2 photos'); return }

  const pics = photos.slice(0, 10)

  try {
    onProgress(0, 'Loading photos...')

    // Load images
    const images: HTMLImageElement[] = []
    for (let i = 0; i < pics.length; i++) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error(`Failed: ${i}`)); img.src = pics[i] })
      images.push(img)
      onProgress(Math.round((i / pics.length) * 15), 'Loading photos...')
    }

    // Canvas + recorder
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')!

    const stream = canvas.captureStream(FPS)
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 })

    const chunks: Blob[] = []
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

    const totalMs = duration * 1000
    const photoMs = totalMs / pics.length
    const fadeMs = style === 'dynamic' ? 300 : style === 'vintage' ? 800 : 500
    const totalFrames = Math.ceil(duration * FPS)

    recorder.start(100)
    onProgress(15, 'Rendering...')

    // Render each frame
    for (let frame = 0; frame < totalFrames; frame++) {
      const t = (frame / FPS) * 1000
      const photoIdx = Math.min(Math.floor(t / photoMs), pics.length - 1)
      const photoT = easeInOut(Math.min((t % photoMs) / photoMs, 1))

      // Clear to black
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)

      // Ken Burns on current photo
      const kb = getKBParams(style, photoIdx)
      const scale = lerp(kb.startScale, kb.endScale, photoT)
      const px = lerp(kb.panX[0], kb.panX[1], photoT)
      const py = lerp(kb.panY[0], kb.panY[1], photoT)

      drawCover(ctx, images[photoIdx], scale, px, py, 1)

      // Crossfade to next
      const timeInPhoto = t - photoIdx * photoMs
      const timeToEnd = photoMs - timeInPhoto
      if (timeToEnd < fadeMs && photoIdx < pics.length - 1) {
        const fadeT = easeInOut(1 - timeToEnd / fadeMs)
        const nextKb = getKBParams(style, photoIdx + 1)
        drawCover(ctx, images[photoIdx + 1], nextKb.startScale, nextKb.panX[0], nextKb.panY[0], fadeT)
      }

      // Vintage overlay: warm tint + subtle grain
      if (style === 'vintage') {
        ctx.fillStyle = 'rgba(120, 80, 40, 0.12)'
        ctx.fillRect(0, 0, W, H)
        // Subtle vignette
        const grad = ctx.createRadialGradient(W/2, H/2, W*0.3, W/2, H/2, W*0.8)
        grad.addColorStop(0, 'rgba(0,0,0,0)')
        grad.addColorStop(1, 'rgba(0,0,0,0.4)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, W, H)
      }

      // Dynamic: subtle letterbox lines
      if (style === 'dynamic') {
        ctx.fillStyle = 'rgba(0,0,0,0.85)'
        ctx.fillRect(0, 0, W, 60)
        ctx.fillRect(0, H - 60, W, 60)
      }

      // Progress
      if (frame % 5 === 0) {
        onProgress(15 + Math.round((frame / totalFrames) * 80), 'Rendering...')
        await new Promise(r => setTimeout(r, 0))
      }
    }

    onProgress(95, 'Encoding...')
    recorder.stop()
    await new Promise<void>(res => { recorder.onstop = () => res() })

    const blob = new Blob(chunks, { type: 'video/webm' })
    onProgress(100, 'Done!')
    onComplete(URL.createObjectURL(blob))
  } catch (err) {
    onError(err instanceof Error ? err.message : 'Failed')
  }
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, scale: number, px: number, py: number, alpha: number) {
  const imgR = img.width / img.height, canR = W / H
  let dw: number, dh: number
  if (imgR > canR) { dh = H * scale; dw = dh * imgR }
  else { dw = W * scale; dh = dw / imgR }
  ctx.globalAlpha = alpha
  ctx.drawImage(img, (W - dw) / 2 + px, (H - dh) / 2 + py, dw, dh)
  ctx.globalAlpha = 1
}

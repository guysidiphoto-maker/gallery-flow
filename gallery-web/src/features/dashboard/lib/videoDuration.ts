// Reads a video's duration (whole seconds) client-side via a detached <video>.
// Resolves null on unreadable files or after a 5s timeout; never rejects.
export function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    // Some browsers only load metadata for attached elements; keep it offscreen.
    video.style.position = 'fixed'
    video.style.left = '-9999px'
    video.style.top = '-9999px'
    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.remove()
    }
    video.onloadedmetadata = () => {
      const dur = Number.isFinite(video.duration) && video.duration > 0
        ? Math.round(video.duration)
        : null
      cleanup()
      resolve(dur)
    }
    video.onerror = () => { cleanup(); resolve(null) }
    setTimeout(() => { cleanup(); resolve(null) }, 5000)
    video.src = url
    document.body.appendChild(video)
  })
}

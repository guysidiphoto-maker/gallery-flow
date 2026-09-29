import { useEffect, useRef, useState } from 'react'

export type Downloader = { email: string; name: string | null }

const storageKey = (galleryId: string) => `pf-dl-id-${galleryId}`

/**
 * With trackDownloads on, the first download asks for an email. The ref is the
 * source of truth so a deferred download never logs a stale pre-submit null.
 */
export function useDownloadGate(galleryId: string | undefined, trackDownloads: boolean) {
  const downloaderRef = useRef<Downloader | null>(null)
  const pendingDownloadRef = useRef<(() => void) | null>(null)
  const [emailGateOpen, setEmailGateOpen] = useState(false)

  // A returning guest isn't asked twice for the same gallery.
  useEffect(() => {
    if (!galleryId) return
    try {
      const raw = localStorage.getItem(storageKey(galleryId))
      if (raw) {
        const parsed = JSON.parse(raw) as { email?: string; name?: string | null }
        if (parsed?.email) {
          downloaderRef.current = { email: parsed.email, name: parsed.name ?? null }
          return
        }
      }
    } catch { /* ignore malformed cache */ }
    downloaderRef.current = null
  }, [galleryId])

  /** True if the download may run now; false if it was parked behind the gate. */
  function ensureDownloaderEmail(proceed: () => void): boolean {
    if (!trackDownloads || downloaderRef.current) return true
    pendingDownloadRef.current = proceed
    setEmailGateOpen(true)
    return false
  }

  function submitEmail(email: string, name: string | null) {
    const d = { email, name }
    downloaderRef.current = d
    if (galleryId) {
      try { localStorage.setItem(storageKey(galleryId), JSON.stringify(d)) } catch { /* ignore */ }
    }
    setEmailGateOpen(false)
    const run = pendingDownloadRef.current
    pendingDownloadRef.current = null
    if (run) run()
  }

  function closeGate() {
    setEmailGateOpen(false)
    pendingDownloadRef.current = null
  }

  return { downloaderRef, emailGateOpen, ensureDownloaderEmail, submitEmail, closeGate }
}

import { useRef, useState } from 'react'

// Local-only until the gallery-defaults backend lands.
const STUDIO_IDENTITY_KEY = 'pixflow.studioIdentity.v1'
const SAVED_PILL_MS = 1800

export type StudioIdentity = {
  studioName: string
  studioWebsite: string
  logoUrl: string
  showFooterCredit: boolean
}

const DEFAULT_IDENTITY: StudioIdentity = {
  studioName: '',
  studioWebsite: '',
  logoUrl: '',
  showFooterCredit: true,
}

function loadIdentity(): StudioIdentity {
  if (typeof window === 'undefined') return DEFAULT_IDENTITY
  try {
    const raw = window.localStorage.getItem(STUDIO_IDENTITY_KEY)
    if (!raw) return DEFAULT_IDENTITY
    return { ...DEFAULT_IDENTITY, ...(JSON.parse(raw) as Partial<StudioIdentity>) }
  } catch {
    return DEFAULT_IDENTITY
  }
}

/** Studio identity persisted to localStorage, with a brief "saved" flag after each write. */
export function useStudioIdentity() {
  const [identity, setIdentity] = useState<StudioIdentity>(loadIdentity)
  const [justSaved, setJustSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function update<K extends keyof StudioIdentity>(key: K, value: StudioIdentity[K]) {
    setIdentity(prev => {
      const next = { ...prev, [key]: value }
      try { window.localStorage.setItem(STUDIO_IDENTITY_KEY, JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setJustSaved(true)
    savedTimer.current = setTimeout(() => setJustSaved(false), SAVED_PILL_MS)
  }

  return { identity, update, justSaved }
}

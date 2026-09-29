import { useCallback, useState } from 'react'
import type { Lang } from './copy'

const KEY = 'pixflow-lang'

/** EN/HE toggle persisted in localStorage (storage may be blocked — ignore). */
export function useLandingLang() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'he' || saved === 'en') return saved
    } catch {}
    return 'en'
  })

  const toggleLang = useCallback(() => {
    const next = lang === 'en' ? 'he' : 'en'
    setLang(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {}
  }, [lang])

  return { lang, toggleLang }
}

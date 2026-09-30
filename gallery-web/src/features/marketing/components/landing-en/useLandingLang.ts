import { useCallback, useEffect, useState } from 'react'
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

  // The shell ships as lang="he" dir="rtl"; keep <html> in step for screen readers and the scrollbar side.
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'
  }, [lang])

  const toggleLang = useCallback(() => {
    const next = lang === 'en' ? 'he' : 'en'
    setLang(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {}
  }, [lang])

  return { lang, toggleLang }
}

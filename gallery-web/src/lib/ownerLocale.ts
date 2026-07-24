// ownerLocale: a tiny, dependency-free locale layer for the OWNER dashboard
// (the business operator's side; never used on client-portal routes).
//
// Cloned from src/lib/portalLocale.ts on purpose: two locales only, Hebrew
// (RTL, default) and English (LTR). The active interface is NEVER mixed.
// Preference persists in localStorage under its OWN key so the owner's
// language choice is independent from any portal preference. A React hook
// exposes `{ locale, dir, t, setLocale, toggle }` and re-renders subscribers
// when the locale changes.
//
// Ownership note (overnight sprint contract C8): this module is created by
// the Tour agent and carries the shared hook plus the tour strings. Other
// wave-1 areas ship their strings in a local `strings.ts` with the same
// `{ he: {}, en: {} }` shape and read `locale`/`dir` from useOwnerLocale().

import { useCallback, useSyncExternalStore } from 'react'

export type Locale = 'he' | 'en'
export type Dir = 'rtl' | 'ltr'

const STORAGE_KEY = 'pixflow-owner-locale'

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'he' || v === 'en') return v
  } catch { /* ignore */ }
  return 'he'
}

let current: Locale = readStored()
const listeners = new Set<() => void>()

function emit() { listeners.forEach(l => l()) }

export function getOwnerLocale(): Locale { return current }

export function setOwnerLocaleValue(next: Locale) {
  if (next === current) return
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  emit()
}

export function dirFor(locale: Locale): Dir { return locale === 'he' ? 'rtl' : 'ltr' }

// ─── Dictionary ─────────────────────────────────────────────────────────────
// One flat key namespace. Copy rules (contract C8): action-oriented, warm,
// no internal jargon, no em-dashes, every key exists in BOTH he and en.

const STRINGS = {
  he: {
    'lang.toggle': 'English',
    'lang.label': 'שפה',

    // ── First-run guided tour ────────────────────────────────────────────
    'tour.aria': 'סיור היכרות בלוח הניהול',
    'tour.stepOf': 'שלב {n} מתוך {total}',
    'tour.next': 'הבא',
    'tour.back': 'הקודם',
    'tour.skip': 'דילוג על הסיור',
    'tour.done': 'סיום',
    'tour.close': 'סגירה',
    'tour.restart': 'הפעלת סיור ההיכרות',
    'tour.stepDot': 'מעבר לשלב {n}',

    'tour.overview.title': 'ברוכים הבאים לסטודיו שלכם',
    'tour.overview.body': 'זהו מרכז הניהול של העסק. כאן רואים את הלקוחות, הגלריות והפעילות האחרונה, הכול במקום אחד.',
    'tour.clients.title': 'לקוחות',
    'tour.clients.body': 'צרו כרטיס לקוח לכל מי שאתם עובדים איתו, ושלחו הזמנה במייל כדי שיוכל להתחבר לאזור האישי שלו.',
    'tour.galleries.title': 'גלריות',
    'tour.galleries.body': 'העלו תמונות, סדרו אותן בגלריות ופרסמו כשהכול מוכן. גלריה שפורסמה זמינה ללקוח לצפייה ולהורדה.',
    'tour.assign.title': 'חיבור גלריה ללקוח',
    'tour.assign.body': 'חברו כל גלריה ללקוח הנכון. הלקוח רואה רק גלריות שחוברו אליו ופורסמו.',
    'tour.search.title': 'חיפוש בתוכן שלכם',
    'tour.search.body': 'מצאו במהירות לקוח, גלריה או תמונה: לפי שם, סוג אירוע, מיקום או תאריך.',
    'tour.import.title': 'ייבוא מספק אחר',
    'tour.import.body': 'עוברים מ-Pixieset או משירות אחר? מרכז הייבוא מעביר לכאן את הגלריות והלקוחות שלכם, צעד אחר צעד.',
    'tour.preview.title': 'לראות מה הלקוח רואה',
    'tour.preview.body': 'כך זה עובד: הסטודיו שלכם יוצר לקוח, מחבר אליו גלריה, והלקוח רואה אותה באזור האישי שלו. אפשר בכל רגע להציץ ולראות בדיוק מה מוצג אצלו.',
  },
  en: {
    'lang.toggle': 'עברית',
    'lang.label': 'Language',

    // ── First-run guided tour ────────────────────────────────────────────
    'tour.aria': 'Dashboard welcome tour',
    'tour.stepOf': 'Step {n} of {total}',
    'tour.next': 'Next',
    'tour.back': 'Back',
    'tour.skip': 'Skip tour',
    'tour.done': 'Finish',
    'tour.close': 'Close',
    'tour.restart': 'Start the welcome tour',
    'tour.stepDot': 'Go to step {n}',

    'tour.overview.title': 'Welcome to your studio',
    'tour.overview.body': 'This is your business home. Your clients, galleries and recent activity, all in one place.',
    'tour.clients.title': 'Clients',
    'tour.clients.body': 'Create a client card for everyone you work with, then send an email invite so they can sign in to their own area.',
    'tour.galleries.title': 'Galleries',
    'tour.galleries.body': 'Upload photos, organize them into galleries, and publish when everything is ready. A published gallery is available to your client to view and download.',
    'tour.assign.title': 'Connect a gallery to a client',
    'tour.assign.body': 'Link each gallery to the right client. A client only sees galleries that are connected to them and published.',
    'tour.search.title': 'Search your content',
    'tour.search.body': 'Quickly find a client, a gallery or a photo: by name, event type, location or date.',
    'tour.import.title': 'Import from another provider',
    'tour.import.body': 'Moving from Pixieset or another service? The Import Center brings your galleries and clients over here, step by step.',
    'tour.preview.title': 'See what your client sees',
    'tour.preview.body': 'How it works: your studio creates a client, connects a gallery to them, and the client sees it in their own area. You can preview at any time and see exactly what they see.',
  },
} as const

export type OwnerStringKey = keyof (typeof STRINGS)['he']

export function translateOwner(locale: Locale, key: OwnerStringKey, vars?: Record<string, string | number>): string {
  let s: string = STRINGS[locale][key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return s
}

// ─── Date + number formatting bound to the active locale ────────────────────

const INTL_LOCALE: Record<Locale, string> = { he: 'he-IL', en: 'en-US' }

export function formatOwnerDate(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { year: 'numeric', month: 'long', day: 'numeric' }).format(d)
}

export function formatOwnerNumber(locale: Locale, n: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(n)
}

// ─── React binding ──────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export interface OwnerLocale {
  locale: Locale
  dir: Dir
  t: (key: OwnerStringKey, vars?: Record<string, string | number>) => string
  fmtDate: (iso: string | null) => string
  fmtNum: (n: number) => string
  setLocale: (l: Locale) => void
  toggle: () => void
}

export function useOwnerLocale(): OwnerLocale {
  const locale = useSyncExternalStore(subscribe, getOwnerLocale, getOwnerLocale)
  const t = useCallback(
    (key: OwnerStringKey, vars?: Record<string, string | number>) => translateOwner(locale, key, vars),
    [locale],
  )
  const fmtDate = useCallback((iso: string | null) => formatOwnerDate(locale, iso), [locale])
  const fmtNum = useCallback((n: number) => formatOwnerNumber(locale, n), [locale])
  const setLocale = useCallback((l: Locale) => setOwnerLocaleValue(l), [])
  const toggle = useCallback(() => setOwnerLocaleValue(getOwnerLocale() === 'he' ? 'en' : 'he'), [])
  return { locale, dir: dirFor(locale), t, fmtDate, fmtNum, setLocale, toggle }
}

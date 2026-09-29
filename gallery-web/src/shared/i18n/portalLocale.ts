// Client-portal locale (he/RTL default, en/LTR), never mixed in one view.
// Persisted in localStorage; subscribers re-render on change.

import { useCallback, useSyncExternalStore } from 'react'

type Locale = 'he' | 'en'
type Dir = 'rtl' | 'ltr'

const STORAGE_KEY = 'pixflow-portal-locale'

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

function getLocale(): Locale { return current }

function setLocaleValue(next: Locale) {
  if (next === current) return
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  emit()
}

function dirFor(locale: Locale): Dir { return locale === 'he' ? 'rtl' : 'ltr' }

// ─── Dictionary ─────────────────────────────────────────────────────────────
// One flat key namespace. Keep copy human and warm, not generic AI phrasing.

const STRINGS = {
  he: {
    'portal.badge': 'אזור לקוח',
    'portal.by': 'מאת',
    'nav.overview': 'סקירה',
    'nav.galleries': 'גלריות',
    'nav.myPage': 'העמוד שלי',
    'nav.menu': 'תפריט',
    'nav.close': 'סגירה',
    'account.title': 'החשבון שלי',
    'account.signedInAs': 'מחובר.ת כעת',
    'account.client': 'לקוח',
    'account.logout': 'התנתקות',
    'account.loggingOut': 'מתנתק…',
    'account.button': 'החשבון שלי',
    'lang.toggle': 'English',
    'lang.label': 'שפה',
    'overview.greeting': 'שלום, {name}',
    'overview.subtitle': 'כאן מרוכזות כל הגלריות והתוכן שהכנו עבורכם. הכול במקום אחד, מוכן לצפייה ולהורדה.',
    'overview.latest': 'הגלריה האחרונה',
    'overview.latestCta': 'צפייה בגלריה',
    'overview.recent': 'גלריות אחרונות',
    'overview.recentCta': 'לכל הגלריות',
    'overview.viewAll': 'לכל הגלריות',
    'overview.empty.title': 'עדיין אין גלריות',
    'overview.empty.body': 'ברגע שהצלם יפרסם גלריה, היא תופיע כאן.',
    'galleries.title': 'הגלריות שלכם',
    'galleries.subtitle': 'כל הגלריות שפורסמו עבורכם.',
    'galleries.search': 'חיפוש גלריה…',
    'galleries.open': 'פתיחת גלריה',
    'galleries.count': '{n} תמונות',
    'galleries.count.one': 'תמונה אחת',
    'galleries.empty.title': 'עדיין אין גלריות',
    'galleries.empty.body': 'ברגע שהצלם יפרסם גלריה עבורכם, תמצאו אותה כאן.',
    'galleries.noResults': 'לא נמצאו גלריות שמתאימות לחיפוש.',
    'status.published': 'פורסם',
    'status.draft': 'טיוטה',
    'footer.poweredBy': 'מופעל על ידי Pixflow',
    'error.title': 'שגיאה',
    'loading': 'טוען',
    'gate.restricted.title': 'הגישה מוגבלת',
    'gate.restricted.body': 'כדי להיכנס לאזור האישי צריך הזמנה. פנו לצלם כדי לקבל הזמנה.',
  },
  en: {
    'portal.badge': 'Client Portal',
    'portal.by': 'by',
    'nav.overview': 'Overview',
    'nav.galleries': 'Galleries',
    'nav.myPage': 'My Page',
    'nav.menu': 'Menu',
    'nav.close': 'Close',
    'account.title': 'My account',
    'account.signedInAs': 'Signed in as',
    'account.client': 'Client',
    'account.logout': 'Log out',
    'account.loggingOut': 'Logging out…',
    'account.button': 'Account',
    'lang.toggle': 'עברית',
    'lang.label': 'Language',
    'overview.greeting': 'Hello, {name}',
    'overview.subtitle': 'Everything we made for you lives here. All your galleries and content, in one place, ready to view and download.',
    'overview.latest': 'Latest gallery',
    'overview.latestCta': 'Open gallery',
    'overview.recent': 'Recent galleries',
    'overview.recentCta': 'View all galleries',
    'overview.viewAll': 'View all galleries',
    'overview.empty.title': 'No galleries yet',
    'overview.empty.body': 'As soon as your photographer publishes a gallery, it will appear here.',
    'galleries.title': 'Your galleries',
    'galleries.subtitle': 'Every gallery published for you.',
    'galleries.search': 'Search galleries…',
    'galleries.open': 'Open gallery',
    'galleries.count': '{n} photos',
    'galleries.count.one': '1 photo',
    'galleries.empty.title': 'No galleries yet',
    'galleries.empty.body': 'Once your photographer publishes a gallery for you, you will find it here.',
    'galleries.noResults': 'No galleries match your search.',
    'status.published': 'Published',
    'status.draft': 'Draft',
    'footer.poweredBy': 'Powered by Pixflow',
    'error.title': 'Error',
    'loading': 'Loading',
    'gate.restricted.title': 'Access restricted',
    'gate.restricted.body': 'You need an invitation to enter your client area. Contact your photographer to get one.',
  },
} as const

type StringKey = keyof (typeof STRINGS)['he']

function translate(locale: Locale, key: StringKey, vars?: Record<string, string | number>): string {
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

function formatDate(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { year: 'numeric', month: 'long' }).format(d)
}

function formatNumber(locale: Locale, n: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(n)
}

// ─── React binding ──────────────────────────────────────────────────────────

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export interface PortalLocale {
  locale: Locale
  dir: Dir
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  fmtDate: (iso: string | null) => string
  fmtNum: (n: number) => string
  setLocale: (l: Locale) => void
  toggle: () => void
}

export function usePortalLocale(): PortalLocale {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale)
  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  )
  const fmtDate = useCallback((iso: string | null) => formatDate(locale, iso), [locale])
  const fmtNum = useCallback((n: number) => formatNumber(locale, n), [locale])
  const setLocale = useCallback((l: Locale) => setLocaleValue(l), [])
  const toggle = useCallback(() => setLocaleValue(getLocale() === 'he' ? 'en' : 'he'), [])
  return { locale, dir: dirFor(locale), t, fmtDate, fmtNum, setLocale, toggle }
}

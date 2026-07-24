// portalLocale — a tiny, dependency-free locale layer for the Client Portal V2.
//
// Two locales only: Hebrew (RTL, default) and English (LTR). The active
// interface is NEVER mixed — every visible string comes from one dictionary.
// Preference persists in localStorage so a client keeps their language across
// visits. A React hook exposes `{ locale, dir, t, setLocale, toggle }` and
// re-renders subscribers when the locale changes.

import { useCallback, useSyncExternalStore } from 'react'

export type Locale = 'he' | 'en'
export type Dir = 'rtl' | 'ltr'

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

export function getLocale(): Locale { return current }

export function setLocaleValue(next: Locale) {
  if (next === current) return
  current = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  emit()
}

export function dirFor(locale: Locale): Dir { return locale === 'he' ? 'rtl' : 'ltr' }

// ─── Dictionary ─────────────────────────────────────────────────────────────
// One flat key namespace. Keep copy human and warm, not generic AI phrasing.

const STRINGS = {
  he: {
    'portal.badge': 'אזור לקוח',
    'portal.by': 'מאת',
    'nav.overview': 'סקירה',
    'nav.galleries': 'גלריות',
    'nav.contentLibrary': 'ספריית תוכן',
    'nav.socialStudio': 'סטודיו לרשתות',
    'nav.calendar': 'לוח תוכן',
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
    'contentLibrary.title': 'ספריית תוכן',
    'contentLibrary.subtitle': 'התמונות המוכנות לפרסום שנבחרו עבורכם.',
    'footer.poweredBy': 'מופעל על ידי Pixflow',
    'error.title': 'שגיאה',
    'loading': 'טוען',
    'gate.restricted.title': 'הגישה מוגבלת',
    'gate.restricted.body': 'כדי להיכנס לאזור האישי צריך הזמנה. פנו לצלם כדי לקבל הזמנה.',
    'gate.notAvailable.badge': 'לא זמין',
    'gate.notAvailable.title': 'המודול הזה אינו זמין בחשבון שלך',
    'gate.notAvailable.body': 'פנו לצלם כדי להפעיל את חבילת התוכן.',
    'nav.comingSoon': 'בקרוב',
    'socialLock.title': 'סטודיו לרשתות בדרך אליכם',
    'socialLock.body': 'אנחנו בונים כאן חוויית תוכן חדשה לרשתות החברתיות. נעדכן ברגע שהיא מוכנה.',
    'socialLock.cta': 'בינתיים, הגלריות שלכם מחכות',
  },
  en: {
    'portal.badge': 'Client Portal',
    'portal.by': 'by',
    'nav.overview': 'Overview',
    'nav.galleries': 'Galleries',
    'nav.contentLibrary': 'Content Library',
    'nav.socialStudio': 'Social Studio',
    'nav.calendar': 'Content Calendar',
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
    'contentLibrary.title': 'Content Library',
    'contentLibrary.subtitle': 'The ready-to-post images selected for you.',
    'footer.poweredBy': 'Powered by Pixflow',
    'error.title': 'Error',
    'loading': 'Loading',
    'gate.restricted.title': 'Access restricted',
    'gate.restricted.body': 'You need an invitation to enter your client area. Contact your photographer to get one.',
    'gate.notAvailable.badge': 'Not available',
    'gate.notAvailable.title': 'This module is not available on your account',
    'gate.notAvailable.body': 'Contact your photographer to enable the content suite.',
    'nav.comingSoon': 'Coming soon',
    'socialLock.title': 'Social Studio is on its way',
    'socialLock.body': 'We are building a new social content experience here. We will let you know the moment it is ready.',
    'socialLock.cta': 'In the meantime, your galleries are waiting',
  },
} as const

export type StringKey = keyof (typeof STRINGS)['he']

export function translate(locale: Locale, key: StringKey, vars?: Record<string, string | number>): string {
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

export function formatDate(locale: Locale, iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { year: 'numeric', month: 'long' }).format(d)
}

export function formatNumber(locale: Locale, n: number): string {
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

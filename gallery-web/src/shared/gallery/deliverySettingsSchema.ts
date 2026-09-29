// Client-side validator for `galleries.delivery_settings` patches; the
// update_gallery_settings RPC re-validates server-side. Hand-rolled to avoid a zod dep.

// Returns null or a Hebrew error; all failures are collected so users see every issue at once.
type FieldRule = (value: unknown) => string | null

const isString = (v: unknown): v is string => typeof v === 'string'
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

function maxLength(name: string, max: number): FieldRule {
  return (v) => {
    if (v === null || v === undefined) return null
    if (!isString(v)) return `${name}: צריך להיות טקסט`
    if (v.length > max) return `${name}: עד ${max} תווים`
    return null
  }
}

function oneOf<T extends string>(name: string, values: readonly T[]): FieldRule {
  return (v) => {
    if (v === null || v === undefined) return null
    if (!isString(v)) return `${name}: ערך לא תקין`
    if (!(values as readonly string[]).includes(v)) {
      return `${name}: חייב להיות אחד מ-${values.join(' / ')}`
    }
    return null
  }
}

function boolean(name: string): FieldRule {
  return (v) => {
    if (v === null || v === undefined) return null
    if (!isBoolean(v)) return `${name}: צריך true/false`
    return null
  }
}

function url(name: string, maxLen = 300): FieldRule {
  return (v) => {
    if (v === null || v === undefined) return null
    if (!isString(v)) return `${name}: צריך URL`
    if (v.length > maxLen) return `${name}: עד ${maxLen} תווים`
    if (v.length === 0) return null
    try { new URL(v) } catch { return `${name}: כתובת URL לא חוקית` }
    return null
  }
}

function isoDate(name: string): FieldRule {
  return (v) => {
    if (v === null || v === undefined || v === '') return null
    if (!isString(v)) return `${name}: תאריך לא תקין`
    if (Number.isNaN(Date.parse(v))) return `${name}: תאריך לא חוקי`
    return null
  }
}

function coverCrop(name: string): FieldRule {
  return (v) => {
    if (v === null || v === undefined) return null
    if (typeof v !== 'object') return `${name}: ערך לא תקין`
    const { zoom, x, y } = v as { zoom?: unknown; x?: unknown; y?: unknown }
    if (!isFiniteNumber(zoom) || zoom < 0.5 || zoom > 4) return `${name}.zoom: בין 0.5 ל-4`
    if (!isFiniteNumber(x) || x < -1 || x > 1) return `${name}.x: בין -1 ל-1`
    if (!isFiniteNumber(y) || y < -1 || y > 1) return `${name}.y: בין -1 ל-1`
    return null
  }
}

// Allowlist: unknown keys are rejected so typos like `coverImageURL` can't persist silently.

const RULES: Record<string, FieldRule> = {
  // Display
  galleryTitle:         maxLength('כותרת', 120),
  galleryDescription:   maxLength('תיאור', 500),
  clientName:           maxLength('שם לקוח', 120),
  welcomeMessage:       maxLength('הודעת ברוכים-הבאים', 500),
  studioName:           maxLength('שם סטודיו', 120),
  studioWebsite:        url('אתר הסטודיו'),

  // Event
  eventDate:            isoDate('תאריך'),
  eventLocation:        maxLength('מיקום', 120),
  eventType:            maxLength('סוג אירוע', 60),

  // Cover
  coverImagePath:       maxLength('cover path', 500),
  coverImageUrl:        maxLength('cover url', 500),
  coverImageId:         maxLength('cover id', 64),
  coverCrop:            coverCrop('coverCrop'),
  coverEnabled:         boolean('הצגת תמונת שער'),
  coverSource:          oneOf('מקור תמונת שער', ['none', 'gallery_asset', 'custom_upload'] as const),

  // Access
  accessType:           oneOf('גישה', ['public', 'password', 'code'] as const),
  password:             maxLength('סיסמה', 120),
  clientCode:           maxLength('קוד גישה', 32),
  requireGalleryCode:   boolean('דרישת קוד גישה'),
  galleryCode:          maxLength('קוד גלריה', 32),

  // Downloads
  downloadsEnabled:     boolean('הורדות מופעלות'),
  allowDownloads:       boolean('הורדות מופעלות (legacy)'),
  bulkDownloadEnabled:  boolean('הורדה מרוכזת'),
  downloadQuality:      oneOf('איכות הורדה', ['web', 'high', 'original'] as const),
  trackDownloads:       boolean('מעקב הורדות'),

  // Branding
  logoUrl:              url('logo'),
  showFooterCredit:     boolean('קרדיט תחתון'),
  themeColor:           maxLength('צבע ערכת נושא', 32),

  // Typography
  headingFont:          maxLength('פונט כותרות', 60),
  bodyFont:             maxLength('פונט גוף', 60),

  // Watermark (per-gallery Brand Kit override)
  watermarkEnabled:     boolean('סימן מים מופעל'),
  watermarkText:        maxLength('טקסט סימן מים', 120),
  watermarkPosition:    oneOf('מיקום סימן מים', ['tl','tc','tr','cl','cc','cr','bl','bc','br'] as const),
  watermarkSource:      oneOf('מקור סימן מים', ['logo','studio_name','custom_text'] as const),
  watermarkScalePercent:    (v) => v === null || v === undefined ? null
                            : (typeof v === 'number' && v >= 1 && v <= 50)
                              ? null
                              : 'סקלת סימן מים: בין 1% ל-50%',
  watermarkOpacityPercent:  (v) => v === null || v === undefined ? null
                            : (typeof v === 'number' && v >= 1 && v <= 100)
                              ? null
                              : 'שקיפות סימן מים: בין 1% ל-100%',
  watermarkContrastAware:   boolean('סימן מים מודע ניגודיות'),

  // Layout
  layoutMode:           oneOf('פריסה', ['1-col', '2-col', '3-col'] as const),
  navStyle:             oneOf('סגנון ניווט', ['top', 'side'] as const),
  imageSpacing:         oneOf('רווח תמונות', ['none', 'small', 'medium', 'wide'] as const),
  gridSpacing:          oneOf('מרווח בין תמונות', ['regular', 'large'] as const),
  appearance:           oneOf('מראה', ['editorial', 'light', 'dark'] as const),
  cornerStyle:          oneOf('סגנון פינות', ['sharp', 'rounded'] as const),
  feedLayout:           oneOf('פריסת פיד', ['grid', 'masonry', 'carousel'] as const),
  welcomeStyle:         oneOf('סגנון פתיחה', ['mosaic', 'cinematic', 'minimal'] as const),

  // Stories
  generateStories:      boolean('יצירת סטוריז'),
  autoGenerateStories:  boolean('יצירת סטוריז אוטומטית (legacy)'),
  showStories:          boolean('הצגת סטוריז'),

  // Face search
  faceIndexEnabled:     boolean('זיהוי פנים'),
  facePrivacyMode:      oneOf('מצב פרטיות פנים', ['open', 'private'] as const),

  // Client privacy
  clientHidePhotosEnabled: boolean('הסתרת תמונות ע"י לקוח'),
  clientSelectionEnabled:  boolean('בחירת תמונות ע"י לקוח'),

  // Legacy keys existing galleries store; permissive so saved values are never rejected.
  // Keep in sync with the server allowlist.
  language:               maxLength('שפה', 8),
  thumbnailSize:          maxLength('גודל תמונה ממוזערת', 16),
  welcomeTextAnimation:   maxLength('אנימציית טקסט פתיחה', 24),
  welcomeAnimationSpeed:  maxLength('מהירות אנימציה', 16),
  gridDirection:          maxLength('כיוון רשת', 8),
  creditsSystem:          maxLength('מערכת קרדיטים', 24),
  faceRecognition:        boolean('זיהוי פנים (legacy)'),
}

export type ValidationResult =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; errors: Array<{ key: string; message: string }> }

export function validateDeliverySettingsPatch(patch: Record<string, unknown>): ValidationResult {
  const errors: Array<{ key: string; message: string }> = []
  const out: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(patch)) {
    const rule = RULES[key]
    if (!rule) {
      errors.push({ key, message: `${key}: מפתח לא מוכר (drift)` })
      continue
    }
    const err = rule(value)
    if (err) {
      errors.push({ key, message: err })
      continue
    }
    out[key] = value
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, patch: out }
}

// Toast text: first 3 errors plus a count of the rest.
export function summarizeValidationErrors(errors: Array<{ key: string; message: string }>): string {
  const head = errors.slice(0, 3).map(e => `• ${e.message}`)
  const more = errors.length > 3 ? `\n…ועוד ${errors.length - 3} שגיאות` : ''
  return head.join('\n') + more
}

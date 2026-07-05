// ─────────────────────────────────────────────────────────────────────────────
// scenes.ts — the Pixflow homepage story, as data.
//
// SINGLE SOURCE OF TRUTH for the scroll narrative: the 3D canvas
// (Pixflow3DScene) and the static mobile/reduced-motion fallback both read
// this same array, so the copy + assets never drift between the two paths.
//
// All copy is CENTERED (the visible layout puts every heading in the middle,
// over a frosted clearing in the 3D field) and written in a punchy, catalog
// voice — short bold headline, a confident supporting line, and a row of
// feature tags. Hebrew, RTL-first. No fabricated metrics, no testimonials.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_BASE = '/assets/pixflow-landing'

export interface Scene {
  /** Stable id, also used as the section DOM id + scroll anchor. */
  id: string
  /** WebP under public/assets/pixflow-landing/. */
  img: string
  /** Meaningful alt for the static fallback (a11y). */
  alt: string
  /** Small uppercase kicker above the title. */
  eyebrow: string
  /** Short, bold, catalog-style headline (\n for line breaks). */
  title: string
  /** Confident supporting line. */
  body: string
  /** Catalog-style feature tags shown as pills under the body. */
  tags: string[]
}

export const SCENES: Scene[] = [
  {
    id: 'hero',
    img: `${ASSET_BASE}/hero-main.webp`,
    alt: 'גלריית Pixflow פתוחה על מחשב נייד וטלפון, תמונות אירוע מסודרות',
    eyebrow: 'גלריות אירועים חכמות',
    title: 'התמונות שלכם,\nמסודרות מעצמן',
    body: 'מעלים את כל האירוע פעם אחת. Pixflow מארגן, בוחר את הרגעים הכי חזקים, ובונה גלריה ממותגת שמוכנה לשיתוף בקישור אחד.',
    tags: ['זיהוי פנים', 'מיתוג משלכם', 'שיתוף בקישור'],
  },
  {
    id: 'upload',
    img: `${ASSET_BASE}/ai-highlights.webp`,
    alt: 'מסך Pixflow מארגן אוטומטית תמונות אירוע ובוחר את הרגעים הטובים',
    eyebrow: 'העלאה',
    title: 'גוררים.\nוזה מסודר.',
    body: 'אלפי תמונות נכנסות ביחד ומסתדרות לגלריה נקייה. בלי מיון ידני ובלי לילות עריכה — Pixflow עושה את העבודה השחורה.',
    tags: ['ארגון אוטומטי', 'בחירת רגעים', 'גלריה מוכנה'],
  },
  {
    id: 'faces',
    img: `${ASSET_BASE}/face-recognition.webp`,
    alt: 'מסך טלפון של Pixflow מזהה אורח ומציג את כל התמונות שלו',
    eyebrow: 'זיהוי פנים',
    title: 'כל אורח\nמוצא את עצמו',
    body: 'סלפי אחד, וזהו. זיהוי הפנים סורק את כל האירוע ומגיש לכל אורח בדיוק את התמונות שבהן הוא מופיע — בשניות.',
    tags: ['חיפוש בסלפי', 'בלי אפליקציה', 'תוצאות מיידיות'],
  },
  {
    id: 'manage',
    img: `${ASSET_BASE}/dashboard.webp`,
    alt: 'לוח הבקרה של Pixflow עם כל הגלריות, מרכז העלאות והרשאות שיתוף',
    eyebrow: 'לוח בקרה',
    title: 'כל הגלריות.\nמסך אחד.',
    body: 'גלריות, לקוחות, הרשאות, שיתוף והורדות — הכול מנוהל ממקום אחד, נקי וברור. אתם שולטים, לא רודפים.',
    tags: ['ניהול לקוחות', 'הרשאות גישה', 'מעקב הורדות'],
  },
  {
    id: 'client',
    img: `${ASSET_BASE}/event-gallery.webp`,
    alt: 'לקוח גולל בגלריית אירוע של Pixflow בטלפון ומוריד תמונות',
    eyebrow: 'חוויית לקוח',
    title: 'גלריה\nשמרגישה יוקרה',
    body: 'שולחים קישור אחד. הלקוח פותח, גולל, בוחר ומוריד — בעברית מלאה, מכל מכשיר, בלי להוריד שום אפליקציה.',
    tags: ['קישור אחד', 'עברית מלאה', 'הורדה חופשית'],
  },
]

// Extra product render (not a story beat) — fed into the floating-card field
// so the 3D depth has more variety than the five hero shots alone.
export const EXTRA_TEXTURES = [`${ASSET_BASE}/product-gallery.webp`]

// The final beat (Scene 6) is not a 3D plane — it is a calm, static section
// rendered by HomepageCTA. Motion settles down before the call to action.

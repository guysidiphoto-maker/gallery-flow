// ─────────────────────────────────────────────────────────────────────────────
// scenes.ts — the Pixflow homepage story, as data.
//
// SINGLE SOURCE OF TRUTH for the scroll narrative: the 3D canvas
// (Pixflow3DScene) and the static mobile/reduced-motion fallback read the same
// array, so copy + assets never drift between the two paths.
//
// Positioning: guests don't look for "a gallery" — they look for themselves.
// Photographers want to upload once, send one clean link, and let the gallery
// do the work. Voice: natural Israeli Hebrew, sharp, human, product-led. No
// hype, no fake metrics, no em-dashes as sentence joiners.
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
  /** Headline (\n marks intentional line breaks). */
  title: string
  /** Supporting line. */
  body: string
  /** Feature chips shown as pills under the body (empty on the hero). */
  tags: string[]
  /** Hero only: the muted trust line under the CTAs. */
  trust?: string
}

export const SCENES: Scene[] = [
  {
    id: 'hero',
    img: `${ASSET_BASE}/hero-main.webp`,
    alt: 'גלריית Pixflow פתוחה על מחשב נייד וטלפון, אורחת מזוהה בזיהוי פנים',
    eyebrow: 'זיהוי פנים לצלמי אירועים',
    title: 'האורחים לא מחפשים גלריה.\nהם מחפשים את עצמם.',
    body: 'Pixflow הופך אלפי תמונות מאירוע לגלריה שכל אחד יודע להשתמש בה: למצוא את עצמו, לשמור רגעים, ולשתף בלי לשגע את הצלם.',
    tags: [],
    trust: 'בלי אפליקציה. בלי סיסמאות. בלי "שלח לי את התמונות שלי" בווטסאפ.',
  },
  {
    id: 'upload',
    img: `${ASSET_BASE}/ai-highlights.webp`,
    alt: 'תמונות אירוע עולות ל-Pixflow והגלריה מתחילה להסתדר אוטומטית',
    eyebrow: 'אחרי האירוע',
    title: 'האירוע נגמר.\nעכשיו כולם רוצים תמונות.',
    body: 'מאות או אלפי קבצים עולים לאוויר, והגלריה מתחילה להסתדר לבד. כדי שתוכלו לשלוח קישור אחד במקום לנהל בלגן.',
    tags: ['העלאה אחת', 'סידור חכם', 'קישור מוכן לשליחה'],
  },
  {
    id: 'faces',
    img: `${ASSET_BASE}/face-recognition.webp`,
    alt: 'אורח מזדהה במסך Pixflow ורואה את כל התמונות שבהן הוא מופיע',
    eyebrow: 'זיהוי פנים',
    title: 'כל אורח מקבל\nדרך קצרה לתמונות שלו.',
    body: 'במקום לחפש את עצמו בגלריה ענקית, האורח נכנס, מזדהה, ורואה את הרגעים שבהם הוא מופיע.',
    tags: ['חיפוש לפי פנים', 'מותאם למובייל', 'פחות גלילה'],
  },
  {
    id: 'manage',
    img: `${ASSET_BASE}/dashboard.webp`,
    alt: 'לוח הבקרה של Pixflow עם רשימת אירועים, הרשאות ושליטה בשיתוף',
    eyebrow: 'לצלם',
    title: 'מעולם הגלריות שלך\nלא היו יפות ונוחות כל כך.',
    body: 'לא עוד תיקיות מפוזרות, לינקים כפולים, או שאלות חוזרות על איפה מורידים. הגלריה בנויה כדי לעשות את זה ברור.',
    tags: ['ניהול פשוט', 'הרשאות גישה', 'גלריות במקום אחד'],
  },
  {
    id: 'client',
    img: `${ASSET_BASE}/event-gallery.webp`,
    alt: 'לקוח פותח גלריה ממותגת של Pixflow בטלפון ומעביר אותה הלאה',
    eyebrow: 'ללקוח',
    title: 'לא שולחים קבצים.\nשולחים חוויה.',
    body: 'הלקוח מקבל גלריה נקייה, ממותגת ונוחה לפתיחה מכל מכשיר. כזו שאפשר להעביר הלאה בלי להסביר כלום.',
    tags: ['מותג שלכם', 'עובד במובייל', 'קל לשיתוף'],
  },
]

// Extra product render (not a story beat) — fed into the floating-card field so
// the 3D depth has more variety than the five hero shots alone.
export const EXTRA_TEXTURES = [`${ASSET_BASE}/product-gallery.webp`]

// The final beat (Scene 6) is not a 3D plane — it is a calm, static section
// rendered by HomepageCTA. Motion settles down before the call to action.

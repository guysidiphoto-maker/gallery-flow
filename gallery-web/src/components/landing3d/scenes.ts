// ─────────────────────────────────────────────────────────────────────────────
// scenes.ts — the Pixflow homepage story, as data.
//
// SINGLE SOURCE OF TRUTH for the scroll narrative: the 3D canvas
// (Pixflow3DScene) and the static mobile/reduced-motion fallback both read
// this same array, so the copy + assets never drift between the two paths.
//
// Every image lives under public/assets/pixflow-landing/ and is a self-contained
// cream/soft-green product render (already ~90–120KB WebP). Because their
// backgrounds match the page, they sit as flat planes on the cream canvas and
// read as one continuous premium scene.
//
// Copy is Hebrew (site is RTL-first). No fabricated metrics, no testimonials,
// no claims beyond what the product does — see the launch-safety rules.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSET_BASE = '/assets/pixflow-landing'

export interface Scene {
  /** Stable id, also used as the section DOM id + scroll anchor. */
  id: string
  /** WebP under public/assets/pixflow-landing/. */
  img: string
  /** Meaningful alt for the static fallback (a11y). */
  alt: string
  /** Small uppercase kicker above the title. Empty for the hero. */
  eyebrow: string
  title: string
  body: string
  /** Which side the copy column sits on (logical, RTL-safe). */
  side: 'start' | 'end' | 'center'
}

export const SCENES: Scene[] = [
  {
    id: 'hero',
    img: `${ASSET_BASE}/hero-main.webp`,
    alt: 'גלריית Pixflow פתוחה על מחשב נייד וטלפון, תמונות אירוע מסודרות',
    eyebrow: '',
    title: 'גלריות חכמות\nלצלמי אירועים',
    body: 'העלו את תמונות האירוע פעם אחת. Pixflow מסדר, מזהה פנים, ומכין גלריה שהלקוחות באמת אוהבים לפתוח.',
    side: 'start',
  },
  {
    id: 'upload',
    img: `${ASSET_BASE}/ai-highlights.webp`,
    alt: 'מסך Pixflow מארגן אוטומטית תמונות אירוע ובוחר את הרגעים הטובים',
    eyebrow: 'העלאה',
    title: 'העלו פעם אחת',
    body: 'גוררים את כל תמונות האירוע פנימה. Pixflow מסדר אותן לגלריה נקייה ובוחר את הרגעים הבולטים — בלי עבודה ידנית.',
    side: 'end',
  },
  {
    id: 'faces',
    img: `${ASSET_BASE}/face-recognition.webp`,
    alt: 'מסך טלפון של Pixflow מזהה אורח ומציג את כל התמונות שלו',
    eyebrow: 'זיהוי פנים',
    title: 'האורחים מוצאים\nאת עצמם',
    body: 'עם זיהוי פנים חכם כל אורח מוצא את התמונות שלו בשניות — סלפי אחד, וזהו.',
    side: 'start',
  },
  {
    id: 'manage',
    img: `${ASSET_BASE}/dashboard.webp`,
    alt: 'לוח הבקרה של Pixflow עם כל הגלריות, מרכז העלאות והרשאות שיתוף',
    eyebrow: 'ניהול',
    title: 'הכול\nבמקום אחד',
    body: 'נהלו גלריות, לקוחות, שיתוף והורדות מלוח בקרה אחד — פשוט וברור.',
    side: 'end',
  },
  {
    id: 'client',
    img: `${ASSET_BASE}/event-gallery.webp`,
    alt: 'לקוח גולל בגלריית אירוע של Pixflow בטלפון ומוריד תמונות',
    eyebrow: 'חוויית לקוח',
    title: 'גלריה\nשמרגישה יוקרתית',
    body: 'שולחים קישור אחד. הלקוחות פותחים, גוללים, בוחרים ומורידים — מכל מכשיר.',
    side: 'start',
  },
]

// The final beat (Scene 6) is not a 3D plane — it is a calm, static section
// rendered by HomepageCTA. Motion settles down before the call to action.

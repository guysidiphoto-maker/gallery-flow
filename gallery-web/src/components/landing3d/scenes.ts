// ─────────────────────────────────────────────────────────────────────────────
// scenes.ts — the Pixflow homepage story, as data.
//
// SINGLE SOURCE OF TRUTH for the scroll narrative: the 3D canvas
// (Pixflow3DScene) and the static mobile/reduced-motion fallback read the same
// array, so copy + assets never drift between the two paths.
//
// Pixflow IS a FACE-RECOGNITION system for event photographers — guests find
// the photos they appear in, and the photographer delivers a branded gallery in
// one link. Copy stays on that value (recognition + delivery + branding), never
// editing/curation. Hebrew, RTL, catalog voice. No em-dashes (they read as AI),
// no fabricated metrics, no testimonials.
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
    alt: 'גלריית Pixflow פתוחה על מחשב נייד וטלפון, אורחת מזוהה בזיהוי פנים',
    eyebrow: 'זיהוי פנים לצלמי אירועים',
    title: 'כל אורח\nמוצא את עצמו',
    body: 'Pixflow היא מערכת זיהוי הפנים לצלמי אירועים. מעלים את האירוע פעם אחת, וכל אורח מקבל בדיוק את התמונות שבהן הוא מופיע.',
    tags: ['זיהוי פנים AI', 'בלי אפליקציה', 'גלריה ממותגת'],
  },
  {
    id: 'upload',
    img: `${ASSET_BASE}/ai-highlights.webp`,
    alt: 'Pixflow סורק אוטומטית את הפנים בכל תמונות האירוע לאחר העלאה',
    eyebrow: 'העלאה',
    title: 'מעלים פעם אחת.\nהמערכת מזהה את כולם.',
    body: 'גוררים את כל תמונות האירוע פנימה, ו-Pixflow סורקת כל פנים אוטומטית. הגלריה מוכנה לשיתוף בלי לתייג אף אחד ידנית.',
    tags: ['סריקה אוטומטית', 'כל הפנים', 'מוכן לשיתוף'],
  },
  {
    id: 'faces',
    img: `${ASSET_BASE}/face-recognition.webp`,
    alt: 'אורח מצלם סלפי במסך Pixflow ומקבל את כל התמונות שבהן הוא מופיע',
    eyebrow: 'זיהוי פנים',
    title: 'סלפי אחד.\nכל התמונות שלו.',
    body: 'האורח מצלם סלפי, וזיהוי הפנים מגיש לו מיד את כל התמונות שבהן הוא מופיע. בלי לגלול אלפי תמונות, בלי אפליקציה.',
    tags: ['חיפוש בסלפי', 'התאמה מיידית', 'פרטי לכל אורח'],
  },
  {
    id: 'manage',
    img: `${ASSET_BASE}/dashboard.webp`,
    alt: 'לוח הבקרה של Pixflow עם כל הגלריות, אורחים והרשאות שיתוף',
    eyebrow: 'לוח בקרה',
    title: 'כל הגלריות.\nמסך אחד.',
    body: 'מנהלים גלריות, אורחים, הרשאות ושיתוף ממקום אחד, וממתגים כל גלריה בשם ובעיצוב שלכם.',
    tags: ['ניהול אורחים', 'הרשאות גישה', 'מיתוג מלא'],
  },
  {
    id: 'client',
    img: `${ASSET_BASE}/event-gallery.webp`,
    alt: 'אורח פותח גלריית אירוע ממותגת של Pixflow בטלפון ומוריד תמונות',
    eyebrow: 'חוויית לקוח',
    title: 'קישור אחד.\nגלריה ממותגת.',
    body: 'שולחים לאורחים קישור אחד. הם פותחים, מוצאים את עצמם ומורידים בעברית מלאה, מכל מכשיר, בלי להתקין כלום.',
    tags: ['קישור אחד', 'עברית מלאה', 'הורדה חופשית'],
  },
]

// Extra product render (not a story beat) — fed into the floating-card field so
// the 3D depth has more variety than the five hero shots alone.
export const EXTRA_TEXTURES = [`${ASSET_BASE}/product-gallery.webp`]

// The final beat (Scene 6) is not a 3D plane — it is a calm, static section
// rendered by HomepageCTA. Motion settles down before the call to action.

// ─────────────────────────────────────────────────────────────────────────
// seo/content.ts — PURE DATA. The single source of truth for marketing /
// keyword landing-page copy. Imported by BOTH:
//   • seo/registry.ts (server) → crawlable SSR HTML + JSON-LD
//   • src/pages/SeoLanding.tsx (client) → the designed, interactive page
// so the copy a crawler sees and the copy a user sees never diverge.
//
// This file must stay free of Node APIs / process.env so Vite can bundle it
// into the client. Origin-dependent values (canonical URLs, schema) are added
// server-side in seo/registry.ts.
//
// COPY RULES (do not violate):
//   • No invented customers, logos, testimonials, prices, rankings, or stats.
//   • No "#1 / best in the world" as fact. Aspirational positioning is fine
//     ("built to become the leading platform", "designed for professional
//     event teams").
//   • Professional, credible, SaaS-level. Truthful about what Pixflow does.
// ─────────────────────────────────────────────────────────────────────────

export type Lang = 'he' | 'en'

export interface CtaLink {
  label: string
  href: string
}

export interface ContentSection {
  h2: string
  body?: string
  bullets?: string[]
}

export interface Faq {
  q: string
  a: string
}

export interface LandingContent {
  /** Registry key + ?route= value. */
  key: string
  /** Canonical path. */
  path: string
  lang: Lang
  dir: 'rtl' | 'ltr'
  /** <title> — keep ≤ 60 chars. */
  title: string
  /** meta description — keep 120–155 chars. */
  description: string
  /** Short eyebrow/kicker above the H1. */
  eyebrow: string
  h1: string
  /** Hero sub-paragraph. */
  intro: string
  primaryCta: CtaLink
  secondaryCta?: CtaLink
  sections: ContentSection[]
  faq: Faq[]
  /** Internal links to sibling pages (SEO internal-linking). */
  related: CtaLink[]
  /** Schema.org Service audienceType. */
  audience: string
  /** hreflang alternates by language → path (optional). */
  alternates?: Partial<Record<Lang, string>>
  changefreq: string
  priority: number
}

const HOME_EN: CtaLink = { label: 'Pixflow home', href: '/en' }
const DEMO: CtaLink = { label: 'See the live demo', href: '/demo' }

// ── Keyword landing pages (English — US / global market) ────────────────────
// Each page targets a distinct, real search intent. Pages cross-link via
// `related` so link equity flows between them and crawlers map the cluster.

export const LANDING_PAGES: LandingContent[] = [
  // ── 1. Face recognition gallery (core / head term) ──────────────────────
  {
    key: 'face-recognition-photo-gallery',
    path: '/face-recognition-photo-gallery',
    lang: 'en',
    dir: 'ltr',
    title: 'Face Recognition Photo Gallery for Events | Pixflow',
    description:
      'Deliver event photos in a gallery with AI face recognition. Guests take a selfie and instantly find every photo they appear in.',
    eyebrow: 'Face recognition photo delivery',
    h1: 'An event photo gallery with built-in face recognition',
    intro:
      'Pixflow turns a finished shoot into a branded gallery where every guest finds their own photos in seconds — no scrolling through thousands of images. Upload once, share one link, and let AI face recognition do the sorting.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'How face recognition finds the right photos',
        body: 'A guest opens your gallery, takes a quick selfie, and Pixflow matches their face against every image in the event. Within seconds they see a personal set of just their photos — ready to download or share.',
      },
      {
        h2: 'Why photographers use a face-recognition gallery',
        bullets: [
          'Guests self-serve their photos instead of emailing you for them.',
          'Higher engagement and downloads — people find themselves immediately.',
          'Your gallery stays fully branded with your studio name, logo, and colors.',
          'Works on mobile, where guests actually open event links.',
        ],
      },
      {
        h2: 'Privacy-aware by design',
        body: 'Face matching is used to help guests find their own photos. You control gallery access — public, password, or client-code — and which galleries are listed publicly. Galleries behind a password or code stay private and are never indexed.',
      },
    ],
    faq: [
      {
        q: 'How accurate is the face recognition?',
        a: 'A guest selfie is matched against the event’s photos to surface the images they appear in. Guests can always browse the full gallery as well, so nothing is hidden behind the match.',
      },
      {
        q: 'Do guests need an app or account?',
        a: 'No. Guests open a link, optionally take a selfie, and get their photos in the browser — no app, no signup.',
      },
      {
        q: 'Can I still deliver the full gallery?',
        a: 'Yes. Face recognition is an additional way in; guests can browse every photo, and you can deliver full-resolution downloads.',
      },
    ],
    related: [
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
      { label: 'For event photographers', href: '/event-photographers' },
      { label: 'How it works', href: '/how-it-works' },
    ],
    audience: 'Event photographers',
    changefreq: 'monthly',
    priority: 0.9,
  },

  // ── 2. AI event photo gallery ───────────────────────────────────────────
  {
    key: 'ai-event-photo-gallery',
    path: '/ai-event-photo-gallery',
    lang: 'en',
    dir: 'ltr',
    title: 'AI Event Photo Gallery Platform | Pixflow',
    description:
      'An AI-powered event photo gallery that finds and delivers photos automatically. Guests find themselves with a selfie; you deliver branded galleries fast.',
    eyebrow: 'AI photo delivery for events',
    h1: 'The AI event photo gallery that delivers itself',
    intro:
      'Pixflow uses AI to remove the slow parts of event delivery — sorting, finding faces, and getting the right photos to the right people. You upload; guests find themselves; everyone gets their photos fast.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'What the AI actually does',
        bullets: [
          'Face recognition so each guest sees the photos they’re in.',
          'Instant, mobile-first galleries that open from a single link.',
          'Branded delivery that looks like your studio, not a generic host.',
        ],
      },
      {
        h2: 'Built for the pace of real events',
        body: 'Conferences, festivals, weddings, and brand activations all share one problem: hundreds of guests want their photos now. Pixflow is designed so you can start sharing within minutes of an event ending.',
      },
    ],
    faq: [
      {
        q: 'What makes Pixflow an “AI” gallery?',
        a: 'Pixflow applies face recognition and smart delivery so guests find their own photos automatically, instead of you manually sorting and sending images.',
      },
      {
        q: 'Is it only for huge events?',
        a: 'No. It works for an intimate wedding or a 5,000-person conference — the gallery and face search scale either way.',
      },
    ],
    related: [
      { label: 'Face recognition photo gallery', href: '/face-recognition-photo-gallery' },
      { label: 'For production companies', href: '/event-production-companies' },
      { label: 'How it works', href: '/how-it-works' },
    ],
    audience: 'Event photographers and production companies',
    changefreq: 'monthly',
    priority: 0.9,
  },

  // ── 3. For event photographers ──────────────────────────────────────────
  {
    key: 'event-photographers',
    path: '/event-photographers',
    lang: 'en',
    dir: 'ltr',
    title: 'Pixflow for Event Photographers | Face Recognition Galleries',
    description:
      'A photo delivery platform for event photographers: branded galleries, AI face search, and fast downloads so guests find their own photos.',
    eyebrow: 'For event photographers',
    h1: 'Photo delivery built for event photographers',
    intro:
      'Stop manually culling, tagging, and emailing photos. Pixflow gives you branded galleries with AI face recognition so guests find themselves, download what they want, and you move on to the next shoot.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'Spend less time on delivery',
        bullets: [
          'Upload once — no per-guest sorting or sending.',
          'Guests find their own photos with a selfie.',
          'Full-resolution downloads handled for you.',
          'One branded link to share on WhatsApp, email, or signage.',
        ],
      },
      {
        h2: 'Look like the professional you are',
        body: 'Every gallery carries your studio branding — logo, colors, and name. Pixflow stays in the background so your work, and your brand, are what guests remember.',
      },
      {
        h2: 'Designed for professional event teams',
        body: 'Pixflow is built to become the leading delivery platform for serious event photographers — from solo shooters to multi-photographer studios covering events back to back.',
      },
    ],
    faq: [
      {
        q: 'What types of events does this fit?',
        a: 'Weddings, corporate events, conferences, festivals, parties, and brand activations — anywhere guests want their photos quickly.',
      },
      {
        q: 'Can I control downloads and resolution?',
        a: 'Yes. You control gallery access and how photos are delivered, including full-resolution originals.',
      },
    ],
    related: [
      { label: 'Wedding photo gallery', href: '/wedding-photo-gallery' },
      { label: 'Corporate event gallery', href: '/corporate-event-gallery' },
      { label: 'Face recognition photo gallery', href: '/face-recognition-photo-gallery' },
    ],
    audience: 'Event photographers',
    changefreq: 'monthly',
    priority: 0.8,
  },

  // ── 4. For production companies ─────────────────────────────────────────
  {
    key: 'event-production-companies',
    path: '/event-production-companies',
    lang: 'en',
    dir: 'ltr',
    title: 'Smart Event Gallery for Production Companies | Pixflow',
    description:
      'A smart photo gallery platform for event production companies. Deliver branded, face-recognition galleries across every event and client, fast — at scale.',
    eyebrow: 'For event production companies',
    h1: 'A smart gallery platform for event production companies',
    intro:
      'Production companies run many events for many clients. Pixflow gives you a single platform to deliver branded, AI face-recognition galleries for every event — fast enough to share while the event is still the talk of the room.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'Delivery that scales with your calendar',
        bullets: [
          'Consistent, branded galleries across every event you produce.',
          'Face recognition so attendees self-serve their photos.',
          'Fast turnaround — start sharing minutes after doors close.',
          'One link per event for sponsors, clients, and attendees.',
        ],
      },
      {
        h2: 'Make photos part of the experience',
        body: 'When attendees can find and share their own photos immediately, your events generate more reach and stronger sponsor value. Pixflow turns the photo gallery into a live part of the event, not an afterthought weeks later.',
      },
    ],
    faq: [
      {
        q: 'Can we brand galleries per client?',
        a: 'Yes. Galleries are brandable so each event can carry the right logo, colors, and name.',
      },
      {
        q: 'Does it handle large attendee counts?',
        a: 'Yes — Pixflow is designed for events from intimate to several thousand attendees.',
      },
    ],
    related: [
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
      { label: 'Corporate event gallery', href: '/corporate-event-gallery' },
      { label: 'For event photographers', href: '/event-photographers' },
    ],
    audience: 'Event production companies',
    changefreq: 'monthly',
    priority: 0.8,
  },

  // ── 5. Wedding gallery ──────────────────────────────────────────────────
  {
    key: 'wedding-photo-gallery',
    path: '/wedding-photo-gallery',
    lang: 'en',
    dir: 'ltr',
    title: 'Wedding Photo Gallery with Face Recognition | Pixflow',
    description:
      'Share a wedding gallery where every guest finds their photos with a selfie. Beautiful, branded, mobile-first delivery with AI face recognition from Pixflow.',
    eyebrow: 'For wedding photographers',
    h1: 'A wedding photo gallery with face recognition',
    intro:
      'After the wedding, guests want their photos and couples want to relive the day. Pixflow delivers a branded wedding gallery where every guest finds the photos they’re in with a quick selfie — and the couple gets everything in one place.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'A better gallery for the couple and their guests',
        bullets: [
          'Guests find their own moments instantly — no endless scrolling.',
          'The couple gets a single, beautiful, branded gallery.',
          'Easy sharing and downloads from any phone.',
          'Your studio branding on every screen.',
        ],
      },
      {
        h2: 'More shares, more referrals',
        body: 'When guests find and share their photos easily, your work travels — and so does your name. A great gallery experience is one of the strongest referral engines a wedding photographer has.',
      },
    ],
    faq: [
      {
        q: 'Can guests download in full resolution?',
        a: 'Yes — you control delivery, including full-resolution downloads for the couple and guests.',
      },
      {
        q: 'Is the gallery private?',
        a: 'You choose: public, password-protected, or client-code access. Private galleries stay private and are never publicly indexed.',
      },
    ],
    related: [
      { label: 'For event photographers', href: '/event-photographers' },
      { label: 'Face recognition photo gallery', href: '/face-recognition-photo-gallery' },
      { label: 'How it works', href: '/how-it-works' },
    ],
    audience: 'Wedding photographers',
    changefreq: 'monthly',
    priority: 0.8,
  },

  // ── 6. Corporate event gallery ──────────────────────────────────────────
  {
    key: 'corporate-event-gallery',
    path: '/corporate-event-gallery',
    lang: 'en',
    dir: 'ltr',
    title: 'Corporate Event Photo Gallery with AI | Pixflow',
    description:
      'Deliver corporate event and conference photos in a branded gallery with AI face recognition. Attendees find their photos with a quick selfie.',
    eyebrow: 'For corporate events & conferences',
    h1: 'A corporate event photo gallery with AI face recognition',
    intro:
      'Conferences, summits, and company events produce thousands of photos and hundreds of people who want them. Pixflow delivers a branded gallery where attendees find their own photos with a selfie — fast enough to drive engagement while the event is still live.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'On-brand, on-time delivery',
        bullets: [
          'Galleries branded for the company or the event sponsor.',
          'Attendees self-serve their photos with face recognition.',
          'Fast turnaround for same-day and next-day delivery.',
          'One link to distribute across email, Slack, or event apps.',
        ],
      },
      {
        h2: 'Photos that extend the event',
        body: 'When attendees can grab and share their photos immediately, your event keeps generating reach and content after the doors close — valuable for marketing teams and sponsors alike.',
      },
    ],
    faq: [
      {
        q: 'Can we match galleries to our brand guidelines?',
        a: 'Yes. Galleries are brandable with the company or sponsor logo, colors, and name.',
      },
      {
        q: 'Is attendee data handled responsibly?',
        a: 'Face matching helps attendees find their own photos, and you control gallery access. Private galleries are never publicly listed or indexed.',
      },
    ],
    related: [
      { label: 'For production companies', href: '/event-production-companies' },
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
      { label: 'For event photographers', href: '/event-photographers' },
    ],
    audience: 'Corporate event and conference organizers',
    changefreq: 'monthly',
    priority: 0.8,
  },

  // ── 7. How it works (informational / AEO) ───────────────────────────────
  {
    key: 'how-it-works',
    path: '/how-it-works',
    lang: 'en',
    dir: 'ltr',
    title: 'How Face Recognition Photo Delivery Works | Pixflow',
    description:
      'A step-by-step guide to how face recognition photo delivery works for events: upload, AI matching, guest selfie search, and instant delivery.',
    eyebrow: 'How it works',
    h1: 'How face recognition photo delivery works',
    intro:
      'Face recognition photo delivery lets event guests find their own photos instantly instead of scrolling through everything. Here is how the process works end to end with Pixflow.',
    primaryCta: DEMO,
    secondaryCta: HOME_EN,
    sections: [
      {
        h2: 'Step 1 — The photographer uploads the event',
        body: 'After the event, you upload your photos to a Pixflow gallery once. The gallery is branded with your studio identity and shared with a single link.',
      },
      {
        h2: 'Step 2 — AI indexes faces in the photos',
        body: 'Pixflow analyses the photos and builds a face index for the event, so it can later match a guest to the images they appear in.',
      },
      {
        h2: 'Step 3 — A guest takes a selfie',
        body: 'A guest opens the gallery link and takes a quick selfie (or browses normally). The selfie is matched against the event’s face index.',
      },
      {
        h2: 'Step 4 — The guest gets their photos instantly',
        body: 'Within seconds the guest sees a personal set of the photos they appear in, ready to view, download, or share — no app and no account required.',
      },
    ],
    faq: [
      {
        q: 'How fast is the guest experience?',
        a: 'Once a gallery is live, a guest typically goes from selfie to their photos in seconds.',
      },
      {
        q: 'What happens to a guest’s selfie?',
        a: 'The selfie is used to match the guest to their photos in that gallery. You control gallery access and visibility throughout.',
      },
      {
        q: 'Can guests who don’t take a selfie still see photos?',
        a: 'Yes — guests can always browse the full gallery; the selfie is just a faster way to find themselves.',
      },
    ],
    related: [
      { label: 'Face recognition photo gallery', href: '/face-recognition-photo-gallery' },
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
      { label: 'For event photographers', href: '/event-photographers' },
    ],
    audience: 'Event photographers and event organizers',
    changefreq: 'monthly',
    priority: 0.7,
  },

  // ── Hebrew landing pages (Israeli market) — native Hebrew, RTL ───────────
  {
    key: 'he-zihui-panim-galeria',
    path: '/he/zihui-panim-galeria',
    lang: 'he',
    dir: 'rtl',
    title: 'גלריית אירועים עם זיהוי פנים | Pixflow',
    description:
      'האורחים מצלמים סלפי אחד ומקבלים מיד את כל התמונות שהם מופיעים בהן. גלריה ממותגת, מהירה ונגישה מהנייד — בלי חיפוש ידני וייגע.',
    eyebrow: 'זיהוי פנים לאירועים',
    h1: 'גלריית אירועים שמוצאת לכל אורח בדיוק את התמונות שלו',
    intro:
      'במקום לגלול בין מאות תמונות, האורח מצלם סלפי אחד ומקבל תוך שניות את כל הצילומים שבהם הוא מופיע. אתם מספקים חוויית גלריה חכמה תחת המותג שלכם.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    alternates: { he: '/he/zihui-panim-galeria', en: '/face-recognition-photo-gallery' },
    sections: [
      {
        h2: 'איך זה עובד',
        bullets: [
          'מעלים את כל תמונות האירוע לגלריה אחת תחת קישור יחיד.',
          'האורח נכנס מהנייד ומצלם סלפי קצר לזיהוי.',
          'המערכת מאתרת אוטומטית את כל התמונות שבהן הוא מופיע.',
          'האורח צופה, מוריד ומשתף — בלי לחפש ובלי להעמיס עליכם.',
        ],
      },
      {
        h2: 'למה זה משנה לכם כצלמים',
        body: 'זיהוי הפנים חוסך את שעות המיון והשליחה הידנית שאחרי כל אירוע. האורחים מקבלים את התמונות שלהם בכוחות עצמם, אתם מקבלים גלריה ממותגת שמייצרת רושם מקצועי, והכול נשאר מרוכז בקישור אחד שקל לשתף.',
      },
      {
        h2: 'פרטיות ושליטה',
        body: 'כל אורח רואה רק את התמונות שבהן הוא מזוהה, ונתוני הזיהוי משמשים אך ורק להתאמת התמונות בתוך אותו אירוע. אתם שולטים מי נכנס לגלריה, מה גלוי ומתי הגישה נסגרת.',
      },
    ],
    faq: [
      { q: 'כמה זמן לוקח לאורח למצוא את התמונות שלו?', a: 'בדרך כלל שניות. אחרי סלפי אחד מהנייד המערכת מציגה את כל התמונות שבהן הוא מזוהה, בלי גלילה ידנית בכל הגלריה.' },
      { q: 'מה קורה אם אורח לא מופיע בתוצאות?', a: 'אפשר לחזור על הסלפי בתאורה טובה יותר, וגם לדפדף בגלריה המלאה. ככל שיש יותר תמונות ברורות של הפנים, הזיהוי מדויק יותר.' },
      { q: 'התמונות נשארות ממותגות בשם שלי?', a: 'כן. הגלריה מוצגת תחת המיתוג שלכם לאורך כל החוויה, מהכניסה ועד ההורדה.' },
    ],
    related: [
      { label: 'זיהוי פנים לתמונות אירועים', href: '/he/zihui-panim-tmunot' },
      { label: 'גלריית תמונות לאירועים', href: '/he/galeria-tmunot-eruim' },
      { label: 'גלריית חתונה עם זיהוי פנים', href: '/he/galeria-hatuna-zihui-panim' },
    ],
    audience: 'צלמי אירועים ומפיקים שרוצים לספק לאורחים גישה אישית ומהירה לתמונות שלהם.',
    changefreq: 'monthly',
    priority: 0.9,
  },
  {
    key: 'he-galeria-tmunot-eruim',
    path: '/he/galeria-tmunot-eruim',
    lang: 'he',
    dir: 'rtl',
    title: 'גלריית תמונות לאירועים | Pixflow',
    description:
      'גלריה אחת לכל תמונות האירוע, מסודרת וממותגת, שמשתפים בקישור יחיד. נוחה לצפייה והורדה מהנייד, עם זיהוי פנים שמביא לכל אורח את שלו.',
    eyebrow: 'גלריה לאירועים',
    h1: 'כל תמונות האירוע במקום אחד, מסודר וקל לשיתוף',
    intro:
      'אספו את כל צילומי האירוע לגלריה אחת ממותגת ושתפו אותה בקישור יחיד. האורחים צופים, מורידים ומשתפים בקלות מהנייד.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    sections: [
      {
        h2: 'גלריה שמסדרת את כל האירוע',
        body: 'במקום קבצים מפוזרים בדיסקים ובהודעות, הכול נמצא בגלריה אחת מאורגנת. אתם מעלים פעם אחת, משתפים קישור, וכל מי שצריך מגיע ישר לתמונות הנכונות מכל מכשיר.',
      },
      {
        h2: 'חוויה שמרגישה מקצועית',
        bullets: [
          'עיצוב נקי וממותג שמציג את העבודה שלכם במיטבה.',
          'חוויה מהירה ונוחה גם בנייד וגם במחשב.',
          'הורדה ושיתוף בלחיצה, בלי הרשמות מסורבלות.',
          'אפשרות לזיהוי פנים שמביא לכל אורח את התמונות שלו.',
        ],
      },
    ],
    faq: [
      { q: 'צריך להתקין אפליקציה כדי לצפות בגלריה?', a: 'לא. הגלריה נפתחת בדפדפן מכל מכשיר דרך הקישור, בלי התקנות.' },
      { q: 'אפשר לשלוט מי רואה את הגלריה?', a: 'כן. אפשר להגדיר את אופן הגישה ולסגור אותה כשהאירוע מסתיים, כך שאתם שולטים בחשיפה.' },
      { q: 'יש הגבלה על כמות התמונות?', a: 'הגלריה בנויה לאירועים שלמים עם הרבה תמונות. אפשר להעלות את כל צילומי האירוע לגלריה אחת.' },
    ],
    related: [
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'שליחת תמונות לאורחים באירוע', href: '/he/shlihat-tmunot-orchim' },
      { label: 'גלריה חכמה לצלמי אירועים', href: '/he/galeria-tzalamei-eruim' },
    ],
    audience: 'צלמים ובעלי אירועים שרוצים לרכז את כל התמונות בגלריה אחת ולשתף בקלות.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    key: 'he-galeria-tzalamei-eruim',
    path: '/he/galeria-tzalamei-eruim',
    lang: 'he',
    dir: 'rtl',
    title: 'גלריה חכמה לצלמי אירועים | Pixflow',
    description:
      'פלטפורמת גלריות לצלמי אירועים: העלאה מהירה, מיתוג מלא, זיהוי פנים ושליחה אוטומטית לאורחים. פחות עבודה ידנית אחרי האירוע, יותר זמן לצלם.',
    eyebrow: 'כלי עבודה לצלמים',
    h1: 'הגלריה שעובדת בשבילכם אחרי האירוע',
    intro:
      'Pixflow בנויה לצלמי אירועים שרוצים לספק תוצאה מקצועית בלי לבזבז שעות על מיון, מיתוג ושליחה. מעלים, ממתגים, והאורחים מקבלים את שלהם לבד.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    alternates: { he: '/he/galeria-tzalamei-eruim', en: '/event-photographers' },
    sections: [
      {
        h2: 'מה אתם מקבלים',
        bullets: [
          'גלריה ממותגת בשם שלכם שמחזקת את המותג בכל אירוע.',
          'זיהוי פנים שמתאים לכל אורח את התמונות שלו אוטומטית.',
          'שיתוף בקישור יחיד שמתאים לוואטסאפ, מייל ורשתות.',
          'חוויה מהירה ונקייה מהנייד, איפה שהאורחים נמצאים.',
        ],
      },
      {
        h2: 'פחות תקורה, יותר צילום',
        body: 'רוב העומס של צלם אירועים נמצא דווקא אחרי האירוע — בסידור, בשליחה ובמענה ללקוחות. כשהאורחים מוצאים את עצמם לבד דרך זיהוי פנים, אתם משוחררים מהמשימות החוזרות ויכולים להתמקד בצילום ובהגדלת מספר האירועים.',
      },
      {
        h2: 'נבנתה כדי להפוך לכלי שצלמים נשענים עליו',
        body: 'Pixflow מפותחת מתוך מטרה להפוך לפלטפורמת הגלריות שצלמי אירועים בישראל סומכים עליה בכל אירוע — מהעלאת התמונות ועד הרגע שהאורח מוריד את הצילום שלו.',
      },
    ],
    faq: [
      { q: 'זה מתאים גם לצלם עצמאי וגם לחברת הפקה?', a: 'כן. צלם יחיד יכול לנהל את האירועים שלו, ולמי שמפיק בהיקף גדול יש גם עמוד ייעודי לגלריה לחברות הפקה.' },
      { q: 'כמה מהר אפשר להעלות אירוע שלם?', a: 'ההעלאה מותאמת לכמויות גדולות של תמונות, כך שאפשר להעלות אירוע מלא ולשתף קישור באותו יום.' },
      { q: 'האורחים צריכים חשבון כדי לצפות?', a: 'לא. הם נכנסים דרך הקישור, ובמידת הצורך מצלמים סלפי לזיהוי — בלי תהליך הרשמה מורכב.' },
    ],
    related: [
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'גלריה לחברות הפקה', href: '/he/galeria-hevrot-hafaka' },
      { label: 'שליחת תמונות לאורחים באירוע', href: '/he/shlihat-tmunot-orchim' },
    ],
    audience: 'צלמי אירועים עצמאים וצוותי צילום שמחפשים כלי גלריה מקצועי וחוסך זמן.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    key: 'he-shlihat-tmunot-orchim',
    path: '/he/shlihat-tmunot-orchim',
    lang: 'he',
    dir: 'rtl',
    title: 'שליחת תמונות לאורחים באירוע | Pixflow',
    description:
      'במקום לשלוח תמונות ידנית לכל אורח, משתפים גלריה אחת בקישור. זיהוי פנים מביא לכל אורח את התמונות שלו — מהר, נוח ובלי עומס עליכם.',
    eyebrow: 'שיתוף עם אורחים',
    h1: 'האורחים מקבלים את התמונות שלהם בלי שתשלחו אחת-אחת',
    intro:
      'השליחה הידנית של תמונות אחרי אירוע גוזלת זמן ומתישה. עם גלריה משותפת וזיהוי פנים, כל אורח מגיע לתמונות שלו בעצמו דרך קישור אחד.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    sections: [
      {
        h2: 'מהשליחה הידנית לשיתוף חכם',
        body: 'במקום לאסוף בקשות, לחפש תמונות ולשלוח בנפרד לכל אחד, אתם משתפים קישור אחד לגלריה. האורח נכנס, מצלם סלפי, ומקבל את כל התמונות שבהן הוא מופיע — בלי שתתערבו.',
      },
      {
        h2: 'נוח לאורחים, קל לכם',
        bullets: [
          'קישור אחד שמתאים לוואטסאפ, מייל או קוד QR באירוע.',
          'כניסה מהנייד בלי התקנת אפליקציה.',
          'כל אורח מקבל את התמונות שלו דרך זיהוי פנים.',
          'הורדה ושיתוף ישיר לרשתות בלחיצה.',
        ],
      },
    ],
    faq: [
      { q: 'איך משתפים את הקישור עם האורחים?', a: 'אפשר לשלוח את הקישור בוואטסאפ או במייל, וגם להציג קוד QR באירוע עצמו כדי שהאורחים ייכנסו ישירות.' },
      { q: 'מה אם אורח רוצה רק את התמונות שלו ולא את כל האירוע?', a: 'זה בדיוק מה שזיהוי הפנים נותן — אחרי סלפי אחד האורח רואה קודם כול את התמונות שבהן הוא מופיע.' },
      { q: 'אפשר לשתף גם לפני שכל התמונות מוכנות?', a: 'כן. אפשר לשתף את הגלריה ולהוסיף אליה תמונות, כך שהאורחים נכנסים לאותו קישור גם בהמשך.' },
    ],
    related: [
      { label: 'גלריית תמונות לאירועים', href: '/he/galeria-tmunot-eruim' },
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'גלריה חכמה לצלמי אירועים', href: '/he/galeria-tzalamei-eruim' },
    ],
    audience: 'צלמים ומארגני אירועים שרוצים לחסוך את השליחה הידנית ולתת לאורחים גישה עצמאית.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    key: 'he-zihui-panim-tmunot',
    path: '/he/zihui-panim-tmunot',
    lang: 'he',
    dir: 'rtl',
    title: 'זיהוי פנים לתמונות אירועים | Pixflow',
    description:
      'טכנולוגיית זיהוי פנים שממיינת אלפי תמונות אירוע ומתאימה לכל אורח את שלו. סלפי אחד מהנייד, וכל התמונות הרלוונטיות מופיעות — בלי מיון ידני.',
    eyebrow: 'הטכנולוגיה שמאחורי הגלריה',
    h1: 'זיהוי פנים שהופך ערימת תמונות לחוויה אישית',
    intro:
      'זיהוי הפנים של Pixflow ממיין אוטומטית אלפי תמונות ומתאים לכל אורח את התמונות שבהן הוא מופיע, על בסיס סלפי אחד.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    sections: [
      {
        h2: 'איך הזיהוי עובד',
        body: 'כשהאורח מצלם סלפי, המערכת משווה אותו לפנים שמופיעות בתמונות האירוע ומחזירה את ההתאמות הרלוונטיות. כל זה קורה בתוך הגלריה, מהנייד, בלי שהאורח צריך לדעת משהו טכני.',
      },
      {
        h2: 'דיוק ופרטיות',
        bullets: [
          'כל אורח רואה רק את התמונות שבהן הוא מזוהה.',
          'נתוני הזיהוי משמשים להתאמת התמונות בתוך האירוע בלבד.',
          'אתם שולטים בגישה לגלריה ובמשך הזמן שהיא פתוחה.',
          'ככל שתמונות הפנים ברורות יותר, ההתאמה מדויקת יותר.',
        ],
      },
    ],
    faq: [
      { q: 'כמה תמונות הזיהוי יכול להתמודד איתן?', a: 'הטכנולוגיה בנויה לאירועים שלמים עם כמויות גדולות של תמונות, וממיינת אותן אוטומטית לכל אורח.' },
      { q: 'מה קורה לסלפי של האורח אחרי הזיהוי?', a: 'הסלפי משמש להתאמת התמונות בתוך אותו אירוע. אתם שולטים בגישה לגלריה ובסגירתה.' },
      { q: 'הזיהוי עובד גם בתמונות קבוצתיות?', a: 'כן. גם בתמונה עם הרבה אנשים, האורח יקבל אותה אם הוא מזוהה בה.' },
    ],
    related: [
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'גלריית חתונה עם זיהוי פנים', href: '/he/galeria-hatuna-zihui-panim' },
      { label: 'שליחת תמונות לאורחים באירוע', href: '/he/shlihat-tmunot-orchim' },
    ],
    audience: 'צלמים ומפיקים שרוצים להבין את טכנולוגיית זיהוי הפנים שמאחורי הגלריה האישית.',
    changefreq: 'monthly',
    priority: 0.7,
  },
  {
    key: 'he-galeria-hevrot-hafaka',
    path: '/he/galeria-hevrot-hafaka',
    lang: 'he',
    dir: 'rtl',
    title: 'גלריה לחברות הפקה | Pixflow',
    description:
      'חברות הפקה מנהלות הרבה אירועים במקביל בגלריות ממותגות עם זיהוי פנים. כל לקוח מקבל קישור אחד, וכל אורח מקבל את התמונות שלו — בקנה מידה גדול.',
    eyebrow: 'פתרון לחברות הפקה',
    h1: 'ניהול גלריות לכל האירועים שלכם, ממותג ובקנה מידה',
    intro:
      'חברות הפקה מטפלות בהרבה אירועים בו-זמנית. Pixflow מאפשרת לספק לכל אירוע גלריה ממותגת עם זיהוי פנים, ולשתף אותה בקישור אחד מסודר.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    alternates: { he: '/he/galeria-hevrot-hafaka', en: '/event-production-companies' },
    sections: [
      {
        h2: 'בנוי להיקפים גדולים',
        body: 'כשמפיקים אירועים אחד אחרי השני, הסדר הוא קריטי. כל אירוע מקבל גלריה ממותגת משלו, וכל אורח מגיע לתמונות שלו דרך זיהוי פנים — כך שהצוות לא נתקע בשליחה ידנית של תמונות בין אירוע לאירוע.',
      },
      {
        h2: 'מיתוג ושירות שמשאירים רושם',
        bullets: [
          'גלריות ממותגות שמחזקות את המותג שלכם מול הלקוחות.',
          'קישור יחיד לכל אירוע, קל לשליחה ולמעקב.',
          'חוויית אורח מהירה ונקייה מהנייד.',
          'זיהוי פנים שמספק לכל אורח את התמונות שלו אוטומטית.',
        ],
      },
      {
        h2: 'שותף לצמיחה',
        body: 'Pixflow מפותחת מתוך שאיפה להיות הפלטפורמה שחברות הפקה בישראל נשענות עליה לניהול גלריות האירועים שלהן — מהאירוע הראשון ועד עשרות אירועים בחודש.',
      },
    ],
    faq: [
      { q: 'אפשר לנהל כמה אירועים במקביל?', a: 'כן. הפלטפורמה בנויה כך שכל אירוע יקבל גלריה ממותגת נפרדת, ותוכלו לנהל אותם זה לצד זה.' },
      { q: 'כל אירוע יכול להיות ממותג בנפרד?', a: 'הגלריות מוצגות תחת המיתוג שלכם, כך שהלקוחות והאורחים חווים שירות אחיד ומקצועי לאורך כל האירועים.' },
      { q: 'זה מתאים גם לאירועים גדולים עם הרבה אורחים?', a: 'כן. זיהוי הפנים נותן לכל אורח גישה עצמאית לתמונות שלו, מה שמתאים במיוחד לאירועים גדולים.' },
    ],
    related: [
      { label: 'גלריה חכמה לצלמי אירועים', href: '/he/galeria-tzalamei-eruim' },
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'זיהוי פנים לתמונות אירועים', href: '/he/zihui-panim-tmunot' },
    ],
    audience: 'חברות הפקה וצוותי אירועים שמנהלים אירועים רבים ומחפשים פתרון גלריות ממותג ומדרגי.',
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    key: 'he-galeria-hatuna-zihui-panim',
    path: '/he/galeria-hatuna-zihui-panim',
    lang: 'he',
    dir: 'rtl',
    title: 'גלריית חתונה עם זיהוי פנים | Pixflow',
    description:
      'גלריית חתונה שבה כל אורח מצלם סלפי ומקבל מיד את התמונות שלו מהאירוע. ממותגת, נוחה מהנייד ונשמרת בקישור אחד לזוג ולאורחים.',
    eyebrow: 'גלריה לחתונות',
    h1: 'גלריית חתונה שכל אורח מוצא בה את עצמו',
    intro:
      'בחתונה יש מאות אורחים ואלפי תמונות. עם זיהוי פנים, כל אורח מצלם סלפי אחד ומקבל את כל הצילומים שבהם הוא מופיע — מהריקודים ועד החופה.',
    primaryCta: { label: 'צפו בדמו', href: '/demo' },
    secondaryCta: { label: 'לעמוד הבית', href: '/' },
    alternates: { he: '/he/galeria-hatuna-zihui-panim', en: '/wedding-photo-gallery' },
    sections: [
      {
        h2: 'חוויה שהזוג והאורחים יזכרו',
        body: 'במקום אלבום אחד שכולם מחפשים בו את עצמם, כל אורח מקבל גלריה אישית של התמונות שלו. הזוג מקבל גלריה ממותגת ומסודרת אחת, שמרכזת את כל תיעוד החתונה בקישור יחיד שקל לשתף.',
      },
      {
        h2: 'למה זה עובד נהדר בחתונות',
        bullets: [
          'מאות אורחים מוצאים את התמונות שלהם בלי להעמיס על הזוג.',
          'שיתוף בקישור אחד בוואטסאפ או בקבוצת החתונה.',
          'כניסה מהנייד בלי אפליקציה ובלי הרשמה מסובכת.',
          'כל אורח רואה בעיקר את התמונות שבהן הוא מופיע.',
        ],
      },
    ],
    faq: [
      { q: 'איך האורחים מקבלים את התמונות שלהם מהחתונה?', a: 'הם נכנסים לקישור הגלריה, מצלמים סלפי קצר, וזיהוי הפנים מציג להם את כל התמונות שבהן הם מופיעים.' },
      { q: 'הזוג מקבל גישה לכל התמונות?', a: 'כן. הגלריה כוללת את כל תיעוד החתונה במקום אחד, והזוג נהנה מגישה מלאה לכל הצילומים.' },
      { q: 'מה עם פרטיות האורחים בחתונה?', a: 'כל אורח רואה בעיקר את התמונות שבהן הוא מזוהה, ונתוני הזיהוי משמשים להתאמה בתוך אירוע החתונה בלבד.' },
    ],
    related: [
      { label: 'גלריית אירועים עם זיהוי פנים', href: '/he/zihui-panim-galeria' },
      { label: 'זיהוי פנים לתמונות אירועים', href: '/he/zihui-panim-tmunot' },
      { label: 'שליחת תמונות לאורחים באירוע', href: '/he/shlihat-tmunot-orchim' },
    ],
    audience: 'צלמי חתונות וזוגות שרוצים שכל אורח יקבל בקלות את תמונות החתונה שלו.',
    changefreq: 'monthly',
    priority: 0.8,
  },
]

// Lookup helpers (shared by client + server).
export const LANDING_BY_PATH: Record<string, LandingContent> = Object.fromEntries(
  LANDING_PAGES.map(p => [p.path, p]),
)
export const LANDING_PATHS: Set<string> = new Set(LANDING_PAGES.map(p => p.path))

export function getLandingByPath(path: string): LandingContent | undefined {
  const clean = path !== '/' ? path.replace(/\/+$/, '') : path
  return LANDING_BY_PATH[clean]
}

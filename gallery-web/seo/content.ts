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

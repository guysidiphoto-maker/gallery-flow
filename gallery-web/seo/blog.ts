// ─────────────────────────────────────────────────────────────────────────
// seo/blog.ts — PURE DATA. Single source of truth for blog/content posts,
// shared by the server renderer (seo/registry.ts) and the React components
// (src/pages/BlogIndex.tsx, src/pages/BlogPost.tsx).
//
// Same rules as seo/content.ts: no Node APIs, no invented stats/claims,
// professional and truthful. Dates are ISO strings (no Date.now()).
// ─────────────────────────────────────────────────────────────────────────

export type Lang = 'he' | 'en'

export interface BlogSection {
  h2?: string
  paragraphs?: string[]
  bullets?: string[]
}

export interface BlogPost {
  slug: string
  path: string // /blog/<slug>
  lang: Lang
  dir: 'rtl' | 'ltr'
  title: string // <title>
  h1: string
  description: string // meta description, 120–155
  excerpt: string // shown on the index
  datePublished: string // ISO date
  dateModified: string // ISO date
  author: string
  readingMinutes: number
  sections: BlogSection[]
  related: { label: string; href: string }[]
}

export const BLOG_INDEX_PATH = '/blog'

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-deliver-event-photos-faster',
    path: '/blog/how-to-deliver-event-photos-faster',
    lang: 'en',
    dir: 'ltr',
    title: 'How to Deliver Event Photos Faster | Pixflow',
    h1: 'How to deliver event photos faster after an event',
    description:
      'Practical ways event photographers can cut delivery time — from culling and uploads to letting guests find their own photos with face recognition.',
    excerpt:
      'Speed is the difference between photos that get shared while the event is still fresh and photos nobody remembers. Here is how to compress your delivery timeline without cutting corners.',
    datePublished: '2026-06-21',
    dateModified: '2026-06-21',
    author: 'Pixflow',
    readingMinutes: 6,
    sections: [
      {
        paragraphs: [
          'For event photography, delivery speed is part of the product. Guests are most excited about photos in the hours and days right after an event — that is when they share, tag, and talk about your work. A gallery that lands two weeks later gets a fraction of the engagement.',
          'The good news: most of the delay in event delivery is process, not photography. Here are the highest-impact ways to deliver faster.',
        ],
      },
      {
        h2: '1. Decide on a delivery model before the event',
        paragraphs: [
          'The fastest photographers know exactly how photos will be delivered before they pick up a camera. Will you deliver a single gallery link? Will guests self-serve their own photos? Settling this in advance removes decisions from the post-event crunch when you are tired and behind.',
        ],
      },
      {
        h2: '2. Cull less, deliver more',
        paragraphs: [
          'Heavy culling is often the biggest bottleneck. For event work — as opposed to a tightly art-directed shoot — guests value finding themselves over a perfectly curated edit. A lighter cull plus a fast gallery usually beats a slow, perfect one.',
        ],
      },
      {
        h2: '3. Let guests find their own photos',
        paragraphs: [
          'The single biggest time sink in event delivery is sorting and sending photos to specific people. Face recognition removes that step entirely: a guest takes a selfie and instantly sees the photos they appear in, with no manual tagging from you.',
          'This is the model Pixflow is built around — you upload once, and every guest self-serves their own photos from a branded gallery.',
        ],
      },
      {
        h2: '4. Upload while you work, not after',
        bullets: [
          'Start uploads as soon as you have a first batch, instead of waiting for the full set.',
          'Use a reliable connection and a tool that resumes interrupted uploads.',
          'Share the gallery link early and let it fill in — guests can return for more.',
        ],
      },
      {
        h2: '5. Brand it once, reuse it everywhere',
        paragraphs: [
          'Set up your studio branding — logo, colors, name — once, so every new gallery is on-brand without extra work. Consistent branding also means every shared photo markets your studio.',
        ],
      },
      {
        h2: 'The takeaway',
        paragraphs: [
          'Faster delivery is mostly about removing manual steps: decide the model up front, cull lighter, upload as you go, and let face recognition do the per-guest sorting. Do that and you can share galleries while the event is still the conversation.',
        ],
      },
    ],
    related: [
      { label: 'How face recognition delivery works', href: '/how-it-works' },
      { label: 'For event photographers', href: '/event-photographers' },
      { label: 'Face recognition photo gallery', href: '/face-recognition-photo-gallery' },
    ],
  },
  {
    slug: 'what-to-look-for-in-an-event-gallery-platform',
    path: '/blog/what-to-look-for-in-an-event-gallery-platform',
    lang: 'en',
    dir: 'ltr',
    title: 'What to Look For in an Event Photo Gallery Platform | Pixflow',
    h1: 'What to look for in an event photo gallery platform',
    description:
      'A practical buyer’s guide for choosing an event photo gallery platform: face recognition, branding, delivery speed, mobile experience, and privacy.',
    excerpt:
      'Not every gallery tool is built for events. If you shoot weddings, conferences, or festivals, here are the capabilities that actually matter when you choose a platform.',
    datePublished: '2026-06-21',
    dateModified: '2026-06-21',
    author: 'Pixflow',
    readingMinutes: 7,
    sections: [
      {
        paragraphs: [
          'Most photo gallery tools were designed for portrait and wedding-album delivery: a small number of curated images for one client. Events are a different problem — hundreds or thousands of photos, and hundreds of people who each want only the photos they are in.',
          'If you work events, here is what to evaluate when choosing a gallery platform.',
        ],
      },
      {
        h2: 'Face recognition for guest self-service',
        paragraphs: [
          'The defining feature for events is whether guests can find their own photos. Face recognition lets a guest take a selfie and instantly see every photo they appear in, instead of scrolling through everything or waiting for you to sort by person. This is the capability that turns a gallery from a storage link into an experience.',
        ],
      },
      {
        h2: 'Branding that is yours, not the platform’s',
        paragraphs: [
          'Every gallery you share is a marketing surface. Look for full branding — your logo, colors, and name — so the platform stays invisible and your studio stays front and center.',
        ],
      },
      {
        h2: 'Delivery speed and a single shareable link',
        bullets: [
          'How fast can you get a gallery live after an event ends?',
          'Is there one clean link you can drop into WhatsApp, email, or event signage?',
          'Can guests access photos without creating an account or installing an app?',
        ],
      },
      {
        h2: 'A mobile-first guest experience',
        paragraphs: [
          'Guests open event links on their phones. The gallery, the face search, and the downloads all need to feel effortless on mobile — that is where the engagement and sharing actually happen.',
        ],
      },
      {
        h2: 'Privacy and access control',
        paragraphs: [
          'Events involve a lot of people, so privacy matters. Look for clear access controls — public, password, or client-code — and make sure private galleries stay private and are never publicly indexed. Face matching should help guests find their own photos, with you in control of visibility.',
        ],
      },
      {
        h2: 'How Pixflow fits',
        paragraphs: [
          'Pixflow is built specifically for this event workflow: AI face recognition so guests self-serve, full studio branding, fast delivery from a single link, a mobile-first guest experience, and access controls that keep private galleries private. It is designed for professional event photographers and production companies who deliver at volume.',
        ],
      },
    ],
    related: [
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
      { label: 'For production companies', href: '/event-production-companies' },
      { label: 'How it works', href: '/how-it-works' },
    ],
  },
]

export const BLOG_BY_PATH: Record<string, BlogPost> = Object.fromEntries(
  BLOG_POSTS.map(p => [p.path, p]),
)
export const BLOG_PATHS: Set<string> = new Set(BLOG_POSTS.map(p => p.path))

export function getPostByPath(path: string): BlogPost | undefined {
  const clean = path.replace(/\/+$/, '')
  return BLOG_BY_PATH[clean]
}

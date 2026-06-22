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
  {
    slug: 'a-face-recognition-workflow-for-event-photographers',
    path: '/blog/a-face-recognition-workflow-for-event-photographers',
    lang: 'en',
    dir: 'ltr',
    title: 'A Face Recognition Workflow for Photographers | Pixflow',
    h1: 'A face recognition workflow for event photographers: shoot to self-serve',
    description:
      'A practical end-to-end face recognition workflow for event photographers — from shooting and culling to upload, indexing, and guest self-service delivery.',
    excerpt:
      'Face recognition only saves time if it fits the way you already work. Here is a practical, end-to-end workflow — from the way you shoot to the moment guests pull their own photos.',
    datePublished: '2026-06-22',
    dateModified: '2026-06-22',
    author: 'Pixflow',
    readingMinutes: 8,
    sections: [
      {
        paragraphs: [
          'Face recognition gets sold as a single feature: a guest takes a selfie, they get their photos. But the quality of that moment is decided long before the guest ever opens the gallery — it is decided by how you shoot, how you cull, and how you upload. Treat face recognition as the last step of a workflow rather than a magic button, and the results get noticeably better.',
          'This is a practical, end-to-end workflow for event photographers, written around how face matching actually behaves in the real world. None of it requires changing your style of photography. It is mostly about removing friction so the matching has good material to work with and guests have a clean path to their own photos.',
        ],
      },
      {
        h2: 'How face matching works (the short version)',
        paragraphs: [
          'You do not need to understand the math, but a rough mental model helps. A face recognition system converts each detected face into a numerical signature that captures the geometry of that face. When a guest takes a selfie, their selfie becomes a signature too, and the system returns the photos whose signatures are close enough to match.',
          'Two consequences follow. First, the system matches on faces, not names — it never needs to know who anyone is, only which faces belong together. Second, anything that makes a face hard to read for a human (heavy motion blur, deep shadow, extreme angles, a face mostly turned away) also makes it harder to match. Your job on the day is simply to give the system enough clear faces per person that at least some of them match confidently.',
        ],
      },
      {
        h2: 'Step 1 — Shoot with matching in mind (without changing your style)',
        paragraphs: [
          'You are not going to pose every guest, and you should not try to. The goal is coverage, not perfection: across an event, most people naturally end up in a few frames where their face is reasonably sharp and front-facing. A few small habits make that far more likely.',
        ],
        bullets: [
          'Get at least one cleaner, well-lit frame of key groups — the couple, the speakers, the VIPs, the family tables.',
          'Do not skip the candids. People in motion, mid-laugh, or in profile still match as long as some of their other frames are clean.',
          'Be aware of backlight and stage lighting. A face that is a silhouette to your eye is a silhouette to the system too.',
          'Shoot the room from a few angles. More coverage per person means more chances for a confident match.',
        ],
      },
      {
        h2: 'Step 2 — Cull lightly, and cull for people',
        paragraphs: [
          'Event culling is a different discipline from culling a styled portrait session. For an event, every guest is hoping to find themselves, and the photo they love most is often one you would have cut — the slightly imperfect one where they are laughing with their friends.',
          'So cull for technical failures, not for taste: drop frames that are genuinely out of focus, badly exposed, or accidental, and keep the rest. A lighter cull means more people are represented, more selfies return results, and fewer guests walk away disappointed.',
        ],
      },
      {
        h2: 'Step 3 — Upload once, index automatically',
        paragraphs: [
          'Once your set is ready, the workflow collapses into a single action: upload the gallery. With a platform built around face recognition, indexing happens automatically as part of that upload — the system detects faces and builds the signatures in the background. You do not tag anyone or sort by person; that manual sorting is exactly the step face recognition exists to delete.',
          'This is the core of how Pixflow is designed to work: you upload to a branded gallery, the faces are indexed for you, and the per-guest sorting that used to eat your evenings simply does not happen anymore. Start uploading as soon as you have a first batch and let the gallery fill in.',
        ],
      },
      {
        h2: 'Step 4 — Let guests self-serve',
        paragraphs: [
          'You share one link — dropped into WhatsApp, sent by email, printed on event signage, or turned into a QR code. The guest opens it on their phone, takes a quick selfie, and is shown the photos they appear in. No account, no app install, no scrolling through a thousand images.',
          'This quietly removes a huge amount of post-event admin. The biggest drain on a photographer’s time after an event is rarely editing — it is the trickle of messages asking “can you send me the ones of me and Sarah?” Self-serve face search answers that question before it is ever asked, for every guest at once.',
        ],
      },
      {
        h2: 'Step 5 — Handle the edge cases',
        paragraphs: [
          'No system matches every face perfectly, and it helps to know where the gaps are. A guest who only appears in a few dim, side-on frames may get a partial result; someone in sunglasses or a mask in every shot may not match at all.',
        ],
        bullets: [
          'Set expectations gently: a good, well-lit selfie returns the best results.',
          'Coverage is your safety net — the lighter cull from Step 2 pays off again here.',
          'For anyone who does not match well, the gallery is still fully browsable, so they are never locked out.',
        ],
      },
      {
        h2: 'Putting it together',
        paragraphs: [
          'The whole workflow is short on purpose: shoot for coverage, cull for failures rather than taste, upload once and let indexing run, share a single link, and let guests pull their own photos. Each step makes the final selfie-to-photos moment feel instant and reliable — and it means your galleries land while the event is still the thing everyone is talking about.',
        ],
      },
    ],
    related: [
      { label: 'How face recognition delivery works', href: '/how-it-works' },
      { label: 'For event photographers', href: '/event-photographers' },
      { label: 'How to deliver event photos faster', href: '/blog/how-to-deliver-event-photos-faster' },
    ],
  },
  {
    slug: 'corporate-event-photo-delivery-playbook',
    path: '/blog/corporate-event-photo-delivery-playbook',
    lang: 'en',
    dir: 'ltr',
    title: 'Corporate Event Photo Delivery: A Playbook | Pixflow',
    h1: 'Corporate event photo delivery: a playbook for marketing and event teams',
    description:
      'A practical playbook for marketing and event teams: how to plan, brand, and deliver corporate event photos at scale with self-serve face recognition.',
    excerpt:
      'Corporate events generate thousands of photos and hundreds of people who each want only the ones they are in. This is a playbook for delivering them without drowning in requests.',
    datePublished: '2026-06-22',
    dateModified: '2026-06-22',
    author: 'Pixflow',
    readingMinutes: 9,
    sections: [
      {
        paragraphs: [
          'Corporate event photography has a distribution problem that wedding and portrait work does not. A conference, sales kickoff, gala, or trade-show booth can produce thousands of images and put hundreds of attendees in front of the lens — and each of them, plus your own leadership, marketing, and PR teams, wants a different slice of the set. Delivering that well is an operations challenge as much as a photography one.',
          'This playbook is for the people who own that challenge: marketing managers, internal communications teams, and event producers. It assumes the photos will be good. The question is how you turn a hard drive full of images into photos that actually get used — without delivery turning into weeks of email.',
        ],
      },
      {
        h2: 'Decide what the photos are for before the event',
        paragraphs: [
          'Corporate event photos usually serve three audiences at once, and they pull in different directions. Naming them up front changes how you brief the photographer and how you deliver. Write a one-line shot brief for each before the event, and you will both shoot the right things and know exactly how to deliver them afterward.',
        ],
        bullets: [
          'Attendees and employees, who mostly want the candids of themselves and their colleagues to share and keep.',
          'Marketing and brand, who want hero shots — the keynote, the stage, the branded environment — for recaps, social, and next year’s promotion.',
          'Leadership, PR, and sales, who want clean, usable images of specific executives, speakers, partners, and award moments.',
        ],
      },
      {
        h2: 'Build the delivery plan into the run-of-show',
        paragraphs: [
          'The biggest delays in corporate delivery are almost never the editing — they are the unanswered questions afterward: who approves the photos, who can be shown publicly, where the files are allowed to live, and who can download them. Settle these while planning the event, not while three teams are chasing you the week after.',
        ],
        bullets: [
          'Approvals: decide who signs off before any photo goes public, and how fast they can turn it around.',
          'Consent and privacy: confirm your attendee photography policy and how guests were notified.',
          'Access tiers: plan who gets the full set versus a curated subset — all-staff, leadership, partners, press.',
          'Branding: have the logo, colors, and event name ready so the gallery looks like your event, not a generic file dump.',
        ],
      },
      {
        h2: 'Solve the “where are the photos of me?” problem at scale',
        paragraphs: [
          'At a corporate event, the single most repeated request is some version of “can you send me the photos I’m in?” Multiplied across hundreds of attendees and routed through one or two people on the marketing team, that becomes a genuine bottleneck.',
          'Self-serve face recognition removes it entirely. Attendees open one gallery link, take a selfie, and instantly see every photo they appear in — no manual sorting by your team, no account, no app. This is the model Pixflow is built around: you (or your photographer) upload once, faces are indexed automatically, and every attendee pulls their own photos from a branded gallery. Your team stops being a switchboard for photo requests.',
        ],
      },
      {
        h2: 'Make one link do the distribution',
        paragraphs: [
          'Corporate delivery works best when there is exactly one place to send people. A single gallery link can go into the post-event email, the internal Slack or Teams channel, the event app, or a printed QR code so attendees grab their photos before they have even left the venue.',
          'One link also protects your brand. Every gallery is a branded surface — your logo, colors, and event name — so the recap reinforces the brand instead of looking like a shared drive. And because you control access, you decide whether the gallery is open, password-gated, or restricted to a specific audience.',
        ],
      },
      {
        h2: 'Feed your brand channels without a second shoot',
        paragraphs: [
          'The marketing value of an event does not end on the day. A well-organized gallery is a content library you can draw on for weeks: the recap post, the thank-you email, the case study, next year’s campaign, and the steady drip of social content that keeps the event alive.',
          'Plan for this by keeping hero shots easy to find and separate from the candids, and by capturing enough variety — wide room shots, speaker close-ups, branded environments, attendee moments — that you are not rationing three usable images across every channel.',
        ],
      },
      {
        h2: 'Respect privacy as a default, not an afterthought',
        paragraphs: [
          'Corporate events carry obligations consumer events do not: employee privacy, attendee consent, NDAs around certain guests, and sometimes regulatory constraints. Delivery should make honoring those obligations easy rather than relying on everyone to remember them.',
          'Practically, that means choosing access controls deliberately — public link, password, or a restricted audience — and keeping private galleries genuinely private and never publicly indexed. Face matching should help attendees find their own photos while you stay in control of who can see what.',
        ],
      },
      {
        h2: 'A simple delivery checklist',
        paragraphs: [
          'Pulling it together, here is the short version a marketing or event team can run for any corporate event.',
        ],
        bullets: [
          'Before: write a three-audience shot brief, confirm consent and approvals, and prepare branding assets.',
          'During: shoot for coverage and capture hero shots separately from candids; consider QR signage for on-site self-serve.',
          'Delivery: upload once to a branded gallery, let face recognition index attendees automatically, and share a single controlled link.',
          'After: pull hero shots into recaps and social, keep the gallery as a content library, and let attendees self-serve.',
        ],
      },
    ],
    related: [
      { label: 'Corporate event gallery', href: '/corporate-event-gallery' },
      { label: 'For production companies', href: '/event-production-companies' },
      { label: 'AI event photo gallery', href: '/ai-event-photo-gallery' },
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

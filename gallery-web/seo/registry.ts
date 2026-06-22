// ─────────────────────────────────────────────────────────────────────────
// SEO registry — single source of truth for Pixflow's crawlable marketing
// routes. Imported by:
//   • api/page.ts        → server-renders <head> + above-the-fold content
//   • api/sitemap.xml.ts → emits <url> entries + hreflang alternates
//
// Why a registry: a Vite SPA renders client-side, so crawlers and AI answer
// engines (GPTBot, PerplexityBot, ClaudeBot, Googlebot without JS) would
// otherwise see one generic shell for every route. This file gives every
// marketing route real, unique, truthful HTML — title, description,
// canonical, hreflang, Open Graph, Twitter, JSON-LD, and a server-rendered
// content block — reusing the server-render pattern proven in
// api/gallery-page.ts.
//
// Keyword landing pages come from seo/content.ts (pure data, shared with the
// React renderer src/pages/SeoLanding.tsx) so crawler copy and user copy never
// diverge.
//
// Content rules: no false claims, no invented customers/logos/prices/rankings,
// no "#1" as fact. bodyHtml is author-trusted static content — never
// interpolate request data into it.
//
// NOTE: a `/pricing` SSR route is intentionally NOT defined here. The pricing
// page (PricingPage + its SPA route) lives on feat/pricing-model-v2; this
// branch is based on main, which has no /pricing route. Add the pricing entry
// when that branch merges, so the SSR route and the SPA route ship together.
// ─────────────────────────────────────────────────────────────────────────

import { LANDING_PAGES, type LandingContent } from './content.js'
import { BLOG_POSTS, BLOG_INDEX_PATH, type BlogPost } from './blog.js'

export const SITE_ORIGIN =
  process.env.SITE_ORIGIN || process.env.NEXT_PUBLIC_SITE_URL || 'https://pixflow-ai.com'

export const OG_DEFAULT = `${SITE_ORIGIN}/og-default.png`
export const LOGO_URL = `${SITE_ORIGIN}/pixflow-icon-512.png`

export type Lang = 'he' | 'en'

export interface SeoRoute {
  key: string
  path: string
  lang: Lang
  dir: 'rtl' | 'ltr'
  title: string
  description: string
  alternates?: Partial<Record<Lang, string>>
  bodyHtml: string
  jsonLd: Record<string, unknown>[]
  ogImage?: string
  changefreq: string
  priority: number
  indexable: boolean
}

// Escape author text before it lands in HTML. Content is trusted (no user
// input), but copy contains characters like `&` (e.g. "events & conferences")
// that must be escaped for valid markup.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Schema.org builders ────────────────────────────────────────────────────

export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: 'Pixflow',
    url: SITE_ORIGIN,
    logo: LOGO_URL,
    description:
      'Pixflow is an AI face-recognition photo gallery platform for event photographers and production companies. Guests find their own photos in seconds and the studio delivers branded galleries instantly.',
    sameAs: [] as string[],
  }
}

export function websiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: 'Pixflow',
    url: SITE_ORIGIN,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    inLanguage: ['he', 'en'],
  }
}

export function softwareApplicationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_ORIGIN}/#software`,
    name: 'Pixflow',
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web, macOS',
    url: SITE_ORIGIN,
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    description:
      'AI face-recognition event photo galleries. Photographers upload once; guests take a selfie or browse to instantly find their own photos in a branded, shareable gallery.',
    featureList: [
      'AI face recognition photo search',
      'Instant branded event galleries',
      'Selfie-based photo finding for guests',
      'One-tap sharing and downloads',
      'Custom studio branding',
      'Fast delivery after events',
    ],
  }
}

export function serviceLd(opts: {
  name: string
  description: string
  audience: string
  lang: Lang
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    serviceType: 'AI face recognition event photo gallery',
    provider: { '@id': `${SITE_ORIGIN}/#organization` },
    description: opts.description,
    areaServed: ['IL', 'Worldwide'],
    audience: { '@type': 'Audience', audienceType: opts.audience },
    inLanguage: opts.lang,
  }
}

export function faqLd(qas: { q: string; a: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qas.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

export function breadcrumbLd(items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${SITE_ORIGIN}${it.path}`,
    })),
  }
}

// ── Shared content fragments (home / static pages) ──────────────────────────

const NAV_HE = `
    <nav aria-label="ראשי" style="display:flex;gap:20px;flex-wrap:wrap;font-size:15px">
      <a href="/" style="color:#1a1a1a">בית</a>
      <a href="/demo" style="color:#1a1a1a">דמו</a>
      <a href="/en" style="color:#1a1a1a">English</a>
    </nav>`

const NAV_EN = `
    <nav aria-label="Primary" style="display:flex;gap:20px;flex-wrap:wrap;font-size:15px">
      <a href="/en" style="color:#1a1a1a">Home</a>
      <a href="/how-it-works" style="color:#1a1a1a">How it works</a>
      <a href="/demo" style="color:#1a1a1a">Demo</a>
      <a href="/" style="color:#1a1a1a">עברית</a>
    </nav>`

/** Light-theme crawlable shell for the home/legal pages (matches the cream
 *  editorial home). Replaced by the React SPA on mount. */
function shell(lang: Lang, inner: string): string {
  const nav = lang === 'he' ? NAV_HE : NAV_EN
  return `
  <div style="max-width:880px;margin:0 auto;padding:32px 24px;font-family:${
    lang === 'he'
      ? "'Heebo','Noto Sans Hebrew',system-ui,sans-serif"
      : "'Inter','Inter Tight',system-ui,sans-serif"
  };color:#1a1a1a;line-height:1.6">
    <header style="display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:40px">
      <a href="${lang === 'he' ? '/' : '/en'}" style="font-weight:700;font-size:20px;color:#1a1a1a;text-decoration:none">Pixflow</a>
      ${nav}
    </header>
    <main>
${inner}
    </main>
  </div>`
}

// ── Landing-page renderer (dark theme, inline-styled, self-contained) ────────
// Produces crawlable HTML for a LandingContent that visually matches
// src/pages/SeoLanding.tsx (so first paint ≈ the React page). Self-contained
// inline styles because SeoLanding's CSS lives in a lazy chunk not present on
// first paint.

const D = {
  bg: '#0a0a0f',
  surface: '#12121a',
  text: '#e8e8f0',
  muted: 'rgba(255,255,255,.56)',
  accent: '#818cf8',
  accentStrong: '#6366f1',
  border: 'rgba(255,255,255,.08)',
}

function landingBody(c: LandingContent): string {
  const sections = c.sections
    .map(s => {
      const body = s.body ? `\n        <p style="font-size:17px;color:${D.muted};margin:0">${esc(s.body)}</p>` : ''
      const bullets = s.bullets?.length
        ? `\n        <ul style="margin:8px 0 0;padding:0;list-style:none">${s.bullets
            .map(
              b =>
                `<li style="position:relative;padding-left:26px;margin:12px 0;font-size:17px;color:${D.text}"><span style="position:absolute;left:4px;top:11px;width:7px;height:7px;border-radius:50%;background:${D.accent}"></span>${esc(
                  b,
                )}</li>`,
            )
            .join('')}</ul>`
        : ''
      return `      <section style="padding:40px 0;border-top:1px solid ${D.border}">
        <h2 style="font-size:28px;line-height:1.2;letter-spacing:-.01em;font-weight:700;margin:0 0 14px">${esc(
          s.h2,
        )}</h2>${body}${bullets}
      </section>`
    })
    .join('\n')

  const faq = c.faq.length
    ? `      <section style="padding:40px 0;border-top:1px solid ${D.border}">
        <h2 style="font-size:28px;line-height:1.2;font-weight:700;margin:0 0 14px">Frequently asked questions</h2>
${c.faq
  .map(
    f =>
      `        <div style="padding:18px 0;border-top:1px solid ${D.border}">
          <h3 style="font-size:17px;font-weight:600;margin:0 0 6px">${esc(f.q)}</h3>
          <p style="font-size:16px;color:${D.muted};margin:0">${esc(f.a)}</p>
        </div>`,
  )
  .join('\n')}
      </section>`
    : ''

  const related = c.related.length
    ? `      <section style="padding:40px 0;border-top:1px solid ${D.border}">
        <h2 style="font-size:28px;line-height:1.2;font-weight:700;margin:0 0 14px">Explore more</h2>
        <div style="display:flex;flex-wrap:wrap;gap:10px">${c.related
          .map(
            r =>
              `<a href="${esc(r.href)}" style="display:inline-block;padding:9px 16px;border-radius:999px;border:1px solid ${D.border};background:${D.surface};color:${D.text};font-size:14px;text-decoration:none">${esc(
                r.label,
              )}</a>`,
          )
          .join('')}</div>
      </section>`
    : ''

  const secondary = c.secondaryCta
    ? `<a href="${esc(c.secondaryCta.href)}" style="display:inline-block;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;border:1px solid ${D.border};color:${D.text}">${esc(
        c.secondaryCta.label,
      )}</a>`
    : ''

  // Hebrew landing pages render RTL with a Hebrew shell; English stay LTR.
  const isHe = c.lang === 'he'
  const font = isHe
    ? "'Heebo','Noto Sans Hebrew',system-ui,sans-serif"
    : "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
  const nav = isHe
    ? `<a href="/" style="color:${D.muted};text-decoration:none">בית</a>
        <a href="/demo" style="color:${D.muted};text-decoration:none">דמו</a>
        <a href="/en" style="color:${D.muted};text-decoration:none">English</a>`
    : `<a href="/en" style="color:${D.muted};text-decoration:none">Home</a>
        <a href="/how-it-works" style="color:${D.muted};text-decoration:none">How it works</a>
        <a href="/demo" style="color:${D.muted};text-decoration:none">Demo</a>
        <a href="/" style="color:${D.muted};text-decoration:none">עברית</a>`

  return `
  <div dir="${c.dir}" style="background:${D.bg};color:${D.text};min-height:100vh;font-family:${font};line-height:1.6">
    <header style="display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:980px;margin:0 auto;padding:22px 24px;border-bottom:1px solid ${D.border}">
      <a href="${isHe ? '/' : '/en'}" style="font-weight:700;font-size:19px;color:${D.text};text-decoration:none">Pixflow</a>
      <nav aria-label="Primary" style="display:flex;gap:22px;flex-wrap:wrap;font-size:14px">
        ${nav}
      </nav>
    </header>
    <main style="max-width:760px;margin:0 auto;padding:0 24px">
      <div style="padding:72px 0 8px">
        <p style="text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:600;color:${D.accent};margin:0 0 18px">${esc(
          c.eyebrow,
        )}</p>
        <h1 style="font-size:46px;line-height:1.08;letter-spacing:-.02em;font-weight:700;margin:0 0 20px">${esc(
          c.h1,
        )}</h1>
        <p style="font-size:20px;color:${D.muted};margin:0 0 32px;max-width:640px">${esc(c.intro)}</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <a href="${esc(c.primaryCta.href)}" style="display:inline-block;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;background:${D.accentStrong};color:#fff">${esc(
    c.primaryCta.label,
  )}</a>
          ${secondary}
        </div>
      </div>
${sections}
${faq}
${related}
    </main>
    <footer style="max-width:760px;margin:48px auto 0;padding:28px 24px 56px;border-top:1px solid ${D.border};color:${D.muted};font-size:14px">
      © Pixflow — AI face recognition event photo galleries &nbsp;·&nbsp; <a href="/terms" style="color:${D.muted}">Terms</a> &nbsp;·&nbsp; <a href="/privacy" style="color:${D.muted}">Privacy</a>
    </footer>
  </div>`
}

/** Adapt a content-driven LandingContent into a server SeoRoute. */
function landingToRoute(c: LandingContent): SeoRoute {
  return {
    key: c.key,
    path: c.path,
    lang: c.lang,
    dir: c.dir,
    title: c.title,
    description: c.description,
    alternates: c.alternates,
    bodyHtml: landingBody(c),
    changefreq: c.changefreq,
    priority: c.priority,
    indexable: true,
    jsonLd: [
      organizationLd(),
      serviceLd({
        name: c.h1,
        description: c.description,
        audience: c.audience,
        lang: c.lang,
      }),
      faqLd(c.faq),
      breadcrumbLd([
        { name: 'Home', path: '/en' },
        { name: c.eyebrow, path: c.path },
      ]),
    ],
  }
}

// ── Blog renderer (dark theme, inline-styled, self-contained) ────────────────

function blogPostingLd(p: BlogPost): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.h1,
    description: p.description,
    datePublished: p.datePublished,
    dateModified: p.dateModified,
    author: { '@type': 'Organization', name: p.author, '@id': `${SITE_ORIGIN}/#organization` },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_ORIGIN}${p.path}` },
    image: OG_DEFAULT,
    inLanguage: p.lang,
  }
}

function blogHeaderFooter(inner: string): string {
  return `
  <div style="background:${D.bg};color:${D.text};min-height:100vh;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7">
    <header style="display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:820px;margin:0 auto;padding:22px 24px;border-bottom:1px solid ${D.border}">
      <a href="/en" style="font-weight:700;font-size:19px;color:${D.text};text-decoration:none">Pixflow</a>
      <nav aria-label="Primary" style="display:flex;gap:22px;flex-wrap:wrap;font-size:14px">
        <a href="/en" style="color:${D.muted};text-decoration:none">Home</a>
        <a href="/blog" style="color:${D.muted};text-decoration:none">Blog</a>
        <a href="/demo" style="color:${D.muted};text-decoration:none">Demo</a>
      </nav>
    </header>
    <main style="max-width:680px;margin:0 auto;padding:0 24px">
${inner}
    </main>
    <footer style="max-width:680px;margin:48px auto 0;padding:28px 24px 56px;border-top:1px solid ${D.border};color:${D.muted};font-size:14px">
      © Pixflow — AI face recognition event photo galleries &nbsp;·&nbsp; <a href="/terms" style="color:${D.muted}">Terms</a> &nbsp;·&nbsp; <a href="/privacy" style="color:${D.muted}">Privacy</a>
    </footer>
  </div>`
}

function blogPostBody(p: BlogPost): string {
  const sections = p.sections
    .map(s => {
      const h2 = s.h2
        ? `      <h2 style="font-size:25px;line-height:1.25;font-weight:700;margin:36px 0 12px">${esc(s.h2)}</h2>`
        : ''
      const paras = (s.paragraphs || [])
        .map(t => `      <p style="font-size:18px;color:${D.text};margin:0 0 18px">${esc(t)}</p>`)
        .join('\n')
      const bullets = s.bullets?.length
        ? `      <ul style="margin:8px 0 18px;padding:0;list-style:none">${s.bullets
            .map(
              b =>
                `<li style="position:relative;padding-left:26px;margin:12px 0;font-size:18px;color:${D.text}"><span style="position:absolute;left:4px;top:12px;width:7px;height:7px;border-radius:50%;background:${D.accent}"></span>${esc(
                  b,
                )}</li>`,
            )
            .join('')}</ul>`
        : ''
      return [h2, paras, bullets].filter(Boolean).join('\n')
    })
    .join('\n')

  const related = p.related.length
    ? `      <section style="padding:32px 0 0;border-top:1px solid ${D.border};margin-top:40px">
        <h2 style="font-size:20px;font-weight:700;margin:0 0 14px">Related</h2>
        <div style="display:flex;flex-wrap:wrap;gap:10px">${p.related
          .map(
            r =>
              `<a href="${esc(r.href)}" style="display:inline-block;padding:9px 16px;border-radius:999px;border:1px solid ${D.border};background:${D.surface};color:${D.text};font-size:14px;text-decoration:none">${esc(
                r.label,
              )}</a>`,
          )
          .join('')}</div>
      </section>`
    : ''

  return blogHeaderFooter(`      <article>
        <p style="text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:600;color:${D.accent};margin:44px 0 16px"><a href="/blog" style="color:${D.accent};text-decoration:none">Blog</a></p>
        <h1 style="font-size:38px;line-height:1.12;letter-spacing:-.02em;font-weight:700;margin:0 0 14px">${esc(
          p.h1,
        )}</h1>
        <p style="font-size:14px;color:${D.muted};margin:0 0 32px">${esc(p.author)} · ${esc(
    p.datePublished,
  )} · ${p.readingMinutes} min read</p>
${sections}
${related}
      </article>`)
}

function blogIndexBody(posts: BlogPost[]): string {
  const items = posts
    .map(
      p => `        <article style="padding:28px 0;border-top:1px solid ${D.border}">
          <h2 style="font-size:24px;line-height:1.2;font-weight:700;margin:0 0 8px"><a href="${esc(
            p.path,
          )}" style="color:${D.text};text-decoration:none">${esc(p.h1)}</a></h2>
          <p style="font-size:13px;color:${D.muted};margin:0 0 10px">${esc(p.datePublished)} · ${
        p.readingMinutes
      } min read</p>
          <p style="font-size:17px;color:${D.muted};margin:0 0 10px">${esc(p.excerpt)}</p>
          <a href="${esc(p.path)}" style="color:${D.accent};font-size:15px;text-decoration:none">Read more →</a>
        </article>`,
    )
    .join('\n')
  return blogHeaderFooter(`      <div style="padding:56px 0 8px">
        <h1 style="font-size:42px;line-height:1.1;letter-spacing:-.02em;font-weight:700;margin:0 0 14px">Pixflow Blog</h1>
        <p style="font-size:19px;color:${D.muted};margin:0">Guides and ideas on delivering event photos with AI face recognition — for photographers and production teams.</p>
      </div>
${items}`)
}

function blogToRoute(p: BlogPost): SeoRoute {
  return {
    key: `blog-${p.slug}`,
    path: p.path,
    lang: p.lang,
    dir: p.dir,
    title: p.title,
    description: p.description,
    bodyHtml: blogPostBody(p),
    changefreq: 'monthly',
    priority: 0.6,
    indexable: true,
    jsonLd: [
      organizationLd(),
      blogPostingLd(p),
      breadcrumbLd([
        { name: 'Home', path: '/en' },
        { name: 'Blog', path: BLOG_INDEX_PATH },
        { name: p.h1, path: p.path },
      ]),
    ],
  }
}

const BLOG_INDEX_ROUTE: SeoRoute = {
  key: 'blog-index',
  path: BLOG_INDEX_PATH,
  lang: 'en',
  dir: 'ltr',
  title: 'Pixflow Blog — Event Photo Delivery & Face Recognition',
  description:
    'Guides on delivering event photos with AI face recognition — faster delivery, choosing a gallery platform, and how face-recognition photo delivery works.',
  changefreq: 'weekly',
  priority: 0.6,
  indexable: true,
  bodyHtml: blogIndexBody(BLOG_POSTS),
  jsonLd: [
    organizationLd(),
    {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      '@id': `${SITE_ORIGIN}${BLOG_INDEX_PATH}#blog`,
      name: 'Pixflow Blog',
      url: `${SITE_ORIGIN}${BLOG_INDEX_PATH}`,
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      blogPost: BLOG_POSTS.map(p => ({
        '@type': 'BlogPosting',
        headline: p.h1,
        url: `${SITE_ORIGIN}${p.path}`,
        datePublished: p.datePublished,
      })),
    },
    breadcrumbLd([
      { name: 'Home', path: '/en' },
      { name: 'Blog', path: BLOG_INDEX_PATH },
    ]),
  ],
}

// ── Home / legal FAQ data ───────────────────────────────────────────────────

const HOME_FAQ_HE = [
  { q: 'מה זה Pixflow?', a: 'Pixflow היא פלטפורמה לגלריות תמונות לאירועים עם זיהוי פנים מבוסס בינה מלאכותית. הצלם מעלה את התמונות פעם אחת, והאורחים מוצאים את עצמם תוך שניות באמצעות סלפי או חיפוש חכם.' },
  { q: 'איך עובד חיפוש התמונות לפי זיהוי פנים?', a: 'האורח מצלם סלפי או בוחר את הפנים שלו, ו-Pixflow מאתרת אוטומטית את כל התמונות שבהן הוא מופיע בגלריה — בלי לדפדף ידנית בין אלפי תמונות.' },
  { q: 'למי Pixflow מתאימה?', a: 'לצלמי אירועים, צלמי חתונות, חברות הפקה, מארגני כנסים ופסטיבלים, וצוותי תוכן של מותגים שצריכים לספק תמונות במהירות אחרי האירוע.' },
  { q: 'כמה מהר אפשר לספק גלריה?', a: 'הגלריה ממותגת ומשותפת בקישור אחד. אפשר להתחיל לשתף תמונות תוך דקות מתום האירוע, והאורחים מקבלים גישה מיידית.' },
  { q: 'אפשר למתג את הגלריה בלוגו של הסטודיו?', a: 'כן. כל גלריה ניתנת למיתוג מלא עם הלוגו, הצבעים והשם של הסטודיו, כך שהחוויה נראית ומרגישה שלכם.' },
]

const HOME_FAQ_EN = [
  { q: 'What is Pixflow?', a: 'Pixflow is an AI face-recognition photo gallery platform for event photographers. Upload your photos once and guests find themselves in seconds with a selfie or smart search — in a branded, shareable gallery.' },
  { q: 'How does face recognition photo delivery work?', a: 'A guest takes a selfie or selects their face, and Pixflow automatically surfaces every photo they appear in across the gallery — no scrolling through thousands of images.' },
  { q: 'Who is Pixflow for?', a: 'Event and wedding photographers, production companies, conference and festival organizers, and brand content teams who need to deliver event photos fast.' },
  { q: 'How fast can I deliver a gallery?', a: 'Galleries are branded and shared with a single link. You can start sharing photos within minutes of an event ending, and guests get instant access.' },
  { q: 'Can I brand the gallery with my studio logo?', a: 'Yes. Every gallery is fully brandable with your studio logo, colors, and name, so the experience looks and feels like yours.' },
]

// ── Static routes (home + legal) ────────────────────────────────────────────

const STATIC_ROUTES: SeoRoute[] = [
  {
    key: 'home-he',
    path: '/',
    lang: 'he',
    dir: 'rtl',
    title: 'Pixflow — גלריות אירועים חכמות עם זיהוי פנים',
    description:
      'פלטפורמת גלריות אירועים עם זיהוי פנים מבוסס AI. אורחים מוצאים את התמונות שלהם תוך שניות, והצלם מספק גלריה ממותגת בקישור אחד — לצלמי אירועים, חתונות וכנסים.',
    alternates: { he: '/', en: '/en' },
    changefreq: 'weekly',
    priority: 1.0,
    indexable: true,
    bodyHtml: shell(
      'he',
      `      <h1 style="font-size:38px;line-height:1.2;margin:0 0 16px">גלריות אירועים חכמות עם זיהוי פנים</h1>
      <p style="font-size:19px;margin:0 0 24px">Pixflow מאפשרת לצלמי אירועים לספק גלריות ממותגות שבהן כל אורח מוצא את עצמו תוך שניות — בעזרת סלפי או חיפוש חכם מבוסס בינה מלאכותית. מעלים פעם אחת, משתפים בקישור אחד.</p>
      <h2 style="font-size:24px;margin:32px 0 12px">למה צלמים בוחרים ב-Pixflow</h2>
      <ul style="font-size:17px;padding-inline-start:20px">
        <li>חיפוש תמונות לפי זיהוי פנים — האורח מצלם סלפי ומקבל את כל התמונות שלו.</li>
        <li>גלריה ממותגת בלוגו ובצבעים של הסטודיו.</li>
        <li>שיתוף והורדה בלחיצה אחת, מותאם לנייד.</li>
        <li>אספקה מהירה — מתחילים לשתף דקות אחרי האירוע.</li>
      </ul>
      <h2 style="font-size:24px;margin:32px 0 12px">למי זה מתאים</h2>
      <p style="font-size:17px">צלמי אירועים, צלמי חתונות, חברות הפקה, מארגני כנסים ופסטיבלים, וצוותי תוכן של מותגים.</p>
      <p style="margin:28px 0"><a href="/demo" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">צפו בדמו</a> &nbsp; <a href="/en" style="color:#1a1a1a">English site</a></p>
      <h2 style="font-size:24px;margin:40px 0 12px">שאלות נפוצות</h2>
      ${HOME_FAQ_HE.map(
        f => `      <h3 style="font-size:18px;margin:20px 0 6px">${esc(f.q)}</h3>\n      <p style="font-size:16px;margin:0">${esc(f.a)}</p>`,
      ).join('\n')}`,
    ),
    jsonLd: [
      organizationLd(),
      websiteLd(),
      softwareApplicationLd(),
      serviceLd({
        name: 'גלריות אירועים עם זיהוי פנים',
        description: 'פלטפורמה לאספקת תמונות אירועים עם זיהוי פנים מבוסס AI לצלמים ולחברות הפקה.',
        audience: 'Event photographers and production companies',
        lang: 'he',
      }),
      faqLd(HOME_FAQ_HE),
    ],
  },
  {
    key: 'home-en',
    path: '/en',
    lang: 'en',
    dir: 'ltr',
    title: 'Pixflow — AI Face Recognition Photo Galleries for Events',
    description:
      'AI face-recognition event photo galleries. Guests find their photos in seconds with a selfie; photographers deliver branded galleries in one link.',
    alternates: { he: '/', en: '/en' },
    changefreq: 'weekly',
    priority: 0.9,
    indexable: true,
    bodyHtml: shell(
      'en',
      `      <h1 style="font-size:38px;line-height:1.2;margin:0 0 16px">AI Face Recognition Photo Galleries for Events</h1>
      <p style="font-size:19px;margin:0 0 24px">Pixflow lets event photographers deliver branded galleries where every guest finds themselves in seconds — with a selfie or AI-powered search. Upload once, share with a single link.</p>
      <h2 style="font-size:24px;margin:32px 0 12px">Why photographers choose Pixflow</h2>
      <ul style="font-size:17px;padding-inline-start:20px">
        <li>Face recognition photo search — a guest takes a selfie and gets every photo they're in.</li>
        <li>Galleries fully branded with your studio logo and colors.</li>
        <li>One-tap sharing and downloads, optimized for mobile.</li>
        <li>Fast delivery — start sharing minutes after the event ends.</li>
      </ul>
      <h2 style="font-size:24px;margin:32px 0 12px">Explore by use case</h2>
      <ul style="font-size:17px;padding-inline-start:20px">
        <li><a href="/face-recognition-photo-gallery" style="color:#1a1a1a">Face recognition photo gallery</a></li>
        <li><a href="/ai-event-photo-gallery" style="color:#1a1a1a">AI event photo gallery</a></li>
        <li><a href="/event-photographers" style="color:#1a1a1a">For event photographers</a></li>
        <li><a href="/event-production-companies" style="color:#1a1a1a">For production companies</a></li>
        <li><a href="/wedding-photo-gallery" style="color:#1a1a1a">Wedding photo gallery</a></li>
        <li><a href="/corporate-event-gallery" style="color:#1a1a1a">Corporate event gallery</a></li>
        <li><a href="/how-it-works" style="color:#1a1a1a">How it works</a></li>
      </ul>
      <p style="margin:28px 0"><a href="/demo" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none">See the demo</a></p>
      <h2 style="font-size:24px;margin:40px 0 12px">Frequently asked questions</h2>
      ${HOME_FAQ_EN.map(
        f => `      <h3 style="font-size:18px;margin:20px 0 6px">${esc(f.q)}</h3>\n      <p style="font-size:16px;margin:0">${esc(f.a)}</p>`,
      ).join('\n')}`,
    ),
    jsonLd: [
      organizationLd(),
      websiteLd(),
      softwareApplicationLd(),
      serviceLd({
        name: 'AI face recognition event photo galleries',
        description: 'A face-recognition event photo delivery platform for photographers and production companies.',
        audience: 'Event photographers and production companies',
        lang: 'en',
      }),
      faqLd(HOME_FAQ_EN),
    ],
  },
  {
    key: 'demo',
    path: '/demo',
    lang: 'he',
    dir: 'rtl',
    title: 'דמו — Pixflow | חוו את זיהוי הפנים בגלריות אירועים',
    description:
      'נסו את Pixflow בעצמכם — דמו אינטראקטיבי של חיפוש תמונות לפי זיהוי פנים בגלריית אירוע. כך אורחים מוצאים את התמונות שלהם תוך שניות.',
    alternates: { he: '/demo' },
    changefreq: 'monthly',
    priority: 0.6,
    indexable: true,
    bodyHtml: shell(
      'he',
      `      <h1 style="font-size:34px;margin:0 0 16px">דמו אינטראקטיבי</h1>
      <p style="font-size:18px;margin:0 0 20px">חוו כיצד אורח מוצא את התמונות שלו בגלריית Pixflow באמצעות סלפי וזיהוי פנים. הדמו ממחיש את חוויית האורח מקצה לקצה.</p>
      <p style="margin:24px 0"><a href="/" style="color:#1a1a1a">חזרה לעמוד הבית</a> &nbsp; <a href="/en" style="color:#1a1a1a">English site</a></p>`,
    ),
    jsonLd: [
      organizationLd(),
      breadcrumbLd([
        { name: 'בית', path: '/' },
        { name: 'דמו', path: '/demo' },
      ]),
    ],
  },
  {
    key: 'terms',
    path: '/terms',
    lang: 'he',
    dir: 'rtl',
    title: 'תנאי שימוש — Pixflow',
    description: 'תנאי השימוש של פלטפורמת Pixflow לגלריות אירועים עם זיהוי פנים.',
    alternates: { he: '/terms' },
    changefreq: 'yearly',
    priority: 0.3,
    indexable: true,
    bodyHtml: shell(
      'he',
      `      <h1 style="font-size:32px;margin:0 0 16px">תנאי שימוש</h1>
      <p style="font-size:17px">תנאי השימוש המלאים של Pixflow מוצגים בעמוד זה. השימוש בפלטפורמה כפוף לתנאים אלה.</p>`,
    ),
    jsonLd: [organizationLd()],
  },
  {
    key: 'privacy',
    path: '/privacy',
    lang: 'he',
    dir: 'rtl',
    title: 'מדיניות פרטיות — Pixflow',
    description:
      'מדיניות הפרטיות של Pixflow — כיצד אנו מטפלים בנתוני זיהוי פנים ובתמונות בגלריות אירועים.',
    alternates: { he: '/privacy' },
    changefreq: 'yearly',
    priority: 0.3,
    indexable: true,
    bodyHtml: shell(
      'he',
      `      <h1 style="font-size:32px;margin:0 0 16px">מדיניות פרטיות</h1>
      <p style="font-size:17px">מדיניות הפרטיות המלאה של Pixflow, לרבות אופן הטיפול בנתוני זיהוי פנים ובתמונות, מוצגת בעמוד זה.</p>`,
    ),
    jsonLd: [organizationLd()],
  },
]

// ── Assembled route table ───────────────────────────────────────────────────

const ROUTES: SeoRoute[] = [
  ...STATIC_ROUTES,
  ...LANDING_PAGES.map(landingToRoute),
  BLOG_INDEX_ROUTE,
  ...BLOG_POSTS.map(blogToRoute),
]

const BY_KEY = new Map(ROUTES.map(r => [r.key, r]))
const BY_PATH = new Map(ROUTES.map(r => [r.path, r]))

export function getRouteByKey(key: string): SeoRoute | undefined {
  return BY_KEY.get(key)
}
export function getRouteByPath(path: string): SeoRoute | undefined {
  const clean = path !== '/' ? path.replace(/\/+$/, '') : path
  return BY_PATH.get(clean)
}
export function allRoutes(): SeoRoute[] {
  return ROUTES
}

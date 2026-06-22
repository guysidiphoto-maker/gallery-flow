import { useEffect } from 'react'
import '../seo-landing.css'
import {
  getLandingByPath,
  type LandingContent,
} from '../../seo/content'

/* ───────────────────────────────────────────────────────────────────────────
   SeoLanding — one React template that renders every content-driven SEO
   landing page (seo/content.ts). The server (seo/registry.ts + api/page.ts)
   renders the same content as crawlable HTML; this is the interactive version
   users see after the SPA mounts. Single source of truth for copy = no drift.
   ───────────────────────────────────────────────────────────────────────── */

function Section({ s }: { s: LandingContent['sections'][number] }) {
  return (
    <section className="seo-section">
      <h2 className="seo-h2">{s.h2}</h2>
      {s.body && <p className="seo-body">{s.body}</p>}
      {s.bullets && s.bullets.length > 0 && (
        <ul className="seo-bullets">
          {s.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SeoLanding() {
  const path =
    typeof window !== 'undefined' ? window.location.pathname : '/'
  const content = getLandingByPath(path)

  // Keep the document head/lang in sync for client navigation and as a
  // belt-and-braces fallback (the SSR layer already sets these on first load).
  useEffect(() => {
    if (!content) return
    document.title = content.title
    document.documentElement.lang = content.lang
    document.documentElement.dir = content.dir
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', content.description)
  }, [content])

  // Unknown landing path (should not happen — main.tsx only routes known
  // paths here). Send the user to the English home rather than render blank.
  if (!content) {
    if (typeof window !== 'undefined') window.location.replace('/en')
    return null
  }

  const faqs = content.faq
  const isHe = content.lang === 'he'
  return (
    <div className="seo-page" dir={content.dir}>
      <header className="seo-header">
        <a className="seo-brand" href={isHe ? '/' : '/en'}>
          Pixflow
        </a>
        <nav className="seo-nav" aria-label="Primary">
          {isHe ? (
            <>
              <a href="/">בית</a>
              <a href="/demo">דמו</a>
              <a href="/en">English</a>
            </>
          ) : (
            <>
              <a href="/en">Home</a>
              <a href="/how-it-works">How it works</a>
              <a href="/demo">Demo</a>
              <a href="/">עברית</a>
            </>
          )}
        </nav>
      </header>

      <main className="seo-container">
        <div className="seo-hero">
          <p className="seo-eyebrow">{content.eyebrow}</p>
          <h1 className="seo-h1">{content.h1}</h1>
          <p className="seo-intro">{content.intro}</p>
          <div className="seo-cta-row">
            <a className="seo-btn seo-btn--primary" href={content.primaryCta.href}>
              {content.primaryCta.label}
            </a>
            {content.secondaryCta && (
              <a className="seo-btn seo-btn--ghost" href={content.secondaryCta.href}>
                {content.secondaryCta.label}
              </a>
            )}
          </div>
        </div>

        {content.sections.map((s, i) => (
          <Section key={i} s={s} />
        ))}

        {faqs.length > 0 && (
          <section className="seo-section">
            <h2 className="seo-h2">Frequently asked questions</h2>
            {faqs.map((f, i) => (
              <div className="seo-faq-item" key={i}>
                <p className="seo-q">{f.q}</p>
                <p className="seo-a">{f.a}</p>
              </div>
            ))}
          </section>
        )}

        {content.related.length > 0 && (
          <section className="seo-section">
            <h2 className="seo-h2">Explore more</h2>
            <div className="seo-related">
              {content.related.map((r, i) => (
                <a className="seo-chip" key={i} href={r.href}>
                  {r.label}
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="seo-footer">
        <span>© Pixflow — AI face recognition event photo galleries</span>
        <span>
          <a href="/terms">Terms</a> &nbsp;·&nbsp; <a href="/privacy">Privacy</a>
        </span>
      </footer>
    </div>
  )
}

export default SeoLanding

import { useEffect } from 'react'
import { cn } from '@/shared/ui'
import { getLandingByPath } from '../../../../seo/content'
import { SeoShell } from '../components/seo/SeoShell'
import { SeoBullets } from '../components/seo/SeoBullets'
import { SeoRelated } from '../components/seo/SeoRelated'
import { seo } from '../components/seo/seoClasses'

// Interactive twin of the server-rendered SEO landing (seo/registry.ts); both
// read seo/content.ts so crawler copy and user copy never drift.

const NAV = [
  { href: '/en', label: 'Home' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/demo', label: 'Demo' },
  { href: '/', label: 'עברית' },
]

const btn = 'inline-block rounded-[10px] px-[26px] py-[13px] text-[15px] font-semibold [transition:translate_0.12s_ease,background_0.15s_ease,border-color_0.15s_ease] active:translate-y-px max-[560px]:flex-auto max-[560px]:text-center'

export function SeoLanding() {
  const content = getLandingByPath(window.location.pathname)

  // Keep head/lang in sync on client navigation (SSR already sets them on first load).
  useEffect(() => {
    if (!content) return
    document.title = content.title
    document.documentElement.lang = content.lang
    document.documentElement.dir = content.dir
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', content.description)
  }, [content])

  // Unknown landing path: send the user to the English home rather than render blank.
  if (!content) {
    window.location.replace('/en')
    return null
  }

  return (
    <SeoShell dir={content.dir} nav={NAV}>
      <div className="pt-[72px] pb-2 max-[560px]:pt-12 max-[560px]:pb-1">
        <p className={seo.eyebrow}>{content.eyebrow}</p>
        <h1 className={seo.h1}>{content.h1}</h1>
        <p className={seo.intro}>{content.intro}</p>
        <div className="mb-4 flex flex-wrap gap-3">
          <a className={cn(btn, 'bg-brand text-white hover:bg-(--mk-brand-hover)')} href={content.primaryCta.href}>
            {content.primaryCta.label}
          </a>
          {content.secondaryCta && (
            <a className={cn(btn, 'border border-white/8 text-(--mk-seo-ink) hover:border-white/28')} href={content.secondaryCta.href}>
              {content.secondaryCta.label}
            </a>
          )}
        </div>
      </div>

      {content.sections.map((s, i) => (
        <section key={i} className={seo.section}>
          <h2 className={seo.h2}>{s.h2}</h2>
          {s.body && <p className={seo.body}>{s.body}</p>}
          {s.bullets && s.bullets.length > 0 && <SeoBullets items={s.bullets} />}
        </section>
      ))}

      {content.faq.length > 0 && (
        <section className={seo.section}>
          <h2 className={seo.h2}>Frequently asked questions</h2>
          {content.faq.map((f, i) => (
            <div className="border-t border-white/8 py-[18px]" key={i}>
              <p className="mb-1.5 text-[17px] font-semibold">{f.q}</p>
              <p className={seo.muted}>{f.a}</p>
            </div>
          ))}
        </section>
      )}

      <SeoRelated title="Explore more" links={content.related} />
    </SeoShell>
  )
}

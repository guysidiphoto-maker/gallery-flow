import { useEffect } from 'react'
import { cn } from '@/shared/ui'
import { BLOG_POSTS } from '../../../../seo/blog'
import { SeoShell } from '../components/seo/SeoShell'
import { BLOG_NAV, seo } from '../components/seo/seoClasses'

// Interactive blog index; the crawlable version is seo/registry.ts (blogIndexBody).

export function BlogIndex() {
  useEffect(() => {
    document.title = 'Pixflow Blog — Event Photo Delivery & Face Recognition'
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  return (
    <SeoShell dir="ltr" nav={BLOG_NAV}>
      <div className="pt-[72px] pb-2 max-[560px]:pt-12 max-[560px]:pb-1">
        <h1 className={seo.h1}>Pixflow Blog</h1>
        <p className={seo.intro}>
          Guides and ideas on delivering event photos with AI face
          recognition — for photographers and production teams.
        </p>
      </div>

      {BLOG_POSTS.map(p => (
        <article className={seo.section} key={p.slug}>
          <h2 className={cn(seo.h2, 'mb-1.5')}>
            <a href={p.path}>{p.h1}</a>
          </h2>
          <p className={cn(seo.muted, 'mb-2.5')}>
            {p.datePublished} · {p.readingMinutes} min read
          </p>
          <p className={cn(seo.body, 'mb-2.5')}>{p.excerpt}</p>
          <a href={p.path} className={seo.chip}>Read more →</a>
        </article>
      ))}
    </SeoShell>
  )
}

import { useEffect } from 'react'
import { cn } from '@/shared/ui'
import { getPostByPath } from '../../../../seo/blog'
import { SeoShell } from '../components/seo/SeoShell'
import { SeoBullets } from '../components/seo/SeoBullets'
import { SeoRelated } from '../components/seo/SeoRelated'
import { BLOG_NAV, seo } from '../components/seo/seoClasses'

// One post from seo/blog.ts; the crawlable version is seo/registry.ts (blogPostBody).
export function BlogPost() {
  const post = getPostByPath(window.location.pathname)

  useEffect(() => {
    if (!post) return
    document.title = post.title
    document.documentElement.lang = post.lang
    document.documentElement.dir = post.dir
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', post.description)
  }, [post])

  if (!post) {
    window.location.replace('/blog')
    return null
  }

  return (
    <SeoShell dir={post.dir} nav={BLOG_NAV}>
      <article>
        <p className={cn(seo.eyebrow, 'mt-11')}>
          <a href="/blog">Blog</a>
        </p>
        <h1 className={seo.h1}>{post.h1}</h1>
        <p className={cn(seo.muted, 'mb-8')}>
          {post.author} · {post.datePublished} · {post.readingMinutes} min read
        </p>

        {post.sections.map((s, i) => (
          <section key={i}>
            {s.h2 && <h2 className={cn(seo.h2, 'mt-9')}>{s.h2}</h2>}
            {s.paragraphs?.map((t, j) => (
              <p className={cn(seo.body, 'mb-[18px] text-(--mk-seo-ink)')} key={j}>{t}</p>
            ))}
            {s.bullets && s.bullets.length > 0 && <SeoBullets items={s.bullets} />}
          </section>
        ))}

        <SeoRelated title="Related" links={post.related} className="mt-10" />
      </article>
    </SeoShell>
  )
}

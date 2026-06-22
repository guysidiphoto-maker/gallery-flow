import { useEffect } from 'react'
import '../seo-landing.css'
import { BLOG_POSTS } from '../../seo/blog'

/* BlogIndex — lists Pixflow blog posts. Server-rendered crawlable version is
   produced by seo/registry.ts (blogIndexBody); this is the interactive page. */
export function BlogIndex() {
  useEffect(() => {
    document.title = 'Pixflow Blog — Event Photo Delivery & Face Recognition'
    document.documentElement.lang = 'en'
    document.documentElement.dir = 'ltr'
  }, [])

  return (
    <div className="seo-page" dir="ltr">
      <header className="seo-header">
        <a className="seo-brand" href="/en">
          Pixflow
        </a>
        <nav className="seo-nav" aria-label="Primary">
          <a href="/en">Home</a>
          <a href="/blog">Blog</a>
          <a href="/demo">Demo</a>
        </nav>
      </header>

      <main className="seo-container">
        <div className="seo-hero">
          <h1 className="seo-h1">Pixflow Blog</h1>
          <p className="seo-intro">
            Guides and ideas on delivering event photos with AI face
            recognition — for photographers and production teams.
          </p>
        </div>

        {BLOG_POSTS.map(p => (
          <article className="seo-section" key={p.slug}>
            <h2 className="seo-h2" style={{ marginBottom: 6 }}>
              <a href={p.path} style={{ color: 'inherit', textDecoration: 'none' }}>
                {p.h1}
              </a>
            </h2>
            <p className="seo-a" style={{ marginBottom: 10 }}>
              {p.datePublished} · {p.readingMinutes} min read
            </p>
            <p className="seo-body" style={{ marginBottom: 10 }}>
              {p.excerpt}
            </p>
            <a href={p.path} className="seo-chip">
              Read more →
            </a>
          </article>
        ))}
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

export default BlogIndex

import { useEffect } from 'react'
import '../seo-landing.css'
import { getPostByPath } from '../../seo/blog'

/* BlogPost — renders a single post from seo/blog.ts. The crawlable server
   version is produced by seo/registry.ts (blogPostBody); this is interactive. */
export function BlogPost() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/blog'
  const post = getPostByPath(path)

  useEffect(() => {
    if (!post) return
    document.title = post.title
    document.documentElement.lang = post.lang
    document.documentElement.dir = post.dir
    const meta = document.querySelector('meta[name="description"]')
    if (meta) meta.setAttribute('content', post.description)
  }, [post])

  if (!post) {
    if (typeof window !== 'undefined') window.location.replace('/blog')
    return null
  }

  return (
    <div className="seo-page" dir={post.dir}>
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
        <article>
          <p className="seo-eyebrow" style={{ marginTop: 44 }}>
            <a href="/blog" style={{ color: 'inherit', textDecoration: 'none' }}>
              Blog
            </a>
          </p>
          <h1 className="seo-h1">{post.h1}</h1>
          <p className="seo-a" style={{ marginBottom: 32 }}>
            {post.author} · {post.datePublished} · {post.readingMinutes} min read
          </p>

          {post.sections.map((s, i) => (
            <section key={i}>
              {s.h2 && (
                <h2 className="seo-h2" style={{ marginTop: 36 }}>
                  {s.h2}
                </h2>
              )}
              {s.paragraphs?.map((t, j) => (
                <p className="seo-body" key={j} style={{ color: 'var(--seo-text)', marginBottom: 18 }}>
                  {t}
                </p>
              ))}
              {s.bullets && s.bullets.length > 0 && (
                <ul className="seo-bullets">
                  {s.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {post.related.length > 0 && (
            <section className="seo-section" style={{ marginTop: 40 }}>
              <h2 className="seo-h2">Related</h2>
              <div className="seo-related">
                {post.related.map((r, i) => (
                  <a className="seo-chip" key={i} href={r.href}>
                    {r.label}
                  </a>
                ))}
              </div>
            </section>
          )}
        </article>
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

export default BlogPost

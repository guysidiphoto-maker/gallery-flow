import { cn } from '@/shared/ui'
import { seo } from './seoClasses'
import type { NavLink } from './SeoShell'

/** "Explore more" / "Related" chip row. */
export function SeoRelated({ title, links, className }: { title: string; links: NavLink[]; className?: string }) {
  if (links.length === 0) return null
  return (
    <section className={cn(seo.section, className)}>
      <h2 className={seo.h2}>{title}</h2>
      <div className={seo.related}>
        {links.map((r, i) => <a className={seo.chip} key={i} href={r.href}>{r.label}</a>)}
      </div>
    </section>
  )
}

import type { ReactNode } from 'react'
import '../../styles/marketing.css'

export interface NavLink { href: string; label: string }

interface Props {
  dir: 'ltr' | 'rtl'
  nav: NavLink[]
  children: ReactNode
}

const navLink = 'text-white/56 transition-colors duration-150 hover:text-(--mk-seo-ink)'
const footLink = 'text-white/56 hover:text-(--mk-seo-ink)'

/** Header, main column and footer shared by the SEO landing and blog pages. */
export function SeoShell({ dir, nav, children }: Props) {
  return (
    <div
      className="mk-root min-h-screen bg-night font-(family-name:--mk-font-inter) leading-[1.6] text-(--mk-seo-ink) antialiased"
      dir={dir}
    >
      <header className="mx-auto flex max-w-[980px] items-center justify-between gap-4 border-b border-white/8 px-6 py-[22px]">
        <a className="text-[19px] font-bold tracking-[-0.01em] text-(--mk-seo-ink)" href="/">
          Pixflow
        </a>
        <nav className="flex flex-wrap gap-[22px] text-[14px]" aria-label="Primary">
          {nav.map(l => <a key={l.href} className={navLink} href={l.href}>{l.label}</a>)}
        </nav>
      </header>

      <main className="mx-auto max-w-[760px] px-6">{children}</main>

      <footer className="mx-auto mt-12 flex max-w-[760px] flex-wrap items-center justify-between gap-[18px] border-t border-white/8 px-6 pt-7 pb-14 text-[14px] text-white/56">
        <span>© Pixflow — AI face recognition event photo galleries</span>
        <span>
          <a className={footLink} href="/terms">Terms</a> &nbsp;·&nbsp; <a className={footLink} href="/privacy">Privacy</a>
        </span>
      </footer>
    </div>
  )
}

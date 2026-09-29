import { useEffect, type ReactNode } from 'react'
import '../../styles/marketing.css'

interface Props {
  title: string
  updated: string
  crossLink: { href: string; label: string }
  footer: ReactNode
  children: ReactNode
}

/** Sticky nav, heading and footer shared by /terms and /privacy. */
export function LegalLayout({ title, updated, crossLink, footer, children }: Props) {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <div dir="rtl" className="mk-root min-h-screen bg-(--mk-legal-bg) font-(family-name:--mk-font-system) text-(--mk-legal-ink)">
      <nav className="sticky top-0 z-10 border-b border-(--mk-legal-line) bg-white py-4">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-6">
          <a href="/" className="text-[20px] font-extrabold text-brand">Pixflow</a>
          <a href={crossLink.href} className="text-[14px] text-brand">{crossLink.label}</a>
        </div>
      </nav>

      <div className="mx-auto max-w-[720px] px-6 pt-12 pb-20">
        <h1 className="mb-2 text-[28px] font-extrabold text-(--mk-legal-ink)">{title}</h1>
        <p className="mb-8 text-[13px] text-(--mk-legal-muted)">{updated}</p>
        {children}
      </div>

      <footer className="border-t border-(--mk-legal-line) bg-white py-5 text-center text-[13px] text-(--mk-legal-muted)">
        {footer}
      </footer>
    </div>
  )
}

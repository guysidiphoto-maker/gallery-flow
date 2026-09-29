const LINKS = [
  { href: '/terms', label: 'תנאי שימוש' },
  { href: '/privacy', label: 'פרטיות' },
  { href: 'mailto:support@pixflow-ai.com', label: 'צור קשר' },
]

/** Minimal legal/contact footer of the cream marketing pages. */
export function CreamFooter() {
  return (
    <footer className="flex flex-col items-center gap-2 border-t border-(--mk-border) p-6">
      <div className="flex gap-4">
        {LINKS.map(l => (
          <a key={l.href} href={l.href} className="mk-small text-muted no-underline">{l.label}</a>
        ))}
      </div>
      <p className="mk-small m-0 text-muted">Pixflow &copy; 2026</p>
    </footer>
  )
}

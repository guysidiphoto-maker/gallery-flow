const LINKS = [
  { href: '/pricing', label: 'מחירים' },
  { href: '/terms', label: 'תנאי שימוש' },
  { href: '/privacy', label: 'פרטיות' },
  { href: 'mailto:support@pixflow-ai.com', label: 'צור קשר' },
]

export function HomeFooter() {
  return (
    <footer className="relative z-[2] border-t border-(--mk-border) bg-canvas px-[clamp(20px,6vw,96px)] py-8">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4">
        <span className="mk-h3 font-(family-name:--mk-font-display) text-ink">pixflow</span>
        <div className="flex flex-wrap gap-6">
          {LINKS.map(l => (
            <a key={l.href} href={l.href} className="mk-small text-muted no-underline">{l.label}</a>
          ))}
        </div>
      </div>
    </footer>
  )
}

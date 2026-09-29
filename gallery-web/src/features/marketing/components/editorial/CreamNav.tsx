import { Button } from '../ui'

interface Props {
  links: Array<{ href: string; label: string }>
  cta: { label: string; onClick: () => void }
  /** `header` renders <header><nav>links</nav></header>; default is <nav><div>links</div></nav>. */
  as?: 'nav' | 'header'
}

/** Top bar of the cream marketing pages: wordmark, text links and a small CTA. */
export function CreamNav({ links, cta, as = 'nav' }: Props) {
  const Outer = as
  const Inner = as === 'header' ? 'nav' : 'div'
  return (
    <Outer className="mx-auto flex max-w-[1200px] items-center justify-between px-[clamp(20px,5vw,56px)] py-4">
      <a href="/" className="mk-h3 font-(family-name:--mk-font-display) text-ink no-underline">pixflow</a>
      <Inner className="flex items-center gap-3">
        {links.map(l => (
          <a key={l.href} href={l.href} className="mk-small text-(--mk-ink-soft) no-underline">{l.label}</a>
        ))}
        <Button size="sm" onClick={cta.onClick}>{cta.label}</Button>
      </Inner>
    </Outer>
  )
}

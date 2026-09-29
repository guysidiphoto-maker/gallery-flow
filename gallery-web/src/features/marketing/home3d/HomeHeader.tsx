import { signInWithGoogle } from '@/shared/lib/auth'
import { Button } from '../components/ui'

const LINK = 'mk-small text-(--mk-ink-soft) no-underline max-[640px]:hidden'

/** Sticky frosted-cream header; secondary links hide on phones. */
export function HomeHeader() {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-(--mk-border) bg-(--mk-cream-light)/72 px-[clamp(20px,6vw,96px)] py-4 backdrop-blur-[12px]">
      <a href="/" className="mk-h3 font-(family-name:--mk-font-display) font-bold text-ink no-underline">
        pixflow
      </a>
      <nav className="flex items-center gap-6">
        <a href="#upload" className={LINK}>איך זה עובד</a>
        <a href="#manage" className={LINK}>לצלמים</a>
        <a href="/demo" className={LINK}>דמו</a>
        <Button size="sm" onClick={() => signInWithGoogle()}>התחילו עכשיו</Button>
      </nav>
    </header>
  )
}

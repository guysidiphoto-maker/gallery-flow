import { cn } from '@/shared/ui'
import { DOWNLOAD_URL, type LandingCopy } from './copy'
import { icons } from './icons'
import { useScrolled } from './useScrolled'

interface Props {
  tx: LandingCopy
  onToggleLang: () => void
  onNavigate: (id: string) => void
  menuOpen: boolean
  onToggleMenu: () => void
}

const link = 'cursor-pointer text-[0.9rem] text-white/50 no-underline transition-colors duration-200 ease-[ease] hover:text-white'
const mobileLink = 'cursor-pointer py-3 text-right text-[1rem] text-(--mk-night-ink) no-underline'

export function LandingNav({ tx, onToggleLang, onNavigate, menuOpen, onToggleMenu }: Props) {
  const scrolled = useScrolled()

  return (
    <nav
      className={cn(
        'fixed inset-x-0 top-0 z-100 h-14 transition-[background,backdrop-filter] duration-300 ease-[ease]',
        scrolled && 'border-b border-white/6 bg-night/80 backdrop-blur-[16px]',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between px-6">
        <span className="text-[1.25rem] font-extrabold tracking-[-0.03em]">{tx.brand}</span>
        <div className="flex items-center gap-6 max-md:hidden">
          <button className={link} onClick={() => onNavigate('features')}>{tx.navFeatures}</button>
          <button className={link} onClick={() => onNavigate('pricing')}>{tx.navPricing}</button>
          <a href={DOWNLOAD_URL} className={cn(link, 'font-semibold text-white')}>{tx.navDownload}</a>
          <button className={cn(link, 'rounded-sm border border-white/15 px-3 py-1 text-[0.8rem]')} onClick={onToggleLang}>
            {tx.langLabel}
          </button>
        </div>
        <button className="hidden cursor-pointer p-1 text-white max-md:block" onClick={onToggleMenu} aria-label="Menu">
          {menuOpen ? icons.close : icons.menu}
        </button>
      </div>
      {menuOpen && (
        <div className="hidden flex-col border-b border-white/6 bg-night/95 px-6 pt-4 pb-6 backdrop-blur-[16px] max-md:flex">
          <button className={mobileLink} onClick={() => onNavigate('features')}>{tx.navFeatures}</button>
          <button className={mobileLink} onClick={() => onNavigate('pricing')}>{tx.navPricing}</button>
          <a href={DOWNLOAD_URL} className={mobileLink}>{tx.navDownload}</a>
          <button className={mobileLink} onClick={onToggleLang}>{tx.langLabel}</button>
        </div>
      )}
    </nav>
  )
}

import type { PortfolioSettings } from '../portfolioSettings'

const link = 'text-[11px] tracking-[.15em] text-white/40 uppercase no-underline transition-colors duration-200'

export function PortfolioFooter({ settings, studioName }: { settings: PortfolioSettings; studioName: string }) {
  return (
    <footer className="border-t border-white/6 px-6 pt-[60px] pb-8 text-center">
      {(settings.phone || settings.email || settings.instagram) && (
        <div className="mb-8 flex flex-wrap justify-center gap-8">
          {settings.phone && <a href={`tel:${settings.phone}`} className={link}>{settings.phone}</a>}
          {settings.email && <a href={`mailto:${settings.email}`} className={link}>{settings.email}</a>}
          {settings.instagram && (
            <a href={`https://instagram.com/${settings.instagram}`} target="_blank" rel="noopener" className={link}>@{settings.instagram}</a>
          )}
        </div>
      )}
      {settings.logoBase64 && <img src={settings.logoBase64} alt="" className="mb-4 max-h-7 opacity-30" />}
      <div className="text-[9px] tracking-[.2em] text-white/15 uppercase">
        {studioName && <span>{studioName} · </span>}
        Powered by Pixflow
      </div>
    </footer>
  )
}

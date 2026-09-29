import type { PortfolioView } from './lib'

export function PortfolioNav({ logo, brandName, view, onHome, onBack }: {
  logo: string
  brandName: string
  view: PortfolioView
  onHome: () => void
  onBack: () => void
}) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-100 flex items-center justify-between bg-[linear-gradient(180deg,rgb(0_0_0/0.6)_0%,transparent_100%)] px-8 py-5">
      <div className="pointer-events-auto cursor-pointer" onClick={onHome}>
        {logo ? (
          <img src={logo} alt="" className="max-h-9 opacity-90 brightness-1000 grayscale" />
        ) : (
          <div className="text-[11px] font-normal tracking-[.25em] text-white/70 uppercase">{brandName}</div>
        )}
      </div>
      {view !== 'home' && (
        <button
          onClick={onBack}
          className="pointer-events-auto cursor-pointer border border-white/20 px-5 py-2 text-[10px] tracking-[.2em] text-white/60 uppercase opacity-70 transition-opacity duration-200 hover:opacity-100"
        >
          Back
        </button>
      )}
    </nav>
  )
}

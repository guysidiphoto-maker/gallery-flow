// /brand-kit — studio identity editor writing businesses.brand_kit.
// Sections auto-save on blur; the header button saves the whole document.
import type { BrandKit as BrandKitDoc } from './brandKit'
import { useBrandKit } from './useBrandKit'
import { Button } from '@/shared/ui'
import { BrandKitIntro } from './components/BrandKitIntro'
import { LogoSection } from './components/LogoSection'
import { ColorsSection } from './components/ColorsSection'
import { TypographySection } from './components/TypographySection'
import { VoiceSection } from './components/VoiceSection'
import { WatermarkSection } from './components/WatermarkSection'
import { SocialSection } from './components/SocialSection'
import './brandKit.css'

const pageShell = 'min-h-screen bg-canvas font-[Heebo,Inter,sans-serif] text-ink'

export function BrandKit() {
  const { loading, brand, setBrand, toast, saveSection, saveAll, uploadLogo, clearLogo } = useBrandKit()

  if (loading) {
    return (
      <div dir="rtl" className={`${pageShell} flex items-center justify-center`}>
        <div className="text-[13px] tracking-[0.14em] text-muted uppercase">Loading</div>
      </div>
    )
  }

  // Callers pass the current `brand` at render time, matching the original blur-save semantics.
  const saveAs = (label: string) => () => saveSection(brand, label)

  return (
    <div dir="rtl" className={`${pageShell} [&_:focus-visible]:rounded-hair [&_:focus-visible]:outline-ink`}>
      <header className="sticky top-0 z-10 border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4 px-7 py-5">
          <div className="flex items-baseline gap-3.5">
            <a href="/dashboard" className="text-xs font-medium tracking-[0.14em] text-muted uppercase no-underline">
              ← Dashboard
            </a>
            <span className="font-display text-[28px] font-medium tracking-[-0.02em] text-ink">Brand Kit</span>
          </div>
          <Button onClick={saveAll} className="px-[22px] text-xs font-semibold tracking-[0.14em]">
            שמירה
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-[900px] flex-col gap-7 px-7 pt-9 pb-24">
        <BrandKitIntro />

        <LogoSection brand={brand} onUpload={uploadLogo} onClear={clearLogo} />

        <ColorsSection
          brand={brand}
          onChange={setBrand}
          onBlur={saveAs('צבעים')}
          onToggleApply={applyToGalleries => {
            void saveSection({ ...brand, apply_to_galleries: applyToGalleries }, 'צבעים')
          }}
        />

        <TypographySection
          brand={brand}
          onSelect={(heading, body) => {
            const next: BrandKitDoc = { ...brand, typography: { heading_family: heading, body_family: body } }
            void saveSection(next, 'טיפוגרפיה')
          }}
        />

        <VoiceSection brand={brand} onChange={setBrand} onBlur={saveAs('טון ומסר')} />
        <WatermarkSection brand={brand} onChange={setBrand} onBlur={saveAs('סימן מים')} />
        <SocialSection brand={brand} onChange={setBrand} onBlur={saveAs('רשתות חברתיות')} />
      </main>

      {toast && (
        <div
          role="status"
          className="fixed start-6 bottom-6 z-[100] animate-[brandkit-toast-in_.18s_ease-out] rounded-hair border border-ink bg-ink px-[18px] py-3 text-xs font-medium tracking-[0.06em] text-white"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

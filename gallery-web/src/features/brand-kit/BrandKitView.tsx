// Brand Kit dashboard tab: studio identity editor writing businesses.brand_kit.
// Sections auto-save on blur; the header button saves the whole document.
import type { BrandKit as BrandKitDoc } from './brandKit'
import { useBrandKit } from './useBrandKit'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { Button, WorkspaceView, workspaceAction } from '@/shared/ui'
import { LogoSection } from './components/LogoSection'
import { ColorsSection } from './components/ColorsSection'
import { TypographySection } from './components/TypographySection'
import { VoiceSection } from './components/VoiceSection'
import { WatermarkSection } from './components/WatermarkSection'
import { SocialSection } from './components/SocialSection'
import { BrandKitSkeleton } from './components/BrandKitSkeleton'
import './brandKit.css'

export function BrandKitView({ businessId }: { businessId: string | null }) {
  const { t } = useOwnerLocale()
  const { loading, brand, setBrand, toast, saveSection, saveAll, uploadLogo, clearLogo } = useBrandKit(businessId)

  // Callers pass the current `brand` at render time, matching the original blur-save semantics.
  const saveAs = (label: string) => () => saveSection(brand, label)

  return (
    <WorkspaceView
      dir="rtl"
      eyebrow={t('nav.workspace')}
      title={t('nav.brandKit')}
      description={t('brandKit.subtitle')}
      actions={
        <Button onClick={saveAll} disabled={loading} className={workspaceAction}>
          {t('brandKit.save')}
        </Button>
      }
    >
      {loading ? (
        <BrandKitSkeleton />
      ) : (
        <div className="flex flex-col gap-7">
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
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed start-6 bottom-6 z-[100] animate-[brandkit-toast-in_.18s_ease-out] rounded-hair border border-ink bg-ink px-[18px] py-3 text-xs font-medium tracking-[0.06em] text-white"
        >
          {toast}
        </div>
      )}
    </WorkspaceView>
  )
}

import type { BrandKit, BrandKitLogoSlot } from '../brandKit'
import { BrandKitCard } from './BrandKitCard'
import { LogoSlotEditor } from './LogoSlotEditor'

const SLOTS: Array<{ slot: BrandKitLogoSlot; label: string; hint: string; dark: boolean }> = [
  { slot: 'url',        label: 'לוגו ראשי',     hint: 'PNG/SVG על רקע בהיר', dark: false },
  { slot: 'dark_url',   label: 'גרסה לרקע כהה', hint: 'אופציונלי',           dark: true },
  { slot: 'square_url', label: 'אייקון ריבועי', hint: 'פבייקון / אווטאר',    dark: false },
]

export function LogoSection({ brand, onUpload, onClear }: {
  brand: BrandKit
  onUpload: (slot: BrandKitLogoSlot, file: File) => Promise<void>
  onClear: (slot: BrandKitLogoSlot) => Promise<void>
}) {
  return (
    <BrandKitCard
      eyebrow="01 — Logo"
      title="לוגו"
      description="עד שלוש גרסאות. המערכת תבחר את הנכונה לפי הקונטקסט (גלריה, מייל, פוסט)."
    >
      <div className="grid grid-cols-3 gap-4">
        {SLOTS.map(s => (
          <LogoSlotEditor
            key={s.slot}
            label={s.label}
            hint={s.hint}
            dark={s.dark}
            url={brand.logo?.[s.slot] ?? null}
            onUpload={file => onUpload(s.slot, file)}
            onClear={() => onClear(s.slot)}
          />
        ))}
      </div>
    </BrandKitCard>
  )
}

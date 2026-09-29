import { Input } from '@/shared/ui'
import type { BrandKit } from '../brandKit'
import { BrandKitCard } from './BrandKitCard'
import { FieldLabel } from './FieldLabel'

type SocialKey = keyof NonNullable<BrandKit['social']>

const FIELDS: Array<{ key: SocialKey; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram',   placeholder: '@studio' },
  { key: 'facebook',  label: 'Facebook',    placeholder: 'facebook.com/studio' },
  { key: 'tiktok',    label: 'TikTok',      placeholder: '@studio' },
  { key: 'twitter',   label: 'X / Twitter', placeholder: '@studio' },
  { key: 'website',   label: 'אתר',         placeholder: 'studio.com' },
]

export function SocialSection({ brand, onChange, onBlur }: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
}) {
  const social = brand.social ?? {}
  return (
    <BrandKitCard
      eyebrow="06"
      title="רשתות חברתיות"
      description="המסבירים מהיכן הסטודיו זמין. מופיעים בכרטיסי שיתוף ובמיילים."
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {FIELDS.map(f => (
          <div key={f.key}>
            <FieldLabel>{f.label}</FieldLabel>
            <Input
              type="text"
              dir="ltr"
              value={social[f.key] ?? ''}
              placeholder={f.placeholder}
              onChange={e => onChange({ ...brand, social: { ...social, [f.key]: e.target.value } })}
              onBlur={onBlur}
              className="px-3 text-left text-[13px]"
            />
          </div>
        ))}
      </div>
    </BrandKitCard>
  )
}

import { cn, Input, Textarea } from '@/shared/ui'
import type { BrandKit, BrandKitLanguage } from '../brandKit'
import { BrandKitCard } from './BrandKitCard'
import { FieldLabel } from './FieldLabel'

const TAGLINE_MAX = 80
const SIGNATURE_MAX = 280

const LANGUAGES: Array<{ id: BrandKitLanguage; label: string }> = [
  { id: 'he', label: 'עברית' },
  { id: 'en', label: 'English' },
  { id: 'auto', label: 'אוטומטי' },
]

export function VoiceSection({ brand, onChange, onBlur, onSave }: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
  /** Apply and persist `next` in one step (for clicks, where no blur follows). */
  onSave: (next: BrandKit) => void
}) {
  const voice = brand.voice ?? {}
  const withVoice = (patch: Partial<NonNullable<BrandKit['voice']>>): BrandKit =>
    ({ ...brand, voice: { ...voice, ...patch } })
  const setVoice = (patch: Partial<NonNullable<BrandKit['voice']>>) => onChange(withVoice(patch))

  return (
    <BrandKitCard
      eyebrow="04"
      title="טון ומסר"
      description="המילים שמלוות את הסטודיו במייל הזמנה, בעמוד פתיחה ובכל סטורי."
    >
      <div className="grid gap-5">
        <div>
          <FieldLabel>טאגליין • {voice.tagline?.length ?? 0}/{TAGLINE_MAX}</FieldLabel>
          <Input
            type="text"
            value={voice.tagline ?? ''}
            maxLength={TAGLINE_MAX}
            placeholder="לדוגמה: רגעים שזוכרים לכל החיים"
            onChange={e => setVoice({ tagline: e.target.value })}
            onBlur={onBlur}
            className="px-3 text-[13px]"
          />
        </div>
        <div>
          <FieldLabel>חתימה • {voice.signature?.length ?? 0}/{SIGNATURE_MAX}</FieldLabel>
          <Textarea
            value={voice.signature ?? ''}
            maxLength={SIGNATURE_MAX}
            rows={4}
            placeholder="חתימה ארוכה לסוף מייל — שם הסטודיו, מיקום, יצירת קשר"
            onChange={e => setVoice({ signature: e.target.value })}
            onBlur={onBlur}
            className="min-h-0 px-3 text-[13px] leading-[1.6]"
          />
        </div>
        <div>
          <FieldLabel>שפה</FieldLabel>
          <div className="flex gap-2">
            {LANGUAGES.map(lang => {
              const active = (voice.language ?? 'he') === lang.id
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onSave(withVoice({ language: lang.id }))}
                  className={cn(
                    'rounded-hair border px-4 py-2 text-xs font-semibold tracking-[0.1em]',
                    active ? 'border-ink bg-ink text-white' : 'border-line bg-transparent text-ink',
                  )}
                >
                  {lang.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </BrandKitCard>
  )
}

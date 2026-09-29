import { cn, Input } from '@/shared/ui'
import type { BrandKit, BrandKitWatermarkPosition, BrandKitWatermarkSource } from '../brandKit'
import { WATERMARK_SOURCES } from '../watermark'
import { BrandKitCard } from './BrandKitCard'
import { FieldLabel } from './FieldLabel'
import { RangeField } from './RangeField'
import { WatermarkPositionPicker } from './WatermarkPositionPicker'
import { WatermarkPreview } from './WatermarkPreview'

type Watermark = NonNullable<BrandKit['watermark']>

export function WatermarkSection({ brand, onChange, onBlur }: {
  brand: BrandKit
  onChange: (next: BrandKit) => void
  onBlur: () => void
}) {
  const wm = brand.watermark ?? {}
  const enabled = Boolean(wm.enabled)
  const source: BrandKitWatermarkSource = wm.source ?? 'logo'
  const position: BrandKitWatermarkPosition = wm.position ?? 'br'
  const opacity = wm.opacity_percent ?? 18
  const scale = wm.scale_percent ?? 12

  const previewText =
    source === 'custom_text' ? wm.text || 'STUDIO'
      : source === 'studio_name' ? (brand.voice?.signature?.split('\n')[0] || 'STUDIO').trim()
        : ''

  const update = (patch: Partial<Watermark>) => onChange({ ...brand, watermark: { ...wm, ...patch } })
  const updateAndSave = (patch: Partial<Watermark>) => { update(patch); onBlur() }

  return (
    <BrandKitCard
      eyebrow="05"
      title="סימן מים"
      description="חתימה דיסקרטית על תמונות הגלריה. ניתן להשתמש בלוגו, בשם הסטודיו או בטקסט חופשי."
    >
      <label className="mb-[22px] flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => updateAndSave({ enabled: e.target.checked })}
          className="size-4 accent-ink"
        />
        <span className="text-[13px] font-medium text-ink">הפעל סימן מים</span>
      </label>

      <div className={cn('grid grid-cols-2 gap-6', !enabled && 'pointer-events-none opacity-50')}>
        <div className="grid gap-5">
          <div>
            <FieldLabel>מקור</FieldLabel>
            <div className="flex flex-col gap-2">
              {WATERMARK_SOURCES.map(opt => (
                <label
                  key={opt.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-hair border px-3 py-2.5',
                    source === opt.id ? 'border-ink bg-raised' : 'border-line bg-transparent',
                  )}
                >
                  <input
                    type="radio"
                    name="watermark-source"
                    checked={source === opt.id}
                    onChange={() => updateAndSave({ source: opt.id })}
                    className="accent-ink"
                  />
                  <span className="text-[13px] text-ink">{opt.label}</span>
                </label>
              ))}
            </div>
            {source === 'custom_text' && (
              <Input
                type="text"
                value={wm.text ?? ''}
                placeholder="STUDIO NAME"
                maxLength={40}
                onChange={e => update({ text: e.target.value })}
                onBlur={onBlur}
                className="mt-2.5 px-3 text-[13px]"
              />
            )}
          </div>

          <div>
            <FieldLabel>מיקום</FieldLabel>
            <WatermarkPositionPicker value={position} onSelect={p => updateAndSave({ position: p })} />
          </div>

          <RangeField
            label={`שקיפות • ${opacity}%`}
            min={5} max={50} value={opacity}
            onChange={v => update({ opacity_percent: v })}
            onCommit={onBlur}
          />

          <RangeField
            label={`גודל • ${scale}%`}
            min={5} max={30} value={scale}
            onChange={v => update({ scale_percent: v })}
            onCommit={onBlur}
          />

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={Boolean(wm.contrast_aware)}
              onChange={e => updateAndSave({ contrast_aware: e.target.checked })}
              className="size-4 accent-ink"
            />
            <span className="text-[13px] text-ink">הסתגלות לניגודיות (אוטומטית הופך לבן/שחור)</span>
          </label>
        </div>

        <WatermarkPreview
          enabled={enabled}
          position={position}
          opacity={opacity}
          scale={scale}
          contrastAware={Boolean(wm.contrast_aware)}
          logoUrl={source === 'logo' ? brand.logo?.url ?? null : null}
          text={previewText}
        />
      </div>
    </BrandKitCard>
  )
}

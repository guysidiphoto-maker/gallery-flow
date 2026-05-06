// FeedStudioControls — two surfaces for steering the Feed Studio AI:
//
// 1. AIDirectionBar — a horizontal pill row of "tweak" buttons. The user
//    clicks one (e.g. "העמק", "יותר עיתונאי", "פחות חזרתי") and the parent
//    re-runs generation via /api/regenerate-feed-with-tweak with that
//    directive prepended to the brief. Stateless, controlled by `busy`.
//
// 2. AdvancedSettingsPanel — a collapsible card of fine-grained controls
//    that flow into Brief.advanced. Sliders, toggles, and segmented
//    controls. Fully controlled — every change emits a fresh AdvancedSettings
//    object via onChange. "Reset to defaults" wipes back to undefined so
//    the AI uses its built-in heuristics.
//
// Visual / interaction language matches FeedStudio.tsx (dark #0a0a0f base,
// #D4FF00 / #7B61FF / #F5A524 accents, RTL, fs-fadeIn animation, btnPill
// shape). All Hebrew strings are constants near the top so a future i18n
// layer can swap them out.

import { useState, type CSSProperties } from 'react'

// ── Public types ────────────────────────────────────────────────────────
export type TweakKind =
  | 'plan_deeper'
  | 'use_more_images'
  | 'more_editorial'
  | 'more_premium'
  | 'more_social'
  | 'less_repetitive'
  | 'spread_gallery_over_3'
  | 'turn_into_carousel'
  | 'replace_weak'
  | 'explain_layout'

export interface AdvancedSettings {
  maxImagesPerGallery?: number
  minImagesPerGallery?: number
  allowGalleryReuse?: boolean
  allowMultiSlot?: boolean
  carouselLength?: number
  storyCount?: number
  textSlideFrequency?: 'low' | 'med' | 'high'
  peopleAtmoRatio?: number       // 0..1
  brandLogoUsage?: 'never' | 'sparingly' | 'often'
  typographyDensity?: 'minimal' | 'balanced' | 'dense'
  colorConsistency?: number      // 0..10
  gridSymmetry?: number          // 0..10
  creativeFreedom?: number       // 0..10
}

// ── Hebrew strings ──────────────────────────────────────────────────────
const HE = {
  directionLabel: 'כיוון את ה-AI',
  thinking:       'AI חושב…',
  advancedTitle:  'הגדרות מתקדמות',
  resetDefaults:  'אפס לברירות מחדל',
  // tweak labels (emoji + text)
  tweaks: {
    plan_deeper:           '🧠 העמק',
    use_more_images:       '🖼 השתמש בעוד תמונות',
    more_editorial:        '📰 יותר עיתונאי',
    more_premium:          '💎 יותר פרימיום',
    more_social:           '📱 יותר סושיאל',
    less_repetitive:       '🔀 פחות חזרתי',
    spread_gallery_over_3: '↔️ פיזור על 3 פוסטים',
    turn_into_carousel:    '🎴 הפוך לקרוסלה',
    replace_weak:          '♻️ החלף חלשים',
    explain_layout:        '❓ הסבר את הסידור',
  } satisfies Record<TweakKind, string>,
  // advanced control labels
  maxImages:        'מקסימום תמונות לגלריה',
  minImages:        'מינימום תמונות לגלריה',
  allowReuse:       'אפשר חזרה על אותה גלריה במספר פוסטים',
  allowMultiSlot:   'פרויקט יכול לתפוס מספר משבצות בגריד',
  carouselLength:   'אורך קרוסלה ברירת-מחדל',
  storyCount:       'מספר סטוריז ברצף',
  textSlideFreq:    'תדירות שקופיות טקסט',
  textSlideOpts:    { low: 'נמוך', med: 'בינוני', high: 'גבוה' } as const,
  brandLogo:        'שימוש בלוגו המותג',
  brandLogoOpts:    { never: 'כלל לא', sparingly: 'מעט', often: 'הרבה' } as const,
  typoDensity:      'צפיפות טיפוגרפיה',
  typoOpts:         { minimal: 'מינימלי', balanced: 'מאוזן', dense: 'צפוף' } as const,
  colorConsistency: 'עקביות צבע',
  gridSymmetry:     'סימטריית גריד',
  creativeFreedom:  'חופש יצירתי',
  creativeFreedomHint: '0=בטוח, 10=ניסיוני',
  on:  'פעיל',
  off: 'כבוי',
}

// ── Tweak → accent color (3 visual groups) ──────────────────────────────
const TWEAK_ORDER: TweakKind[] = [
  'plan_deeper', 'use_more_images', 'more_editorial', 'more_premium',
  'more_social', 'less_repetitive', 'spread_gallery_over_3',
  'turn_into_carousel', 'replace_weak', 'explain_layout',
]

const TWEAK_ACCENT: Record<TweakKind, string> = {
  plan_deeper:           '#D4FF00',
  use_more_images:       '#D4FF00',
  more_editorial:        '#D4FF00',
  more_premium:          '#D4FF00',
  more_social:           '#7B61FF',
  less_repetitive:       '#7B61FF',
  spread_gallery_over_3: '#7B61FF',
  turn_into_carousel:    '#F5A524',
  replace_weak:          '#F5A524',
  explain_layout:        '#F5A524',
}

// ════════════════════════════════════════════════════════════════════════
// AIDirectionBar
// ════════════════════════════════════════════════════════════════════════
export function AIDirectionBar({
  onTweak,
  busy,
}: {
  onTweak: (tweak: TweakKind, ctx?: { galleryId?: string; postId?: string }) => void
  busy?: boolean
}) {
  return (
    <div style={{ direction: 'rtl', animation: 'fs-fadeIn .35s both' }}>
      <style>{`
        .fsc-scroll::-webkit-scrollbar { display: none }
        .fsc-pill { transition: transform .15s, background .15s, border-color .15s }
        .fsc-pill:hover:not(:disabled) { transform: translateY(-1px); background: rgba(255,255,255,.09) }
        .fsc-pill:active:not(:disabled) { transform: translateY(0) }
        @keyframes fsc-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
        .fsc-thinking { animation: fsc-pulse 1.4s ease-in-out infinite }
        .fsc-slider { -webkit-appearance: none; appearance: none; height: 4px; background: rgba(255,255,255,.12); border-radius: 2px; outline: none }
        .fsc-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #D4FF00; cursor: pointer; border: 2px solid #0a0a0f }
        .fsc-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #D4FF00; cursor: pointer; border: 2px solid #0a0a0f }
        .fsc-slider:disabled::-webkit-slider-thumb { background: rgba(255,255,255,.3) }
      `}</style>

      {/* Label / busy indicator */}
      <div style={{
        fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase',
        color: busy ? '#D4FF00' : 'rgba(255,255,255,.5)', marginBottom: 10, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        {busy && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#D4FF00' }} className="fsc-thinking" />}
        <span className={busy ? 'fsc-thinking' : undefined}>
          {busy ? HE.thinking : HE.directionLabel}
        </span>
      </div>

      {/* Pill row */}
      <div
        className="fsc-scroll"
        style={{
          display: 'flex', gap: 8,
          overflowX: 'auto', whiteSpace: 'nowrap',
          paddingBottom: 4,
          opacity: busy ? 0.55 : 1,
          pointerEvents: busy ? 'none' : 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {TWEAK_ORDER.map(kind => (
          <button
            key={kind}
            type="button"
            disabled={busy}
            onClick={() => onTweak(kind)}
            className="fsc-pill"
            style={{
              ...pillBase,
              borderInlineStartColor: TWEAK_ACCENT[kind],
              borderInlineStartWidth: 3,
            }}
          >
            {HE.tweaks[kind]}
          </button>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// AdvancedSettingsPanel
// ════════════════════════════════════════════════════════════════════════
export function AdvancedSettingsPanel({
  value,
  onChange,
  defaultOpen,
}: {
  value: AdvancedSettings
  onChange: (next: AdvancedSettings) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false)

  function patch(p: Partial<AdvancedSettings>) {
    onChange({ ...value, ...p })
  }

  function reset() {
    onChange({})
  }

  const maxImg = value.maxImagesPerGallery ?? 5
  const minImg = value.minImagesPerGallery ?? 1
  const carLen = value.carouselLength ?? 4
  const storyN = value.storyCount ?? 5
  const peoRatio = value.peopleAtmoRatio ?? 0.5
  const colorCon = value.colorConsistency ?? 5
  const gridSym = value.gridSymmetry ?? 5
  const creativeF = value.creativeFreedom ?? 5

  return (
    <div style={{
      direction: 'rtl',
      background: 'rgba(255,255,255,.03)',
      border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 10,
      animation: 'fs-fadeIn .35s both',
    }}>
      <style>{`
        .fsc-chev { transition: transform .25s ease }
      `}</style>

      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', padding: '14px 18px',
          background: 'transparent', border: 'none',
          color: 'rgba(255,255,255,.92)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'inherit', textAlign: 'inherit',
        }}
      >
        <span style={{
          fontSize: 13, fontWeight: 700, letterSpacing: '.04em',
        }}>{HE.advancedTitle}</span>
        <span
          className="fsc-chev"
          style={{
            display: 'inline-block', fontSize: 12, color: 'rgba(255,255,255,.55)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >▾</span>
      </button>

      {open && (
        <div style={{
          padding: '8px 18px 20px', borderTop: '1px solid rgba(255,255,255,.06)',
        }}>
          <div style={{
            display: 'grid', gap: 18,
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            marginTop: 14,
          }}>
            <Field label={HE.maxImages}>
              <NumberInput value={value.maxImagesPerGallery} placeholder={String(maxImg)}
                min={1} max={15} onChange={v => patch({ maxImagesPerGallery: v })} />
            </Field>
            <Field label={HE.minImages}>
              <NumberInput value={value.minImagesPerGallery} placeholder={String(minImg)}
                min={1} max={value.maxImagesPerGallery ?? 15}
                onChange={v => patch({ minImagesPerGallery: v })} />
            </Field>
            <Field label={HE.allowReuse}>
              <Toggle value={value.allowGalleryReuse ?? true}
                onChange={v => patch({ allowGalleryReuse: v })} />
            </Field>
            <Field label={HE.allowMultiSlot}>
              <Toggle value={value.allowMultiSlot ?? false}
                onChange={v => patch({ allowMultiSlot: v })} />
            </Field>
            <Field label={HE.carouselLength}>
              <NumberInput value={value.carouselLength} placeholder={String(carLen)}
                min={2} max={10} onChange={v => patch({ carouselLength: v })} />
            </Field>
            <Field label={HE.storyCount}>
              <NumberInput value={value.storyCount} placeholder={String(storyN)}
                min={3} max={15} onChange={v => patch({ storyCount: v })} />
            </Field>
            <Field label={HE.textSlideFreq}>
              <Segmented value={value.textSlideFrequency}
                options={[
                  { value: 'low',  label: HE.textSlideOpts.low  },
                  { value: 'med',  label: HE.textSlideOpts.med  },
                  { value: 'high', label: HE.textSlideOpts.high },
                ]}
                onChange={v => patch({ textSlideFrequency: v })} />
            </Field>
            <Field label={`אנשים ${Math.round(peoRatio * 100)}% · אווירה ${Math.round((1 - peoRatio) * 100)}%`}>
              <Slider min={0} max={1} step={0.05} value={peoRatio}
                onChange={v => patch({ peopleAtmoRatio: v })} />
            </Field>
            <Field label={HE.brandLogo}>
              <Segmented value={value.brandLogoUsage}
                options={[
                  { value: 'never',     label: HE.brandLogoOpts.never     },
                  { value: 'sparingly', label: HE.brandLogoOpts.sparingly },
                  { value: 'often',     label: HE.brandLogoOpts.often     },
                ]}
                onChange={v => patch({ brandLogoUsage: v })} />
            </Field>
            <Field label={HE.typoDensity}>
              <Segmented value={value.typographyDensity}
                options={[
                  { value: 'minimal',  label: HE.typoOpts.minimal  },
                  { value: 'balanced', label: HE.typoOpts.balanced },
                  { value: 'dense',    label: HE.typoOpts.dense    },
                ]}
                onChange={v => patch({ typographyDensity: v })} />
            </Field>
            <Field label={`${HE.colorConsistency}: ${colorCon}/10`}>
              <Slider min={0} max={10} step={1} value={colorCon}
                onChange={v => patch({ colorConsistency: v })} />
            </Field>
            <Field label={`${HE.gridSymmetry}: ${gridSym}/10`}>
              <Slider min={0} max={10} step={1} value={gridSym}
                onChange={v => patch({ gridSymmetry: v })} />
            </Field>
            <Field label={`${HE.creativeFreedom}: ${creativeF}/10 (${HE.creativeFreedomHint})`}>
              <Slider min={0} max={10} step={1} value={creativeF}
                onChange={v => patch({ creativeFreedom: v })} />
            </Field>
          </div>

          {/* Reset link */}
          <div style={{ marginTop: 22, textAlign: 'start' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                color: 'rgba(255,255,255,.5)', fontSize: 12, fontFamily: 'inherit',
                cursor: 'pointer', textDecoration: 'underline',
                textUnderlineOffset: 3, letterSpacing: '.02em',
              }}
            >
              {HE.resetDefaults}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Internal control primitives ─────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      {children}
    </div>
  )
}

function NumberInput({
  value, placeholder, min, max, onChange,
}: {
  value: number | undefined
  placeholder: string
  min: number
  max: number
  onChange: (v: number | undefined) => void
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={e => {
        const raw = e.target.value
        if (raw === '') { onChange(undefined); return }
        const n = Number(raw)
        if (Number.isFinite(n)) onChange(n)
      }}
      style={{
        width: '100%', padding: '9px 12px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 6, color: '#fff',
        fontSize: 13, fontFamily: 'inherit',
        direction: 'rtl', colorScheme: 'dark',
      }}
    />
  )
}

function Slider({
  min, max, step, value, onChange,
}: {
  min: number; max: number; step: number; value: number
  onChange: (v: number) => void
}) {
  return (
    <input
      type="range"
      min={min} max={max} step={step} value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="fsc-slider"
      style={{ width: '100%', accentColor: '#D4FF00' }}
    />
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      aria-pressed={value}
      style={{
        padding: '8px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '.04em',
        fontFamily: 'inherit',
        background: value ? '#D4FF00' : 'rgba(255,255,255,.05)',
        color: value ? '#000' : 'rgba(255,255,255,.85)',
        border: `1px solid ${value ? '#D4FF00' : 'rgba(255,255,255,.12)'}`,
        borderRadius: 6, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'background .15s, color .15s, border-color .15s',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 4,
        background: value ? '#000' : 'rgba(255,255,255,.4)',
      }} />
      <span>{value ? HE.on : HE.off}</span>
    </button>
  )
}

function Segmented<V extends string>({
  value, options, onChange,
}: {
  value: V | undefined
  options: ReadonlyArray<{ value: V; label: string }>
  onChange: (v: V) => void
}) {
  return (
    <div style={{
      display: 'inline-flex', gap: 0,
      background: 'rgba(255,255,255,.04)',
      border: '1px solid rgba(255,255,255,.12)',
      borderRadius: 6, padding: 2,
    }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '7px 14px', fontSize: 12, fontWeight: 600,
              fontFamily: 'inherit', letterSpacing: '.03em',
              background: active ? '#D4FF00' : 'transparent',
              color: active ? '#000' : 'rgba(255,255,255,.75)',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              transition: 'background .15s, color .15s',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Shared style tokens ─────────────────────────────────────────────────
const pillBase: CSSProperties = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '.04em',
  fontFamily: 'inherit', background: 'rgba(255,255,255,.05)',
  color: 'rgba(255,255,255,.85)',
  border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center',
  flex: '0 0 auto',
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,.55)', marginBottom: 8, fontWeight: 600,
}

import { Icon, type IconName } from '@/shared/ui/Icon'
import { textMuted, textPrimary } from '../styles'
import { pickerTile } from './createModalStyles'

// Three-up icon tile picker used by the create-gallery modal.
export function IconOptionPicker<T extends string>({ eyebrow, options, value, onChange }: {
  eyebrow: string
  options: ReadonlyArray<{ value: T; label: string; icon: IconName }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
        color: textMuted, textTransform: 'uppercase', marginBottom: 12,
      }}>
        {eyebrow}
      </div>
      <div className="dash-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              style={pickerTile(selected)}
            >
              <Icon name={opt.icon} size={20} strokeWidth={selected ? 1.85 : 1.4} />
              <span style={{
                fontSize: 12,
                fontWeight: selected ? 600 : 500,
                color: textPrimary, fontFamily: 'inherit',
              }}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

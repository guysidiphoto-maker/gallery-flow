import { FieldLabel } from './FieldLabel'

/** Labelled range input that commits on blur / pointer release. */
export function RangeField({ label, min, max, value, onChange, onCommit }: {
  label: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
  onCommit: () => void
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        onBlur={onCommit}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="w-full accent-ink"
      />
    </div>
  )
}

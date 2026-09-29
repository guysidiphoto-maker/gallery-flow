import { ToggleRow } from '@/shared/ui'

// `last` drops the divider explicitly: some rows are followed by a bordered detail block.
export function SettingsToggleRow({ label, desc, on, onChange, last }: {
  label: string; desc: string; on: boolean; onChange: () => void; last?: boolean
}) {
  return (
    <ToggleRow
      title={label}
      description={desc}
      checked={on}
      onChange={() => onChange()}
      className={last ? 'border-b-0' : undefined}
    />
  )
}

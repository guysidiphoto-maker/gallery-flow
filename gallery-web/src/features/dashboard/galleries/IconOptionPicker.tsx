import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'

// Three-up icon tile picker used by the create-gallery modal.
export function IconOptionPicker<T extends string>({ eyebrow, options, value, onChange }: {
  eyebrow: string
  options: ReadonlyArray<{ value: T; label: string; icon: IconName }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-6">
      <Eyebrow className="mb-3 block text-[9px] font-medium">{eyebrow}</Eyebrow>
      <div className="dash-grid-3 grid grid-cols-3 gap-2.5">
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-2.5 rounded-hair border px-2 py-[18px] transition-[border-color,background-color] duration-150',
                selected ? 'border-ink bg-surface' : 'border-line bg-raised',
              )}
            >
              <Icon name={opt.icon} size={20} strokeWidth={selected ? 1.85 : 1.4} />
              <span className={cn('text-xs text-ink', selected ? 'font-semibold' : 'font-medium')}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

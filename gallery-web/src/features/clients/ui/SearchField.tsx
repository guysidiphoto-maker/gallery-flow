import { Icon } from '@/shared/ui/Icon'
import { Input, cn } from '@/shared/ui'

export function SearchField({ value, onChange, placeholder, ariaLabel, className }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel: string
  className?: string
}) {
  return (
    <div className={cn('relative max-w-[420px] flex-[1_1_260px]', className)}>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="ps-10"
      />
      <span className="pointer-events-none absolute start-[13px] top-1/2 flex -translate-y-1/2 text-muted">
        <Icon name="search" size={15} strokeWidth={1.8} />
      </span>
    </div>
  )
}

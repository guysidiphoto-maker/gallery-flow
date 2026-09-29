import { cn } from '@/shared/ui'

/** Row of pill filters. Gets tablist/tab roles only when `ariaLabel` is given. */
export function FilterTabs<T extends string>({ tabs, value, onChange, ariaLabel, size = 'md' }: {
  tabs: ReadonlyArray<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
  ariaLabel?: string
  size?: 'sm' | 'md'
}) {
  const asTabs = !!ariaLabel
  return (
    <div role={asTabs ? 'tablist' : undefined} aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {tabs.map(t => {
        const active = value === t.id
        return (
          <button
            key={t.id}
            role={asTabs ? 'tab' : undefined}
            aria-selected={asTabs ? active : undefined}
            onClick={() => onChange(t.id)}
            className={cn(
              'rounded-hair border',
              size === 'md' ? 'px-3.5 py-2 text-xs' : 'px-3 py-1.5 text-[11.5px]',
              active ? 'border-ink bg-ink font-semibold text-white' : 'border-line bg-transparent font-normal text-ink-soft',
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

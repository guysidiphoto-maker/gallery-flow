import { cn } from '@/shared/ui'

export function SearchSkeletons() {
  const bar = 'rounded-[4px] bg-line opacity-35'
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex flex-col gap-2 rounded-[4px] border border-line bg-surface p-3.5">
          <div className={cn(bar, 'h-3.5', i % 2 === 0 ? 'w-2/5' : 'w-[55%]')} />
          <div className={cn(bar, 'h-2.5 w-[70%]')} />
        </div>
      ))}
    </div>
  )
}

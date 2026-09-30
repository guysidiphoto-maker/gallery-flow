import { shimmer } from '../lib/skeleton'

export function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-3.5 rounded-[4px] ${shimmer}`}
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  )
}

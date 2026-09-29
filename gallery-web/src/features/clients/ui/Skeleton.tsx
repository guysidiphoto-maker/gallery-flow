/** Stack of shimmering placeholder rows (uses the global `shimmer` keyframes). */
export function Skeleton({ height = 64, count = 4 }: { height?: number; count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{ height }}
          className="animate-[shimmer_1.5s_ease_infinite] rounded-[4px] border border-line bg-[linear-gradient(90deg,var(--color-surface)_25%,var(--color-line)_50%,var(--color-surface)_75%)] bg-[length:400px_100%]"
        />
      ))}
    </div>
  )
}

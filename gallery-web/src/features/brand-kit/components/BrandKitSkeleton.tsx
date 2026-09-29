// Placeholder section cards at roughly the loaded height, so the page doesn't jump.
export function BrandKitSkeleton() {
  return (
    <div className="flex flex-col gap-7" aria-hidden>
      {[280, 220, 200].map(h => (
        <div
          key={h}
          style={{ height: h }}
          className="animate-[dash-skeleton_1.4s_ease_infinite] rounded-hair border border-line bg-linear-90 from-surface from-25% via-line-soft via-37% to-surface to-63% bg-size-[400%_100%]"
        />
      ))}
    </div>
  )
}

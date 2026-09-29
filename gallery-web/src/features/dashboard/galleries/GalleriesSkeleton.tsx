const shimmer = 'bg-linear-90 from-line from-25% via-ink via-50% to-line to-75% bg-size-[400px_100%] animate-[dash-shimmer_1.5s_ease_infinite]'

export function GalleriesSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-40 rounded-[18px] border border-line bg-raised p-7">
          <div className={`mb-4 h-4 w-3/5 rounded-[8px] ${shimmer}`} />
          <div className={`h-3 w-2/5 rounded-sm ${shimmer}`} />
        </div>
      ))}
    </div>
  )
}

import { shimmer } from '../lib/skeleton'

// Mirrors the loaded layout (stats strip + 4:3 cards with a caption) so the
// grid doesn't jump when galleries arrive.
export function GalleriesSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-14 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] border border-line bg-surface">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={i > 0 ? 'border-s border-line p-7' : 'p-7'}>
            <div className={`mb-3.5 h-3 w-16 rounded-[4px] ${shimmer}`} />
            <div className={`h-[26px] w-12 rounded-[4px] ${shimmer}`} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-8">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-[4px] bg-surface">
            <div className={`aspect-[4/3] rounded-hair ${shimmer}`} />
            <div className="px-4 pt-[18px] pb-4">
              <div className={`mb-2.5 h-2.5 w-20 rounded-[4px] ${shimmer}`} />
              <div className={`mb-2 h-5 w-3/5 rounded-[4px] ${shimmer}`} />
              <div className={`h-3.5 w-16 rounded-[4px] ${shimmer}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

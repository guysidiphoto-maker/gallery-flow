import { shimmer } from './lib/skeleton'

const bar = `${shimmer} rounded-[4px]`

// Auth is still resolving: paint the shell's silhouette (sidebar + tab header)
// at the real sizes, so the signed-in dashboard fades in without a jump.
export function DashboardLoading() {
  return (
    <div className="dash flex min-h-screen bg-canvas [direction:rtl]" aria-busy="true" aria-label="טוען">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-3 border-s border-line px-5 py-7 max-[900px]:hidden">
        <div className={`mb-8 h-6 w-24 ${bar}`} />
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={`h-4 w-32 ${bar}`} />)}
      </aside>
      <main className="mx-auto w-full max-w-[1180px] px-10 pt-14 pb-24 max-[600px]:px-5">
        <div className="mb-3.5 flex h-5 items-center"><div className={`h-3 w-20 ${bar}`} /></div>
        <div className={`h-[clamp(28px,4vw,52px)] w-64 ${bar}`} />
      </main>
    </div>
  )
}

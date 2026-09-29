export function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin-slow rounded-full border-3 border-line border-t-ink" />
        <div className="text-sm tracking-[0.02em] text-ink-soft">Loading...</div>
      </div>
    </div>
  )
}

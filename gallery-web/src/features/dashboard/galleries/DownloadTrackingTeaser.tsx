// "Coming soon" teaser. Skeleton rows instead of fake emails so nobody
// mistakes them for real activity.
export function DownloadTrackingTeaser() {
  return (
    <div className="mt-12 animate-[dash-fade-up_.5s_ease_both_.2s] rounded-[18px] border border-line bg-surface p-7 backdrop-blur-[8px]">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="mb-1 text-lg font-bold tracking-[-0.01em]">
            מעקב הורדות
          </h3>
          <p className="text-xs text-muted">
            צפו מי הוריד תמונות מהגלריות שלכם
          </p>
        </div>
        <span className="rounded-[20px] border border-sage/15 bg-sage/8 px-3.5 py-1.5 text-[11px] font-semibold text-black">בקרוב</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between rounded-[12px] border border-black/3 bg-white/2 px-4 py-3.5 opacity-55">
            <div className="flex-1">
              <div className="mb-1.5 h-2.5 w-3/5 rounded-[4px] bg-line" />
              <div className="h-2 w-[30%] rounded-[4px] bg-line" />
            </div>
            <div className="h-[22px] w-9 rounded-[8px] bg-sage/10" />
          </div>
        ))}
      </div>
    </div>
  )
}

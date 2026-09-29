const caption = 'mb-1.5 text-[9px] tracking-[0.14em] text-muted uppercase'
const phoneFrame = 'relative aspect-[9/16] w-full overflow-hidden rounded-md border-2 border-line bg-night'
const cover = 'block size-full object-cover'

// Desktop public hero / mobile public / private entry screen previews.
export function CoverPreviews({ url, title }: { url: string | null; title: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[180px] flex-[1_1_200px]">
        <div className={caption}>דסקטופ · ציבורי</div>
        <div className="relative aspect-[16/7] w-full overflow-hidden rounded-[8px] bg-night">
          {url && <img src={url} alt="" className={cover} />}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-linear-to-b from-black/10 to-black/50 p-2 text-center text-white">
            <div className="text-[14px] leading-[1.15] font-bold">{title}</div>
          </div>
        </div>
      </div>
      <div className="w-[92px]">
        <div className={caption}>מובייל</div>
        <div className={phoneFrame}>
          {url && <img src={url} alt="" className={cover} />}
          <div className="absolute inset-0 flex items-end justify-center bg-linear-to-b from-black/0 to-black/60 p-1.5 text-center text-white">
            <div className="text-[9px] leading-[1.1] font-bold">{title}</div>
          </div>
        </div>
      </div>
      <div className="w-[92px]">
        <div className={caption}>מסך כניסה</div>
        <div className={phoneFrame}>
          {url && <img src={url} alt="" className={`${cover} scale-[1.12] blur-[6px] brightness-[.55] saturate-[.85]`} />}
          <div className="absolute inset-0 bg-radial-[120%_90%_at_50%_40%] from-night/35 to-night/85" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-1.5">
            <div className="h-[15px] w-[18px] rounded-[3px] border-[1.5px] border-white/55" />
            <div className="h-2 w-[70%] rounded-[4px] bg-white/14" />
            <div className="h-2 w-[70%] rounded-[4px] bg-white/28" />
          </div>
        </div>
      </div>
    </div>
  )
}

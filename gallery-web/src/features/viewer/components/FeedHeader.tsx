/** Compact sticky title that replaces the hero in mobile feed mode. */
export function FeedHeader({ galleryTitle, studioName }: { galleryTitle: string; studioName: string }) {
  return (
    <div className="gv-feed-header sticky top-0 z-100 border-b border-white/5 px-5 py-4 text-center backdrop-blur-[24px]">
      <h1 className="m-0 font-gallery-heading text-[20px] leading-[1.2] font-bold text-white">{galleryTitle}</h1>
      {studioName && (
        <p className="mt-1 text-[10px] font-medium tracking-[0.12em] text-white/30 uppercase">{studioName}</p>
      )}
    </div>
  )
}

/** Studio credit (or "delivered with" label). Extra bottom room on mobile clears the floating save bar. */
export function GalleryFooter({ studioName, studioWebsite, fallbackText }: {
  studioName: string
  studioWebsite: string
  fallbackText: string
}) {
  return (
    <footer className="gv-footer-rule relative px-6 pt-14 pb-12 text-center text-[11px] tracking-[0.04em] text-white/14 max-[769px]:pb-20">
      {studioName && studioWebsite ? (
        <a
          href={studioWebsite.startsWith('http') ? studioWebsite : `https://${studioWebsite}`}
          target="_blank" rel="noopener noreferrer"
          className="border-b border-white/15 no-underline"
        >{studioName}</a>
      ) : (studioName || fallbackText)}
    </footer>
  )
}

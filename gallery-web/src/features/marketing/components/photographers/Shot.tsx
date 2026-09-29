/** A real product render framed as a premium shot. */
export function Shot({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-(--mk-border) bg-(--mk-surface) leading-[0] shadow-pop">
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block h-auto w-full" />
    </div>
  )
}

export const asset = (name: string) => `/assets/pixflow-landing/${name}`

/** Shared section padding of the photographers page. */
export const SECTION_PAD = 'px-[clamp(20px,5vw,56px)] py-16'

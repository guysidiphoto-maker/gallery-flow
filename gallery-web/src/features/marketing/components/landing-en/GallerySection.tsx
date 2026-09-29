import { BrowserMockup } from './BrowserMockup'
import { btn, container, section, sectionSub, sectionTitle } from './classes'
import { DOWNLOAD_URL, GALLERY_URL, type LandingCopy } from './copy'
import { FadeUp } from './FadeUp'

const pill = 'pointer-events-none absolute z-2 whitespace-nowrap rounded-[16px] border border-brand/25 bg-brand/12 px-3 py-[5px] text-[0.72rem] font-semibold text-brand-soft'

/** A real published gallery, live in an iframe, with floating feature pills. */
export function GallerySection({ tx }: { tx: LandingCopy }) {
  return (
    <section className={section} id="gallery-embed">
      <FadeUp className={container}>
        <h2 className={sectionTitle}>{tx.galleryTitle}</h2>
        <p className={sectionSub}>{tx.gallerySub}</p>
        <div className="relative">
          <div className="pointer-events-none absolute top-1/2 left-1/2 z-0 h-4/5 w-4/5 -translate-1/2 bg-(image:--mk-lp-gallery-glow)" />
          <span className={`${pill} top-[10%] -left-10 animate-[mk-lp-float_16s_linear_-2s_infinite]`}>Password Protected</span>
          <span className={`${pill} top-[40%] -right-[50px] animate-[mk-lp-float_18s_linear_-6s_infinite]`}>Custom Branding</span>
          <span className={`${pill} bottom-[15%] left-[5%] animate-[mk-lp-float_15s_linear_-10s_infinite]`}>AI Stories</span>
          <BrowserMockup url="pixflow-ai.com/gallery/eclipse-media" className="relative z-1">
            <iframe src={GALLERY_URL} className="block h-[480px] w-full border-none max-md:h-[380px]" title="Live gallery" loading="lazy" />
          </BrowserMockup>
        </div>
        <div className="mt-8 text-center">
          <p className="mb-4 text-[1.15rem] text-white/50">{tx.galleryCta}</p>
          <a href={DOWNLOAD_URL} className={btn({ variant: 'primary', glow: true })}>{tx.ctaDownload}</a>
        </div>
      </FadeUp>
    </section>
  )
}

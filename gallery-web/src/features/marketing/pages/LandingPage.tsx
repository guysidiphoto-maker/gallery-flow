import { useCallback, useState } from 'react'
import { InteractiveDemo } from '../components/demo/InteractiveDemo'
import { container, section, sectionSub, sectionTitle } from '../components/landing-en/classes'
import { DEMO_SAMPLE_PHOTOS, GALLERY_URL, LANDING_COPY } from '../components/landing-en/copy'
import { FadeUp } from '../components/landing-en/FadeUp'
import { FaqSection } from '../components/landing-en/FaqSection'
import { FeatureGrid } from '../components/landing-en/FeatureGrid'
import { FinalCtaSection } from '../components/landing-en/FinalCtaSection'
import { GallerySection } from '../components/landing-en/GallerySection'
import { icons } from '../components/landing-en/icons'
import { LandingFooter } from '../components/landing-en/LandingFooter'
import { LandingHero } from '../components/landing-en/LandingHero'
import { LandingNav } from '../components/landing-en/LandingNav'
import { PricingSection } from '../components/landing-en/PricingSection'
import { StepsSection } from '../components/landing-en/StepsSection'
import { useLandingLang } from '../components/landing-en/useLandingLang'
import '../styles/marketing.css'

/** English (and toggleable Hebrew) landing for the Mac app, at /en. */
export function LandingPage() {
  const { lang, toggleLang } = useLandingLang()
  const tx = LANDING_COPY[lang]
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }, [])

  return (
    <div
      className="mk-root overflow-x-hidden bg-night font-(family-name:--mk-font-inter) leading-[1.6] text-(--mk-night-ink) antialiased"
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      <LandingNav
        tx={tx} onToggleLang={toggleLang} onNavigate={scrollTo}
        menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(o => !o)}
      />
      <LandingHero tx={tx} onSeeDemo={() => scrollTo('showcase')} />
      <StepsSection tx={tx} />

      {/* Section padding stays 110px on mobile here (the original rule order did that). */}
      <section className="py-[110px]" id="demo">
        <FadeUp className={container}>
          <InteractiveDemo samplePhotos={DEMO_SAMPLE_PHOTOS} lang={lang} galleryUrl={GALLERY_URL} />
        </FadeUp>
      </section>

      <GallerySection tx={tx} />

      <section className={section} id="features">
        <FadeUp className={container}>
          <h2 className={sectionTitle}>{tx.featuresTitle}</h2>
          <FeatureGrid
            features={[
              { icon: icons.grid, t: tx.f1t, d: tx.f1d },
              { icon: icons.star, t: tx.f2t, d: tx.f2d },
              { icon: icons.layers, t: tx.f3t, d: tx.f3d },
              { icon: icons.cloud, t: tx.f4t, d: tx.f4d },
              { icon: icons.play, t: tx.f5t, d: tx.f5d },
              { icon: icons.monitor, t: tx.f6t, d: tx.f6d },
            ]}
          />
        </FadeUp>
      </section>

      <section className={section} id="built-for">
        <FadeUp className={container}>
          <h2 className={sectionTitle}>{tx.builtForTitle}</h2>
          <p className={sectionSub}>{tx.builtForSub}</p>
          <FeatureGrid
            features={[
              { icon: icons.cloud, t: tx.bf1t, d: tx.bf1d },
              { icon: icons.grid, t: tx.bf2t, d: tx.bf2d },
              { icon: icons.play, t: tx.bf3t, d: tx.bf3d },
            ]}
          />
        </FadeUp>
      </section>

      <PricingSection tx={tx} />
      <FaqSection tx={tx} />
      <FinalCtaSection tx={tx} />
      <LandingFooter tx={tx} onNavigate={scrollTo} />
    </div>
  )
}

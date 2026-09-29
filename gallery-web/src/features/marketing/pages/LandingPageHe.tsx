// Legacy Hebrew homepage, kept live at /home-legacy.
import '../styles/marketing.css'
import { signInWithGoogle } from '@/shared/lib/auth'
import type { Step } from '../components/editorial/StepCard'
import { CreamNav } from '../components/editorial/CreamNav'
import { CreamFooter } from '../components/editorial/CreamFooter'
import { StepsSection } from '../components/editorial/StepsSection'
import { FaqSection } from '../components/editorial/FaqSection'
import { FinalCta } from '../components/editorial/FinalCta'
import { HeHero } from '../components/landing-he/HeHero'
import { PricingTeaser } from '../components/landing-he/PricingTeaser'
import { FaceScanShowcase } from '../components/FaceScanShowcase'
import { ScanHUD } from '../components/ScanHUD'

const STEPS: Step[] = [
  { n: '1', t: 'מעלים תמונות', d: 'גוררים תיקייה וסוגרים עניין.', swatch: 'bg-(image:--mk-swatch-tan)' },
  { n: '2', t: 'שולחים לינק', d: 'וואטסאפ, QR, מה שנוח — בלי אפליקציה ללקוח.', swatch: 'bg-(image:--mk-swatch-rose)' },
  { n: '3', t: 'הם מוצאים את עצמם', d: 'סלפי אחד, וזיהוי הפנים עושה את השאר.', swatch: 'bg-(image:--mk-swatch-sage)' },
]

const FAQS = [
  { q: 'כמה מדויק זיהוי הפנים?', a: 'גבוה מאוד — עובד גם בתאורה חלשה, עם משקפיים ובתמונות קבוצתיות.' },
  { q: 'הלקוחות צריכים אפליקציה?', a: 'לא. לינק, סלפי, תמונות. זהו.' },
  { q: 'איך עובד התמחור?', a: 'מנוי חודשי לפי כמות תמונות, החל מ-$39. מתחילים חינם עם 100 תמונות ומשדרגים כשגדלים.' },
  { q: 'מה עם פרטיות?', a: 'כל אורח רואה רק את עצמו. הסלפי משמש לזיהוי בלבד.' },
]

export function LandingPageHe() {
  const go = () => signInWithGoogle()

  return (
    <div dir="rtl" className="mk-root mk-smooth-scroll min-h-screen overflow-x-hidden bg-canvas font-(family-name:--mk-font-sans) text-ink antialiased">
      <ScanHUD />
      <CreamNav
        links={[
          { href: '#how', label: 'איך זה עובד' },
          { href: '/pricing', label: 'מחירים' },
          { href: '/demo', label: 'דמו' },
        ]}
        cta={{ label: 'התחל בחינם', onClick: go }}
      />
      <HeHero onStart={go} />
      <FaceScanShowcase />
      <StepsSection
        title="שלושה שלבים. זהו."
        steps={STEPS}
        className="max-w-[1000px] px-[clamp(20px,5vw,56px)] py-12"
        cols="grid-cols-[repeat(auto-fit,minmax(240px,1fr))]"
        stagger={90}
        cardPad="p-7"
      />
      <PricingTeaser onStart={go} />
      <FaqSection faqs={FAQS} className="max-w-[620px] px-[clamp(20px,5vw,56px)] py-12" />
      <FinalCta
        title={<>הגלריה הבאה שלך<br />מוכרת את עצמה.</>}
        label="יאללה, נרים את זה"
        onClick={go}
        className="pt-12 pb-16"
      />
      <CreamFooter />
    </div>
  )
}

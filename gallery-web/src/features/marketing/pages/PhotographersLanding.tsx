// /photographers — Hebrew landing for Israeli event photographers. Positioning:
// a delivery platform, not "another selfie gallery". Pixel/ads fire only via track().
import '../styles/marketing.css'
import { signInWithGoogle } from '@/shared/lib/auth'
import { track, AnalyticsEvent } from '@/shared/lib/analytics'
import type { Step } from '../components/editorial/StepCard'
import { CreamNav } from '../components/editorial/CreamNav'
import { CreamFooter } from '../components/editorial/CreamFooter'
import { StepsSection } from '../components/editorial/StepsSection'
import { FaqSection } from '../components/editorial/FaqSection'
import { FinalCta } from '../components/editorial/FinalCta'
import { PhotographersHero } from '../components/photographers/PhotographersHero'
import { PainSection } from '../components/photographers/PainSection'
import { FeatureSplit } from '../components/photographers/FeatureSplit'
import { BeforeAfter } from '../components/photographers/BeforeAfter'
import { PricingSection } from '../components/photographers/PricingSection'
import { SECTION_PAD, asset } from '../components/photographers/Shot'

const STEPS: Step[] = [
  { n: '1', t: 'מעלים את התמונות', d: 'גוררים תיקייה שלמה וסוגרים עניין.', swatch: 'bg-(image:--mk-swatch-tan)' },
  { n: '2', t: 'Pixflow מסדר את הגלריה', d: 'גלריה נקייה ומהירה, מוכנה לשיתוף.', swatch: 'bg-(image:--mk-swatch-rose)' },
  { n: '3', t: 'שולחים קישור אחד', d: 'וואטסאפ, QR או מייל. בלי אפליקציה לאורחים.', swatch: 'bg-(image:--mk-swatch-lilac)' },
  { n: '4', t: 'האורחים מוצאים את עצמם עם סלפי', d: 'סלפי אחד, וזיהוי הפנים עושה את השאר.', swatch: 'bg-(image:--mk-swatch-sage)' },
]

const FAQS = [
  { q: 'האורחים צריכים להוריד אפליקציה?', a: 'לא. פותחים קישור בדפדפן, גם מהטלפון.' },
  { q: 'זה מתאים לאירועים גדולים?', a: 'כן. Pixflow נבנה בדיוק למקרים שבהם יש הרבה תמונות והרבה אנשים שרוצים למצוא את עצמם.' },
  { q: 'מה קורה אם מישהו לא מצא את עצמו?', a: 'עדיין אפשר לדפדף בגלריה. הזיהוי נועד לקצר את הדרך, לא לנעול את החוויה.' },
  { q: 'אפשר להשתמש בזה עם המיתוג שלי?', a: 'כן. המטרה היא שהגלריה תיראה כמו חלק מהמותג של הצלם, לא כמו קישור גנרי.' },
  { q: 'זיהוי הפנים תמיד מושלם?', a: 'לא מבטיחים קסמים. בתנאי צילום טובים הזיהוי מדויק ומהיר, אבל איכות הזיהוי תלויה בתאורה, בזוויות ובאיכות התמונות.' },
]

export function PhotographersLanding() {
  const go = () => {
    // Ad-campaign top of funnel: GA4 cta_click + Meta custom ClickStart.
    track(AnalyticsEvent.CTA_CLICK, { location: 'photographers' })
    signInWithGoogle()
  }
  const scrollHow = () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div dir="rtl" className="mk-root mk-smooth-scroll min-h-screen overflow-x-hidden bg-canvas font-(family-name:--mk-font-sans) text-ink antialiased">
      <CreamNav
        links={[
          { href: '#how', label: 'איך זה עובד' },
          { href: '#faq', label: 'שאלות נפוצות' },
        ]}
        cta={{ label: 'צרו גלריה ראשונה', onClick: go }}
      />
      <PhotographersHero onStart={go} onHow={scrollHow} />
      <PainSection />
      <StepsSection
        title="איך זה עובד"
        steps={STEPS}
        className={`max-w-[1080px] ${SECTION_PAD}`}
        cols="grid-cols-[repeat(auto-fit,minmax(230px,1fr))]"
        stagger={80}
        cardPad="p-[26px]"
        descLeading="leading-[1.6]"
      />
      <FeatureSplit
        tinted
        badge="זיהוי פנים"
        title={<>סלפי אחד.<br />כל הרגעים שלך.</>}
        body="האורח נכנס מהטלפון, מזהה את עצמו, ומגיע לתמונות שבהן הוא מופיע. סלפי אחד, בלי אפליקציה ובלי חיפוש ידני."
        shot={{ src: asset('face-recognition.webp'), alt: 'חיפוש סלפי, זיהוי פנים ב-Pixflow' }}
      />
      <FeatureSplit
        badge="מסירה ממותגת"
        title={<>מסירה שנראית כמו<br />חלק מהמותג שלכם.</>}
        body="עיצוב נקי ומוקפד, הלוגו והצבעים שלכם, ופתיחה חלקה מכל מכשיר. הגלריה נראית כמו המשך של העבודה שלכם, לא כמו קישור גנרי."
        shot={{ src: asset('dashboard.webp'), alt: 'ניהול גלריות ממותג ב-Pixflow' }}
      />
      <BeforeAfter />
      <PricingSection onStart={go} />
      <FaqSection faqs={FAQS} id="faq" openHeight={240} className={`max-w-[640px] ${SECTION_PAD}`} />
      <FinalCta
        title={<>האירוע הבא שלכם<br />יכול להימסר אחרת.</>}
        label="צרו גלריה ראשונה"
        onClick={go}
        className="pt-16 pb-24"
      />
      <CreamFooter />
    </div>
  )
}

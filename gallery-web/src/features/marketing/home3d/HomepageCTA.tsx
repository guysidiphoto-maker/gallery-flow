// Final beat: an opaque cream section over the fixed canvas with the closing call to
// action and the FAQ. Shared by the 3D and static paths.

import { Button, Reveal } from '../components/ui'
import { HomeFaqItem } from './HomeFaqItem'

const CONTACT = 'mailto:support@pixflow-ai.com'

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'האורחים צריכים להוריד אפליקציה?', a: 'לא. פותחים קישור בדפדפן, גם מהטלפון.' },
  { q: 'זה מתאים לאירועים גדולים?', a: 'כן. Pixflow נבנה בדיוק למקרים שבהם יש הרבה תמונות והרבה אנשים שרוצים למצוא את עצמם.' },
  { q: 'זיהוי הפנים באמת עובד?', a: 'כן. האורחים מוצאים את עצמם עם סלפי, בלי אפליקציה ובלי חיפוש ידני, ומגיעים מהר לתמונות שבהן הם מופיעים.' },
  { q: 'מה קורה אם מישהו לא מצא את עצמו?', a: 'עדיין אפשר לדפדף בגלריה, לחפש ידנית, או לעבור לפי רגעים מהאירוע. הזיהוי נועד לקצר את הדרך, לא לנעול את החוויה.' },
  { q: 'זה מחליף גלריה רגילה?', a: 'כן, אם הגלריה הרגילה שלכם גורמת לאנשים ללכת לאיבוד בין מאות או אלפי תמונות.' },
  { q: 'למי זה מתאים?', a: 'צלמי אירועים, הפקות, כנסים, חברות וכל מי שמוסר הרבה תמונות להרבה אנשים.' },
]

/** `onStart`: primary CTA (Google sign-in). */
export function HomepageCTA({ onStart }: { onStart: () => void }) {
  return (
    <section id="start" className="relative z-[2] bg-canvas px-[clamp(20px,6vw,96px)] pt-24 pb-16">
      <div className="mx-auto max-w-[720px] text-center">
        <Reveal>
          <h2 className="m-0 font-(family-name:--mk-font-display) text-[clamp(30px,4.2vw,52px)] leading-[1.1] font-extrabold tracking-[-0.025em] whitespace-pre-line text-ink">
            {'צלמתם אירוע גדול?\nתמסרו אותו כמו שצריך.'}
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mk-body mx-auto mt-4 max-w-[600px] text-[18px] leading-[1.62] text-(--mk-ink-soft)">
            תנו לאורחים למצוא את עצמם לבד, וללקוחות לקבל גלריה שמרגישה מסודרת, מקצועית ונוחה מהרגע הראשון.
          </p>
        </Reveal>
        <Reveal delay={160}>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={onStart} className="px-9 py-[15px] text-[16px]">פתחו גלריה ראשונה</Button>
            <Button variant="secondary" size="lg" onClick={() => { window.location.href = CONTACT }}>דברו איתנו</Button>
          </div>
        </Reveal>
      </div>

      <div className="mx-auto mt-24 max-w-[660px]">
        <Reveal>
          <div className="mk-label mb-6 text-center text-sage">שאלות נפוצות</div>
        </Reveal>
        <Reveal delay={80}>
          <div className="rounded-[18px] border border-(--mk-border) bg-(--mk-surface) px-6 py-2">
            {FAQ.map(item => <HomeFaqItem key={item.q} {...item} />)}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

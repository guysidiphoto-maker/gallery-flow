import { Reveal } from '../ui'
import { SECTION_PAD } from './Shot'

export function PainSection() {
  return (
    <section className={SECTION_PAD}>
      <div className="mx-auto max-w-[820px] text-center">
        <Reveal>
          <h2 className="mk-h1 m-0">
            כל אירוע נגמר באותה שאלה:<br />“איפה התמונות שלי?”
          </h2>
        </Reveal>
        <Reveal delay={90}>
          <p className="mk-body mx-auto mt-6 max-w-[620px] text-[17px] leading-[1.8] text-(--mk-ink-soft)">
            הלקוח קיבל גלריה, אבל האורחים לא באמת יודעים למצוא את עצמם. הם גוללים, מתייאשים, ושולחים הודעות.
            Pixflow נותן להם דרך קצרה וברורה להגיע לרגעים שלהם.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

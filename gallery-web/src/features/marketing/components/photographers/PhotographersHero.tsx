import { Button, Reveal } from '../ui'
import { Shot, asset } from './Shot'

interface Props {
  onStart: () => void
  onHow: () => void
}

export function PhotographersHero({ onStart, onHow }: Props) {
  return (
    <header className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-center gap-12 px-[clamp(20px,5vw,56px)] pt-12 pb-16">
      <div className="max-w-[560px] flex-[1_1_440px]">
        <Reveal>
          <span className="mk-label mb-3 inline-block text-sage">לצלמי אירועים</span>
          <h1 className="mk-display m-0">
            הגלריות שלך מעולם<br />לא היו יפות<br />ויעילות כל כך.
          </h1>
        </Reveal>
        <Reveal delay={90}>
          <p className="mk-body mt-4 mb-6 max-w-[480px] text-[18px] text-(--mk-ink-soft)">
            גלריה ממותגת ומוקפדת שנראית יוצאת דופן, עם זיהוי פנים שנותן לכל אורח למצוא את עצמו בשניות. יפה ללקוח, פשוט לכם.
          </p>
        </Reveal>
        <Reveal delay={170}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onStart}>צרו גלריה ראשונה</Button>
            <Button variant="secondary" size="lg" onClick={onHow}>ראו איך זה עובד</Button>
          </div>
        </Reveal>
        <Reveal delay={240}>
          <p className="mk-small mt-4 max-w-[460px] leading-[1.7] text-muted">
            בלי אפליקציה לאורחים. בלי סיסמאות מסובכות. בלי “איפה התמונות שלי?” בווטסאפ.
          </p>
        </Reveal>
      </div>

      <Reveal delay={120} y={32} className="max-w-[520px] flex-[1_1_380px]">
        <Shot src={asset('hero-main.webp')} alt="גלריית אירוע ממותגת של Pixflow" eager />
      </Reveal>
    </header>
  )
}

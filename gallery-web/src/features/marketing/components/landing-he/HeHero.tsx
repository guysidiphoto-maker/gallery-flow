import { useState } from 'react'
import { cn } from '@/shared/ui'
import { Button, Reveal } from '../ui'
import { PhoneDemo } from './PhoneDemo'

/** Legacy homepage hero: headline, CTAs and the phone that plays the guest flow. */
export function HeHero({ onStart }: { onStart: () => void }) {
  const [live, setLive] = useState(false)

  return (
    <section className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-center gap-12 px-[clamp(20px,5vw,56px)] pt-12 pb-16">
      <div className="max-w-[540px] flex-[1_1_420px]">
        <Reveal>
          <h1 className="mk-display m-0">הגלריה שלך.<br />הלקוחות מוצאים<br />את עצמם.</h1>
        </Reveal>
        <Reveal delay={90}>
          <p className="mk-body mt-4 mb-6 max-w-[460px] text-[18px] text-(--mk-ink-soft)">
            ענן גלריות לצלמים עם זיהוי פנים. האורחים מצלמים סלפי — וכל התמונות שלהם כבר שם. בלי אפליקציה, בלי חיפוש.
          </p>
        </Reveal>
        <Reveal delay={170}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onStart}>התחל בחינם</Button>
            <button
              onClick={() => setLive(v => !v)}
              className="mk-body cursor-pointer border-none bg-transparent font-(family-name:--mk-font-sans) font-semibold text-sage"
            >
              {live ? '● רואים את זה חי →' : '▶ תראה לי איך זה עובד'}
            </button>
          </div>
        </Reveal>
        <Reveal delay={240}>
          <div className="mk-small mt-4 text-muted">100 תמונות חינם · בלי כרטיס אשראי</div>
        </Reveal>
      </div>

      <Reveal delay={120} y={32} className="flex-[0_0_auto]">
        {/* `phone` is a ScanHUD target. */}
        <div className={cn(
          'phone relative aspect-[9/19.5] w-[clamp(220px,24vw,280px)] overflow-hidden rounded-[38px] border-2',
          'animate-[mk-phone-float_6s_ease-in-out_infinite] bg-(--mk-phone) transition-[border-color,box-shadow] duration-500 ease-[ease] motion-reduce:animate-none',
          live ? 'border-sage shadow-(--mk-phone-live-shadow)' : 'border-(--mk-phone-edge) shadow-pop',
        )}>
          <div className="absolute top-0 left-1/2 z-[5] h-[18px] w-[70px] -translate-x-1/2 rounded-b-[10px] bg-(--mk-phone)" />
          <div className="absolute inset-[3px] overflow-hidden rounded-[34px] bg-(--mk-phone)">
            <PhoneDemo active={live} />
          </div>
        </div>
      </Reveal>
    </section>
  )
}

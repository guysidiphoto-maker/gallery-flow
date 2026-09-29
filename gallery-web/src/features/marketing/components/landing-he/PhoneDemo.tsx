import { cn } from '@/shared/ui'
import { usePhoneDemo } from './usePhoneDemo'

const MSGS = ['מחפשים אותך…', 'עוברים על התמונות 👀', 'יש מצב שתפסנו אותך…', 'עוד שנייה…']

const SCREEN = 'absolute inset-0 flex flex-col items-center justify-center gap-[7px] p-3.5 transition-opacity duration-[450ms] ease-[ease]'
const RING = 'flex items-center justify-center rounded-full border-[1.5px]'

function Person({ size, className }: { size: number; className: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" className={className}>
      <circle cx="12" cy="10" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

/** The guest "find your photos" flow, animated inside the dark phone mockup. */
export function PhoneDemo({ active }: { active: boolean }) {
  const { step, line, thumbs } = usePhoneDemo(active, MSGS.length)
  const shown = (s: number) => (step === s ? 'opacity-100' : 'opacity-0')

  return (
    <div className="absolute inset-0">
      <div className={cn(SCREEN, shown(0))}>
        <div className={cn(RING, 'size-[55px] border-sage/30')}>
          <Person size={30} className="stroke-[1.2] text-white/30" />
        </div>
        <p className="text-[13px] font-bold text-white">מצא את התמונות שלך</p>
        <p className="text-[9px] text-white/30">סלפי אחד וזהו</p>
        <div className="mt-1.5 rounded-[60px] bg-sage px-[22px] py-2 text-[11px] font-bold text-white">בוא נתחיל</div>
      </div>

      <div className={cn(SCREEN, shown(1))}>
        <div className={cn(RING, 'relative size-20 border-sage/20')}>
          <div className="absolute -inset-2.5 animate-[mk-viewfinder-pulse_3s_ease-in-out_infinite] rounded-full border border-sage/8" />
          <Person size={38} className="stroke-1 text-white/20" />
        </div>
        <div className={cn(RING, 'mt-2.5 size-10 border-white/18 bg-white/5')}>
          <div className="size-[30px] rounded-full bg-white" />
        </div>
      </div>

      <div className={cn(SCREEN, 'bg-white/90 duration-[80ms]', shown(2))} />

      <div className={cn(SCREEN, shown(3))}>
        <div className={cn(RING, 'size-[60px] animate-[mk-orb-glow_3s_ease-in-out_infinite] border-sage/30')}>
          <Person size={26} className="stroke-[1.3] text-white/35" />
        </div>
        <div className="mt-2 flex flex-col items-center gap-px">
          {MSGS.map((t, i) => (
            <p
              key={i}
              className={cn(
                'm-0 text-center text-[11px] transition-all duration-[450ms] ease-out-expo',
                i < line ? 'opacity-100' : 'translate-y-1.5 opacity-0',
                i === line - 1 ? 'font-semibold text-white/70' : 'font-normal text-white/12',
              )}
            >
              {t}
            </p>
          ))}
        </div>
      </div>

      <div className={cn(SCREEN, shown(4))}>
        <div className={cn(RING, 'size-[34px] border-sage/30 bg-sage/8')}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-sage">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="mt-[5px] mb-px text-[15px] font-extrabold text-white">מצאנו אותך</p>
        <p className="mb-2 text-[10px] text-white/30">47 תמונות</p>
        <div className="grid w-[130px] grid-cols-4 gap-0.5 px-0">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'aspect-square rounded-[4px] bg-(image:--mk-phone-thumb) transition-all duration-[250ms] ease-out-expo',
                i < thumbs ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
              )}
              style={{ transitionDelay: `${i * 22}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

import { Icon, type IconName } from '@/shared/ui/Icon'
import { cn, Eyebrow } from '@/shared/ui'

const FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'bolt',        title: 'מהיר במיוחד', desc: 'שלוש שכבות איכות לכל תמונה — גלריות נטענות מהר אצל הלקוח, לא משנה כמה תמונות' },
  { icon: 'shield',      title: 'פרטי ובטוח',   desc: 'הגנת סיסמה אמיתית בצד השרת — לא מסך שעוקפים בדפדפן' },
  { icon: 'face-search', title: 'זיהוי פנים',   desc: 'אורחים מצלמים סלפי ומקבלים את התמונות שלהם בלבד' },
]

// First-run onboarding: quiet hero, two CTAs, three feature tiles.
export function GalleriesEmptyState({ onNewGallery }: { onNewGallery: () => void }) {
  return (
    <div className="relative animate-[dash-fade-up_.5s_ease_both] px-6 pt-10 pb-[100px] text-center">
      <div className="mx-auto mb-14 max-w-[720px] rounded-hair border border-line bg-surface px-8 pt-16 pb-14">
        <Eyebrow className="mb-[18px] block font-medium">Welcome</Eyebrow>
        <h2 className="mb-[18px] text-[38px] leading-[1.05] font-medium tracking-[-0.02em] text-ink">
          ברוך הבא ל-Pixflow
        </h2>
        <p className="mx-auto mb-3.5 max-w-[480px] text-base leading-[1.65] text-ink-soft">
          גלריות מהירות, פרטיות ויפות לאירועים. עם זיהוי פנים אופציונלי שמאפשר לאורחים למצוא את עצמם בסלפי.
        </p>
        <p className="mb-9 text-[11px] font-medium tracking-label text-muted uppercase">
          100 free tokens · 100 photos
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={onNewGallery}
            className="flex items-center gap-2.5 rounded-hair border border-ink px-7 py-3.5 text-xs font-medium tracking-label no-underline uppercase transition-colors duration-200 cursor-pointer bg-ink text-white hover:bg-black"
          >
            Create first gallery
            <Icon name="plus" size={13} strokeWidth={2} />
          </button>
          <a
            href="/demo"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-2.5 rounded-hair border border-ink px-7 py-3.5 text-xs font-medium tracking-label no-underline uppercase transition-colors duration-200 bg-transparent text-ink hover:bg-ink hover:text-white"
          >
            Try demo
            <Icon name="arrow-out" size={13} strokeWidth={2} />
          </a>
        </div>
      </div>

      <div className="mx-auto grid max-w-[720px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-0 border border-line bg-surface">
        {FEATURES.map((f, i) => (
          <div key={f.title} className={cn('px-7 py-8 text-right', i > 0 && 'border-s border-line')}>
            <div className="mb-[18px] flex items-center justify-end text-ink">
              <Icon name={f.icon} size={20} strokeWidth={1.4} />
            </div>
            <div className="mb-2 text-[10px] font-medium tracking-label text-muted uppercase">
              Feature
            </div>
            <div className="mb-2 text-base font-medium tracking-[-0.01em] text-ink">
              {f.title}
            </div>
            <div className="text-[13px] leading-[1.6] text-ink-soft">
              {f.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

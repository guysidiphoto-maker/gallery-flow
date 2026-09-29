import { Card, Detect } from '../ui'
import { SECTION_PAD } from './Shot'

export function BeforeAfter() {
  return (
    <section className={`mx-auto max-w-[1000px] ${SECTION_PAD}`}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 px-0">
        <Detect>
          <Card className="flex h-full flex-col gap-3 p-[30px]">
            <span className="mk-label text-muted">לפני</span>
            <p className="mk-h3 m-0 leading-[1.5] font-medium text-(--mk-ink-soft)">
              תיקיות, לינקים, הודעות, אורחים שמחפשים את עצמם.
            </p>
          </Card>
        </Detect>
        <Detect delay={90}>
          <Card className="flex h-full flex-col gap-3 border-sage/40 bg-sage/14 p-[30px]">
            <span className="mk-label text-sage">אחרי</span>
            <p className="mk-h3 m-0 leading-[1.5] text-ink">
              קישור אחד, גלריה אחת, וכל אורח יודע לאן ללכת.
            </p>
          </Card>
        </Detect>
      </div>
    </section>
  )
}

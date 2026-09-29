import { Badge, Button, Card, Detect } from '../ui'

/** Pricing summary card that sends visitors to the full /pricing page. */
export function PricingTeaser({ onStart }: { onStart: () => void }) {
  return (
    <section className="mx-auto max-w-[1000px] px-[clamp(20px,5vw,56px)] py-8">
      <Detect>
        <Card className="flex flex-col items-center gap-3 bg-sunken p-9 text-center">
          <Badge>זיהוי פנים כלול בכל מנוי</Badge>
          <h2 className="mk-h1 m-0 text-[clamp(24px,3.5vw,34px)]">תמחור פשוט ושקוף</h2>
          <p className="mk-body m-0 max-w-[480px] text-(--mk-ink-soft)">
            מנוי מ-<strong>$39/חודש</strong>. מתחילים חינם עם 100 תמונות. בלי כוכביות, בלי שיחת מכירה.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={() => { window.location.href = '/pricing' }}>ראה תמחור מלא</Button>
            <Button variant="secondary" size="lg" onClick={onStart}>התחל בחינם</Button>
          </div>
        </Card>
      </Detect>
    </section>
  )
}

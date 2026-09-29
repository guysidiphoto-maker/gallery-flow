import { Button } from '@/shared/ui'

export function DomainUpsell() {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-ink">
        תכנית עסקית בלבד
      </div>
      <div className="mb-4 text-[12px] leading-[1.6] text-muted">
        חברו דומיין משלכם — למשל photos.studio-shem.co.il — ושלחו ללקוחות קישור ממותג במקום pixflow-ai.com.
      </div>
      <Button
        onClick={() => { window.location.href = '/#pricing' }}
        className="px-[18px] py-2.5 text-[12px] font-semibold tracking-[0.14em]"
      >
        שדרוג לתכנית עסקית
      </Button>
    </div>
  )
}

import { Button, Eyebrow } from '@/shared/ui'
import { useEditor } from '../../EditorContext'

const labelCell = 'text-left text-[9px] font-medium'
const valueCell = 'font-mono text-[13px] text-ink'

export function DomainPendingDns({ domain, token }: { domain: string; token: string }) {
  const { customDomain: { domainSaving, domainCopied, recheckCustomDomain, removeCustomDomain, copyVerificationToken } } = useEditor()
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-ink">
        המתנה לאימות DNS — עד 72 שעות
      </div>
      <div className="mb-4 text-[12px] leading-[1.6] text-muted">
        הוסיפו את רשומת ה־TXT הבאה אצל ספק הדומיין שלכם. ברגע שה־DNS יתעדכן, נאמת את הבעלות אוטומטית.
      </div>

      {/* At phone width the label/value pairs stack so long values can wrap. */}
      <div className="mb-4 grid grid-cols-[88px_1fr] gap-x-3.5 gap-y-2.5 border border-line bg-raised px-4 py-3.5 [direction:ltr] [unicode-bidi:embed] max-sm:grid-cols-1">
        <Eyebrow className={labelCell}>Type</Eyebrow>
        <div className={valueCell}>TXT</div>

        <Eyebrow className={labelCell}>Name</Eyebrow>
        <div className={`${valueCell} wrap-anywhere`}>
          {`_pixflow-verify.${domain}`}
        </div>

        <Eyebrow className={labelCell}>Value</Eyebrow>
        <div className="flex items-center gap-2">
          <code className={`${valueCell} flex-1 border border-line bg-surface px-2.5 py-1.5 wrap-anywhere`}>
            {token}
          </code>
          <button
            type="button"
            onClick={() => { void copyVerificationToken(token) }}
            className="shrink-0 rounded-hair border border-line bg-transparent px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-ink uppercase"
          >
            {domainCopied ? 'הועתק' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={recheckCustomDomain}
          disabled={domainSaving}
          className="px-[18px] py-2.5 text-[12px] font-semibold tracking-[0.14em] disabled:cursor-wait"
        >
          רענן סטטוס
        </Button>
        <Button
          variant="ghost"
          onClick={removeCustomDomain}
          disabled={domainSaving}
          className="px-[18px] py-2.5 text-[12px] tracking-[0.14em] disabled:cursor-wait"
        >
          ביטול
        </Button>
      </div>
    </div>
  )
}

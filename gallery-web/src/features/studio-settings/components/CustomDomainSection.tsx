import { Button, Eyebrow, Input, Panel, cn } from '@/shared/ui'
import type { CustomDomainState } from '../useCustomDomain'
import { DnsRecordCard } from './DnsRecordCard'
import { actionButton, fieldInput, fieldLabel, helpText, primaryAction } from './settingsStyles'

/** Upsell (plan lacks it) → input form → DNS-pending card → verified card. */
export function CustomDomainSection({ domain: d }: { domain: CustomDomainState }) {
  return (
    <Panel eyebrow="דומיין מותאם" className="pb-5">
      {!d.enabled ? (
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink">תכנית עסקית בלבד</div>
          <div className={cn(helpText, 'mb-4')}>
            חברו דומיין משלכם — למשל photos.studio-shem.co.il — ושלחו ללקוחות קישור ממותג במקום pixflow-ai.com.
          </div>
          <Button onClick={() => { window.location.href = '/#pricing' }} className={primaryAction}>
            שדרוג לתכנית עסקית
          </Button>
        </div>
      ) : d.status === 'verified' && d.domain ? (
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-sage" />
            <span className="text-[13px] font-semibold text-ink">הדומיין מאומת ✓</span>
          </div>
          <a
            href={`https://${d.domain}`}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="mb-4 inline-block text-sm text-ink underline [unicode-bidi:embed]"
          >
            {d.domain}
          </a>
          <div>
            <Button variant="ghost" onClick={d.remove} disabled={d.saving} className={cn(actionButton, 'disabled:cursor-wait')}>
              {d.saving ? 'מסיר...' : 'הסר דומיין'}
            </Button>
          </div>
        </div>
      ) : d.status === 'pending_dns' && d.domain && d.token ? (
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-ink">המתנה לאימות DNS — עד 72 שעות</div>
          <div className={cn(helpText, 'mb-4')}>
            הוסיפו את רשומת ה־TXT הבאה אצל ספק הדומיין שלכם. ברגע שה־DNS יתעדכן, נאמת את הבעלות אוטומטית.
          </div>
          <DnsRecordCard domain={d.domain} token={d.token} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={d.recheck} disabled={d.saving} className={cn(primaryAction, 'disabled:cursor-wait')}>
              בדוק שוב עכשיו
            </Button>
            <Button variant="ghost" onClick={d.remove} disabled={d.saving} className={cn(actionButton, 'disabled:cursor-wait')}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className={cn(helpText, 'mb-3.5')}>
            חברו דומיין שבבעלותכם וגלריות יוצגו תחתיו במקום תחת pixflow-ai.com.
          </div>
          <label className="mb-3 block">
            <Eyebrow className={fieldLabel}>הדומיין המותאם שלך</Eyebrow>
            <Input
              type="text"
              value={d.input}
              onChange={e => d.setInput(e.target.value)}
              placeholder="photos.studio-shem.co.il"
              dir="ltr"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={cn(fieldInput, 'text-left', d.error && 'border-danger focus:border-danger')}
            />
          </label>
          {d.error && <div className="mb-3 text-xs leading-normal text-danger">{d.error}</div>}
          <Button
            onClick={d.submit}
            disabled={d.saving || !d.input.trim()}
            className={cn(primaryAction, 'disabled:opacity-50')}
          >
            {d.saving ? 'שומר...' : 'בדוק זמינות ושמור'}
          </Button>
        </div>
      )}
    </Panel>
  )
}

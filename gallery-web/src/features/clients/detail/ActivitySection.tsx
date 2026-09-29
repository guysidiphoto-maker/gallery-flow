import type { ClientDetailAudit } from '../api'
import { AUDIT_ACTION_HE } from '../labels'
import { formatRelative } from '../lib/format'
import { Section } from '../ui/Section'

const ACTOR_HE = (actor: string) => actor === 'owner' ? 'צלם' : actor === 'client' ? 'לקוח' : 'מערכת'

export function ActivitySection({ audit }: { audit: ClientDetailAudit[] }) {
  return (
    <Section title="היסטוריית פעילות">
      {audit.length === 0 ? (
        <div className="py-2 text-[13px] text-muted">אין עדיין פעילות מתועדת.</div>
      ) : (
        <div className="flex flex-col border-s-2 border-line ps-4">
          {audit.slice(0, 40).map((a, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-3 py-2.5">
              <span className="text-[13.5px] font-medium text-ink">{AUDIT_ACTION_HE[a.action] ?? a.action}</span>
              <span className="text-[11.5px] text-muted">{ACTOR_HE(a.actor_type)}</span>
              <span className="ms-auto text-[11.5px] text-muted">{formatRelative(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

import { border, textMuted, textPrimary } from '../styles'
import type { ActivitySummary } from '../types'

// Real send history from the gallery email log; never fabricated.
export function RecentRecipients({ activitySummary, activityLoading }: {
  activitySummary: ActivitySummary | null
  activityLoading: boolean
}) {
  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${border}` }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: textMuted, marginBottom: 10,
      }}>נמענים אחרונים</div>
      {activityLoading && !activitySummary ? (
        <div style={{ fontSize: 12, color: textMuted, padding: '8px 0' }}>טוען…</div>
      ) : (activitySummary?.recent_emails?.length ?? 0) === 0 ? (
        <div style={{ fontSize: 12, color: textMuted, padding: '8px 0', lineHeight: 1.5 }}>
          עדיין לא נשלחו מיילים לגלריה זו. שליחה ראשונה תופיע כאן.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
          {activitySummary!.recent_emails.slice(0, 8).map(row => {
            const failed = row.status === 'failed'
            return (
              <div key={row.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                fontSize: 12,
              }}>
                <span style={{ direction: 'ltr', textAlign: 'left', color: textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.recipient_email}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  color: failed ? '#b4544b' : textMuted,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: failed ? '#b4544b' : '#22c55e' }} />
                  {failed ? 'נכשל' : 'נשלח'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

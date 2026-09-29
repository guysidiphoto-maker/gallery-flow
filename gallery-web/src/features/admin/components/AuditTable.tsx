import { cn } from '@/shared/ui'
import type { GrantRow } from '../adminApi'
import { bodyRow, tableWrap, td, th, theadRow } from './adminStyles'

const HEADERS = ['תאריך', 'עסק', 'כמות', 'מנהל', 'סיבה', 'מזהה בקשה']

export function AuditTable({ audit }: { audit: GrantRow[] }) {
  return (
    <div className={tableWrap}>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className={theadRow}>
            {HEADERS.map(h => <th key={h} className={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {audit.map(g => (
            <tr key={g.ledger_id} className={bodyRow}>
              <td className={td}>{new Date(g.created_at).toLocaleString('he-IL')}</td>
              <td className={td}>{g.business_name ?? g.business_id}</td>
              <td className={cn(td, 'font-semibold')}>+{g.amount.toLocaleString('he-IL')}</td>
              <td className={td}>{g.admin_email ?? '—'}</td>
              <td className={td}>{g.reason || '—'}</td>
              <td className={cn(td, 'font-mono text-[10px] text-muted')}>{g.request_id}</td>
            </tr>
          ))}
          {audit.length === 0 && <tr><td className={td} colSpan={6}>אין פעולות עדיין.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

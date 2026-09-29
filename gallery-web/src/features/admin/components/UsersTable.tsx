import { Button, cn } from '@/shared/ui'
import { fmtDate, type UserRow } from '../adminApi'
import { bodyRow, btnSmall, tableWrap, td, th, theadRow } from './adminStyles'

const HEADERS = ['אימייל', 'שם עסק', 'מזהה עסק', 'נרשם', 'מסלול', 'סטטוס', 'גלריות', 'יתרה', 'פעולה']

export function UsersTable({ rows, onGrant }: { rows: UserRow[]; onGrant: (row: UserRow) => void }) {
  return (
    <div className={tableWrap}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className={theadRow}>
            {HEADERS.map(h => <th key={h} className={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.business_id} className={bodyRow}>
              <td className={td}>{r.email ?? '—'}</td>
              <td className={td}>{r.business_name}</td>
              <td className={cn(td, 'font-mono text-[11px] text-muted')}>{r.business_id}</td>
              <td className={td}>{fmtDate(r.created_at)}</td>
              <td className={td}>{r.plan_name ?? r.plan_id ?? '—'}</td>
              <td className={td}>{r.subscription_status ?? '—'}</td>
              <td className={td}>{r.gallery_count}</td>
              <td className={cn(td, 'font-semibold')}>{r.balance.toLocaleString('he-IL')}</td>
              <td className={td}>
                <Button className={btnSmall} onClick={() => onGrant(r)}>הענקת קרדיטים</Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td className={td} colSpan={9}>לא נמצאו משתמשים.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

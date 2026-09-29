import { Button, Input, Modal, cn } from '@/shared/ui'
import type { GrantState } from '../useAdminUsers'
import { btnGhost, btnPrimary, input, label } from './adminStyles'

export function GrantCreditsModal({ grant: g }: { grant: GrantState }) {
  const { target } = g
  return (
    <Modal
      open={!!target}
      onClose={() => { if (!g.granting) g.setTarget(null) }}
      dir="rtl"
      className="max-w-[440px] rounded-md border-line-soft p-7 shadow-none"
    >
      {target && (
        <>
          <h3 className="mb-1.5 text-lg">הענקת קרדיטים</h3>
          <p className="mb-[18px] text-[13px] text-muted">
            {target.business_name} · יתרה נוכחית: <strong>{target.balance.toLocaleString('he-IL')}</strong> קרדיטים
          </p>
          <label className={label}>כמות קרדיטים (מספר חיובי שלם)</label>
          <Input
            type="number" min={1} step={1} value={g.amount}
            onChange={e => g.setAmount(e.target.value)}
            className={input} autoFocus
          />
          {!g.amountValid && g.amount !== '' && (
            <p className="mt-1 text-xs text-danger">יש להזין מספר שלם חיובי עד 1,000,000.</p>
          )}
          <label className={cn(label, 'mt-3.5')}>סיבה פנימית (רשות)</label>
          <Input
            value={g.reason}
            onChange={e => g.setReason(e.target.value)}
            placeholder="לדוגמה: חשבון בדיקה / חבר"
            className={input}
          />
          <div className="mt-[22px] flex justify-end gap-2.5">
            <Button variant="ghost" className={btnGhost} disabled={g.granting} onClick={() => g.setTarget(null)}>ביטול</Button>
            <Button
              className={cn(btnPrimary, 'disabled:opacity-50')}
              disabled={!g.amountValid || g.granting}
              onClick={() => void g.confirmGrant()}
            >
              {g.granting ? 'מעניק…' : 'אישור והענקה'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

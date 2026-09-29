import { Input, Select } from '@/shared/ui'
import type { MemberRole } from '../api'
import { ROLE_HE } from '../labels'
import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { FormField } from '../ui/FormField'
import { Modal } from '../ui/Modal'
import type { InviteForm } from './useClientDetail'

const ROLE_OPTIONS: MemberRole[] = ['client_admin', 'approver', 'viewer']

export function InviteModal({ form }: { form: InviteForm }) {
  const close = () => form.setOpen(false)
  return (
    <Modal open={form.open} onClose={close} title="הזמנת משתמש">
      <form onSubmit={form.submit}>
        <FormField label="אימייל" required>
          <Input
            type="email" value={form.email} autoFocus dir="ltr" className="text-left"
            onChange={e => form.setEmail(e.target.value)}
            placeholder="client@example.com"
          />
        </FormField>
        <FormField label="תפקיד" hint="מנהל לקוח: ניהול מלא · מאשר: אישור בחירות · צופה: צפייה בלבד">
          <Select value={form.role} onChange={e => form.setRole(e.target.value as MemberRole)}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_HE[r]}</option>)}
          </Select>
        </FormField>
        {form.error && <div className="mb-3.5"><ErrorBanner text={form.error} /></div>}
        <div className="flex justify-start gap-2.5">
          <Button type="submit" variant="primary" busy={form.busy}>צור קישור הזמנה</Button>
          <Button variant="ghost" onClick={close}>ביטול</Button>
        </div>
        <p className="mt-3.5 text-xs leading-normal text-muted">
          לא נשלח אימייל. לאחר היצירה יוצג קישור אותו תשלח ללקוח בעצמך.
        </p>
      </form>
    </Modal>
  )
}

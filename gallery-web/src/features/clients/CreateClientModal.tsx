import { useState } from 'react'
import { Icon } from '@/shared/ui/Icon'
import { Input } from '@/shared/ui'
import type { ToastInput } from '@/shared/ui/Toast'
import { errorText } from './labels'
import { createClientReq, type InviteLink } from './api'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { CopyField } from './ui/CopyField'
import { FormField } from './ui/FormField'
import { ErrorBanner } from './ui/ErrorBanner'

// Every close path resets the form, so it always opens clean.
export function CreateClientModal({ open, onClose, reload, showToast, onOpenClient }: {
  open: boolean
  onClose: () => void
  reload: () => Promise<void>
  showToast: (t: ToastInput) => void
  onOpenClient: (clientId: string) => void
}) {
  const [cName, setCName] = useState('')
  const [cContact, setCContact] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdInvite, setCreatedInvite] = useState<InviteLink | null>(null)

  const reset = () => {
    setCName(''); setCContact(''); setCEmail(''); setCPhone('')
    setCreateError(null); setCreatedInvite(null)
  }
  const close = () => { onClose(); reset() }

  const submitCreate = async (withInvite: boolean) => {
    const name = cName.trim()
    if (!name) { setCreateError('יש להזין שם לקוח.'); return }
    const email = cEmail.trim()
    if (withInvite && !email) { setCreateError('כדי לשלוח הזמנה יש להזין אימייל.'); return }
    setCreateBusy(true)
    setCreateError(null)
    const res = await createClientReq({
      name,
      contactName: cContact.trim() || undefined,
      email: email || undefined,
      invite: withInvite,
    })
    if (!res.ok) { setCreateBusy(false); setCreateError(errorText(res.error)); return }
    // Stay busy through the reload so a second click can't create a duplicate.
    await reload()
    setCreateBusy(false)
    if (res.invite) {
      // Keep the modal open to surface the link; the owner delivers it manually.
      setCreatedInvite(res.invite)
      showToast({ kind: 'success', text: 'הלקוח נוצר. העתק את קישור ההזמנה.' })
    } else {
      close()
      showToast({ kind: 'success', text: 'הלקוח נוצר.' })
      onOpenClient(res.client_id)
    }
  }

  return (
    <Modal open={open} onClose={close} title="לקוח חדש">
      {createdInvite ? (
        <div>
          <div className="mb-3.5 flex items-center gap-2.5">
            <span className="flex text-sage"><Icon name="check" size={18} strokeWidth={2} /></span>
            <span className="text-[15px] font-medium text-ink">הלקוח נוצר וההזמנה מוכנה</span>
          </div>
          <p className="mb-[18px] text-[13.5px] leading-relaxed text-ink-soft">
            לא נשלח אימייל. העתק את הקישור ושלח אותו ל־{createdInvite.email} בעצמך.
          </p>
          <CopyField value={createdInvite.link} />
          <div className="mt-[22px] flex gap-2.5">
            <Button variant="outline" onClick={close}>סיום</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void submitCreate(false) }}>
          <FormField label="שם הלקוח / העסק" required>
            <Input value={cName} autoFocus onChange={e => setCName(e.target.value)} placeholder="למשל: משפחת כהן / חברת ABC" />
          </FormField>
          <FormField label="שם איש קשר">
            <Input value={cContact} onChange={e => setCContact(e.target.value)} placeholder="שם מלא" />
          </FormField>
          <FormField label="אימייל" hint="נדרש רק אם ברצונך ליצור הזמנה מיד">
            <Input type="email" dir="ltr" className="text-left" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="client@example.com" />
          </FormField>
          <FormField label="טלפון" hint="לשימושך בלבד — לא נשמר במערכת בשלב זה">
            <Input dir="ltr" className="text-left" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="050-0000000" />
          </FormField>
          {createError && <div className="mb-4"><ErrorBanner text={createError} /></div>}
          <div className="flex flex-wrap gap-2.5">
            <Button type="submit" variant="primary" busy={createBusy}>צור לקוח</Button>
            <Button variant="outline" busy={createBusy} onClick={() => void submitCreate(true)}>צור ושלח הזמנה</Button>
            <Button variant="ghost" onClick={close}>ביטול</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

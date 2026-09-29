import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useConfirm } from '@/shared/ui/useConfirm'
import type { ToastInput } from '@/shared/ui/Toast'
import { errorText } from '../labels'
import {
  fetchClientDetail, inviteMember, resendInvitation, cancelInvitation,
  setMembershipStatus, sendPasswordReset,
  type ClientDetail, type MemberRole, type SettableStatus,
} from '../api'

export interface LinkResult { title: string; note: string; link: string }
export type GalleryFilter = 'all' | 'live' | 'draft'

/** Loads one client's detail and owns every member/invite action on it. */
export function useClientDetail(clientId: string, showToast: (t: ToastInput) => void) {
  const { confirm, ConfirmHost } = useConfirm()
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // The ONLY place an invite/reset link is surfaced to the owner.
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null)
  // Per-row busy id so only the acted-on row spins.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Lives here (not in the section) so it survives the reload after each action.
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const d = await fetchClientDetail(clientId)
      if (!d) { setLoadError('אין לך הרשאה ללקוח זה, או שהוא לא נמצא.'); setDetail(null) }
      else setDetail(d)
    } catch (e) {
      setLoadError((e as Error).message || 'טעינת פרטי הלקוח נכשלה.')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { void load() }, [load])

  const submitInvite = async (e: FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim()
    if (!email) { setInviteError('יש להזין אימייל.'); return }
    setInviteBusy(true)
    setInviteError(null)
    const res = await inviteMember({ clientId, email, role: inviteRole })
    setInviteBusy(false)
    if (!res.ok) { setInviteError(errorText(res.error)); return }
    setInviteOpen(false)
    setInviteEmail('')
    setInviteRole('viewer')
    setLinkResult({
      title: 'ההזמנה נוצרה',
      note: `לא נשלח אימייל. העתק את הקישור ושלח אותו ל־${res.invite.email} בעצמך.`,
      link: res.invite.link,
    })
    showToast({ kind: 'success', text: 'ההזמנה נוצרה. העתק את הקישור.' })
    await load()
  }

  const doResend = async (invitationId: string) => {
    setBusyId(invitationId)
    const res = await resendInvitation(invitationId)
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    setLinkResult({
      title: 'הזמנה נשלחה מחדש',
      note: `נוצר קישור חדש. העתק ושלח ל־${res.invite.email} בעצמך (לא נשלח אימייל).`,
      link: res.invite.link,
    })
    showToast({ kind: 'success', text: 'נוצר קישור הזמנה חדש.' })
    await load()
  }

  const doCancelInvite = async (invitationId: string) => {
    const ok = await confirm({
      title: 'ביטול הזמנה',
      body: 'ההזמנה תבוטל והקישור הקיים יפסיק לעבוד. להמשיך?',
      confirmLabel: 'בטל הזמנה', cancelLabel: 'חזרה', danger: true,
    })
    if (!ok) return
    setBusyId(invitationId)
    const res = await cancelInvitation(invitationId)
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    showToast({ kind: 'success', text: 'ההזמנה בוטלה.' })
    await load()
  }

  const doSetStatus = async (membershipId: string, status: SettableStatus, verb: string, danger: boolean) => {
    if (danger) {
      const ok = await confirm({
        title: verb,
        body: status === 'revoked'
          ? 'ביטול לצמיתות ינתק את המשתמש מהלקוח באופן מיידי. להמשיך?'
          : 'המשתמש יאבד גישה לפורטל באופן מיידי. להמשיך?',
        confirmLabel: verb, cancelLabel: 'חזרה', danger: true,
      })
      if (!ok) return
    }
    setBusyId(membershipId)
    const res = await setMembershipStatus({ membershipId, status })
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    showToast({ kind: 'success', text: 'הסטטוס עודכן.' })
    await load()
  }

  const doReset = async (membershipId: string, email: string) => {
    const ok = await confirm({
      title: 'איפוס סיסמה',
      body: `ייווצר קישור לאיפוס סיסמה עבור ${email}. תצטרך לשלוח אותו בעצמך (לא נשלח אימייל). להמשיך?`,
      confirmLabel: 'צור קישור', cancelLabel: 'חזרה',
    })
    if (!ok) return
    setBusyId(membershipId)
    const res = await sendPasswordReset(membershipId)
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    if (!res.reset_link) { showToast({ kind: 'error', text: 'לא הוחזר קישור איפוס.' }); return }
    setLinkResult({
      title: 'קישור לאיפוס סיסמה',
      note: `העתק ושלח ל־${email} בעצמך. הקישור מוביל לעמוד הגדרת סיסמה של Supabase.`,
      link: res.reset_link,
    })
    showToast({ kind: 'success', text: 'נוצר קישור איפוס.' })
  }

  return {
    detail, loading, loadError, load, ConfirmHost,
    busyId, linkResult, setLinkResult, galleryFilter, setGalleryFilter,
    invite: {
      open: inviteOpen, setOpen: setInviteOpen,
      email: inviteEmail, setEmail: setInviteEmail,
      role: inviteRole, setRole: setInviteRole,
      busy: inviteBusy, error: inviteError, setError: setInviteError,
      submit: submitInvite,
    },
    doResend, doCancelInvite, doSetStatus, doReset,
  }
}

export type InviteForm = ReturnType<typeof useClientDetail>['invite']

import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../Icon'
import { useConfirm } from '../useConfirm'
import type { ToastInput } from '../Toast'
import { c, MEMBERSHIP_STATUS_HE, INVITATION_STATUS_HE, ROLE_HE, GALLERY_STATUS_HE, AUDIT_ACTION_HE, errorText } from './theme'
import {
  Badge, Button, Modal, CopyField, Field, inputStyle, EmptyState, ErrorBanner, Skeleton,
  formatDate, formatRelative,
} from './primitives'
import {
  fetchClientDetail, inviteMember, resendInvitation, cancelInvitation,
  setMembershipStatus, sendPasswordReset,
  type ClientDetail, type MemberRole, type SettableStatus,
} from './api'
import { computeVisibilityIndicator } from '../assignment/visibility'

interface Props {
  clientId: string
  businessSlug: string | null
  onBack: () => void
  showToast: (t: ToastInput) => void
}

const ROLE_OPTIONS: MemberRole[] = ['client_admin', 'approver', 'viewer']

// Public client page URL. When we can resolve the owner's business slug we use
// the branded path; otherwise the id-only fallback (both are PUBLIC pages — this
// is a preview, NOT impersonation and NOT a client session).
// Exported: BulkAssignView (src/components/assignment) reuses the exact same
// link logic for its per-gallery "preview as client" affordance.
export function portalUrl(businessSlug: string | null, clientId: string): string {
  const base = businessSlug ? `/${businessSlug}/client/${clientId}` : `/client/${clientId}`
  return typeof window !== 'undefined' ? `${window.location.origin}${base}` : base
}

export function ClientDetailView({ clientId, businessSlug, onBack, showToast }: Props) {
  const { confirm, ConfirmHost } = useConfirm()
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Invite modal state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('viewer')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Link result modal (invite / reset) — the ONLY place a link is surfaced.
  const [linkResult, setLinkResult] = useState<{ title: string; note: string; link: string } | null>(null)

  // Per-row busy ids so only the acted-on row spins.
  const [busyId, setBusyId] = useState<string | null>(null)

  // Quick filter for the assigned-galleries section (all galleries here are
  // assigned to THIS client, so the useful split is published vs draft).
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'live' | 'draft'>('all')

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

  // ── member/invite actions ──────────────────────────────────────────────────

  const submitInvite = async (e: React.FormEvent) => {
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

  const doResend = async (invitationId: string, email: string) => {
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

  const previewAsClient = () => {
    window.open(portalUrl(businessSlug, clientId), '_blank', 'noopener,noreferrer')
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const backButton = (
    <button
      onClick={onBack}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
        border: 'none', color: c.textMuted, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 12.5, padding: '4px 0', marginBottom: 20,
      }}
    >
      {/* RTL: chevron points to the inline-end (right) to mean "back". */}
      <span style={{ transform: 'scaleX(-1)', display: 'inline-flex' }}>
        <Icon name="logout" size={14} strokeWidth={1.8} />
      </span>
      חזרה לרשימת הלקוחות
    </button>
  )

  if (loading) {
    return <div>{backButton}<Skeleton height={80} count={5} /></div>
  }
  if (loadError || !detail) {
    return <div>{backButton}<ErrorBanner text={loadError ?? 'הלקוח לא נמצא.'} onRetry={load} /></div>
  }

  const { client, galleries, members, invitations, audit } = detail
  const pendingInvites = invitations.filter(i => i.status === 'pending')

  return (
    <div>
      <ConfirmHost />
      {backButton}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 20, marginBottom: 32,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.22em', color: c.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>
            לקוח
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(26px,3.4vw,40px)', fontWeight: 500, letterSpacing: '-0.025em', color: c.textPrimary }}>
            {client.name}
          </h1>
          {client.slug && (
            <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 6, direction: 'ltr', textAlign: 'right' }}>/{client.slug}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="gallery" onClick={previewAsClient} title="נפתח בלשונית חדשה">
            תצוגה מקדימה כלקוח (עמוד ציבורי)
          </Button>
        </div>
      </div>

      {/* Portal link + overview stats */}
      <Section title="פורטל הלקוח">
        <div style={{ marginBottom: 16 }}>
          <CopyField label="קישור לפורטל הציבורי" value={portalUrl(businessSlug, clientId)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', border: `1px solid ${c.border}`, background: c.bgSubtle }}>
          <Stat label="גלריות משויכות" value={galleries.length} />
          <Stat label="משתמשי לקוח" value={members.length} />
          <Stat label="פעילים" value={members.filter(m => m.status === 'active').length} />
          <Stat label="הזמנות ממתינות" value={pendingInvites.length} />
        </div>
      </Section>

      {/* Assigned galleries */}
      <Section
        title={`גלריות משויכות (${galleries.length})`}
        action={galleries.length > 0 ? (
          <div style={{ display: 'flex', gap: 4 }}>
            {([['all', 'הכול'], ['live', 'פורסמו'], ['draft', 'טיוטות']] as const).map(([id, label]) => {
              const active = galleryFilter === id
              return (
                <button
                  key={id}
                  onClick={() => setGalleryFilter(id)}
                  style={{
                    fontFamily: 'inherit', fontSize: 11.5, fontWeight: active ? 600 : 400,
                    padding: '6px 12px', borderRadius: 2, cursor: 'pointer',
                    border: `1px solid ${active ? c.textPrimary : c.border}`,
                    background: active ? c.textPrimary : 'transparent',
                    color: active ? '#fff' : c.textSecondary,
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : undefined}
      >
        {galleries.length === 0 ? (
          <EmptyState icon="gallery" title="אין גלריות משויכות"
            body="שייך גלריות ללקוח זה דרך מסך «שיוך גלריות» ברשימת הלקוחות." />
        ) : (() => {
          const activeMembers = members.filter(m => m.status === 'active').length
          const shown = galleries.filter(g =>
            galleryFilter === 'all' ? true : galleryFilter === 'live' ? g.status === 'live' : g.status !== 'live')
          if (shown.length === 0) {
            return <div style={{ fontSize: 13, color: c.textMuted, padding: '8px 0' }}>אין גלריות בסינון הנוכחי.</div>
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
              {shown.map((g, i) => {
                // All galleries here are assigned to this client — the hidden
                // indicator fires for drafts and for clients with 0 active users.
                const hiddenReason = computeVisibilityIndicator({ client_id: clientId, status: g.status }, activeMembers)
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    padding: '14px 18px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', background: c.bgSubtle,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                      {g.event_date && <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{formatDate(g.event_date)}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {hiddenReason && (
                        <span title={hiddenReason === 'not_published'
                          ? 'הלקוח לא רואה את הגלריה: היא עדיין לא פורסמה'
                          : 'הלקוח לא רואה את הגלריה: אין לו משתמשים פעילים'}>
                          <Badge tone="warn" icon="shield">לא גלוי ללקוח</Badge>
                        </span>
                      )}
                      <Badge tone={g.status === 'live' ? 'live' : 'neutral'}>{GALLERY_STATUS_HE[g.status] ?? g.status}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </Section>

      {/* Client users (members) */}
      <Section
        title={`משתמשי לקוח (${members.length})`}
        action={<Button variant="outline" icon="plus" onClick={() => { setInviteError(null); setInviteOpen(true) }}>הזמן משתמש</Button>}
      >
        {members.length === 0 ? (
          <EmptyState icon="clients" title="אין עדיין משתמשים"
            body="הזמן משתמש כדי לתת ללקוח גישה מאובטחת לפורטל (במקום קוד PIN)."
            action={<Button variant="outline" icon="plus" onClick={() => setInviteOpen(true)}>הזמן משתמש</Button>} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
            {members.map((m, i) => {
              const busy = busyId === m.id
              return (
                <div key={m.id} style={{
                  padding: '16px 18px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', background: c.bgSubtle,
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, direction: 'ltr' }}>{m.email}</span>
                      <Badge tone="neutral">{ROLE_HE[m.role] ?? m.role}</Badge>
                      <Badge tone={m.status === 'active' ? 'live' : m.status === 'invited' ? 'warn' : 'danger'}>
                        {MEMBERSHIP_STATUS_HE[m.status] ?? m.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>
                      גישה אחרונה: {formatRelative(m.last_access_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {m.status === 'active' && (
                      <Button variant="ghost" busy={busy} onClick={() => doReset(m.id, m.email)} style={{ padding: '8px 14px' }}>איפוס סיסמה</Button>
                    )}
                    {m.status === 'active' && (
                      <Button variant="ghost" busy={busy} onClick={() => doSetStatus(m.id, 'disabled', 'השהיית משתמש', true)} style={{ padding: '8px 14px' }}>השהה</Button>
                    )}
                    {(m.status === 'disabled' || m.status === 'invited') && (
                      <Button variant="ghost" busy={busy} onClick={() => doSetStatus(m.id, 'active', 'הפעלה מחדש', false)} style={{ padding: '8px 14px' }}>הפעל</Button>
                    )}
                    {m.status !== 'revoked' && (
                      <Button variant="danger" busy={busy} onClick={() => doSetStatus(m.id, 'revoked', 'ביטול משתמש', true)} style={{ padding: '8px 14px' }}>בטל</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Pending invitations */}
      {pendingInvites.length > 0 && (
        <Section title={`הזמנות ממתינות (${pendingInvites.length})`}>
          <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
            {pendingInvites.map((inv, i) => {
              const busy = busyId === inv.id
              const expired = inv.expires_at ? new Date(inv.expires_at).getTime() < Date.now() : false
              return (
                <div key={inv.id} style={{
                  padding: '16px 18px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', background: c.bgSubtle,
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, direction: 'ltr' }}>{inv.email}</span>
                      <Badge tone={expired ? 'danger' : 'warn'}>{expired ? 'פג תוקף' : INVITATION_STATUS_HE[inv.status] ?? inv.status}</Badge>
                      {inv.resent_count > 0 && <Badge tone="neutral">נשלח {inv.resent_count}×</Badge>}
                    </div>
                    <div style={{ fontSize: 12, color: c.textMuted, marginTop: 6 }}>
                      תוקף עד: {formatDate(inv.expires_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button variant="ghost" busy={busy} onClick={() => doResend(inv.id, inv.email)} style={{ padding: '8px 14px' }}>שלח קישור חדש</Button>
                    <Button variant="danger" busy={busy} onClick={() => doCancelInvite(inv.id)} style={{ padding: '8px 14px' }}>בטל</Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Activity history */}
      <Section title="היסטוריית פעילות">
        {audit.length === 0 ? (
          <div style={{ fontSize: 13, color: c.textMuted, padding: '8px 0' }}>אין עדיין פעילות מתועדת.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderInlineStart: `2px solid ${c.border}`, paddingInlineStart: 16 }}>
            {audit.slice(0, 40).map((a, i) => (
              <div key={i} style={{ padding: '10px 0', display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: c.textPrimary, fontWeight: 500 }}>{AUDIT_ACTION_HE[a.action] ?? a.action}</span>
                <span style={{ fontSize: 11.5, color: c.textMuted }}>{a.actor_type === 'owner' ? 'צלם' : a.actor_type === 'client' ? 'לקוח' : 'מערכת'}</span>
                <span style={{ fontSize: 11.5, color: c.textMuted, marginInlineStart: 'auto' }}>{formatRelative(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="הזמנת משתמש">
        <form onSubmit={submitInvite}>
          <Field label="אימייל" required>
            <input
              type="email" value={inviteEmail} autoFocus
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="client@example.com" style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' }}
            />
          </Field>
          <Field label="תפקיד" hint="מנהל לקוח: ניהול מלא · מאשר: אישור בחירות · צופה: צפייה בלבד">
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as MemberRole)} style={inputStyle}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_HE[r]}</option>)}
            </select>
          </Field>
          {inviteError && <div style={{ marginBottom: 14 }}><ErrorBanner text={inviteError} /></div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start' }}>
            <Button type="submit" variant="primary" busy={inviteBusy}>צור קישור הזמנה</Button>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>ביטול</Button>
          </div>
          <p style={{ fontSize: 12, color: c.textMuted, marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
            לא נשלח אימייל. לאחר היצירה יוצג קישור אותו תשלח ללקוח בעצמך.
          </p>
        </form>
      </Modal>

      {/* Link result modal (invite/reset link surface) */}
      <Modal open={!!linkResult} onClose={() => setLinkResult(null)} title={linkResult?.title ?? ''}>
        {linkResult && (
          <div>
            <p style={{ fontSize: 13.5, color: c.textSecondary, marginTop: 0, marginBottom: 18, lineHeight: 1.6 }}>{linkResult.note}</p>
            <CopyField value={linkResult.link} />
            <div style={{ marginTop: 20 }}>
              <Button variant="outline" onClick={() => setLinkResult(null)}>סגור</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── local layout helpers ──────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', color: c.textMuted }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: '20px 22px', borderInlineStart: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 10, color: c.textMuted, fontWeight: 500, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 400, color: c.textPrimary, letterSpacing: '-0.02em', lineHeight: 1 }}>{value.toLocaleString('he-IL')}</div>
    </div>
  )
}

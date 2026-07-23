// ClientsManager — owner/photographer-side "Clients Manager" for Client Portal
// V2. Rendered inside the existing Dashboard shell (in-page view switch, no new
// route). Reads via self-scoped cpv2_owner_* RPCs under the owner session;
// writes via POST /api/client-admin (authedFetch). NO email is ever sent — the
// UI only ever surfaces returned invite/reset links for the owner to deliver.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { c, errorText } from '../components/clients/theme'
import {
  Badge, Button, Modal, CopyField, Field, inputStyle, EmptyState, ErrorBanner, Skeleton,
  formatRelative,
} from '../components/clients/primitives'
import {
  fetchClientsOverview, createClientReq, hasProductionSuite,
  type ClientOverviewRow, type InviteLink,
} from '../components/clients/api'
import { ClientDetailView } from '../components/clients/ClientDetailView'
import { GalleryAssignmentView } from '../components/clients/GalleryAssignmentView'

interface Props {
  businessSlug: string | null
  businessId: string | null
}

type View =
  | { kind: 'list' }
  | { kind: 'detail'; clientId: string }
  | { kind: 'assign' }

type StatusFilter = 'all' | 'active' | 'invited' | 'legacy'

export function ClientsManager({ businessSlug }: Props) {
  const { showToast, ToastContainer } = useToast()
  const [view, setView] = useState<View>({ kind: 'list' })

  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasProduction, setHasProduction] = useState(false)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  // Create-client modal
  const [createOpen, setCreateOpen] = useState(false)
  const [cName, setCName] = useState('')
  const [cContact, setCContact] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdInvite, setCreatedInvite] = useState<InviteLink | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await fetchClientsOverview()
      setClients(rows)
    } catch (e) {
      setError((e as Error).message || 'טעינת הלקוחות נכשלה.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void hasProductionSuite().then(setHasProduction) }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter(cl => {
      if (q && !cl.name.toLowerCase().includes(q) && !(cl.slug ?? '').toLowerCase().includes(q)) return false
      if (filter === 'active' && cl.active_member_count === 0) return false
      if (filter === 'invited' && cl.pending_invites === 0) return false
      if (filter === 'legacy' && !cl.has_legacy_pin) return false
      return true
    })
  }, [clients, query, filter])

  const resetCreateForm = () => {
    setCName(''); setCContact(''); setCEmail(''); setCPhone('')
    setCreateError(null); setCreatedInvite(null)
  }

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
    setCreateBusy(false)
    if (!res.ok) { setCreateError(errorText(res.error)); return }
    await load()
    if (res.invite) {
      // Keep the modal open to surface the link; owner delivers it manually.
      setCreatedInvite(res.invite)
      showToast({ kind: 'success', text: 'הלקוח נוצר. העתק את קישור ההזמנה.' })
    } else {
      setCreateOpen(false)
      resetCreateForm()
      showToast({ kind: 'success', text: 'הלקוח נוצר.' })
      setView({ kind: 'detail', clientId: res.client_id })
    }
  }

  // ── sub-views ───────────────────────────────────────────────────────────────

  if (view.kind === 'detail') {
    return (
      <>
        <ClientDetailView
          clientId={view.clientId}
          businessSlug={businessSlug}
          onBack={() => { setView({ kind: 'list' }); void load() }}
          showToast={showToast}
        />
        <ToastContainer />
      </>
    )
  }

  if (view.kind === 'assign') {
    return (
      <>
        <GalleryAssignmentView onBack={() => { setView({ kind: 'list' }); void load() }} showToast={showToast} />
        <ToastContainer />
      </>
    )
  }

  // ── list view ───────────────────────────────────────────────────────────────

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'הכול' },
    { id: 'active', label: 'עם משתמשים פעילים' },
    { id: 'invited', label: 'הזמנות ממתינות' },
    { id: 'legacy', label: 'קוד PIN ישן' },
  ]

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.22em', color: c.textMuted, textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            Workspace
            {hasProduction && <Badge tone="accent" icon="bolt">Production Suite</Badge>}
          </div>
          <h1 style={{ fontSize: 'clamp(28px,4vw,52px)', fontWeight: 500, margin: 0, letterSpacing: '-0.025em', lineHeight: 1.02, color: c.textPrimary }}>
            לקוחות
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="gallery" onClick={() => setView({ kind: 'assign' })}>שיוך גלריות</Button>
          <Button variant="outline" icon="plus" onClick={() => { resetCreateForm(); setCreateOpen(true) }}>לקוח חדש</Button>
        </div>
      </div>

      {loading ? (
        <Skeleton height={78} count={4} />
      ) : error ? (
        <ErrorBanner text={error} onRetry={load} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon="clients"
          title="עדיין אין לקוחות"
          body="צור את הלקוח הראשון כדי לשייך אליו גלריות ולתת גישה מאובטחת לפורטל."
          action={<Button variant="outline" icon="plus" onClick={() => { resetCreateForm(); setCreateOpen(true) }}>צור לקוח ראשון</Button>}
        />
      ) : (
        <>
          {/* Search + filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 420 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="חיפוש לפי שם לקוח…"
                aria-label="חיפוש לקוחות"
                style={{ ...inputStyle, paddingInlineStart: 40 }}
              />
              <span style={{ position: 'absolute', insetInlineStart: 13, top: '50%', transform: 'translateY(-50%)', color: c.textMuted, pointerEvents: 'none', display: 'flex' }}>
                <Icon name="search" size={15} strokeWidth={1.8} />
              </span>
            </div>
            <div role="tablist" aria-label="סינון לקוחות" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {filterTabs.map(t => {
                const active = filter === t.id
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(t.id)}
                    style={{
                      fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
                      padding: '8px 14px', borderRadius: 2, cursor: 'pointer',
                      border: `1px solid ${active ? c.textPrimary : c.border}`,
                      background: active ? c.textPrimary : 'transparent',
                      color: active ? '#fff' : c.textSecondary,
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="search" title="אין תוצאות" body="לא נמצאו לקוחות התואמים את החיפוש או הסינון." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
              {filtered.map((cl, i) => (
                <button
                  key={cl.client_id}
                  onClick={() => setView({ kind: 'detail', clientId: cl.client_id })}
                  style={{
                    textAlign: 'right', fontFamily: 'inherit', cursor: 'pointer',
                    padding: '18px 20px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none',
                    background: c.bgSubtle, border: 'none', borderInlineWidth: 0,
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    transition: 'background .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = c.card }}
                  onMouseLeave={e => { e.currentTarget.style.background = c.bgSubtle }}
                >
                  <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 600, color: c.textPrimary }}>{cl.name}</span>
                      {cl.has_legacy_pin && <Badge tone="warn" icon="shield">קוד PIN ישן</Badge>}
                      {cl.active_member_count > 0
                        ? <Badge tone="live">{cl.active_member_count} פעילים</Badge>
                        : cl.pending_invites > 0
                          ? <Badge tone="warn">{cl.pending_invites} הזמנות ממתינות</Badge>
                          : <Badge tone="neutral">אין משתמשים</Badge>}
                    </div>
                    <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span>{cl.gallery_count.toLocaleString('he-IL')} גלריות</span>
                      <span>{cl.member_count.toLocaleString('he-IL')} משתמשים</span>
                      <span>גישה אחרונה: {formatRelative(cl.last_access_at)}</span>
                    </div>
                  </div>
                  <span style={{ color: c.textMuted, display: 'flex', transform: 'scaleX(-1)' }}>
                    <Icon name="logout" size={16} strokeWidth={1.7} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create-client modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); resetCreateForm() }} title="לקוח חדש">
        {createdInvite ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ color: c.statusLive, display: 'flex' }}><Icon name="check" size={18} strokeWidth={2} /></span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>הלקוח נוצר וההזמנה מוכנה</span>
            </div>
            <p style={{ fontSize: 13.5, color: c.textSecondary, marginTop: 0, marginBottom: 18, lineHeight: 1.6 }}>
              לא נשלח אימייל. העתק את הקישור ושלח אותו ל־{createdInvite.email} בעצמך.
            </p>
            <CopyField value={createdInvite.link} />
            <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm() }}>סיום</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void submitCreate(false) }}>
            <Field label="שם הלקוח / העסק" required>
              <input value={cName} autoFocus onChange={e => setCName(e.target.value)} placeholder="למשל: משפחת כהן / חברת ABC" style={inputStyle} />
            </Field>
            <Field label="שם איש קשר">
              <input value={cContact} onChange={e => setCContact(e.target.value)} placeholder="שם מלא" style={inputStyle} />
            </Field>
            <Field label="אימייל" hint="נדרש רק אם ברצונך ליצור הזמנה מיד">
              <input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="client@example.com" style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' }} />
            </Field>
            <Field label="טלפון" hint="לשימושך בלבד — לא נשמר במערכת בשלב זה">
              <input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="050-0000000" style={{ ...inputStyle, direction: 'ltr', textAlign: 'left' }} />
            </Field>
            {createError && <div style={{ marginBottom: 16 }}><ErrorBanner text={createError} /></div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Button type="submit" variant="primary" busy={createBusy}>צור לקוח</Button>
              <Button variant="outline" busy={createBusy} onClick={() => void submitCreate(true)}>צור ושלח הזמנה</Button>
              <Button variant="ghost" onClick={() => { setCreateOpen(false); resetCreateForm() }}>ביטול</Button>
            </div>
          </form>
        )}
      </Modal>

      <ToastContainer />
    </div>
  )
}

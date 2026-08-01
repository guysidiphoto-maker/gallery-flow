// SUPERSEDED (2026-07-24): ClientsManager now renders
// src/components/assignment/BulkAssignView.tsx (multi-select, bulk assign,
// visibility indicators, preview-as-client). This single-row view is kept only
// as a reference during the overnight sprint; the wave-2 integrator may delete
// it once BulkAssignView is verified on Preview.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useConfirm } from '../useConfirm'
import type { ToastInput } from '../Toast'
import { c, GALLERY_STATUS_HE, errorText } from './theme'
import { Badge, Button, Modal, Field, inputStyle, EmptyState, ErrorBanner, Skeleton, formatDate } from './primitives'
import {
  fetchAssignableGalleries, fetchClientsOverview,
  assignGallery, reassignGallery, unassignGallery,
  type AssignableGalleryRow, type ClientOverviewRow,
} from './api'

interface Props {
  onBack: () => void
  showToast: (t: ToastInput) => void
}

export function GalleryAssignmentView({ onBack, showToast }: Props) {
  const { confirm, ConfirmHost } = useConfirm()
  const [galleries, setGalleries] = useState<AssignableGalleryRow[]>([])
  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Assign / reassign modal
  const [target, setTarget] = useState<AssignableGalleryRow | null>(null)
  const [chosenClient, setChosenClient] = useState<string>('')
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, cl] = await Promise.all([fetchAssignableGalleries(), fetchClientsOverview()])
      setGalleries(g)
      setClients(cl)
    } catch (e) {
      setError((e as Error).message || 'טעינת הגלריות נכשלה.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return galleries
    return galleries.filter(g =>
      g.name.toLowerCase().includes(q) || (g.client_name ?? '').toLowerCase().includes(q))
  }, [galleries, query])

  const openAssign = (g: AssignableGalleryRow) => {
    setTarget(g)
    setChosenClient(g.client_id ?? '')
    setModalError(null)
  }

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    if (!chosenClient) { setModalError('יש לבחור לקוח.'); return }
    const isReassign = !!target.client_id && target.client_id !== chosenClient
    // Reassign requires an explicit confirm (moving away from an existing client).
    if (isReassign) {
      const ok = await confirm({
        title: 'שיוך מחדש',
        body: `הגלריה «${target.name}» תעבור מ־${target.client_name ?? 'לקוח קיים'} ללקוח החדש. הלקוח הקודם יאבד את הגישה אליה. להמשיך?`,
        confirmLabel: 'שייך מחדש', cancelLabel: 'חזרה', danger: true,
      })
      if (!ok) return
    }
    setModalBusy(true)
    setModalError(null)
    const res = isReassign
      ? await reassignGallery({ galleryId: target.gallery_id, clientId: chosenClient })
      : await assignGallery({ galleryId: target.gallery_id, clientId: chosenClient })
    setModalBusy(false)
    if (!res.ok) { setModalError(errorText(res.error)); return }
    setTarget(null)
    showToast({ kind: 'success', text: res.reassigned ? 'הגלריה שויכה מחדש.' : 'הגלריה שויכה.' })
    await load()
  }

  const doUnassign = async (g: AssignableGalleryRow) => {
    const ok = await confirm({
      title: 'ביטול שיוך',
      body: `הגלריה «${g.name}» תנותק מ־${g.client_name ?? 'הלקוח'}. הלקוח יאבד את הגישה אליה. להמשיך?`,
      confirmLabel: 'בטל שיוך', cancelLabel: 'חזרה', danger: true,
    })
    if (!ok) return
    setBusyId(g.gallery_id)
    const res = await unassignGallery(g.gallery_id)
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    showToast({ kind: 'success', text: 'השיוך בוטל.' })
    await load()
  }

  return (
    <div>
      <ConfirmHost />
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
          border: 'none', color: c.textMuted, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, padding: '4px 0', marginBottom: 20,
        }}
      >
        חזרה לרשימת הלקוחות
      </button>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.22em', color: c.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>ניהול</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 500, letterSpacing: '-0.025em', color: c.textPrimary }}>שיוך גלריות</h1>
        <p style={{ fontSize: 13.5, color: c.textMuted, marginTop: 10, marginBottom: 0, maxWidth: 520, lineHeight: 1.5 }}>
          שייך כל גלריה ללקוח כדי שתופיע בפורטל שלו. גלריה משויכת ללקוח אחד בלבד.
        </p>
      </div>

      {loading ? (
        <Skeleton height={64} count={5} />
      ) : error ? (
        <ErrorBanner text={error} onRetry={load} />
      ) : galleries.length === 0 ? (
        <EmptyState icon="gallery" title="אין גלריות לשיוך" body="צור גלריות במסך «הגלריות שלי» כדי לשייך אותן ללקוחות." />
      ) : (
        <>
          <div style={{ position: 'relative', marginBottom: 20, maxWidth: 420 }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש גלריה או לקוח…"
              aria-label="חיפוש גלריות"
              style={{ ...inputStyle, paddingInlineStart: 40 }}
            />
            <span style={{ position: 'absolute', insetInlineStart: 13, top: '50%', transform: 'translateY(-50%)', color: c.textMuted, pointerEvents: 'none', display: 'flex' }}>
              <Icon name="search" size={15} strokeWidth={1.8} />
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="search" title="אין תוצאות" body="לא נמצאו גלריות התואמות את החיפוש." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
              {filtered.map((g, i) => {
                const busy = busyId === g.gallery_id
                return (
                  <div key={g.gallery_id} style={{
                    padding: '16px 18px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none', background: c.bgSubtle,
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                  }}>
                    <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: c.textPrimary }}>{g.name}</span>
                        <Badge tone={g.status === 'live' ? 'live' : 'neutral'}>{GALLERY_STATUS_HE[g.status] ?? g.status}</Badge>
                      </div>
                      <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 6 }}>
                        {g.client_name
                          ? <>משויך ל־<span style={{ color: c.textSecondary, fontWeight: 500 }}>{g.client_name}</span></>
                          : 'לא משויך'}
                        {g.event_date && <> · {formatDate(g.event_date)}</>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {g.client_id ? (
                        <>
                          <Button variant="ghost" busy={busy} onClick={() => openAssign(g)} style={{ padding: '8px 14px' }}>שייך מחדש</Button>
                          <Button variant="danger" busy={busy} onClick={() => doUnassign(g)} style={{ padding: '8px 14px' }}>בטל שיוך</Button>
                        </>
                      ) : (
                        <Button variant="outline" busy={busy} onClick={() => openAssign(g)} style={{ padding: '8px 16px' }}>שייך ללקוח</Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.client_id ? 'שיוך גלריה מחדש' : 'שיוך גלריה ללקוח'}>
        {target && (
          <form onSubmit={submitAssign}>
            <p style={{ fontSize: 13.5, color: c.textSecondary, marginTop: 0, marginBottom: 18 }}>
              גלריה: <strong style={{ color: c.textPrimary }}>{target.name}</strong>
            </p>
            <Field label="לקוח" required>
              {clients.length === 0 ? (
                <div style={{ fontSize: 13, color: c.textMuted }}>אין לקוחות. צור לקוח תחילה.</div>
              ) : (
                <select value={chosenClient} onChange={e => setChosenClient(e.target.value)} style={inputStyle} autoFocus>
                  <option value="">— בחר לקוח —</option>
                  {clients.map(cl => <option key={cl.client_id} value={cl.client_id}>{cl.name}</option>)}
                </select>
              )}
            </Field>
            {modalError && <div style={{ marginBottom: 14 }}><ErrorBanner text={modalError} /></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" busy={modalBusy} disabled={clients.length === 0}>
                {target.client_id ? 'שייך מחדש' : 'שייך'}
              </Button>
              <Button variant="ghost" onClick={() => setTarget(null)}>ביטול</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

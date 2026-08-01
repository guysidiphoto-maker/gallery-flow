// BulkAssignView — owner-side gallery-assignment workspace (supersedes the
// single-row GalleryAssignmentView). Multi-select + bulk assign to one client,
// Assigned/Unassigned/Published/Draft filters, per-gallery "no client can see
// this" indicator, reassign/unassign with explicit confirms, and a per-row
// "preview as client" link (same public-page logic as ClientDetailView).
//
// Reads: cpv2_owner_assignable_galleries + cpv2_owner_clients_overview (RPCs).
// Writes: POST /api/client-admin (assign/reassign/unassign/bulk_assign_galleries).
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../Icon'
import { useConfirm } from '../useConfirm'
import type { ToastInput } from '../Toast'
import { c, GALLERY_STATUS_HE, errorText } from '../clients/theme'
import { Badge, Button, Modal, Field, inputStyle, EmptyState, ErrorBanner, Skeleton, formatDate } from '../clients/primitives'
import { portalUrl } from '../clients/ClientDetailView'
import {
  fetchAssignableGalleries, fetchClientsOverview,
  assignGallery, reassignGallery, unassignGallery, bulkAssignGalleries,
  BULK_ASSIGN_MAX,
  type AssignableGalleryRow, type ClientOverviewRow, type BulkAssignSummary,
} from '../clients/api'
import AssignClientField from './AssignClientField'
import { computeVisibilityIndicator, type VisibilityReason } from './visibility'
import { t, dirFor, type AssignmentLocale } from './strings'

export interface BulkAssignViewProps {
  businessSlug: string | null
  onBack: () => void
  showToast: (toast: ToastInput) => void
  locale?: AssignmentLocale
}

type Filter = 'all' | 'assigned' | 'unassigned' | 'published' | 'draft'

const HIDDEN_REASON_KEY: Record<VisibilityReason, 'bulk.hidden.unassigned' | 'bulk.hidden.notPublished' | 'bulk.hidden.noActiveMembers'> = {
  unassigned: 'bulk.hidden.unassigned',
  not_published: 'bulk.hidden.notPublished',
  no_active_members: 'bulk.hidden.noActiveMembers',
}

export default function BulkAssignView({ businessSlug, onBack, showToast, locale = 'he' }: BulkAssignViewProps) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const { confirm, ConfirmHost } = useConfirm()

  const [galleries, setGalleries] = useState<AssignableGalleryRow[]>([])
  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

  // Bulk action state
  const [bulkClient, setBulkClient] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Per-row assign/reassign modal
  const [target, setTarget] = useState<AssignableGalleryRow | null>(null)
  const [chosenClient, setChosenClient] = useState<string | null>(null)
  const [modalBusy, setModalBusy] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, cl] = await Promise.all([fetchAssignableGalleries(), fetchClientsOverview()])
      setGalleries(g)
      setClients(cl)
      // Drop selections for galleries that no longer exist.
      setSelected(prev => new Set([...prev].filter(id => g.some(row => row.gallery_id === id))))
    } catch (e) {
      setError((e as Error).message || tr('bulk.loadError'))
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void load() }, [load])

  const clientById = useMemo(() => {
    const m = new Map<string, ClientOverviewRow>()
    for (const cl of clients) m.set(cl.client_id, cl)
    return m
  }, [clients])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return galleries.filter(g => {
      if (filter === 'assigned' && !g.client_id) return false
      if (filter === 'unassigned' && g.client_id) return false
      if (filter === 'published' && g.status !== 'live') return false
      if (filter === 'draft' && g.status !== 'draft') return false
      if (q && !g.name.toLowerCase().includes(q) && !(g.client_name ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [galleries, query, filter])

  const allVisibleSelected = filtered.length > 0 && filtered.every(g => selected.has(g.gallery_id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) filtered.forEach(g => next.delete(g.gallery_id))
      else filtered.forEach(g => next.add(g.gallery_id))
      return next
    })
  }

  // ── bulk assign ─────────────────────────────────────────────────────────────

  const runBulk = async () => {
    if (!bulkClient) { showToast({ kind: 'error', text: tr('bulk.modal.clientRequired') }); return }
    const ids = [...selected]
    if (ids.length === 0) return
    if (ids.length > BULK_ASSIGN_MAX) { showToast({ kind: 'error', text: tr('bulk.tooMany') }); return }

    const moving = galleries.filter(g => selected.has(g.gallery_id) && g.client_id && g.client_id !== bulkClient)
    if (moving.length > 0) {
      const ok = await confirm({
        title: tr('bulk.confirm.bulkTitle'),
        body: `${moving.length} — ${tr('bulk.confirm.bulkReassignBody')}`,
        confirmLabel: tr('bulk.confirm.bulkOk'), cancelLabel: tr('bulk.confirm.back'), danger: true,
      })
      if (!ok) return
    }

    setBulkBusy(true)
    const res = await bulkAssignGalleries({ clientId: bulkClient, galleryIds: ids })
    setBulkBusy(false)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }

    const s = res as BulkAssignSummary & { ok: true }
    const parts = [
      s.assigned > 0 ? `${s.assigned} ${tr('bulk.summary.assigned')}` : '',
      s.reassigned > 0 ? `${s.reassigned} ${tr('bulk.summary.reassigned')}` : '',
      s.unchanged > 0 ? `${s.unchanged} ${tr('bulk.summary.unchanged')}` : '',
      s.failed > 0 ? `${s.failed} ${tr('bulk.summary.failed')}` : '',
    ].filter(Boolean).join(' · ')
    showToast({
      kind: s.failed > 0 ? 'error' : 'success',
      text: `${s.failed > 0 ? tr('bulk.toast.bulkPartial') : tr('bulk.toast.bulkDone')}: ${parts}`,
    })
    setSelected(new Set())
    await load()
  }

  // ── per-row actions ─────────────────────────────────────────────────────────

  const openAssign = (g: AssignableGalleryRow) => {
    setTarget(g)
    setChosenClient(g.client_id)
    setModalError(null)
  }

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!target) return
    if (!chosenClient) { setModalError(tr('bulk.modal.clientRequired')); return }
    const isReassign = !!target.client_id && target.client_id !== chosenClient
    if (isReassign) {
      const ok = await confirm({
        title: tr('bulk.confirm.reassignTitle'),
        body: `«${target.name}» — ${tr('bulk.confirm.reassignBody')}`,
        confirmLabel: tr('bulk.confirm.reassignOk'), cancelLabel: tr('bulk.confirm.back'), danger: true,
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
    showToast({ kind: 'success', text: res.reassigned ? tr('bulk.toast.reassigned') : tr('bulk.toast.assigned') })
    await load()
  }

  const doUnassign = async (g: AssignableGalleryRow) => {
    const ok = await confirm({
      title: tr('bulk.confirm.unassignTitle'),
      body: `«${g.name}» — ${tr('bulk.confirm.unassignBody')}`,
      confirmLabel: tr('bulk.confirm.unassignOk'), cancelLabel: tr('bulk.confirm.back'), danger: true,
    })
    if (!ok) return
    setBusyId(g.gallery_id)
    const res = await unassignGallery(g.gallery_id)
    setBusyId(null)
    if (!res.ok) { showToast({ kind: 'error', text: errorText(res.error) }); return }
    showToast({ kind: 'success', text: tr('bulk.toast.unassigned') })
    await load()
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const filterTabs: { id: Filter; label: string }[] = [
    { id: 'all', label: tr('bulk.filter.all') },
    { id: 'assigned', label: tr('bulk.filter.assigned') },
    { id: 'unassigned', label: tr('bulk.filter.unassigned') },
    { id: 'published', label: tr('bulk.filter.published') },
    { id: 'draft', label: tr('bulk.filter.draft') },
  ]

  return (
    <div dir={dirFor(locale)}>
      <ConfirmHost />
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent',
          border: 'none', color: c.textMuted, cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 12.5, padding: '4px 0', marginBottom: 20,
        }}
      >
        {tr('bulk.back')}
      </button>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.22em', color: c.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>{tr('bulk.kicker')}</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(24px,3.2vw,36px)', fontWeight: 500, letterSpacing: '-0.025em', color: c.textPrimary }}>{tr('bulk.title')}</h1>
        <p style={{ fontSize: 13.5, color: c.textMuted, marginTop: 10, marginBottom: 0, maxWidth: 560, lineHeight: 1.5 }}>
          {tr('bulk.subtitle')}
        </p>
      </div>

      {loading ? (
        <Skeleton height={64} count={5} />
      ) : error ? (
        <ErrorBanner text={error} onRetry={load} />
      ) : galleries.length === 0 ? (
        <EmptyState icon="gallery" title={tr('bulk.empty.title')} body={tr('bulk.empty.body')} />
      ) : (
        <>
          {/* Search + filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 420 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={tr('bulk.search')}
                aria-label={tr('bulk.search')}
                style={{ ...inputStyle, paddingInlineStart: 40 }}
              />
              <span style={{ position: 'absolute', insetInlineStart: 13, top: '50%', transform: 'translateY(-50%)', color: c.textMuted, pointerEvents: 'none', display: 'flex' }}>
                <Icon name="search" size={15} strokeWidth={1.8} />
              </span>
            </div>
            <div role="tablist" aria-label={tr('bulk.title')} style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {filterTabs.map(tab => {
                const active = filter === tab.id
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.id)}
                    style={{
                      fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
                      padding: '8px 14px', borderRadius: 2, cursor: 'pointer',
                      border: `1px solid ${active ? c.textPrimary : c.border}`,
                      background: active ? c.textPrimary : 'transparent',
                      color: active ? '#fff' : c.textSecondary,
                    }}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Select-all + bulk action bar */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
            border: `1px solid ${selected.size > 0 ? c.textPrimary : c.border}`,
            background: selected.size > 0 ? c.card : c.bgSubtle,
            padding: '12px 16px', marginBottom: 16, transition: 'border-color .15s, background .15s',
          }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: c.textSecondary, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                style={{ width: 15, height: 15, accentColor: c.textPrimary, cursor: 'pointer' }}
              />
              {tr('bulk.selectAll')}
            </label>
            {selected.size > 0 && (
              <>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: c.textPrimary }}>
                  {selected.size.toLocaleString(locale === 'he' ? 'he-IL' : 'en-US')} {tr('bulk.selectedCount')}
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{ fontFamily: 'inherit', fontSize: 12, background: 'transparent', border: 'none', color: c.textMuted, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {tr('bulk.clearSelection')}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto', flex: '1 1 320px', maxWidth: 460, minWidth: 240 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <AssignClientField value={bulkClient} onChange={id => setBulkClient(id)} allowCreateInline locale={locale} />
                  </div>
                  <Button variant="primary" busy={bulkBusy} disabled={!bulkClient} onClick={() => void runBulk()} style={{ padding: '11px 18px', flexShrink: 0 }}>
                    {tr('bulk.assignSelected')} ({selected.size})
                  </Button>
                </div>
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="search" title={tr('bulk.noResults.title')} body={tr('bulk.noResults.body')} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${c.border}` }}>
              {filtered.map((g, i) => {
                const busy = busyId === g.gallery_id
                const isSelected = selected.has(g.gallery_id)
                const activeMembers = g.client_id ? clientById.get(g.client_id)?.active_member_count : undefined
                const hiddenReason = computeVisibilityIndicator(
                  { client_id: g.client_id, status: g.status }, activeMembers,
                )
                return (
                  <div key={g.gallery_id} style={{
                    padding: '16px 18px', borderTop: i > 0 ? `1px solid ${c.border}` : 'none',
                    background: isSelected ? c.card : c.bgSubtle,
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
                  }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(g.gallery_id)}
                      aria-label={g.name}
                      style={{ width: 16, height: 16, accentColor: c.textPrimary, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500, color: c.textPrimary }}>{g.name}</span>
                        <Badge tone={g.status === 'live' ? 'live' : 'neutral'}>{GALLERY_STATUS_HE[g.status] ?? g.status}</Badge>
                        {hiddenReason && (
                          <span title={tr(HIDDEN_REASON_KEY[hiddenReason])}>
                            <Badge tone="warn" icon="shield">{tr('bulk.hiddenBadge')}</Badge>
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: c.textMuted, marginTop: 6 }}>
                        {g.client_name
                          ? <>{tr('bulk.assignedTo')} <span style={{ color: c.textSecondary, fontWeight: 500 }}>{g.client_name}</span></>
                          : tr('bulk.unassigned')}
                        {g.event_date && <> · {formatDate(g.event_date)}</>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {g.client_id ? (
                        <>
                          <a
                            href={portalUrl(businessSlug, g.client_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={tr('bulk.previewTitle')}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                              padding: '8px 14px', borderRadius: 2, textDecoration: 'none',
                              border: `1px solid ${c.border}`, color: c.textSecondary,
                            }}
                          >
                            <Icon name="arrow-out" size={12} strokeWidth={1.8} />
                            {tr('bulk.preview')}
                          </a>
                          <Button variant="ghost" busy={busy} onClick={() => openAssign(g)} style={{ padding: '8px 14px' }}>{tr('bulk.reassign')}</Button>
                          <Button variant="danger" busy={busy} onClick={() => void doUnassign(g)} style={{ padding: '8px 14px' }}>{tr('bulk.unassign')}</Button>
                        </>
                      ) : (
                        <Button variant="outline" busy={busy} onClick={() => openAssign(g)} style={{ padding: '8px 16px' }}>{tr('bulk.assign')}</Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Per-row assign/reassign modal */}
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.client_id ? tr('bulk.modal.reassignTitle') : tr('bulk.modal.assignTitle')}
      >
        {target && (
          <form onSubmit={submitAssign}>
            <p style={{ fontSize: 13.5, color: c.textSecondary, marginTop: 0, marginBottom: 18 }}>
              {tr('bulk.modal.gallery')}: <strong style={{ color: c.textPrimary }}>{target.name}</strong>
            </p>
            <Field label={tr('assign.field.label')} required>
              <AssignClientField value={chosenClient} onChange={id => setChosenClient(id)} allowCreateInline locale={locale} />
            </Field>
            {modalError && <div style={{ marginBottom: 14 }}><ErrorBanner text={modalError} /></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" busy={modalBusy} disabled={!chosenClient}>
                {target.client_id ? tr('bulk.modal.submitReassign') : tr('bulk.modal.submitAssign')}
              </Button>
              <Button variant="ghost" onClick={() => setTarget(null)}>{tr('bulk.modal.cancel')}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

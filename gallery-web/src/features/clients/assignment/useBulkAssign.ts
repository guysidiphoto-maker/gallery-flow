import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useConfirm } from '@/shared/ui/useConfirm'
import type { ToastInput } from '@/shared/ui/Toast'
import { errorText } from '../labels'
import {
  fetchAssignableGalleries, fetchClientsOverview,
  assignGallery, reassignGallery, unassignGallery, bulkAssignGalleries,
  BULK_ASSIGN_MAX,
  type AssignableGalleryRow, type ClientOverviewRow, type BulkAssignSummary,
} from '../api'
import { t, type AssignmentLocale } from './strings'

export type BulkFilter = 'all' | 'assigned' | 'unassigned' | 'published' | 'draft'

/** State + actions for the bulk gallery-assignment workspace. */
export function useBulkAssign(locale: AssignmentLocale, showToast: (toast: ToastInput) => void) {
  const tr = (k: Parameters<typeof t>[1]) => t(locale, k)
  const { confirm, ConfirmHost } = useConfirm()

  const [galleries, setGalleries] = useState<AssignableGalleryRow[]>([])
  const [clients, setClients] = useState<ClientOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<BulkFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)

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

  const openAssign = (g: AssignableGalleryRow) => {
    setTarget(g)
    setChosenClient(g.client_id)
    setModalError(null)
  }

  const submitAssign = async (e: FormEvent) => {
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

  return {
    ConfirmHost, galleries, loading, error, load, clientById,
    query, setQuery, filter, setFilter, filtered,
    selected, setSelected, allVisibleSelected, toggleOne, toggleAllVisible, busyId,
    bulkClient, setBulkClient, bulkBusy, runBulk,
    modal: {
      target, close: () => setTarget(null), chosenClient, setChosenClient,
      busy: modalBusy, error: modalError, submit: submitAssign,
    },
    openAssign, doUnassign,
  }
}

export type AssignModalState = ReturnType<typeof useBulkAssign>['modal']

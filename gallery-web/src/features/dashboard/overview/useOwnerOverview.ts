import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchClientsOverview,
  fetchAssignableGalleries,
  type ClientOverviewRow,
  type AssignableGalleryRow,
} from '@/features/clients/api'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { getProgress, saveProgress } from '../tour/onboarding'
import { deriveOverviewStats, type DerivedStats } from './overviewStats'
import type { OverviewNavTarget } from './OwnerOverview'

const CHECKLIST_SURFACE = 'owner_checklist'

// A checklist step is "done" when we can prove it cheaply from real data.
export interface ChecklistItem {
  key: string
  label: string
  done: boolean
  action: () => void
  actionLabel: string
}

// Owner-home data: clients + galleries, derived stats and the first-run checklist.
export function useOwnerOverview({ businessId, onNavigate, onNewGallery }: {
  businessId: string | null
  onNavigate: (view: OverviewNavTarget) => void
  onNewGallery: () => void
}) {
  const { t } = useOwnerLocale()
  const [clients, setClients] = useState<ClientOverviewRow[] | null>(null)
  const [galleries, setGalleries] = useState<AssignableGalleryRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const [c, g] = await Promise.all([fetchClientsOverview(), fetchAssignableGalleries()])
      setClients(c)
      setGalleries(g)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Only load once we actually have an owner business resolved; otherwise the
    // RPCs would fail closed and we would flash an error for a logged-in user
    // whose business row is still resolving.
    if (!businessId) return
    void load()
  }, [businessId, load])

  // First-run checklist dismissal state (DB best-effort, localStorage fallback).
  useEffect(() => {
    let cancelled = false
    void getProgress(CHECKLIST_SURFACE).then(p => {
      if (cancelled) return
      if (p.status === 'completed' || p.status === 'dismissed') setChecklistDismissed(true)
    })
    return () => { cancelled = true }
  }, [])

  const dismissChecklist = useCallback(() => {
    setChecklistDismissed(true)
    void saveProgress(CHECKLIST_SURFACE, { status: 'dismissed', step: 0 })
  }, [])

  const stats = useMemo<DerivedStats | null>(
    () => (clients && galleries ? deriveOverviewStats(clients, galleries) : null),
    [clients, galleries],
  )

  const checklist = useMemo<ChecklistItem[]>(() => {
    if (!clients || !galleries) return []
    const hasClient = clients.length > 0
    const hasInvitedOrActive = clients.some(
      c => (c.active_member_count || 0) > 0 || (c.member_count || 0) > 0 || (c.pending_invites || 0) > 0,
    )
    const hasAssigned = galleries.some(g => !!g.client_id)
    const hasPublished = galleries.some(g => g.status === 'live')
    const hasAssignedAndPublished = galleries.some(g => !!g.client_id && g.status === 'live')
    const hasActiveMember = clients.some(c => (c.active_member_count || 0) > 0)
    return [
      {
        key: 'client',
        label: t('overview.check.client'),
        done: hasClient,
        action: () => onNavigate('clients'),
        actionLabel: t('overview.check.client.cta'),
      },
      {
        key: 'invite',
        label: t('overview.check.invite'),
        done: hasInvitedOrActive,
        action: () => onNavigate('clients'),
        actionLabel: t('overview.check.invite.cta'),
      },
      {
        key: 'assign',
        label: t('overview.check.assign'),
        done: hasAssigned,
        action: () => onNavigate('clients'),
        actionLabel: t('overview.check.assign.cta'),
      },
      {
        key: 'newGallery',
        label: t('overview.check.newGallery'),
        done: hasAssignedAndPublished,
        action: onNewGallery,
        actionLabel: t('overview.check.newGallery.cta'),
      },
      {
        key: 'preview',
        label: t('overview.check.preview'),
        done: hasPublished,
        action: () => onNavigate('clients'),
        actionLabel: t('overview.check.preview.cta'),
      },
      {
        key: 'verify',
        label: t('overview.check.verify'),
        done: hasActiveMember,
        action: () => onNavigate('clients'),
        actionLabel: t('overview.check.verify.cta'),
      },
    ]
  }, [clients, galleries, t, onNavigate, onNewGallery])

  const doneCount = checklist.filter(i => i.done).length
  const allDone = checklist.length > 0 && doneCount === checklist.length

  return { loading, error, load, stats, checklist, doneCount, allDone, checklistDismissed, dismissChecklist }
}

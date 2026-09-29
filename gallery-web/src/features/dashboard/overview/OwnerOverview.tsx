// Owner home: a dismissible first-run checklist plus a compact studio status
// grid, built only from the existing self-scoped owner RPCs (no business_id
// from the browser). Handles loading, empty and error + retry states.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchClientsOverview,
  fetchAssignableGalleries,
  type ClientOverviewRow,
  type AssignableGalleryRow,
} from '@/features/clients/api'
import { useOwnerLocale } from '@/shared/i18n/ownerLocale'
import { cn, Eyebrow, WorkspaceView } from '@/shared/ui'
import { getProgress, saveProgress } from '../tour/onboarding'

// The set of Dashboard views OwnerOverview can send the operator to.
export type OverviewNavTarget = 'galleries' | 'clients' | 'search' | 'import'

export interface OwnerOverviewProps {
  businessId: string | null
  businessSlug: string | null
  locale: 'he' | 'en'
  onNavigate: (view: OverviewNavTarget) => void
  onNewGallery: () => void
}

const CHECKLIST_SURFACE = 'owner_checklist'

interface DerivedStats {
  activeClients: number
  totalGalleries: number
  published: number
  drafts: number
  unassigned: number
  pendingInvites: number
  notVisible: number // client_id null OR status !== 'live'
  recent: AssignableGalleryRow[]
}

function derive(clients: ClientOverviewRow[], galleries: AssignableGalleryRow[]): DerivedStats {
  const published = galleries.filter(g => g.status === 'live').length
  const drafts = galleries.filter(g => g.status !== 'live').length
  const unassigned = galleries.filter(g => !g.client_id).length
  const notVisible = galleries.filter(g => !g.client_id || g.status !== 'live').length
  const pendingInvites = clients.reduce((n, c) => n + (c.pending_invites || 0), 0)
  const activeClients = clients.filter(c => (c.active_member_count || 0) > 0).length
  // "Recently added": the assignable-galleries RPC returns owner galleries; sort
  // by event_date desc as a cheap recency proxy (no created_at in the row) and
  // take the first few. Galleries without a date sink to the bottom.
  const recent = [...galleries]
    .sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))
    .slice(0, 5)
  return {
    activeClients,
    totalGalleries: galleries.length,
    published,
    drafts,
    unassigned,
    pendingInvites,
    notVisible,
    recent,
  }
}

// A checklist step is "done" when we can prove it cheaply from real data.
interface ChecklistItem {
  key: string
  label: string
  done: boolean
  action: () => void
  actionLabel: string
}

export default function OwnerOverview({
  businessId,
  locale,
  onNavigate,
  onNewGallery,
}: OwnerOverviewProps) {
  const { t, dir, fmtNum, fmtDate } = useOwnerLocale()
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
    () => (clients && galleries ? derive(clients, galleries) : null),
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

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <WorkspaceView dir={dir} eyebrow={t('nav.workspace')} title={t('overview.title')} description={t('overview.subtitle')}>

      {error && (
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-line-soft bg-raised px-[22px] py-5">
          <span className="text-sm text-ink-soft">{t('overview.error')}</span>
          <button
            onClick={() => void load()}
            className="cursor-pointer rounded-[4px] border-none bg-ink px-[18px] py-[9px] text-[13px] font-semibold text-white"
          >
            {t('overview.retry')}
          </button>
        </div>
      )}

      {/* First-run checklist */}
      {!error && !checklistDismissed && !allDone && (
        <section className="mb-8 rounded-[8px] border border-line-soft bg-raised px-[26px] pt-[26px] pb-5">
          <div className="mb-[18px] flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                {t('overview.checklist.title')}
              </h2>
              <p className="mt-1.5 text-[13px] text-muted">
                {loading
                  ? t('overview.loading')
                  : t('overview.checklist.progress', { done: doneCount, total: checklist.length })}
              </p>
            </div>
            <button
              onClick={dismissChecklist}
              className="cursor-pointer border-none bg-transparent px-1.5 py-1 text-xs text-muted"
            >
              {t('overview.checklist.dismiss')}
            </button>
          </div>

          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <ol className="flex flex-col gap-0.5">
              {checklist.map(item => (
                <li key={item.key} className="flex items-center gap-3.5 border-t border-line-soft py-[13px]">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[13px] font-bold text-white',
                      item.done ? 'border-success bg-success' : 'border-line-soft bg-transparent',
                    )}
                  >
                    {item.done ? '✓' : ''}
                  </span>
                  <span className={cn('flex-1 text-sm', item.done ? 'text-muted line-through' : 'text-ink')}>
                    {item.label}
                  </span>
                  {!item.done && (
                    <button
                      onClick={item.action}
                      className="cursor-pointer rounded-[4px] border border-line-soft bg-transparent px-3.5 py-[7px] text-xs font-semibold whitespace-nowrap text-ink"
                    >
                      {item.actionLabel}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Status grid */}
      <section className="mb-9">
        <Eyebrow className="mb-4 block text-[9px] font-medium">{t('overview.status.title')}</Eyebrow>
        {loading && !stats ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-[8px] border border-line-soft bg-raised p-[22px]">
                <SkeletonRows count={2} />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3.5">
            <StatCard
              value={fmtNum(stats.activeClients)}
              label={t('overview.card.activeClients')}
              onClick={() => onNavigate('clients')}
            />
            <StatCard
              value={fmtNum(stats.published)}
              hint={t('overview.card.drafts', { n: fmtNum(stats.drafts) })}
              label={t('overview.card.published')}
              onClick={() => onNavigate('galleries')}
            />
            <StatCard
              value={fmtNum(stats.unassigned)}
              label={t('overview.card.unassigned')}
              tone={stats.unassigned > 0 ? 'warn' : undefined}
              onClick={() => onNavigate('clients')}
            />
            <StatCard
              value={fmtNum(stats.notVisible)}
              label={t('overview.card.notVisible')}
              tone={stats.notVisible > 0 ? 'warn' : undefined}
              onClick={() => onNavigate('clients')}
            />
            <StatCard
              value={fmtNum(stats.pendingInvites)}
              label={t('overview.card.pendingInvites')}
              onClick={() => onNavigate('clients')}
            />
            <StatCard
              value={fmtNum(stats.totalGalleries)}
              label={t('overview.card.totalGalleries')}
              onClick={() => onNavigate('galleries')}
            />
          </div>
        ) : null}
      </section>

      {/* Recently added galleries */}
      {stats && stats.recent.length > 0 && (
        <section className="mb-3">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <Eyebrow className="text-[9px] font-medium">{t('overview.recent.title')}</Eyebrow>
            <button
              onClick={() => onNavigate('galleries')}
              className="cursor-pointer border-none bg-transparent text-xs font-semibold text-ink-soft"
            >
              {t('overview.recent.all')}
            </button>
          </div>
          <div className="overflow-hidden rounded-[8px] border border-line-soft bg-raised">
            {stats.recent.map((g, i) => (
              <div key={g.gallery_id} className={cn('flex items-center gap-3 px-[18px] py-3.5', i > 0 && 'border-t border-line-soft')}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {g.name}
                  </div>
                  <div className="mt-[3px] text-xs text-muted">
                    {g.client_name
                      ? g.client_name
                      : t('overview.recent.noClient')}
                    {g.event_date ? ` · ${fmtDate(g.event_date)}` : ''}
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-[3px] border px-[9px] py-1 text-[10px] font-semibold tracking-[0.12em] uppercase',
                    g.status === 'live' ? 'border-success text-success' : 'border-line-soft text-muted',
                  )}
                >
                  {g.status === 'live' ? t('overview.recent.live') : t('overview.recent.draft')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state: no galleries at all */}
      {stats && stats.totalGalleries === 0 && (
        <div className="rounded-[8px] border border-dashed border-line-soft bg-raised px-6 py-8 text-center">
          <p className="mb-[18px] text-[15px] text-ink-soft">
            {t('overview.empty')}
          </p>
          <button
            onClick={onNewGallery}
            className="cursor-pointer rounded-[4px] border-none bg-ink px-[22px] py-[11px] text-sm font-semibold text-white"
          >
            {t('overview.empty.cta')}
          </button>
        </div>
      )}
    </WorkspaceView>
  )
}

// ── Presentational helpers ──────────────────────────────────────────────────

function StatCard({
  value, label, hint, tone, onClick,
}: {
  value: string
  label: string
  hint?: string
  tone?: 'warn'
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1.5 rounded-[8px] border border-line-soft bg-raised px-[22px] py-5 text-start transition-colors duration-150',
        onClick ? 'cursor-pointer hover:border-ink' : 'cursor-default',
      )}
    >
      <span className={cn('text-[30px] leading-none font-medium tracking-[-0.02em]', tone === 'warn' ? 'text-warning' : 'text-ink')}>
        {value}
      </span>
      <span className="text-[13px] text-ink-soft">{label}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </button>
  )
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 animate-[dash-skeleton_1.4s_ease_infinite] rounded-[4px] bg-linear-90 from-sunken from-25% via-line-soft via-37% to-sunken to-63% bg-size-[400%_100%]"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  )
}

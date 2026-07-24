// OwnerOverview: the operator "what do I do next" home for the business owner.
//
// It answers two questions at a glance:
//   1. What are my next steps? (a dismissible first-run checklist)
//   2. What is the current state of my studio? (a compact status grid + a
//      short "recently added" list)
//
// Data comes ONLY from the existing self-scoped owner RPCs, reused through
// src/components/clients/api.ts (fetchClientsOverview / fetchAssignableGalleries).
// No new RPC, no new endpoint, no business_id ever passed from the browser.
//
// Copy is action-oriented, jargon-free (no membership/entitlement/RLS/tenant),
// no em-dashes, he+en via ownerLocale, RTL-correct. Every state is handled:
// loading skeletons, empty states, and error + retry.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchClientsOverview,
  fetchAssignableGalleries,
  type ClientOverviewRow,
  type AssignableGalleryRow,
} from '../clients/api'
import { useOwnerLocale } from '../../lib/ownerLocale'
import { getProgress, saveProgress } from '../../lib/onboarding'

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

// ── Editorial palette (matches the Dashboard shell tones) ────────────────────
const C = {
  bg: '#FBFAF8',
  card: '#FFFFFF',
  border: '#E7E2DA',
  textPrimary: '#1A1712',
  textSecondary: '#5C554B',
  textMuted: '#9B9488',
  accent: '#1A1712',
  good: '#2D7D5A',
  warn: '#A67C52',
}

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
    <div dir={dir} style={{ animation: 'fadeInUp .4s ease both' }}>
      {/* Heading */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, fontWeight: 500, letterSpacing: '0.22em',
          color: C.textMuted, textTransform: 'uppercase', marginBottom: 14,
        }}>
          {t('nav.overview')}
        </div>
        <h1 style={{
          fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 500, margin: 0,
          letterSpacing: '-0.025em', lineHeight: 1.02, color: C.textPrimary,
        }}>
          {t('overview.title')}
        </h1>
        <p style={{ color: C.textSecondary, fontSize: 15, margin: '14px 0 0', lineHeight: 1.55, maxWidth: 560 }}>
          {t('overview.subtitle')}
        </p>
      </div>

      {error && (
        <div style={{
          border: `1px solid ${C.border}`, background: C.card, borderRadius: 6,
          padding: '20px 22px', marginBottom: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <span style={{ color: C.textSecondary, fontSize: 14 }}>{t('overview.error')}</span>
          <button
            onClick={() => void load()}
            style={{
              background: C.accent, color: '#fff', border: 'none', borderRadius: 4,
              padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('overview.retry')}
          </button>
        </div>
      )}

      {/* First-run checklist */}
      {!error && !checklistDismissed && !allDone && (
        <section style={{
          border: `1px solid ${C.border}`, background: C.card, borderRadius: 8,
          padding: '26px 26px 20px', marginBottom: 32,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', marginBottom: 18,
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: C.textPrimary }}>
                {t('overview.checklist.title')}
              </h2>
              <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0' }}>
                {loading
                  ? t('overview.loading')
                  : t('overview.checklist.progress', { done: doneCount, total: checklist.length })}
              </p>
            </div>
            <button
              onClick={dismissChecklist}
              style={{
                background: 'none', border: 'none', color: C.textMuted, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px',
              }}
            >
              {t('overview.checklist.dismiss')}
            </button>
          </div>

          {loading ? (
            <SkeletonRows count={3} />
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {checklist.map(item => (
                <li key={item.key} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '13px 0', borderTop: `1px solid ${C.border}`,
                }}>
                  <span aria-hidden style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${item.done ? C.good : C.border}`,
                    background: item.done ? C.good : 'transparent',
                    color: '#fff', fontSize: 13, fontWeight: 700,
                  }}>
                    {item.done ? '✓' : ''}
                  </span>
                  <span style={{
                    flex: 1, fontSize: 14,
                    color: item.done ? C.textMuted : C.textPrimary,
                    textDecoration: item.done ? 'line-through' : 'none',
                  }}>
                    {item.label}
                  </span>
                  {!item.done && (
                    <button
                      onClick={item.action}
                      style={{
                        background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4,
                        padding: '7px 14px', fontSize: 12, fontWeight: 600, color: C.textPrimary,
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}
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
      <section style={{ marginBottom: 36 }}>
        <div style={{
          fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
          color: C.textMuted, textTransform: 'uppercase', marginBottom: 16,
        }}>
          {t('overview.status.title')}
        </div>
        {loading && !stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                border: `1px solid ${C.border}`, background: C.card, borderRadius: 8,
                padding: 22, height: 96,
              }}>
                <SkeletonRows count={2} />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
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
        <section style={{ marginBottom: 12 }}>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
            marginBottom: 16,
          }}>
            <div style={{
              fontSize: 9, fontWeight: 500, letterSpacing: '0.22em',
              color: C.textMuted, textTransform: 'uppercase',
            }}>
              {t('overview.recent.title')}
            </div>
            <button
              onClick={() => onNavigate('galleries')}
              style={{
                background: 'none', border: 'none', color: C.textSecondary, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              {t('overview.recent.all')}
            </button>
          </div>
          <div style={{ border: `1px solid ${C.border}`, background: C.card, borderRadius: 8, overflow: 'hidden' }}>
            {stats.recent.map((g, i) => (
              <div key={g.gallery_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 500, color: C.textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
                    {g.client_name
                      ? g.client_name
                      : t('overview.recent.noClient')}
                    {g.event_date ? ` · ${fmtDate(g.event_date)}` : ''}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                  padding: '4px 9px', borderRadius: 3,
                  color: g.status === 'live' ? C.good : C.textMuted,
                  border: `1px solid ${g.status === 'live' ? C.good : C.border}`,
                }}>
                  {g.status === 'live' ? t('overview.recent.live') : t('overview.recent.draft')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state: no galleries at all */}
      {stats && stats.totalGalleries === 0 && (
        <div style={{
          border: `1px dashed ${C.border}`, background: C.card, borderRadius: 8,
          padding: '32px 24px', textAlign: 'center',
        }}>
          <p style={{ color: C.textSecondary, fontSize: 15, margin: '0 0 18px' }}>
            {t('overview.empty')}
          </p>
          <button
            onClick={onNewGallery}
            style={{
              background: C.accent, color: '#fff', border: 'none', borderRadius: 4,
              padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t('overview.empty.cta')}
          </button>
        </div>
      )}
    </div>
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
      style={{
        border: `1px solid ${C.border}`, background: C.card, borderRadius: 8,
        padding: '20px 22px', textAlign: 'start', cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color .15s',
      }}
      onMouseEnter={onClick ? (e => { e.currentTarget.style.borderColor = C.accent }) : undefined}
      onMouseLeave={onClick ? (e => { e.currentTarget.style.borderColor = C.border }) : undefined}
    >
      <span style={{
        fontSize: 30, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1,
        color: tone === 'warn' ? C.warn : C.textPrimary,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 13, color: C.textSecondary }}>{label}</span>
      {hint && <span style={{ fontSize: 11, color: C.textMuted }}>{hint}</span>}
    </button>
  )
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          height: 14, borderRadius: 4,
          background: 'linear-gradient(90deg, #F0EDE7 25%, #E7E2DA 37%, #F0EDE7 63%)',
          backgroundSize: '400% 100%',
          animation: 'ownerSkeleton 1.4s ease infinite',
          width: `${90 - i * 12}%`,
        }} />
      ))}
      <style>{`@keyframes ownerSkeleton { 0% { background-position: 100% 50% } 100% { background-position: 0 50% } }`}</style>
    </div>
  )
}
